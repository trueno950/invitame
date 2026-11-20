// The owner's account state, as the administrator's support card needs it (M9 T9; S4, L8, L9). The invitation detail
// already answers the owner's id and email (T8, T2); the card offers «Desactivar cuenta» or «Reactivar cuenta» and the
// sign-in-code resend for that account, so it needs exactly one more field: whether the account is active.
//
// This is a sibling of `INVITATION_OWNER_EMAIL_READER`, not a widening of it: that port's own contract says it answers
// «solo el correo» (L3) and nothing else about a user, and the list still asks it for a page of rows. Only the detail
// asks this one, for its single owner, so the privacy rule of the list is unchanged and the detail states its one
// additive field explicitly (design S4: the detail gains what the support card must know).
//
// The invitations module owns the shape the page renders and declares the port; the users module implements it, so no
// module queries another module's tables.

/** The stored `User.status` labels the support card distinguishes; anything else is left to the API's own refusal. */
export const OWNER_ACCOUNT_STATUSES = ["ACTIVE", "DISABLED"] as const;

export type OwnerAccountStatus = (typeof OWNER_ACCOUNT_STATUSES)[number];

/** The owner account state of the administrator's invitation detail. */
export interface InvitationOwnerStatusReader {
  /**
   * The stored status of each of the given owners, in one batched read: an owner id no row has is absent from the map.
   * The detail asks once, for its one owner; nothing here answers a role, a name, a session, or an address.
   */
  statusesFor(ownerIds: readonly string[]): Promise<Map<string, OwnerAccountStatus>>;
}

export const INVITATION_OWNER_STATUS_READER = Symbol("InvitationOwnerStatusReader");
