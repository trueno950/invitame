// The media facet of the administrator's invitation status view (M9 T2; S1). The invitations module owns what the
// status view shows and therefore declares this port; the media module implements it, following the
// `INVITATION_GALLERY_READER` precedent, so the invitation read never imports a media repository or queries its
// tables. Counts only: no storage key, no URL, no alt text, and no binary.

/** How many stored photos one invitation has. */
export interface InvitationMediaCounts {
  /** Whether a stored main photo exists. */
  mainPhoto: boolean;
  /** How many stored gallery photos exist, in any position. */
  galleryCount: number;
}

/** The media source of the administrator's status view. */
export interface InvitationMediaCountReader {
  /**
   * The stored counts of each of the given invitations, in one batched read: an invitation with no stored asset is
   * absent from the map. A page of the status view asks once for every row it shows, never once per row.
   */
  countsFor(invitationIds: readonly string[]): Promise<Map<string, InvitationMediaCounts>>;
}

export const INVITATION_MEDIA_COUNT_READER = Symbol("InvitationMediaCountReader");
