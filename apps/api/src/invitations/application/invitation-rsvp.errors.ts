// The failures of the RSVP use cases (M6 G1; S1, S4). The domain owns the rules about names, settings, and party
// sizes; these errors report an outcome it cannot state on its own: a response the domain refused, a published
// invitation that does not accept an open response, and a submission over the rate limit. Presentation maps them
// to HTTP; nothing here chooses a status code.

/**
 * The settings a request asked for are not acceptable: the deadline is not an ISO instant with an offset, or the
 * party limit is not an integer from 1 to 10. `issues` are the deterministic English explanations the domain
 * produced; nothing was stored.
 */
export class InvalidRsvpSettingsError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The RSVP settings are not valid.");
    this.name = "InvalidRsvpSettingsError";
  }
}

/**
 * The response a guest submitted is not acceptable against the invitation's party limit. `issues` are the
 * deterministic English explanations the domain produced; nothing was stored.
 */
export class InvalidRsvpResponseError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The RSVP response is not valid.");
    this.name = "InvalidRsvpResponseError";
  }
}

/**
 * The invitation is visible, but it does not accept an open response right now: its package grants no `RSVP`, it
 * grants `GUEST_LIST` instead (personal links replace the open form, G2), the deadline has passed, or the write
 * found the invitation no longer published.
 */
export class RsvpNotOpenError extends Error {
  constructor() {
    super("The invitation is not accepting RSVP responses.");
    this.name = "RsvpNotOpenError";
  }
}

/**
 * This client address already used its submissions to this invitation within the window. The answer names no
 * count and no window: a guest only needs to know the submission was not recorded.
 */
export class RsvpRateLimitedError extends Error {
  constructor() {
    super("Too many RSVP submissions for this invitation.");
    this.name = "RsvpRateLimitedError";
  }
}
