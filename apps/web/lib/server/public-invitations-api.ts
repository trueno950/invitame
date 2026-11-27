import type { GalleryPhoto } from "../invitation-features/gallery.ts";
import {
  GUEST_ALBUM_MAX_PHOTOS,
  GUEST_ALBUM_UPLOADER_NAME_MAX_LENGTH,
  type GuestAlbumPhotoValue,
  type GuestAlbumValue,
} from "../invitation-features/guest-album.ts";
import { type GiftRegistry, parseGiftRegistry } from "../invitation-features/gift-registry.ts";
import {
  isE164Phone,
  type GuestbookEntryValue,
} from "../invitation-features/invitation-features.ts";
import { type Itinerary, parseItinerary } from "../invitation-features/itinerary.ts";
import { type Livestream, parseLivestream } from "../invitation-features/livestream.ts";
import { type Lodging, parseLodging } from "../invitation-features/lodging.ts";
import { type MusicLink, musicServiceOf } from "../invitation-features/music.ts";
import { parseStoredPlaces, type StoredPlaces } from "../invitation-features/place-point.ts";
import { isInvitationTimeZone } from "../invitation-features/time-zones.ts";
import {
  RSVP_COMPANIONS_MAX,
  RSVP_COMPANION_NAME_MAX_LENGTH,
  RSVP_DIETARY_NOTES_MAX_LENGTH,
  type RsvpCompanionValue,
} from "../public/rsvp-companions.ts";
import { ApiClientError, type ApiClientOptions, sendApiRequest } from "./api-client.ts";
import {
  GUEST_NAME_MAX_LENGTH,
  GUEST_SEATS_MAX,
  GUEST_SEATS_MIN,
  GUEST_TABLE_LABEL_MAX_LENGTH,
  isGuestToken,
  isInvitationSlug,
} from "./invitations-api.ts";
import { isApiMediaUrl } from "./media-api.ts";

/**
 * The web server's client of the public invitation read (M5 T5; S1, S5, A3, A7). A guest has no session
 * and the page must never forward a browser cookie, so this client sends none and keeps only the
 * web-to-API proxy secret; `sendApiRequest` reuses the request primitive of the signed-in clients.
 *
 * The API authorizes nothing here: it decides on its own whether a slug is visible, and answers the same
 * 404 for an unknown, draft, archived, expired, or unrenderable one (A3). A 404 is therefore a value the
 * page renders as its friendly not-found, while a 5xx, a timeout, or an unreachable API throws
 * `unavailable` so the page can show its own outage notice instead of pretending the invitation is gone.
 *
 * This module deliberately has no `server-only` marker, so `node --test` can prove the mapping; the
 * cookie-free wiring that imports it lives in `app/i/[slug]/_lib/public-api.ts` and is `server-only`.
 */

/** The party limits the API accepts, mirrored so a guest page never renders an option the API refuses (S4). */
export const RSVP_PARTY_LIMIT_MIN = 1;
export const RSVP_PARTY_LIMIT_MAX = 10;

/**
 * How the guest page accepts attendance answers (M6 G1, G3; S4): an open form, a guest list with personal links,
 * or nothing at all, with the creator's deadline as an ISO instant (or null) and the party limit of one answer.
 */
export interface PublicRsvpFeature {
  readonly mode: "open" | "guest-list" | null;
  readonly deadline: string | null;
  readonly partyLimit: number;
  /**
   * Whether a confirmed guest's personal page may show the access QR (M6 G2; S4). It is only ever true in guest-list
   * mode: the pass belongs to a personal link, and G4 renders it. This client reads it and never acts on it here.
   */
  readonly qrPass: boolean;
}

/** The features the API gated for one invitation, as a guest page reads them (S4, S7). */
export interface PublicInvitationFeatures {
  readonly countdown: boolean;
  readonly map: boolean;
  /** Add-to-calendar is always on for a published invitation, so the read always says `true` (S4). */
  readonly calendar: true;
  readonly whatsapp: { readonly phone: string } | null;
  /**
   * The playlist link, the service it names, and the title and cover the API stored for it, or null when music is not
   * gated on (S7, S2). The title and the cover are absent when the API stored none, or when this deployment refuses
   * the value, so the card renders what it can.
   */
  readonly music: MusicLink | null;
  /**
   * The moments of the day in the owner's order, or null when the package does not grant `ITINERARY` or the invitation
   * stores none (F1; L3.3). The API answers the list, never the payload's version, so this client reads no version.
   */
  readonly itinerary: Itinerary | null;
  /**
   * Whether the pinned package grants `GIFT_REGISTRY`, which is also what lets each layout draw an older invitation's
   * content text field (F2; L4.3). It is the gate, never the data, and the boolean the field always answered.
   */
  readonly giftRegistry: boolean;
  /**
   * The structured gift registry a guest's card draws, or null when the package does not grant `GIFT_REGISTRY` or the
   * invitation stores nothing a card would show (F2; L4.3). The transfer and the note are always present, null when
   * there is none.
   */
  readonly giftRegistryDetails: GiftRegistry | null;
  /**
   * The hotel cards and the transport line a guest's block draws, or null when the package does not grant `LODGING` or
   * the invitation stores nothing there (F4; L7.3). An API body written before F4 answers nothing here and reads as
   * null, so a page deployed earlier keeps rendering (L20).
   */
  readonly lodging: Lodging | null;
  /** The livestream link and its resolved video id, or null when the feature is not granted or nothing is stored (F9). */
  readonly livestream: Livestream | null;
  /**
   * The guestbook wall (F7; L10.4): the visible entries newest first, at most 50, or null when the pinned package does
   * not grant `GUESTBOOK`. An empty list is a granted wall waiting for its first message, so the page still offers the
   * form. An API body written before F7 answers no field and reads as null, so a page deployed earlier keeps rendering
   * and a body of this generation reads the same way (L20).
   */
  readonly guestbook: readonly GuestbookEntryValue[] | null;
  /**
   * The album of the guests' photos (F8; L11.4): the published photos newest first, at most 60, and how many published
   * photos the invitation holds in total, or null when the pinned package does not grant `GUEST_ALBUM`. An empty album
   * is a granted album waiting for its first photo, so the page still offers its form. An API body written before F8
   * answers no field and reads as null, so a page deployed earlier keeps rendering (L20).
   */
  readonly guestAlbum: GuestAlbumValue | null;
  /**
   * The gallery photos in the creator's order (M8 S3, S4), an empty array when the package does not grant `GALLERY`
   * and always a list, so a layout can read it without a guard.
   */
  readonly gallery: readonly GalleryPhoto[];
  /** Which attendance answers the page accepts, and the limits of one (G3; S4). */
  readonly rsvp: PublicRsvpFeature;
}

