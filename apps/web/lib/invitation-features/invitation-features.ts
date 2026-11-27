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

import type { RsvpCompanionValue } from "../public/rsvp-companions.ts";
import type { GalleryPhoto } from "./gallery.ts";
import type { GiftRegistry } from "./gift-registry.ts";
import type { ItineraryMoment } from "./itinerary.ts";
import { type Lodging, lodgingHasContent } from "./lodging.ts";
import type { MusicLink } from "./music.ts";
import type { StoredPlaces } from "./place-point.ts";

/** The creator's WhatsApp contact of one invitation, stored in E.164. */
export interface WhatsAppContact {
  /** An E.164 number: `+`, then 8 to 15 digits. */
  readonly phone: string;
}

/** The server action an RSVP form posts to (M6 G3; S4); it is a server function, never a client script. */
export type RsvpFormAction = (formData: FormData) => Promise<void>;

/**
 * The open RSVP form of a guest page (M6 G3; S4), as the shared features block renders it. The API owns the
 * decision: the page only builds this view when the invitation accepts open answers, and the block shows the
 * form while `closed` is false and a note once the deadline has passed. `action` is the server action the form
 * posts to; it is absent only in a render that does not submit anything (tests, previews), never on the public
 * page.
 */
export interface RsvpBlockView {
  /** The invitation's public slug, the only value that names it to the API. */
  readonly slug: string;
  /** The party any answer may name: the creator's limit, from 1 to 10. */
  readonly partyLimit: number;
  /** The deadline as an ISO instant, or null when the invitation accepts answers until it is unpublished. */
  readonly deadline: string | null;
  /** Whether the deadline has already passed, so the block shows the closing note instead of the form. */
  readonly closed: boolean;
  readonly action?: RsvpFormAction;
}

/**
 * The attendance card of one guest's personal page (M6 G4; S4), as the shared features block renders it. The guest
 * record already holds the name and the phone the API ignores in the body, so this card never asks for them; the party
 * it offers stops at the guest's own seats, and a decline names no party at all.
 */
export interface GuestRsvpBlockView {
  /** The invitation's public slug, the only value that names it to the API. */
  readonly slug: string;
  /** The guest's opaque personal token, the only value that names the guest. */
  readonly token: string;
  /** The seats the creator reserved, which bound every party the card offers. */
  readonly seats: number;
  /** Every party the card offers: one per seat, from 1 to the guest's own seats. */
  readonly partySizes: readonly number[];
  /** The answer the guest last gave, or null when they have not answered yet. */
  readonly answer: { readonly attending: boolean; readonly partySize: number } | null;
  /**
   * The companions of the guest's last answer, so the rows start from it (F3; L6.1). Empty when they answered none or
   * have not answered yet, and empty for an answer stored before the companions existed.
   */
  readonly companions: readonly RsvpCompanionValue[];
  /** The dietary notes of the last answer, or "" when they left none (F3; L6.1). */
  readonly dietaryNotes: string;
  /** The message the guest last left, or "" when they left none. */
  readonly message: string;
  /** The creator's deadline as an ISO instant, or null when the invitation has none. */
  readonly deadline: string | null;
  /** Whether the deadline already passed, so the card shows the closing note instead of the form. */
  readonly closed: boolean;
  readonly action?: RsvpFormAction;
}

/**
 * The access pass of a confirmed guest (M6 G4; S4; F5): the absolute check-in URL the QR encodes, the guest's name as
 * the ticket heads it, the table the owner assigned, and the confirmed people it counts. Only the pass draws the
 * table: the rest of the page never mentions it (L8.4).
 */
export interface GuestPassBlockView {
  readonly checkInUrl: string;
  /** The guest's name as the ticket heads it, from the personal read. */
  readonly name: string;
  /** The table the owner assigned, or null: the ticket then prints only the people count (F5; L8.4). */
  readonly tableLabel: string | null;
  /** The people this pass admits: the confirmed party size, never the seats the owner reserved (F5; L8.4). */
  readonly people: number;
}

/** One message of the guestbook wall (F7; L10.1): the signature and the message, both plain text. */
export interface GuestbookEntryValue {
  readonly authorName: string;
  readonly message: string;
}

/**
 * The guestbook wall of one guest page (F7; S2.7, L10.5), as the shared features block renders it. The API owns the
 * gate: the page builds this view only while the package grants `GUESTBOOK`. The wall lists the visible messages newest
 * first and serves the form below them; an expired invitation keeps the wall and closes the form with a note. `action`
 * is the server action the form posts to, so the block works with no client script at all.
 */
