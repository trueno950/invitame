// The owner facet of the administrator's invitation status view (M9 T2; S1, L3). The owner decided the status view
// shows «Solo el correo»: this port answers exactly that one field and nothing else about a user — no display name, no
// account status, no role, no session — so the invitations module cannot render personal data it never read.
//
// The invitations module owns the shape the status view needs and declares the port; the users module implements it,
// following the `INVITATION_GALLERY_READER` precedent, so no module queries another module's tables.

/** The owner source of the administrator's status view. */
export interface InvitationOwnerEmailReader {
  /**
   * The stored email of each of the given owners, in one batched read: an owner id no row has is absent from the map.
   * A page of the status view asks once for every distinct owner it shows, never once per row.
   */
  emailsFor(ownerIds: readonly string[]): Promise<Map<string, string>>;
}

export const INVITATION_OWNER_EMAIL_READER = Symbol("InvitationOwnerEmailReader");
