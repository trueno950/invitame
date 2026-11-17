import type { PublicGalleryPhoto } from "../domain/invitation-features";

// The gallery the public invitation read renders (M8 S4). The invitations module owns what a guest may see and
// therefore declares this port; the media module implements it, so the invitation projection never imports a media
// repository or queries its tables. A photo is answered only while the package grants `GALLERY`, which the public
// read decides from the same gated keys as every other feature.

export type { PublicGalleryPhoto };

/** The gallery source of the public read. Answers only stored photos, in position order. */
export interface InvitationGalleryReader {
  readGallery(invitationId: string): Promise<PublicGalleryPhoto[]>;
}

export const INVITATION_GALLERY_READER = Symbol("InvitationGalleryReader");
