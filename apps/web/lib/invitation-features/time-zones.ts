/**
 * The time zones an invitation may store (S3, S4). This is the web's mirror of the API's allow-list
 * (`apps/api/src/invitations/domain/invitation-features.ts`): the API owns the list and refuses anything
 * outside it, and the web needs the same list to read a stored zone strictly, to offer exactly those
 * choices to the creator, and to recognize a value this runtime can format. Nothing here is a fallback: a
 * zone that is not an exact member is refused rather than replaced by the default.
 *
 * The order is the API's order, which is the order of the creator's select.
 */
export const INVITATION_TIME_ZONES = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Mazatlan",
  "America/Hermosillo",
  "America/Chihuahua",
  "America/Tijuana",
  "America/Matamoros",
  "America/Monterrey",
  "America/Merida",
  "America/Ojinaga",
  "America/Bahia_Banderas",
] as const;

export type InvitationTimeZone = (typeof INVITATION_TIME_ZONES)[number];

/** The zone a new invitation stores, and the one every older row reads (S4). */
export const DEFAULT_INVITATION_TIME_ZONE: InvitationTimeZone = "America/Mexico_City";

/** Whether a value is one exact member of the allow-list; nothing is trimmed or case-folded. */
export function isInvitationTimeZone(value: unknown): value is InvitationTimeZone {
  return typeof value === "string" && (INVITATION_TIME_ZONES as readonly string[]).includes(value);
}
