// The failures of the guestbook use cases (F7; S2.7, L10.3). The domain owns the rules about a signature and a message;
// these errors report an outcome it cannot state on its own: a signature the domain refused, a guestbook the invitation
// does not offer right now, and a submission over the rate limit. Presentation maps them to HTTP; nothing here chooses
// a status code.

/**
 * The signature a guest submitted is not acceptable: the name or the message is blank, wider than its bound, or not a
 * text. `issues` are the deterministic English explanations the domain produced; nothing was stored.
 */
export class InvalidGuestbookEntryError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The guestbook entry is not valid.");
    this.name = "InvalidGuestbookEntryError";
  }
}

/**
 * The invitation is visible, but its guestbook is closed right now: the pinned package does not grant `GUESTBOOK`, the
 * invitation expired, or the write found the invitation no longer published. One error for every case, because a guest
 * only needs to know the wall does not take a signature.
 */
export class GuestbookClosedError extends Error {
  constructor() {
    super("The invitation is not accepting guestbook entries.");
    this.name = "GuestbookClosedError";
  }
}

/**
 * This client address already used its signatures on this invitation within the window. The answer names no count and
 * no window: a guest only needs to know the signature was not recorded.
 */
export class GuestbookRateLimitedError extends Error {
  constructor() {
    super("Too many guestbook entries for this invitation.");
    this.name = "GuestbookRateLimitedError";
  }
}