/** The guest's page of a published invitation: the projection of A7, and nothing else. */
export interface PublicInvitation {
  slug: string;
  componentKey: string;
  /** The pinned `TemplateVersion` configuration snapshot, parsed by the renderer. */
  configuration: Record<string, unknown>;
  /** The pinned schema's declared content properties, parsed by the renderer. */
  content: Record<string, unknown>;
  /**
   * The content property names the omitted sections cover (S3, S8.3): the renderer draws no block for them and
   * their values are absent from `content`. Always a list, empty when the invitation omits nothing — and for an
   * API that predates the field, so an older deployment renders exactly what it rendered before.
   */
  hiddenFields: readonly string[];
  publishedAt: string | null;
  /** The invitation's stored IANA zone, which every wall clock of the page is read in (S4). */
  timeZone: string;
  /** The gated guest features; nothing about the package itself is here (S4). */
  features: PublicInvitationFeatures;
  /**
   * The stored points a guest may use, keyed by the address field each one belongs to (S1, S2). The API answers only
   * the ones a guest may see — the package grants `MAP` and the address text still equals the stored label — so this
   * client never decides a point's visibility; it only refuses a shape no write could have stored.
   */
  places: StoredPlaces;
  /**
   * Whether the invitation passed its expiry and is read-only (S2, T3). The page still renders every other field; this
   * is what closes the RSVP. The API decides it and answers a boolean, never the instant, so this client never computes
   * an expiration of its own.
   */
  expired: boolean;
}

export type PublicInvitationResult =
  | { ok: true; value: PublicInvitation }
  | { ok: false; failure: "not-found" };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** An ISO-8601 instant as the API serializes it (`Date#toISOString`). */
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

/** The longest renderer key this page accepts; every registered key is far shorter. */
const MAX_COMPONENT_KEY_LENGTH = 120;

/** How many hidden content names one read may carry; every line declares far fewer. */
const MAX_HIDDEN_FIELDS = 40;

/** The longest content property name a schema declares; longer values are not this contract. */
const MAX_FIELD_NAME_LENGTH = 60;

/**
 * The content fields the omitted sections cover (S8.3). A body that states them must state a bounded list of
 * distinct property names, so the layouts receive exactly what the API computed and never an unbounded value;
 * an absent field is an API that predates the contract and means "nothing is hidden".
 */
function parseHiddenFields(value: unknown): readonly string[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_HIDDEN_FIELDS) {
    return undefined;
  }

  const fields: string[] = [];
  for (const field of value) {
    if (
      typeof field !== "string" ||
      field.length === 0 ||
      field.length > MAX_FIELD_NAME_LENGTH ||
      fields.includes(field)
    ) {
      return undefined;
    }
    fields.push(field);
  }
  return fields;
}

/**
 * The RSVP mode of one invitation (S4). The API decides it from the package's catalog keys alone: `guest-list` when
 * the package includes the guest list, `open` when it includes RSVP, and null when it includes neither. The party
 * limit is the creator's, from 1 to 10; the deadline is an ISO instant or null.
 */
function parsePublicRsvp(value: unknown): PublicRsvpFeature | undefined {
  const rsvp = record(value);

  if (rsvp === undefined) {
    return undefined;
  }

  const mode = rsvp.mode;
  const deadline = rsvp.deadline;
  const partyLimit = rsvp.partyLimit;
  const qrPass = rsvp.qrPass;

  if (!(mode === "open" || mode === "guest-list" || mode === null)) {
    return undefined;
  }
  if (typeof qrPass !== "boolean") {
    return undefined;
  }
  if (!(deadline === null || isTimestamp(deadline))) {
    return undefined;
  }
  if (
    typeof partyLimit !== "number" ||
    !Number.isInteger(partyLimit) ||
    partyLimit < RSVP_PARTY_LIMIT_MIN ||
    partyLimit > RSVP_PARTY_LIMIT_MAX
  ) {
    return undefined;
  }

  return { mode, deadline, partyLimit, qrPass };
}

