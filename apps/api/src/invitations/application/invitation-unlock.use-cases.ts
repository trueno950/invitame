import { validateInvitationPassword } from "../domain/invitation-password";
import { isValidInvitationSlug } from "../domain/invitation-slug";
import type { InvitationAccessTokens } from "./invitation-access-token";
import type { InvitationLockReader } from "./invitation-lock";
import { InvitationUnlockRateLimitedError } from "./invitation-password.errors";
import {
  INVITATION_UNLOCK_CLIENT_SCOPE,
  type InvitationUnlockRateLimiter,
  UNKNOWN_CLIENT_ADDRESS,
  invitationUnlockScope,
} from "./invitation-unlock-rate-limiter";
import {
  spendInvitationPasswordVerification,
  verifyInvitationPassword,
} from "./invitation-password";

// The unlock route of a password-protected invitation (F13; S2.13, L18.2, L18.3). A guest who knows the shared code
// exchanges it for an access token; the token is what the public routes then accept, so the code itself is never stored
// by the web and never sent again.
//
// The order is deliberate:
// 1. a value no access code can be — not a string, wider than the domain maximum, shorter than its minimum, or carrying
//    a control character — answers the neutral refusal before anything else, so a request that could never open an
//    invitation never spends a guest's budget or the hasher;
// 2. the two attempt budgets are spent before the lock is read and before any scrypt work: the per-address one under a
//    digest of the requested address (or, for an address nothing resolves, of that address), and the cap that spans
//    every address under the caller's own client address, so varying the slug cannot buy a fresh budget and an address
//    no invitation holds is limited exactly like a known one;
// 3. the lock is read; an address no published invitation holds, and an invitation with no code, answer the same neutral
//    refusal as a wrong code, after the same scrypt work, so the answer is never an oracle for "does this invitation
//    exist" or "is it protected";
// 4. the code is verified in constant time against the stored hash;
// 5. only then are both budgets refunded — a successful unlock does not count toward a cap that only failures should
//    spend, so guests behind one venue address are not locked out by their own correct unlocks — and a token is minted,
//    signed over the invitation id, the stored password version, and the expiry.
//
// When no client address resolves, the cap that spans every address is not spent: the public forms hash the shared
// `unknown` value into a key that also names their invitation, so their fallback bucket spans one invitation, and a
// bucket that spanned every invitation would let one caller exhaust every guest's budget (L18.3). The per-address budget
// still applies, exactly as it does for the open RSVP form.
//
// Nothing here logs: the plain code, the hash, and the token are all secrets of one invitation.

/** One unlock attempt; the code is untrusted and the address comes from the request. */
export interface UnlockInvitationInput {
  readonly slug: string;
  readonly password: unknown;
  readonly clientAddress: string;
}

/** The outcome of one attempt: the minted token, or the neutral refusal the route answers. */
export type UnlockInvitationResult =
  | { readonly status: "unlocked"; readonly token: string; readonly expiresAt: Date }
  | { readonly status: "rejected" };

/**
 * One unlock attempt (F13; L18.2, L18.3). Answers `rejected` — never an error and never a different body — for a value
 * no code can be, a code that does not match, an address no published invitation holds, and an invitation with no access
 * code; throws `InvitationUnlockRateLimitedError` when this address is over its cap for the requested address or over
 * the cap that spans every address, and changes nothing.
 */
export class UnlockInvitationUseCase {
  constructor(
    private readonly locks: InvitationLockReader,
    private readonly tokens: InvitationAccessTokens,
    private readonly rateLimiter: InvitationUnlockRateLimiter,
    /** The instant the token is minted at and the expiry counted from (L18.2); injectable for an exact boundary. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: UnlockInvitationInput): Promise<UnlockInvitationResult> {
    // A value the domain cannot hold is not a code: it is refused before the budget, the lock read, and the hash.
    const validated = validateInvitationPassword(input.password);

    if (validated.password === null) {
      return { status: "rejected" };
    }
    const slug = String(input.slug);
    const scope = invitationUnlockScope(slug);
    // The attempt is counted before the lock is read, so a script cannot probe the store or the verifier for free.
    if (!(await this.rateLimiter.consume(scope, input.clientAddress))) {
      throw new InvitationUnlockRateLimitedError();
    }
    const countsPerClient = input.clientAddress !== UNKNOWN_CLIENT_ADDRESS;

    if (
      countsPerClient &&
      !(await this.rateLimiter.consume(INVITATION_UNLOCK_CLIENT_SCOPE, input.clientAddress))
    ) {
      throw new InvitationUnlockRateLimitedError();
    }

    const lock = isValidInvitationSlug(slug) ? await this.locks.findLockBySlug(slug) : null;

    if (lock === null || lock.passwordHash === null) {
      await spendInvitationPasswordVerification(validated.password);

      return { status: "rejected" };
    }
    if (!(await verifyInvitationPassword(lock.passwordHash, validated.password))) {
      return { status: "rejected" };
    }
    await this.refund(scope, input.clientAddress);
    if (countsPerClient) {
      await this.refund(INVITATION_UNLOCK_CLIENT_SCOPE, input.clientAddress);
    }
    const minted = this.tokens.mint(lock.invitationId, lock.passwordVersion, this.now());

    return { status: "unlocked", ...minted };
  }

  /**
   * Gives one counted attempt back after the code matched. A failed refund never refuses a correct code: the worst case
   * is a counter that keeps counting this unlock, and the store's own failure surfaces on the next attempt's `consume`.
   */
  private async refund(scope: string, clientAddress: string): Promise<void> {
    await this.rateLimiter.refund(scope, clientAddress).catch(() => undefined);
  }
}
