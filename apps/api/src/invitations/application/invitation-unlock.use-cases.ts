import { isValidInvitationSlug } from "../domain/invitation-slug";
import type { InvitationAccessTokens } from "./invitation-access-token";
import type { InvitationLockReader } from "./invitation-lock";
import { InvitationUnlockRateLimitedError } from "./invitation-password.errors";
import {
  type InvitationUnlockRateLimiter,
  invitationUnlockScope,
  unknownInvitationUnlockScope,
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
// 1. the attempt is counted first, under the invitation the address resolves to (or a digest of the address when it
//    resolves to nothing), so no request of the route is free — a script cannot probe codes without spending its budget,
//    and an unknown address is limited exactly like a known one;
// 2. the lock is read; an address no published invitation holds, and an invitation with no code, answer the same neutral
//    refusal as a wrong code, after the same scrypt work, so the answer is never an oracle for "does this invitation
//    exist" or "is it protected";
// 3. the code is verified in constant time against the stored hash;
// 4. only then is a token minted, signed over the invitation id, the stored password version, and the expiry.
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
 * One unlock attempt (F13; L18.2, L18.3). Answers `rejected` — never an error and never a different body — for a code
 * that does not match, for an address no published invitation holds, and for an invitation with no access code; throws
 * `InvitationUnlockRateLimitedError` when this address is over its cap for this invitation and changes nothing.
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
    const lock =
      typeof input.slug === "string" && isValidInvitationSlug(input.slug)
        ? await this.locks.findLockBySlug(input.slug)
        : null;
    const scope =
      lock === null
        ? unknownInvitationUnlockScope(String(input.slug))
        : invitationUnlockScope(lock.invitationId);

    if (!(await this.rateLimiter.consume(scope, input.clientAddress))) {
      throw new InvitationUnlockRateLimitedError();
    }
    if (lock === null || lock.passwordHash === null) {
      await spendInvitationPasswordVerification(input.password);

      return { status: "rejected" };
    }
    if (!(await verifyInvitationPassword(lock.passwordHash, input.password))) {
      return { status: "rejected" };
    }
    const minted = this.tokens.mint(lock.invitationId, lock.passwordVersion, this.now());

    return { status: "unlocked", ...minted };
  }
}
