// The refusals of the album use cases (F8; S2.8, L11.3, L26). Each one is a distinct answer: an invisible invitation is
// the guest page's 404, a visible invitation whose album takes no photo is a 409, an address over its hourly cap is a
// 429, a refused file is a 400 with the domain's issues, a full album is a 409 with its own code, and a pending queue over
// its own cap is a 409 with a second code, so the guest reads exactly why the photo was not stored. None of them carries
// an owner, a key, a provider, or a stored value.

/**
 * The invitation is visible, but its album takes no photo right now (L11.3): the pinned package does not grant
 * `GUEST_ALBUM`, the invitation expired, or it stopped being published during the upload.
 */
export class GuestAlbumClosedError extends Error {
  constructor() {
    super("The guest album is closed for this invitation.");
    this.name = "GuestAlbumClosedError";
  }
}

/** This client address already uploaded the hourly maximum to this invitation (L11.3). */
export class GuestAlbumRateLimitedError extends Error {
  constructor() {
    super("The guest album received too many photos from this address.");
    this.name = "GuestAlbumRateLimitedError";
  }
}

/** The invitation already holds `GUEST_PHOTO_MAX_STORED` photos that count toward its cap (L11.3, L26). */
export class GuestAlbumFullError extends Error {
  constructor() {
    super("The guest album of this invitation is full.");
    this.name = "GuestAlbumFullError";
  }
}

/**
 * The invitation already has `GUEST_PHOTO_MAX_PENDING` photos waiting for review (L26): the queue is full while the
 * album's total cap may still have room, so the refusal has its own code and the guest reads why.
 */
export class GuestAlbumPendingFullError extends Error {
  constructor() {
    super("The guest album of this invitation has too many photos waiting for review.");
    this.name = "GuestAlbumPendingFullError";
  }
}

/** The upload was refused: the domain's issues say why, and nothing was stored or written. */
export class InvalidGuestPhotoError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The photo was refused.");
    this.name = "InvalidGuestPhotoError";
  }
}