/** The widest signature and message the API stores, mirrored so a body that says more is refused whole (F7; L10.1). */
const GUESTBOOK_AUTHOR_NAME_MAX_LENGTH = 60;
const GUESTBOOK_MESSAGE_MAX_LENGTH = 500;
/** How many visible entries the wall may hold, mirrored from the API's own bound (F7; L10.4). */
const MAX_GUESTBOOK_ENTRIES = 50;

/**
 * The guestbook wall of a guest page, or null when the pinned package does not grant it (F7; L10.4). An absent field is
 * an API written before F7 and reads as null, so a rolling deploy keeps both generations working; a list past the
 * API's own bound, an entry of another shape, or text wider than the column is not this contract, so the whole body is
 * refused instead of being shown.
 */
function parsePublicGuestbook(value: unknown): readonly GuestbookEntryValue[] | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length > MAX_GUESTBOOK_ENTRIES) {
    return undefined;
  }

  const entries: GuestbookEntryValue[] = [];
  for (const item of value) {
    const entry = record(item);

    if (entry === undefined) {
      return undefined;
    }
    const { authorName, message } = entry;

    if (
      typeof authorName !== "string" ||
      [...authorName].length < 1 ||
      [...authorName].length > GUESTBOOK_AUTHOR_NAME_MAX_LENGTH ||
      typeof message !== "string" ||
      [...message].length < 1 ||
      [...message].length > GUESTBOOK_MESSAGE_MAX_LENGTH
    ) {
      return undefined;
    }
    entries.push({ authorName, message });
  }
  return entries;
}

/** One published photo of the album, or undefined when a field breaks the documented contract (F8; L11.4). */
function parseGuestAlbumPhoto(value: unknown, apiOrigin: string): GuestAlbumPhotoValue | undefined {
  const photo = record(value);

  if (photo === undefined) {
    return undefined;
  }

  const { url, uploaderName } = photo;

  if (typeof url !== "string" || !isApiMediaUrl(url, apiOrigin)) {
    return undefined;
  }
  // The name is plain text the API already trimmed and bounded: an empty one is no name, never an empty label.
  if (
    !(
      uploaderName === null ||
      (typeof uploaderName === "string" &&
        uploaderName.trim().length > 0 &&
        [...uploaderName].length <= GUEST_ALBUM_UPLOADER_NAME_MAX_LENGTH)
    )
  ) {
    return undefined;
  }

  return { url, uploaderName };
}

/**
 * The album of a guest page, or null when the pinned package does not grant it (F8; L11.4). An absent field is an API
 * written before F8 and reads as null, so a rolling deploy keeps both generations working; a list past the API's own
 * bound, a photo of another shape, a photo on any host but the configured API origin (A5), or a count that is not a
 * whole number is not this contract, so the whole body is refused instead of being shown.
 */
function parsePublicGuestAlbum(
  value: unknown,
  apiOrigin: string,
): GuestAlbumValue | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  const album = record(value);

  if (album === undefined || !Array.isArray(album.photos)) {
    return undefined;
  }
  if (album.photos.length > GUEST_ALBUM_MAX_PHOTOS) {
    return undefined;
  }

  const photos: GuestAlbumPhotoValue[] = [];
  for (const item of album.photos) {
    const photo = parseGuestAlbumPhoto(item, apiOrigin);

    if (photo === undefined) {
      return undefined;
    }
    photos.push(photo);
  }

  const count = album.count;

  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    return undefined;
  }

  return { photos, count };
}

/** The alt texts the API stores, mirrored so a body that says more is refused whole (M8 S4). */
const MEDIA_ALT_MAX_LENGTH = 120;
/** How many photos one gallery may hold, mirrored from the API's own limit (M8 S4). */
const MAX_GALLERY_PHOTOS = 12;

/**
 * One gallery photo of a guest page (M8 S4): the absolute API URL of the image, the dimensions a layout reserves, and
 * the creator's alt text. A relative path, another scheme, an URL with credentials, a URL on any host but the
 * configured API origin (A5), a non-positive dimension, or a photo count past the API's own limit is not this
 * contract, so the whole body is refused instead of being shown.
 */
function parseGalleryPhoto(value: unknown, apiOrigin: string): GalleryPhoto | undefined {
  const photo = record(value);

  if (photo === undefined) {
    return undefined;
  }

  const { url, width, height, alt } = photo;

  if (typeof url !== "string" || !isApiMediaUrl(url, apiOrigin)) {
    return undefined;
  }
  if (
    typeof width !== "number" ||
    !Number.isSafeInteger(width) ||
    width <= 0 ||
    typeof height !== "number" ||
    !Number.isSafeInteger(height) ||
    height <= 0
  ) {
    return undefined;
  }
  if (!(alt === null || (typeof alt === "string" && [...alt].length <= MEDIA_ALT_MAX_LENGTH))) {
    return undefined;
  }

  return { url, width, height, alt };
}

/** The gallery of a guest page: every photo of the documented shape, or nothing at all (M8 S4). */
function parseGallery(value: unknown, apiOrigin: string): GalleryPhoto[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_GALLERY_PHOTOS) {
    return undefined;
  }

  const photos: GalleryPhoto[] = [];
  for (const item of value) {
    const photo = parseGalleryPhoto(item, apiOrigin);
    if (photo === undefined) {
      return undefined;
    }
    photos.push(photo);
  }
  return photos;
}