export interface GuestbookBlockView {
  /** The invitation's public slug, the only value that names it to the API. */
  readonly slug: string;
  /** The visible entries, already newest first and at most 50, as the API answered them. */
  readonly entries: readonly GuestbookEntryValue[];
  /** Whether the invitation expired, so the wall shows the closing note instead of the form. */
  readonly closed: boolean;
  readonly action?: RsvpFormAction;
}

/**
 * The guest's own block of their personal page: the greeting, the seats they hold, their answer card, and their pass
 * when the API offers one. It is absent on the public page, which is why a public render keeps exactly the markup it
 * had before a guest's name was known.
 */
export interface GuestPageBlockView {
  /** «Hola, Ana», from the first name the guest was registered with. */
  readonly greeting: string;
  /** «Tienes 4 lugares reservados a tu nombre.», with the singular when it is one. */
  readonly seats: string;
  /** The answer card, or absent when the invitation takes no personal answers. */
  readonly rsvp?: GuestRsvpBlockView;
  /** The pass, or absent while the guest has not confirmed or the package does not grant it. */
  readonly pass?: GuestPassBlockView;
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
  /**
   * The stored playlist link, the service it names, and the title and cover the API stored for it, or null when music
   * is not gated on (S7, S2).
   */
  readonly music: MusicLink | null;
  /**
   * Whether the layouts render their own gift registry block (F7; S7). The content decides its value: the gate
   * says the package grants it, the layout says whether there is something to show. It stays a boolean for an older
   * invitation's content text field, which the API withholds while the structured registry shows (F2; L4.3).
   */
  readonly giftRegistry: boolean;
  /**
   * The structured registry the shared block draws (F2; L4.5), or absent when the package does not grant
   * `GIFT_REGISTRY` or the invitation stores nothing a card would show. The gate above and this card are answered
   * apart, so a granted package with no registry keeps the legacy text it always had.
   */
  readonly giftRegistryDetails?: GiftRegistry;
  /**
   * The photos the guest may see, in the creator's order (M8 S3, S4). Absent or empty renders no gallery, which is
   * what a package without `GALLERY` answers; the block never invents a photo the API did not send.
   */
  readonly gallery?: readonly GalleryPhoto[];
  /**
   * The moments of the day in the owner's order (F1; L3.3). Absent or empty renders no timeline, which is what a
   * package without `ITINERARY`, or an invitation that stored no moment, answers.
   */
  readonly itinerary?: readonly ItineraryMoment[];
  /**
   * The hotel cards and the transport line the shared block draws (F4; L7.5). Absent or empty renders no lodging, which
   * is what a package without `LODGING`, or an invitation that stored nothing, answers.
   */
  readonly lodging?: Lodging;
  /**
   * The guestbook wall the shared block draws (F7; L10.5), or absent when the package does not grant `GUESTBOOK`. An
   * empty list is a wall waiting for its first message, so it still renders its form.
   */
  readonly guestbook?: GuestbookBlockView;
  /**
   * The confirmed points of this invitation, keyed by the address field each one belongs to (S1, S2). Only a point
   * whose stored label still equals the text the field holds is here, so the block attaches a coordinate to exactly
   * the places a guest may be sent to. Absent or empty renders the map links of every layout unchanged.
   */
  readonly places?: StoredPlaces;
  /** The open RSVP form of the guest page, or absent when the invitation has no open RSVP (G3; S4). */
  readonly rsvp?: RsvpBlockView;
  /** The personal block of one guest, or absent on a public page (G4; S4). */
  readonly guest?: GuestPageBlockView;
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
  "ITINERARY",
  "COUNTDOWN",
  "MAP",
  "WHATSAPP",
  "MUSIC",
  "GIFT_REGISTRY",
  "LODGING",
  "GUESTBOOK",
  "RSVP",
  "GUEST_LIST",
  "QR_PASS",
  "GALLERY",
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
    features.music !== null ||
    (features.gallery !== undefined && features.gallery.length > 0) ||
    (features.itinerary !== undefined && features.itinerary.length > 0) ||
    (features.lodging !== undefined && lodgingHasContent(features.lodging)) ||
    features.guestbook !== undefined ||
    features.giftRegistryDetails !== undefined ||
    features.rsvp !== undefined ||
    features.guest !== undefined
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
