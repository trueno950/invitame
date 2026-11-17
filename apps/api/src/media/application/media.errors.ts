// The refusals of the media use cases (M8 S4). Each one is a distinct answer: an invisible asset or invitation is
// a 404, an archived invitation or an unmet package feature is a 409, a limit is a 409 with its own code, and a
// refused upload or update is a 400 with the domain's issues. None of them carries an owner, a key, a provider, or
// a stored value.

/** The asset, or the invitation behind it, is invisible to this caller: missing, foreign, or already deleted. */
export class MediaNotFoundError extends Error {
  constructor() {
    super("The media asset was not found.");
    this.name = "MediaNotFoundError";
  }
}

/** The pinned package does not grant `GALLERY`, so this invitation has no gallery to fill (S3, S4). */
export class GalleryNotAvailableError extends Error {
  constructor() {
    super("The gallery is not available for this invitation.");
    this.name = "GalleryNotAvailableError";
  }
}

/** Which limit of S4 was reached: the 12 gallery photos, or the 40 stored assets of one invitation. */
export type MediaLimit = "gallery" | "assets";

/** One of the media limits of S4 is already reached; nothing was stored. */
export class MediaLimitExceededError extends Error {
  constructor(readonly limit: MediaLimit) {
    super(`The ${limit} media limit is reached.`);
    this.name = "MediaLimitExceededError";
  }
}

/** The upload was refused: the domain's issues say why, and nothing was stored or written. */
export class InvalidMediaUploadError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The upload was refused.");
    this.name = "InvalidMediaUploadError";
  }
}

/** The update was refused: the domain's issues say why, and nothing changed. */
export class InvalidMediaUpdateError extends Error {
  constructor(readonly issues: readonly string[]) {
    super("The media update was refused.");
    this.name = "InvalidMediaUpdateError";
  }
}