/**
 * The gated features of a guest page (S4, S7). The read always says `calendar: true`, because add-to-calendar is
 * not a catalog feature; a body that says otherwise is not this contract, so it is refused instead of being
 * normalized. `whatsapp` is the stored E.164 contact or null, `music` is an allow-listed `https` link and the
 * service it names or null, `giftRegistry` is the gate each layout still reads for an older invitation's content
 * text field, and `giftRegistryDetails` is the structured card the shared block draws or null (F2; L4.3).
 */
function parsePublicFeatures(
  value: unknown,
  apiOrigin: string,
): PublicInvitationFeatures | undefined {
  const features = record(value);

  if (
    features === undefined ||
    typeof features.countdown !== "boolean" ||
    typeof features.map !== "boolean" ||
    features.calendar !== true
  ) {
    return undefined;
  }

  const music = features.music === null ? null : musicServiceOf(features.music);
  const rsvp = parsePublicRsvp(features.rsvp);
  const gallery = parseGallery(features.gallery, apiOrigin);
  // An absent itinerary (a body written before the column existed) reads as none; another shape refuses the body.
  const itinerary = features.itinerary === undefined ? null : parseItinerary(features.itinerary);
  // The structured card follows the same rule (F2; L4.3): absent (a body written before F2) reads as none, and another
  // shape refuses the body. The gate keeps the boolean it always was, so both API generations read the same way.
  const giftRegistryGranted =
    typeof features.giftRegistry === "boolean" ? features.giftRegistry : undefined;
  const giftRegistry =
    features.giftRegistryDetails === undefined
      ? null
      : parseGiftRegistry(features.giftRegistryDetails);
  // The same rule for the lodging (F4; L7.3): an absent field (a body written before F4) reads as none, and another
  // shape refuses the body instead of reaching a guest.
  const lodging = features.lodging === undefined ? null : parseLodging(features.lodging);
  // The same rule for the livestream (F9; L20): an absent field (a body written before F9) reads as none, and another
  // shape refuses the body instead of reaching a guest.
  const livestream =
    features.livestream === undefined ? null : parseLivestream(features.livestream);
  // The wall follows the same rule (F7; L20): an absent field (a body written before F7) reads as none, and another
  // shape refuses the body instead of reaching a guest.
  const guestbook = parsePublicGuestbook(features.guestbook);

  // The album follows the same rule (F8; L20): an absent field (a body written before F8) reads as no album, and another
  // shape refuses the body instead of reaching a guest.
  const guestAlbum = parsePublicGuestAlbum(features.guestAlbum, apiOrigin);

  if (
    guestbook === undefined ||
    guestAlbum === undefined ||
    music === undefined ||
    rsvp === undefined ||
    gallery === undefined ||
    itinerary === undefined ||
    giftRegistry === undefined ||
    giftRegistryGranted === undefined ||
    lodging === undefined ||
    livestream === undefined
  ) {
    return undefined;
  }

  const whatsapp = features.whatsapp;
  const base = {
    countdown: features.countdown,
    map: features.map,
    calendar: true,
    giftRegistry: giftRegistryGranted,
    giftRegistryDetails: giftRegistry,
    lodging,
    livestream,
    guestbook,
    guestAlbum,
    music,
    itinerary,
    gallery,
    rsvp,
  } as const;

  if (whatsapp === null) {
    return { ...base, whatsapp: null };
  }

  const phone = record(whatsapp)?.phone;

  if (typeof phone !== "string" || !isE164Phone(phone)) {
    return undefined;
  }

  return { ...base, whatsapp: { phone } };
}

/**
 * The public invitation of a success body, or `undefined` when it breaks the documented contract. Only
 * the fields of the projection are kept: a body that grows an owner, a package, a price, a status, or an id
 * never reaches the page. `apiOrigin` is the origin of the API this deployment reads, and the only host a gallery
 * photo's URL may name (A5).
 */
export function parsePublicInvitation(
  value: unknown,
  apiOrigin: string,
): PublicInvitation | undefined {
  const invitation = record(value);

  if (invitation === undefined) {
    return undefined;
  }

  const configuration = record(invitation.configuration);
  const content = record(invitation.content);
  const componentKey = invitation.componentKey;
  const features = parsePublicFeatures(invitation.features, apiOrigin);
  const places = parseStoredPlaces(invitation.places);
  const hiddenFields = parseHiddenFields(invitation.hiddenFields);
  // The read-only flag is part of the contract, so a body without it is not this API's answer (S2, T3).
  const expired = invitation.expired;

  if (
    typeof expired !== "boolean" ||
    !isInvitationSlug(invitation.slug) ||
    typeof componentKey !== "string" ||
    componentKey.length === 0 ||
    componentKey.length > MAX_COMPONENT_KEY_LENGTH ||
    configuration === undefined ||
    content === undefined ||
    features === undefined ||
    places === undefined ||
    hiddenFields === undefined ||
    !isInvitationTimeZone(invitation.timeZone) ||
    !(invitation.publishedAt === null || isTimestamp(invitation.publishedAt))
  ) {
    return undefined;
  }

  return {
    slug: invitation.slug,
    componentKey,
    configuration,
    content,
    publishedAt: invitation.publishedAt,
    timeZone: invitation.timeZone,
    features,
    places,
    hiddenFields,
    expired,
  };
}

