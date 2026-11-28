import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";

import {
  InvalidInvitationPasswordError,
  InvitationPasswordNotAvailableError,
  InvitationUnlockRateLimitedError,
} from "../application/invitation-password.errors";
import type { UnlockInvitationResult } from "../application/invitation-unlock.use-cases";
import type { InvitationPasswordState } from "../application/invitation.repository";
import { mapInvitationError } from "./invitation.response";

// The stable REST shapes of the access-code feature (F13; S2.13, L18). Three of them:
//
//   * the owner's answer, which states only whether a code is set and its version — never the code, never the hash;
//   * the locked answer of every public invitation route, which carries no invitation data but the one display name the
//     lock screen needs (L18.2, L18.3);
//   * the successful unlock, which carries the access token and its expiry.
//
// Error codes: `INVALID_INVITATION_PASSWORD` carries the domain's issues (400), `PASSWORD_PROTECTION_NOT_AVAILABLE` is 409
// because the invitation is visible but its package does not grant the capability (L18.5), and the unlock refusals are
// the two neutral ones below. An error this module does not own is mapped by the invitation error mapper, so a foreign
// invitation keeps its `INVITATION_NOT_FOUND` 404 (A4) and an archived one its `INVITATION_NOT_EDITABLE` 409 (A2).

/** What the owner's two writes answer (L18.1): whether a code is set, and the version every write raises. */
export interface InvitationPasswordStateResponse {
  passwordProtected: boolean;
  passwordVersion: number;
}

/** The locked answer of a public invitation route (L18.2): the lock state and the one name a lock screen draws. */
export interface InvitationLockedResponse {
  code: "INVITATION_LOCKED";
  /**
   * The celebrant's name, or the couple's — the only invitation data a locked request learns (L18.3) — or null when the
   * stored content names nobody, so the lock screen shows its generic line.
   */
  displayName: string | null;
  /**
   * The current address a previous one must redirect to before the lock screen (F11; L15.3), or null when the request
   * already names the current address. The web redirects first so the access cookie it sets lives at the address the
   * invitation is served from: a cookie scoped to a renamed address never reaches the current one.
   */
  redirectTo: string | null;
}

/**
 * The one neutral body of a refused unlock (L18.3): the same object for a wrong code and for an attempt over the limit,
 * so the answer never says which of the two happened. It carries no count, no remaining attempts, no hint, and nothing
 * about the invitation. The two answers differ in status only — 401 for a refused code, 429 for a refused attempt — which
 * is the pattern the open RSVP form and the guestbook already use for their own per-address limits.
 */
export const INVITATION_PASSWORD_REJECTED_RESPONSE = {
  code: "INVITATION_PASSWORD_REJECTED",
} as const;

/** A successful unlock (L18.2): the value the web stores in its `HttpOnly` cookie, and the instant it expires. */
export interface InvitationUnlockedResponse {
  accessToken: string;
  /** The expiry the token itself carries, so the cookie's own `Max-Age` never disagrees with it. */
  expiresAt: string;
}

export function toInvitationPasswordStateResponse(
  state: InvitationPasswordState,
): InvitationPasswordStateResponse {
  return {
    passwordProtected: state.passwordProtected,
    passwordVersion: state.passwordVersion,
  };
}

/**
 * The answer of the owner's two access-code writes, or the owner-facing 404 (A4): an id that names nothing and another
 * customer's invitation answer the same body, so the route never confirms that a foreign row exists.
 */
export function orInvitationPasswordState(
  state: InvitationPasswordState | null,
): InvitationPasswordStateResponse {
  if (state === null) {
    throw new NotFoundException({ code: "INVITATION_NOT_FOUND" });
  }

  return toInvitationPasswordStateResponse(state);
}

/**
 * The locked answer of one public request (L18.2, L18.3): 423 Locked with only the lock state, the display name, and the
 * current address a previous one must redirect to. It is thrown from the guard, before the route runs, so a locked
 * request reads, writes, uploads, or counts nothing.
 */
export function invitationLocked(displayName: string | null, redirectTo: string | null): never {
  throw new HttpException(
    { code: "INVITATION_LOCKED", displayName, redirectTo } satisfies InvitationLockedResponse,
    HttpStatus.LOCKED,
  );
}

/**
 * The refusal of one unlock attempt that did not open the invitation (L18.3): the same body whether the code was wrong,
 * the address names no visible invitation, or the invitation has no code. 401 and not 423: the request asked to exchange
 * a code for a token, and the code given was not accepted.
 */
export function invitationPasswordRejected(): never {
  throw new HttpException(INVITATION_PASSWORD_REJECTED_RESPONSE, HttpStatus.UNAUTHORIZED);
}

/**
 * The answer of an attempt over its own cap (L18.3): the *same* neutral body as a wrong code, with the 429 the shared
 * per-address limiters already answer, and no `Retry-After` that would tell an attacker how long to wait.
 */
export function invitationUnlockRateLimited(): never {
  throw new HttpException(INVITATION_PASSWORD_REJECTED_RESPONSE, HttpStatus.TOO_MANY_REQUESTS);
}

/** The restore-ready answer of a successful unlock, or the neutral refusal (L18.2). */
export function orInvitationUnlocked(result: UnlockInvitationResult): InvitationUnlockedResponse {
  if (result.status === "rejected") {
    return invitationPasswordRejected();
  }

  return { accessToken: result.token, expiresAt: result.expiresAt.toISOString() };
}

/**
 * Maps the owner's access-code errors to their HTTP outcome; an error this feature does not own goes to the invitation
 * mapper unchanged, so the ownership, archived, and id-format rules keep their own answers (A2, A4).
 *
 * - a value the domain refuses is 400 `INVALID_INVITATION_PASSWORD` with its issues;
 * - a pinned package that does not grant `PASSWORD_PROTECTION` is 409 `PASSWORD_PROTECTION_NOT_AVAILABLE`, and nothing is
 *   stored (L18.5).
 */
export function mapInvitationPasswordError(error: unknown): never {
  if (error instanceof InvalidInvitationPasswordError) {
    throw new BadRequestException({
      code: "INVALID_INVITATION_PASSWORD",
      issues: [...error.issues],
    });
  }
  if (error instanceof InvitationPasswordNotAvailableError) {
    throw new ConflictException({ code: "PASSWORD_PROTECTION_NOT_AVAILABLE" });
  }

  return mapInvitationError(error);
}

/**
 * Maps the unlock errors to their HTTP outcome: an address over its cap is the neutral 429, and anything else is
 * rethrown unchanged, because a store failure must never look like a refused code.
 */
export function mapInvitationUnlockError(error: unknown): never {
  if (error instanceof InvitationUnlockRateLimitedError) {
    return invitationUnlockRateLimited();
  }

  throw error;
}
