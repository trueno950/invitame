import { validateInvitationPassword } from "../domain/invitation-password";
import { isValidInvitationSlug } from "../domain/invitation-slug";
import type { InvitationAccessTokens } from "./invitation-access-token";
import type { InvitationLockReader } from "./invitation-lock";
import { InvitationUnlockRateLimitedError } from "./invitation-password.errors";
import {
  INVITATION_UNLOCK_CLIENT_SCOPE,
  INVITATION_UNLOCK_VERIFICATION_SCOPE,
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
// 2. the hard ceiling is spent next: 300 verifications per 15 minutes per client address, whatever address each of them
//    names, counted before the lock read and before any scrypt work. Over it, the route answers the existing neutral 429
//    immediately, so an abuser cannot buy unbounded hashing (L33); this is the only refusal that happens before the code
//    is verified;
// 3. the two soft budgets are counted before the lock is read — the cap that spans every address under the caller's own
//    client address, then the per-address one under a digest of the requested address (or, for an address nothing
//    resolves, of that address) — but their exhaustion no longer refuses the attempt (L33): the code is verified either
//    way, and a spent budget only decides how a code that did not open the invitation answers;
// 4. the lock is read; an address no published invitation holds, and an invitation with no code, answer the same neutral
//    refusal as a wrong code, after the same scrypt work, so the answer is never an oracle for "does this invitation
//    exist" or "is it protected";
// 5. the code is verified in constant time against the stored hash;
// 6. a code that opened the invitation refunds both soft counts — a successful unlock does not count toward a cap that
//    only failures should spend, so guests behind one venue address are not locked out by their own correct unlocks — and
//    a token is minted, signed over the invitation id, the stored password version, and the expiry. The ceiling is never
//    refunded: it counts the verifications the address bought, not the failures it made;
// 7. a code that did not open the invitation answers the neutral 429 once either soft budget is spent, so the over-limit
//    state stays observable to the guest, and the neutral 401 otherwise. Both carry the same body, and the failed attempt
//    stays counted (L33).
//
// When no client address resolves, neither cap that spans every address is spent — neither the cross-address failures nor
// the ceiling of verifications: the public forms hash the shared `unknown` value into a key that also names their
// invitation, so their fallback bucket spans one invitation, and a bucket that spanned every invitation would let one
// caller exhaust every guest's budget or every guest's ceiling (L18.3, L33). The per-address budget still applies, exactly
// as it does for the open RSVP form, so a wrong code from an unresolved address answers 429 once that budget is spent.
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
 * One unlock attempt (F13; L18.2, L18.3, L33). Answers `rejected` — never an error and never a different body — for a value
 * no code can be, a code that does not match, an address no published invitation holds, and an invitation with no access
 * code; throws `InvitationUnlockRateLimitedError` when this address is over the hard ceiling of verifications (before the
 * lock is read and before any hashing) or when a code that did not open the invitation did so after its soft budgets were
 * spent (after the verification), and changes nothing beyond the counters either way.
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
    const countsPerClient = input.clientAddress !== UNKNOWN_CLIENT_ADDRESS;

    // The hard ceiling is spent first and is the only cap that refuses before the verifier: it bounds the scrypt work one
    // client address can buy across every address, so an over-ceiling attempt answers the neutral 429 without a lock read
    // and without a derivation (L33).
    if (
      countsPerClient &&
      !(await this.rateLimiter.consume(INVITATION_UNLOCK_VERIFICATION_SCOPE, input.clientAddress))
    ) {
      throw new InvitationUnlockRateLimitedError();
    }

    // The two soft budgets are still counted before the lock is read, so every attempt that reaches the verifier is one a
    // failure can be charged for — but their exhaustion no longer refuses it (L33): it is recorded and only decides the
    // answer of a code that did not open the invitation.
    let budgetSpent = false;

    if (
      countsPerClient &&
      !(await this.rateLimiter.consume(INVITATION_UNLOCK_CLIENT_SCOPE, input.clientAddress))
    ) {
      budgetSpent = true;
    }
    if (!(await this.rateLimiter.consume(scope, input.clientAddress))) {
      budgetSpent = true;
    }

    const lock = isValidInvitationSlug(slug) ? await this.locks.findLockBySlug(slug) : null;

    if (lock === null || lock.passwordHash === null) {
      await spendInvitationPasswordVerification(validated.password);

      return this.refuse(budgetSpent);
    }
    if (!(await verifyInvitationPassword(lock.passwordHash, validated.password))) {
      return this.refuse(budgetSpent);
    }
    await this.refund(scope, input.clientAddress);
    if (countsPerClient) {
      await this.refund(INVITATION_UNLOCK_CLIENT_SCOPE, input.clientAddress);
    }
    const minted = this.tokens.mint(lock.invitationId, lock.passwordVersion, this.now());

    return { status: "unlocked", ...minted };
  }

  /**
   * The answer of a code that did not open the invitation (L33): the neutral 429 once a soft budget of this address is
   * spent, so the over-limit state stays observable to the guest, and the neutral 401 otherwise. Both carry the same body;
   * the route maps each to its own status, and the refused attempt stays counted as the failure it was.
   */
  private refuse(budgetSpent: boolean): UnlockInvitationResult {
    if (budgetSpent) {
      throw new InvitationUnlockRateLimitedError();
    }

    return { status: "rejected" };
  }

  /**
   * Gives one counted attempt back after the code matched. A failed refund never refuses a correct code: the worst case is
   * a counter that keeps counting this unlock, and the store's own failure surfaces on the next attempt's `consume`.
   */
  private async refund(scope: string, clientAddress: string): Promise<void> {
    await this.rateLimiter.refund(scope, clientAddress).catch(() => undefined);
  }
}