const NOT_FOUND: PublicInvitationResult = { ok: false, failure: "not-found" };

/**
 * One guest's own block of their personal page (M6 G4; S4): their name, their seats, the answer they last gave, and
 * whether the access pass is offered. Nothing here names another guest, the invitation's id, or the owner.
 */
export interface PublicGuestResponse {
  readonly name: string;
  readonly seats: number;
  /**
   * The table the owner assigned, or null when there is none (F5; L8.4). Only this guest's block carries it: the open
   * public read has no guest block at all. An API written before the column existed answers no field, which reads as
   * null (L20).
   */
  readonly tableLabel: string | null;
  readonly response: {
    readonly attending: boolean;
    readonly partySize: number;
    /** The companions the guest named, or null for an answer stored before they existed (F3; L6.1). */
    readonly companions: readonly RsvpCompanionValue[] | null;
    readonly dietaryNotes: string | null;
    readonly message: string | null;
  } | null;
  /** Whether the pass is offered: only for a confirmed guest of a package that grants `QR_PASS` (S4). */
  readonly qrPass: boolean;
}

/** The personal page: the public projection of A7 plus one guest block (S4). */
export interface PublicGuestInvitation extends PublicInvitation {
  readonly guest: PublicGuestResponse;
}

/**
 * The companions a stored answer carries (F3; L6.1): a list of `{ name, child }` inside the API's own bounds, or null.
 * An absent field is an API written before F3 and reads as null, so a rolling deploy keeps both generations working;
 * another shape refuses the whole body instead of being shown.
 */
/**
 * The table of the guest's own block (F5; L8.1): a trimmed text of 1 to 12 characters, null when none is assigned, or
 * null for an API written before the column existed (L20).
 */
function parseStoredTableLabel(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();

  return trimmed === value &&
    [...trimmed].length >= 1 &&
    [...trimmed].length <= GUEST_TABLE_LABEL_MAX_LENGTH
    ? trimmed
    : undefined;
}

function parseCompanions(value: unknown): readonly RsvpCompanionValue[] | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value) || value.length > RSVP_COMPANIONS_MAX) {
    return undefined;
  }

  const companions: RsvpCompanionValue[] = [];
  for (const item of value) {
    const companion = record(item);

    if (companion === undefined) {
      return undefined;
    }
    const { name, child } = companion;

    if (
      typeof name !== "string" ||
      [...name].length > RSVP_COMPANION_NAME_MAX_LENGTH ||
      typeof child !== "boolean"
    ) {
      return undefined;
    }
    companions.push({ name, child });
  }
  return companions;
}

/** The dietary notes of a stored answer (F3; L6.1): a bounded text, or null; absent reads as null. */
function parseDietaryNotes(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || [...value].length > RSVP_DIETARY_NOTES_MAX_LENGTH) {
    return undefined;
  }
  return value;
}

/** One guest's answer, as the public block reads it: a confirmed answer names 1 to seats, a decline none. */
function parsePublicGuestResponse(
  value: unknown,
  seats: number,
): PublicGuestResponse["response"] | undefined {
  const response = record(value);

  if (response === undefined) {
    return undefined;
  }

  const { attending, partySize, message } = response;
  const companions = parseCompanions(response.companions);
  const dietaryNotes = parseDietaryNotes(response.dietaryNotes);

  if (
    typeof attending !== "boolean" ||
    typeof partySize !== "number" ||
    !Number.isSafeInteger(partySize) ||
    partySize < 0 ||
    partySize > seats ||
    (attending && partySize < 1) ||
    (!attending && partySize !== 0) ||
    companions === undefined ||
    dietaryNotes === undefined ||
    !(message === null || typeof message === "string")
  ) {
    return undefined;
  }

  return { attending, partySize, companions, dietaryNotes, message };
}

/**
 * The personal page of a success body, or `undefined` when it breaks the documented contract: the public projection
 * is parsed again, and the guest block must name this guest's seats, answer, and pass without anything else. A body
 * that grows another guest, an owner, a package, or an id never reaches the page.
 */
export function parsePublicGuestInvitation(
  value: unknown,
  apiOrigin: string,
): PublicGuestInvitation | undefined {
  const page = parsePublicInvitation(value, apiOrigin);
  const guest = record(record(value)?.guest);

  if (page === undefined || guest === undefined) {
    return undefined;
  }

  const { name, seats, qrPass, tableLabel } = guest;
  const storedTableLabel = parseStoredTableLabel(tableLabel);

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    [...name].length > GUEST_NAME_MAX_LENGTH ||
    typeof seats !== "number" ||
    !Number.isInteger(seats) ||
    seats < GUEST_SEATS_MIN ||
    seats > GUEST_SEATS_MAX ||
    typeof qrPass !== "boolean" ||
    storedTableLabel === undefined
  ) {
    return undefined;
  }

  const response = guest.response === null ? null : parsePublicGuestResponse(guest.response, seats);

  if (response === undefined) {
    return undefined;
  }

  return { ...page, guest: { name, seats, tableLabel: storedTableLabel, response, qrPass } };
}

export type PublicGuestResult =
  | { ok: true; value: PublicGuestInvitation }
  | { ok: false; failure: "not-found" };

const GUEST_NOT_FOUND: PublicGuestResult = { ok: false, failure: "not-found" };

