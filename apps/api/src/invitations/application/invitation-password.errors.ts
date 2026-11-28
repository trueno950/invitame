// The failures of the access-code feature (F13; S2.13, L18). Presentation maps them to HTTP; nothing here chooses a
// status code, and no message ever carries the plain code, a hash, or a token.

/**
 * The pinned package does not grant `PASSWORD_PROTECTION`, so this invitation may not be given an access code (L18.5).
 * Nothing is stored: the refusal is the catalog's answer, not the owner's, and withdrawing the key later never removes a
 * code that is already protecting an invitation.
 */
export class InvitationPasswordNotAvailableError extends Error {
  constructor() {
    super("The pinned package does not grant PASSWORD_PROTECTION.");
    this.name = "InvitationPasswordNotAvailableError";
  }
}

/**
 * The value the owner sent is not a usable access code (L18.1): a non-string, a value outside 4 to 40 characters, or
 * one carrying a control character. The issues are the domain's own sentences and carry no part of the value.
 */
export class InvalidInvitationPasswordError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`The access code is not valid: ${issues.join("; ")}`);
    this.name = "InvalidInvitationPasswordError";
  }
}

/**
 * One client address already spent its unlock attempts on this invitation (L18.3). Nothing was verified and no token was
 * minted; the caller answers the same neutral body a wrong code answers, so a locked-out attempt tells an attacker
 * nothing about the code it tried.
 */
export class InvitationUnlockRateLimitedError extends Error {
  constructor() {
    super("Too many unlock attempts for this address and invitation.");
    this.name = "InvitationUnlockRateLimitedError";
  }
}
