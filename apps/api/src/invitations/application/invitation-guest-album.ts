import type { PublicGuestAlbum } from "../domain/invitation-features";

// The album of the guests' photos the public invitation read renders (F8; S2.8, L11.4). The invitations module owns what
// a guest may see and therefore declares this port; the media module implements it, so the invitation projection never
// imports a media repository or queries its tables. The album is answered only while the package grants `GUEST_ALBUM`,
// which the public read decides from the same gated keys as every other feature, and only PUBLISHED photos are ever in
// it: a pending or hidden photo is invisible to a guest even if a caller forgets the projection.

export type { PublicGuestAlbum };

/** The album source of the public read. Answers only published photos, newest first and bounded. */
export interface InvitationGuestAlbumReader {
  readPublishedPhotos(invitationId: string): Promise<PublicGuestAlbum>;
}

export const INVITATION_GUEST_ALBUM_READER = Symbol("InvitationGuestAlbumReader");
