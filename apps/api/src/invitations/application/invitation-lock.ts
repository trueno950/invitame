import type { JsonObject } from "../domain/invitation-content";
import { lockScreenDisplayName } from "../domain/invitation-password";
import { isValidInvitationSlug } from "../domain/invitation-slug";
import type { InvitationAccessTokens } from "./invitation-access-token";

// The gate of a password-protected invitation (F13; S2.13, L18.2). One decision per public request, taken before the
// route runs: a published invitation that stores an access code answers no data at all unless the request carries a
// token the API minted for that same invitation and that same password version. The decision is deliberately the
// smallest possible read — the invitation id, its stored hash, its version, and its content — so the gate never builds,
// renders, or maps a projection of an invitation it will not serve.
//
// The gate answers "pass" for every case the route already handles: an address no invitation holds, a draft, an
// archived or expired-invisible invitation, and an invitation with no access code. The route then answers its own 404 or
// its own page, so the lock adds no new answer to an invitation that is not locked.
//
// A store failure is an error, never a pass: a gate that cannot read the lock refuses the request instead of serving an
// invitation that may be locked.

/**
 * One published invitation as the gate reads it (L18.2). It carries the hash only because the unlock route verifies
 * against it; nothing else in the API reads a stored hash, and no read answers it.
 */
export interface StoredInvitationLock {
  readonly invitationId: string;
  /** The encoded scrypt hash, or null when the invitation has no access code. */
  readonly passwordHash: string | null;
  readonly passwordVersion: number;
  /** The stored content, so the lock screen can name the celebration without a second read (L18.3). */
  readonly content: JsonObject;
  /**
   * The current address a previous one must redirect to (F11; L15.3), or null when the requested address already is the
   * current one. A locked read carries it so the web can send the guest to the address its own access cookie is scoped
   * to before drawing the lock screen: a cookie set at a renamed address never reaches the current one.
   */
  readonly redirectTo: string | null;
}

/**
 * The one statement that reads a lock by public address (L18.2, L18.3): the current address or any previous one, and
 * only while the invitation is PUBLISHED, so a draft that once held the address stays invisible exactly as the public
 * read does.
 */
export interface InvitationLockReader {
  findLockBySlug(slug: string): Promise<StoredInvitationLock | null>;
}

/** The DI token of the lock reader (L18.2). */
export const INVITATION_LOCK_READER = Symbol("InvitationLockReader");

/** What the gate decided for one request: it may pass, or it must answer the locked state. */
export type InvitationPasswordGateDecision =
  | { readonly locked: false }
  | {
      readonly locked: true;
      /** The only invitation data a locked answer carries (L18.3), or null when the content names nobody. */
      readonly displayName: string | null;
      /** The current address the web redirects to before drawing the lock screen (F11; L15.3), when one applies. */
      readonly redirectTo: string | null;
    };

/**
 * The gate of the public invitation routes (F13; L18.2). It is asked once per public request by the guard, with the
 * address the request names and the value of its access header, and it is the only place that decides whether an
 * invitation is locked for that request.
 */
export class InvitationPasswordGate {
  constructor(
    private readonly locks: InvitationLockReader,
    private readonly tokens: InvitationAccessTokens,
    /** The instant the token expiry is judged at (L18.2); injectable so a test observes the boundary exactly. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(
    slug: unknown,
    presentedToken: string | undefined,
  ): Promise<InvitationPasswordGateDecision> {
    // A malformed address names nothing: the route answers its own 404, as it always did (A3).
    if (typeof slug !== "string" || !isValidInvitationSlug(slug)) {
      return { locked: false };
    }
    const lock = await this.locks.findLockBySlug(slug);

    if (lock === null || lock.passwordHash === null) {
      return { locked: false };
    }
    const admitted = this.tokens.isValid(
      presentedToken,
      lock.invitationId,
      lock.passwordVersion,
      this.now(),
    );

    return admitted
      ? { locked: false }
      : {
          locked: true,
          displayName: lockScreenDisplayName(lock.content),
          redirectTo: lock.redirectTo,
        };
  }
}