/** One guest's personal answer, as the page's form submits it (M6 G4; S4). */
export interface PublicGuestRsvpSubmission {
  readonly attending: boolean;
  /** The people who come: 1 to the guest's seats; none at all for a decline. */
  readonly partySize: number;
  /** The people who come with the guest: one per extra person, none for a decline (F3; L6.1). */
  readonly companions: readonly RsvpCompanionValue[];
  /** The dietary restrictions the guest typed, or null (F3; L6.1). */
  readonly dietaryNotes: string | null;
  readonly message: string | null;
}

/** The outcomes of one personal answer; every accepted attempt, first or repeated, is `{ ok: true }`. */
export type PublicGuestRsvpSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: "not-found" | "not-open" | "rate-limited" | "invalid" };

const readsBody = (status: number): boolean => (status >= 200 && status < 300) || status === 404;

/** The statuses of a submission whose body the page reads: its success, and every refusal it maps (S4). */
const readsRsvpBody = (status: number): boolean =>
  (status >= 200 && status < 300) ||
  status === 400 ||
  status === 404 ||
  status === 409 ||
  status === 429;

/** The statuses of an upload whose body the page reads: its success and every refusal the album maps (L11.3). */
const readsUploadBody = (status: number): boolean =>
  readsRsvpBody(status) || status === 413 || status === 415;

/** One guest's open RSVP answer, as the form submits it (M6 G3; S4). */
export interface PublicRsvpSubmission {
  readonly name: string;
  readonly attending: boolean;
  readonly partySize: number;
  /** The people who come with the guest: one per extra person, none for a decline (F3; L6.1). */
  readonly companions: readonly RsvpCompanionValue[];
  /** The dietary restrictions the guest typed, or null (F3; L6.1). */
  readonly dietaryNotes: string | null;
  readonly phone: string | null;
  readonly message: string | null;
  /** The hidden field a bot fills; any value makes the API answer success without storing anything (S4). */
  readonly honeypot: string;
}

/**
 * The outcomes of one submission the page handles. Every accepted attempt — stored, updated, or dropped because
 * the honeypot was filled — is `{ ok: true }`, so the page says thank you without learning which one it was.
 */
export type PublicRsvpSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: "not-found" | "not-open" | "rate-limited" | "invalid" };

/** The one signature on the guestbook wall, as the form submits it (F7; L10.1, L10.3). */
export interface PublicGuestbookSubmission {
  readonly authorName: string;
  readonly message: string;
  /** The hidden field a bot fills; any value makes the API answer success without storing anything. */
  readonly honeypot: string;
}

/**
 * The outcomes of one signature the page handles. Every accepted attempt — stored or dropped by the honeypot — is
 * `{ ok: true }`, so the page says thank you without learning which one it was. `closed` is the wall of a package that
 * does not grant the key or of an expired invitation.
 */
export type PublicGuestbookSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: "not-found" | "closed" | "rate-limited" | "invalid" };

/** One photo a guest uploads (F8; L11.3, L11.5): the bytes this server read and the optional name they typed. */
export interface PublicGuestPhotoUpload {
  readonly bytes: Uint8Array;
  readonly uploaderName: string | null;
}

/**
 * The outcomes of one upload the page handles. A success means the photo is stored PENDING, never published: the page
 * says it will appear once the owner approves it (L11.5). `closed` is the album of an expired invitation or of a
 * package that does not grant the key, `full` the invitation whose album already holds its cap of pending and published
 * photos, `pending-full` the invitation whose queue of photos waiting for review is over its own cap (L26), and
 * `invalid` a file the domain refused — its type, its size, or its dimensions.
 */
export type PublicGuestPhotoUploadResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly failure:
        | "not-found"
        | "closed"
        | "full"
        | "pending-full"
        | "rate-limited"
        | "invalid";
    };

/** The status and code pairing each refusal this deployment implements; anything else fails closed. */
const RSVP_REFUSALS: Readonly<Record<string, { status: number; failure: string }>> = {
  PUBLIC_INVITATION_NOT_FOUND: { status: 404, failure: "not-found" },
  RSVP_NOT_OPEN: { status: 409, failure: "not-open" },
  RSVP_RATE_LIMITED: { status: 429, failure: "rate-limited" },
  INVALID_RSVP: { status: 400, failure: "invalid" },
};

/** The status and code pairing each guestbook refusal this deployment implements; anything else fails closed. */
const GUESTBOOK_REFUSALS: Readonly<Record<string, { status: number; failure: string }>> = {
  PUBLIC_INVITATION_NOT_FOUND: { status: 404, failure: "not-found" },
  GUESTBOOK_CLOSED: { status: 409, failure: "closed" },
  GUESTBOOK_RATE_LIMITED: { status: 429, failure: "rate-limited" },
  INVALID_GUESTBOOK_ENTRY: { status: 400, failure: "invalid" },
};

/**
 * The status and code pairing each album refusal this deployment implements; anything else fails closed. The album
 * shares the media module's multipart refusals, because the upload is the same multipart reader: a body over the
 * route's bound, a request that is not multipart, and a field the route does not accept are all one `invalid`.
 */
