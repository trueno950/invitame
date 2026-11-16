/**
 * What a guest invitation shows beyond its content (S3, S4, S7). The API decides the features of one invitation
 * — its package's feature keys intersected with the implemented allow-list, plus add-to-calendar, which is
 * always on and is not a catalog feature — and hands the web exactly this shape. The web never reads a
 * package or a feature name to choose a code path: `countdown`, `map`, `calendar`, and `giftRegistry` are
 * booleans, `whatsapp` is either a stored contact or nothing at all, and `music` is either a stored link with the
 * service it names or nothing at all.
 *
 * This module is data only. The block that renders these features is
 * `app/_components/invitation-features/invitation-features-block.ts`; the layouts render their own gift registry
 * block, gated by `giftRegistry` (F7).
 */

import type { MusicLink } from "./music.ts";

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
  /** The stored playlist link and the service it names, or null when music is not gated on (S7). */
  readonly music: MusicLink | null;
  /**
   * Whether the layouts render their own gift registry block (F7; S7). The content decides its value: the gate
   * says the package grants it, the layout says whether there is something to show.
   */
  readonly giftRegistry: boolean;
}

/** An E.164 number: a `+`, a first digit from 1 to 9, and 7 to 14 digits after it. */
const E164 = /^\+[1-9]\d{7,14}$/;

/** Whether the text is an E.164 phone number, compared by pattern and never normalized. */
export function isE164Phone(phone: string): boolean {
  return E164.test(phone);
}

/**
 * The feature keys the API implements and gates (S4, S7). This is the web's mirror of the API's allow-list,
 * used only to read an `availableFeatures` list strictly: a key outside it is data this deployment does not
 * understand, so the client refuses the whole body instead of letting an unknown key through. A key never
 * selects a code path on the guest page.
 */
export const INVITATION_FEATURE_KEYS = [
  "COUNTDOWN",
  "MAP",
  "WHATSAPP",
  "MUSIC",
  "GIFT_REGISTRY",
  "RSVP",
  "CALENDAR",
] as const;

export type InvitationFeatureKey = (typeof INVITATION_FEATURE_KEYS)[number];

/** Whether a value is one exact, implemented feature key. */
export function isInvitationFeatureKey(value: unknown): value is InvitationFeatureKey {
  return (
    typeof value === "string" && (INVITATION_FEATURE_KEYS as readonly string[]).includes(value)
  );
}

/**
 * Whether the shared features block has anything to render, which decides whether it renders at all. The gift
 * registry is not part of it — the layout draws its own block — so a gift registry alone renders no features
 * block, and a page whose only gated feature is the gift registry keeps exactly the features block markup it
 * had before this batch.
 */
export function hasAnyFeature(features: InvitationFeatures): boolean {
  return (
    features.countdown ||
    features.map ||
    features.calendar ||
    features.whatsapp !== null ||
    features.music !== null
  );
}

/**
 * Whether a layout renders the gift registry block of its own content (F7; S7): the content must carry a value
 * and, when the page is rendering a real invitation, the API must have gated the feature on. A renderer called
 * with no `features` at all is a creator preview or a sample — there is no gate to consult there, so the content
 * alone decides and those renders stay exactly as they were before this batch. That rule is what keeps the
 * template chooser and `lib/renderers/samples.ts` unchanged, and it is the reason the gate is optional.
 */
export function showsGiftRegistry(
  features: InvitationFeatures | undefined,
  value: string | undefined,
): value is string {
  return value !== undefined && (features === undefined || features.giftRegistry);
}
