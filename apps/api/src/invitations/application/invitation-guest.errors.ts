// The failures of the guest-list use cases (M6 G2; S1, S4). The domain owns the rules about names, seats, phones,
// notes, and totals; these errors report an outcome it cannot state on its own: a guest the domain refused, a
// package that does not grant the guest list or its access pass, a guest who has not confirmed, and a seat count
// that would not hold a party already confirmed. Presentation maps them to HTTP; nothing here chooses a status code.

/**
 * The guest a request asked for is not acceptable: a blank or too wide name, a seat count outside 1 to 10, a phone
 * the WhatsApp rules cannot normalize, or a note wider than 200 characters. `issues` are the deterministic English
 * explanations the domain produced; nothing was stored.
 */
export class InvalidGuestError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The guest is not valid.");
    this.name = "InvalidGuestError";
  }
}

/**
 * The invitation's pinned package does not grant `GUEST_LIST`, so it has no guest list to read or write. The
 * invitation is visible and the request is well formed; the package is what refuses it (S3, S4).
 */
export class GuestListNotAvailableError extends Error {
  constructor() {
    super("The invitation's package does not include the guest list.");
    this.name = "GuestListNotAvailableError";
  }
}

/**
 * The invitation's pinned package does not grant `QR_PASS`, so its guests have no access pass and there is nothing
 * to check in (S3, S4).
 */
export class QrPassNotAvailableError extends Error {
  constructor() {
    super("The invitation's package does not include the QR pass.");
    this.name = "QrPassNotAvailableError";
  }
}

/**
 * The guest's personal token names a guest of this invitation, but that guest has not confirmed attendance, so
 * there is no party to admit. The answer says nothing about another guest and nothing about the token's history.
 */
export class GuestNotConfirmedError extends Error {
  constructor() {
    super("The guest has not confirmed attendance.");
    this.name = "GuestNotConfirmedError";
  }
}

/**
 * The new seat count cannot hold the party the guest already confirmed: the stored answer names more people than
 * the seats would allow. The confirmed party travels so the owner sees what to reconcile; nothing was changed.
 */
export class GuestSeatsBelowConfirmedPartyError extends Error {
  constructor(readonly partySize: number) {
    super("The guest already confirmed a larger party.");
    this.name = "GuestSeatsBelowConfirmedPartyError";
  }
}

/**
 * The named invitation is this owner's, but it has no guest with that id or that personal token. It is separate from
 * a missing invitation on purpose: a foreign or unknown invitation keeps the invitation 404, so nothing tells the
 * two apart (A4), while a guest that is not part of an invitation this owner holds is its own 404.
 */
export class GuestNotFoundError extends Error {
  constructor() {
    super("The invitation has no such guest.");
    this.name = "GuestNotFoundError";
  }
}