const GUEST_ALBUM_REFUSALS: Readonly<Record<string, { status: number; failure: string }>> = {
  PUBLIC_INVITATION_NOT_FOUND: { status: 404, failure: "not-found" },
  GUEST_ALBUM_CLOSED: { status: 409, failure: "closed" },
  GUEST_ALBUM_FULL: { status: 409, failure: "full" },
  GUEST_ALBUM_PENDING_FULL: { status: 409, failure: "pending-full" },
  GUEST_ALBUM_RATE_LIMITED: { status: 429, failure: "rate-limited" },
  INVALID_GUEST_PHOTO: { status: 400, failure: "invalid" },
  INVALID_MEDIA_UPLOAD: { status: 400, failure: "invalid" },
  PAYLOAD_TOO_LARGE: { status: 413, failure: "invalid" },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, failure: "invalid" },
};

/**
 * The deadline of one guest upload: a photo of the widest configured size over a slow mobile link needs more than the
 * shared 10 seconds, and the invitation page never waits on it because the guest's form posts to its own action.
 */
const GUEST_PHOTO_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Builds the multipart body of one guest upload (L11.3): the file part is named `file` and declared
 * `application/octet-stream`, so the API decides the format from the bytes alone; the browser's own file name and MIME
 * type never travel, and the name the guest typed goes only when they typed one.
 */
export function guestPhotoUploadForm(upload: PublicGuestPhotoUpload): FormData {
  const form = new FormData();

  if (upload.uploaderName !== null) {
    form.set("uploaderName", upload.uploaderName);
  }
  form.set(
    "file",
    new Blob([upload.bytes as BlobPart], { type: "application/octet-stream" }),
    "photo",
  );

  return form;
}

