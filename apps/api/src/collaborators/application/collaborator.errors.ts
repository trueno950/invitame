/**
 * The failures of the co-host routes (F12; S2.12, L17). Each one names a rule, never a value: no address, token, id, or
 * permission set of the payload travels in a message, so a refusal can be returned and logged as is.
 */

/** The body asked for something a collaborator invitation cannot be: a bad address or a bad permission set (400). */
export class InvalidCollaboratorInvitationError extends Error {
  override readonly name = "InvalidCollaboratorInvitationError";

  constructor(readonly issues: readonly string[]) {
    super("The collaborator invitation is invalid.");
  }
}

/** The invitation's pinned package does not grant `CO_HOSTS`, so the owner cannot invite anybody (L17.5; 409). */
export class CollaboratorFeatureNotAvailableError extends Error {
  override readonly name = "CollaboratorFeatureNotAvailableError";

  constructor() {
    super("The pinned package does not grant CO_HOSTS.");
  }
}

/** That address already has a standing invitation to this invitation (409): one address, one link (L17.1). */
export class CollaboratorAlreadyInvitedError extends Error {
  override readonly name = "CollaboratorAlreadyInvitedError";

  constructor() {
    super("That address is already invited to this invitation.");
  }
}

/** The invitation already keeps five non-revoked collaborators (L17.1; 409). */
export class CollaboratorLimitReachedError extends Error {
  override readonly name = "CollaboratorLimitReachedError";

  constructor() {
    super("The invitation keeps at most five collaborators.");
  }
}

/**
 * The one refusal every unusable acceptance answers (L17.3): a wrong account, an expired token, a token already used, a
 * revoked collaborator, and a token that names nothing are the same answer, so a caller never learns which one it was.
 */
export class CollaborationRefusedError extends Error {
  override readonly name = "CollaborationRefusedError";

  constructor() {
    super("The collaboration invitation is not available.");
  }
}

/**
 * The invitation was stored but its email could not be delivered (503). The row stays, because nothing about the
 * decision was wrong; the owner revokes it and invites the address again, which mints a new link.
 */
export class CollaboratorEmailUnavailableError extends Error {
  override readonly name = "CollaboratorEmailUnavailableError";

  constructor() {
    super("The invitation email could not be delivered.");
  }
}
