/**
 * What a guest invitation shows beyond its content (S3, S4). The API decides the features of one invitation
 * — its package's feature keys intersected with the implemented allow-list, plus add-to-calendar, which is
 * always on and is not a catalog feature — and hands the web exactly this shape. The web never reads a
 * package or a feature name to choose a code path: `countdown`, `map`, and `calendar` are booleans, and
 * `whatsapp` is either a stored contact or nothing at all.
 *
 * This module is data only. The block that renders these features is
 * `app/_components/invitation-features/invitation-features-block.ts`.
 */

/** The creator's WhatsApp contact of one invitation, stored in E.164. */
export interface WhatsAppContact {
  /** An E.164 number: `+`, then 8 to 15 digits. */
  readonly phone: string;
}

/** The features of one invitation, as the public read returns them. */
export interface InvitationFeatures {
  /** The invitation's IANA time zone: every wall clock of the page is read in it. */
  readonly timeZone: string;
  readonly countdown: boolean;
  readonly map: boolean;
  readonly calendar: boolean;
  /** The stored contact, or null when the invitation has no WhatsApp number. */
  readonly whatsapp: WhatsAppContact | null;
}

/** An E.164 number: a `+`, a first digit from 1 to 9, and 7 to 14 digits after it. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** Whether the text is an E.164 phone number, compared by pattern and never normalized. */
export function isE164Phone(phone: string): boolean {
  return E164.test(phone);
}

/** Whether an invitation has any feature to show, which decides whether the block renders at all. */
export function hasAnyFeature(features: InvitationFeatures): boolean {
  return features.countdown || features.map || features.calendar || features.whatsapp !== null;
}