/** The `code` of a refusal body, if the body is one this client can read at all. */
function refusalCode(text: string | undefined): string | undefined {
  try {
    const body = record(JSON.parse(text ?? ""));
    const code = body?.code;

    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/** The fixed success body of `POST /public/invitations/:slug/rsvp` (S4). */
function isAccepted(value: unknown): boolean {
  return record(value)?.status === "received";
}

export interface PublicInvitationsClient {
  /** `GET /public/invitations/:slug`: the guest's page, or `not-found` (A3). */
  getBySlug(slug: string): Promise<PublicInvitationResult>;
  /**
   * `GET /public/invitations/:slug/guests/:token`: one guest's personal page (M6 G4; S4), or `not-found` for every
   * invisible case — an unknown slug, a revoked token, or a token of another invitation. No cookie is sent.
   */
  getGuest(slug: string, token: string): Promise<PublicGuestResult>;
  /**
   * `POST /public/invitations/:slug/guests/:token/rsvp`: one guest's answer through their personal link (G4; S4).
   * The address the web forwarded travels in the API's client-IP header and is what the API's rate limit counts.
   */
  submitGuestRsvp(
    slug: string,
    token: string,
    submission: PublicGuestRsvpSubmission,
    options?: { clientAddress?: string },
  ): Promise<PublicGuestRsvpSubmitResult>;
  /**
   * `POST /public/invitations/:slug/rsvp`: one guest's open answer (M6 G3; S4). The address the web forwarded
   * travels in the API's client-IP header and is what the API's rate limit counts against.
   */
  submitRsvp(
    slug: string,
    submission: PublicRsvpSubmission,
    options?: { clientAddress?: string },
  ): Promise<PublicRsvpSubmitResult>;
  /**
   * `POST /public/invitations/:slug/guestbook`: one guest's signature on the wall (F7; L10.3). The address the web
   * forwarded travels in the API's client-IP header and is what the API's rate limit counts against.
   */
  submitGuestbook(
    slug: string,
    submission: PublicGuestbookSubmission,
    options?: { clientAddress?: string },
  ): Promise<PublicGuestbookSubmitResult>;
  /**
   * `POST /public/invitations/:slug/photos`: one guest's photo, as multipart (F8; L11.3). A photo is PENDING until the
   * owner publishes it, so a successful upload says nothing about when it will appear. The address the web forwarded
   * travels in the API's client-IP header and is what the API's rate limit counts against.
   */
  uploadGuestPhoto(
    slug: string,
    upload: PublicGuestPhotoUpload,
    options?: { clientAddress?: string },
  ): Promise<PublicGuestPhotoUploadResult>;
}

/**
 * A stateless client of the public read and the public submission. A slug that cannot be one names nothing, so no
 * request is made; an unusually shaped slug never becomes a path segment the API could interpret differently.
 */
export function createPublicInvitationsClient(options: ApiClientOptions): PublicInvitationsClient {
  return {
    async getBySlug(slug: string): Promise<PublicInvitationResult> {
      if (!isInvitationSlug(slug)) {
        return NOT_FOUND;
      }

      const { status, text } = await sendApiRequest(
        options,
        { method: "GET", path: `/public/invitations/${encodeURIComponent(slug)}` },
        readsBody,
      );

      if (status === 404) {
        return NOT_FOUND;
      }

      if (status < 200 || status >= 300) {
        throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text ?? "");
      } catch {
        payload = undefined;
      }

      const invitation = parsePublicInvitation(payload, options.config.apiOrigin);

      if (invitation === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { ok: true, value: invitation };
    },

    async getGuest(slug: string, token: string): Promise<PublicGuestResult> {
      // A slug or a token that cannot be one names nothing, so no request is made and neither becomes a path
      // segment the API could read differently.
      if (!isInvitationSlug(slug) || !isGuestToken(token)) {
        return GUEST_NOT_FOUND;
      }

      const { status, text } = await sendApiRequest(
        options,
        {
          method: "GET",
          path: `/public/invitations/${encodeURIComponent(slug)}/guests/${encodeURIComponent(token)}`,
        },
        readsBody,
      );

      if (status === 404) {
        return GUEST_NOT_FOUND;
      }

      if (status < 200 || status >= 300) {
        throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text ?? "");
      } catch {
        payload = undefined;
      }

      const page = parsePublicGuestInvitation(payload, options.config.apiOrigin);

      if (page === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { ok: true, value: page };
    },

    async submitGuestRsvp(
      slug: string,
      token: string,
      submission: PublicGuestRsvpSubmission,
      request: { clientAddress?: string } = {},
    ): Promise<PublicGuestRsvpSubmitResult> {
      if (!isInvitationSlug(slug) || !isGuestToken(token)) {
        return { ok: false, failure: "not-found" };
      }

      const { status, text } = await sendApiRequest(
        options,
        {
          method: "POST",
          path: `/public/invitations/${encodeURIComponent(slug)}/guests/${encodeURIComponent(token)}/rsvp`,
          body: submission,
          ...(request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress }),
        },
        (answer): boolean => readsRsvpBody(answer),
      );

      if (status >= 200 && status < 300) {
        let payload: unknown;
        try {
          payload = JSON.parse(text ?? "");
        } catch {
          payload = undefined;
        }
        if (!isAccepted(payload)) {
          throw new ApiClientError("invalid-response", status);
        }
        return { ok: true };
      }

      const code = refusalCode(text);
      const refusal = code === undefined ? undefined : RSVP_REFUSALS[code];

      if (refusal !== undefined && refusal.status === status) {
        return { ok: false, failure: refusal.failure as "not-found" };
      }

      throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
    },

    async submitRsvp(
      slug: string,
      submission: PublicRsvpSubmission,
      request: { clientAddress?: string } = {},
    ): Promise<PublicRsvpSubmitResult> {
      if (!isInvitationSlug(slug)) {
        return { ok: false, failure: "not-found" };
      }

      const { status, text } = await sendApiRequest(
        options,
        {
          method: "POST",
          path: `/public/invitations/${encodeURIComponent(slug)}/rsvp`,
          body: submission,
          ...(request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress }),
        },
        (answer): boolean => readsRsvpBody(answer),
      );

      if (status >= 200 && status < 300) {
        let payload: unknown;
        try {
          payload = JSON.parse(text ?? "");
        } catch {
          payload = undefined;
        }
        if (!isAccepted(payload)) {
          throw new ApiClientError("invalid-response", status);
        }
        return { ok: true };
      }

      const code = refusalCode(text);
      const refusal = code === undefined ? undefined : RSVP_REFUSALS[code];

      if (refusal !== undefined && refusal.status === status) {
        return { ok: false, failure: refusal.failure as "not-found" };
      }

      throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
    },

    async submitGuestbook(
      slug: string,
      submission: PublicGuestbookSubmission,
      request: { clientAddress?: string } = {},
    ): Promise<PublicGuestbookSubmitResult> {
      if (!isInvitationSlug(slug)) {
        return { ok: false, failure: "not-found" };
      }

      const { status, text } = await sendApiRequest(
        options,
        {
          method: "POST",
          path: `/public/invitations/${encodeURIComponent(slug)}/guestbook`,
          body: submission,
          ...(request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress }),
        },
        (answer): boolean => readsRsvpBody(answer),
      );

      if (status >= 200 && status < 300) {
        let payload: unknown;
        try {
          payload = JSON.parse(text ?? "");
        } catch {
          payload = undefined;
        }
        if (!isAccepted(payload)) {
          throw new ApiClientError("invalid-response", status);
        }
        return { ok: true };
      }

      const code = refusalCode(text);
      const refusal = code === undefined ? undefined : GUESTBOOK_REFUSALS[code];

      if (refusal !== undefined && refusal.status === status) {
        return { ok: false, failure: refusal.failure as "not-found" };
      }

      throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
    },

    async uploadGuestPhoto(
      slug: string,
      upload: PublicGuestPhotoUpload,
      request: { clientAddress?: string } = {},
    ): Promise<PublicGuestPhotoUploadResult> {
      if (!isInvitationSlug(slug)) {
        return { ok: false, failure: "not-found" };
      }

      const { status, text } = await sendApiRequest(
        options,
        {
          method: "POST",
          path: `/public/invitations/${encodeURIComponent(slug)}/photos`,
          multipart: guestPhotoUploadForm(upload),
          timeoutMs: GUEST_PHOTO_UPLOAD_TIMEOUT_MS,
          ...(request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress }),
        },
        readsUploadBody,
      );

      if (status >= 200 && status < 300) {
        let payload: unknown;
        try {
          payload = JSON.parse(text ?? "");
        } catch {
          payload = undefined;
        }
        if (!isAccepted(payload)) {
          throw new ApiClientError("invalid-response", status);
        }
        return { ok: true };
      }

      const code = refusalCode(text);
      const refusal = code === undefined ? undefined : GUEST_ALBUM_REFUSALS[code];

      if (refusal !== undefined && refusal.status === status) {
        return { ok: false, failure: refusal.failure as "not-found" };
      }

      throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
    },
  };
}
