// Per-invitation feature data (F1, F6, F7; S3, S4, S7). The package decides which catalog keys an invitation may
// show; this module decides what the API implements and what a guest sees. Five pure rules live here:
//
// - the time zone allow-list: an invitation stores one IANA zone from this list, and the Spanish labels belong
//   to the web, never to the domain;
// - WhatsApp phone normalization: a Mexican ten-digit number or an international `+` number, stored as E.164;
// - playlist link normalization: an `https` link on an allow-listed music host, at most 500 characters;
// - playlist metadata bounds: the title the provider answered as one bounded line of visible text, and a cover
//   only from an allow-listed image host over `https` (S2);
// - feature gating: the package's feature keys intersected with the implemented allow-list, plus the add-to-
//   calendar feature, which is not catalog data; WhatsApp also needs a stored phone, music a usable link, and the
//   itinerary at least one stored moment (F1).
//
// The itinerary payload itself is `domain/invitation-itinerary.ts`, the gift registry is
// `domain/invitation-gift-registry.ts`, and the lodging is `domain/invitation-lodging.ts`: this module only decides
// whether a guest may see them and hands them to the projection, so one reader owns each shape.
//
// Package and feature names never select a code path (AGENTS.md): the gate compares keys and nothing else, so a
// new catalog key never makes a feature appear, and an unknown key is simply not implemented.

/**
 * The time zones an invitation may store (S4). The list is the eleven Mexico zones S4 names, narrowed to those
 * the installed tz data treats as distinct. Every one of them is a canonical zone id in
 * `Intl.supportedValuesOf("timeZone")` and none is a pure link (`US/Pacific`, `Mexico/General`, ...), so all
 * eleven stay; `invitation-features.spec.ts` proves that against the installed tz data.
 *
 * Several of them behave identically for a future event — `America/Mexico_City`, `America/Chihuahua`,
 * `America/Monterrey`, `America/Merida`, and `America/Bahia_Banderas` are `UTC-06:00` all year since Mexico
 * dropped daylight saving in 2022, `America/Hermosillo` matches `America/Mazatlan` at `UTC-07:00`, and
 * `America/Ojinaga` matches `America/Matamoros` on the United States daylight-saving rule — but they are
 * distinct places with distinct historical rules, so the owner still picks the one that names their location.
 */
import type { PublicGuestbookEntry } from "./invitation-guestbook";
import {
  giftRegistryHasContent,
  type InvitationGiftRegistry,
  type PublicGiftRegistry,
  publicGiftRegistry,
  storedGiftRegistry,
  validateGiftRegistry,
} from "./invitation-gift-registry";
import {
  type InvitationItinerary,
  storedItinerary,
  validateItinerary,
} from "./invitation-itinerary";
import {
  type InvitationLodging,
  lodgingHasContent,
  type PublicLodging,
  publicLodging,
  storedLodging,
  validateLodging,
} from "./invitation-lodging";
import {
  type InvitationLivestream,
  livestreamHasContent,
  type PublicLivestream,
  publicLivestream,
  storedLivestream,
  validateLivestream,
} from "./invitation-livestream";
import { type InvitationReminders, validateReminders } from "./invitation-reminders";

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

/** The zone a new invitation stores and the one every row that existed before F1 reads (S4). */
export const DEFAULT_INVITATION_TIME_ZONE: InvitationTimeZone = "America/Mexico_City";

/** Whether a value is one exact member of the allow-list; nothing is trimmed or case-folded. */
export function isInvitationTimeZone(value: unknown): value is InvitationTimeZone {
  return typeof value === "string" && (INVITATION_TIME_ZONES as readonly string[]).includes(value);
}

/**
 * The catalog feature keys this batch implements (S4, S7, M6 S3). A package feature outside this list is stored
 * catalog data that no current layout renders, so gating drops it instead of letting a key select a component.
 * `RSVP` and `GUEST_LIST` arrived with Milestone 6 (`GUEST_LIST` is the personal-link guest list, M6 G2),
 * `QR_PASS` is the guest list's access pass for the door, also M6 G2, and `GALLERY` is the invitation's photo
 * gallery (M8 S3, S4). `ITINERARY` is the plan of the day (F1; S2.1, L3.2) and comes first because it is the first
 * capability of the owner's list; `LODGING` is the lodging and transport block (F4; S2.4, L7.2). The order is the
 * order the owner's feature list follows; `GUESTBOOK` is the guest's wall of messages (F7; S2.7, L10.2),
 * `GUEST_ALBUM` is the album of photos the guests upload for the owner to approve (F8; S2.8, L11.2), and `LIVESTREAM` is
 * the link of the transmission with its player (F9; S2.9, L12.2), and `OPENING_ANIMATION` is the envelope the guest opens
 * over a published invitation (F10; S2.10, L14.4).
 */
export const IMPLEMENTED_INVITATION_FEATURES = [
  "ITINERARY",
  "COUNTDOWN",
  "MAP",
  "RSVP",
  "WHATSAPP",
  "MUSIC",
  "GIFT_REGISTRY",
  "LODGING",
  "GUESTBOOK",
  "GUEST_ALBUM",
  "LIVESTREAM",
  "GUEST_LIST",
  "QR_PASS",
  "GALLERY",
  "OPENING_ANIMATION",
  "CO_HOSTS",
] as const;

export type ImplementedInvitationFeature = (typeof IMPLEMENTED_INVITATION_FEATURES)[number];

/** The catalog key that grants confirmation of attendance (M6 S3). */
export const RSVP_FEATURE_KEY = "RSVP";

/** The catalog key that grants the guest page its map and precise place links (S1, S2). */
export const MAP_FEATURE_KEY = "MAP";

/** The catalog key that grants a managed guest list with personal links (M6 S3; G2 implements it). */
export const GUEST_LIST_FEATURE_KEY = "GUEST_LIST";

/** The catalog key that grants the guest list its access QR and the owner's check-in (M6 S3; G2). */
export const QR_PASS_FEATURE_KEY = "QR_PASS";

/** The catalog key that grants the invitation's photo gallery (M8 S3, S4); Premium and Deluxe include it. */
export const GALLERY_FEATURE_KEY = "GALLERY";

/** The catalog key that grants the plan of the day (F1; S2.1, L3.2); every seeded package includes it. */
export const ITINERARY_FEATURE_KEY = "ITINERARY";

/**
 * The catalog key that grants the gift registry (F2; S2.2, L4.2); the existing key, granted by Deluxe. The same key
 * still lets each layout draw an older invitation's content text field, which is why it is answered apart from the
 * structured registry (L4.3).
 */
export const GIFT_REGISTRY_FEATURE_KEY = "GIFT_REGISTRY";

/**
 * The catalog key that grants the lodging and transport block (F4; S2.4, L7.2), granted by Premium and Deluxe. The
 * key stays while the invitation stores no hotel and no transport line, because only the data decides whether a card
 * exists; the public read answers the block itself only when there is something to draw.
 */
export const LODGING_FEATURE_KEY = "LODGING";

/**
 * The catalog key that grants the guestbook (F7; S2.7, L10.2), granted by Premium and Deluxe. Unlike the itinerary and
 * the lodging the key stays on with no stored data at all, because the wall exists to receive the first message: the
 * public read answers `features.guestbook` with the visible entries — an empty list while there are none — only when
 * the package grants it.
 */
export const GUESTBOOK_FEATURE_KEY = "GUESTBOOK";

/**
 * The catalog key that grants the album of the guests' photos (F8; S2.8, L11.2), granted by Deluxe. Like the guestbook,
 * the key stays on with no stored photo at all, because the album exists to receive the first one: the public read
 * answers `features.guestAlbum` — an empty list and a zero count while nobody uploaded — only when the package grants
 * it.
 */
export const GUEST_ALBUM_FEATURE_KEY = "GUEST_ALBUM";

/**
 * The catalog key that grants the livestream (F9; S2.9, L12.2), granted by Premium and Deluxe. Like the itinerary and
 * the lodging, the key is offered only while the invitation stores a link, because the card exists to draw that link;
 * a package's key with nothing stored keeps the editor closed on a feature nobody could publish.
 */
export const LIVESTREAM_FEATURE_KEY = "LIVESTREAM";

/**
 * The catalog key that grants the opening animation (F10; S2.10, L14.4), granted to every seeded package so the catalogue
 * can withdraw it later without a code change. Unlike the itinerary, the lodging, and the livestream the key is not
 * about stored data: the switch `openingAnimation` on the same settings row decides whether the guest page draws the
 * envelope, so the key stays granted while the owner switches it off.
 */
export const OPENING_ANIMATION_FEATURE_KEY = "OPENING_ANIMATION";

/**
 * The catalog key that grants co-hosts (F12; S2.12, L17.5), granted by Premium and Deluxe. It is the key the invite route
 * checks before it stores an invitation, so the capability is catalog data the panel can withdraw: a package that does
 * not grant it answers 409 `CO_HOSTS_NOT_AVAILABLE`. The collaborator rows a package once allowed stay stored and keep
 * their access while the invitation's own promises stand; withdrawing the key stops new invitations, never a
 * collaboration the owner already granted and has not revoked.
 */
export const CO_HOSTS_FEATURE_KEY = "CO_HOSTS";

/**
 * The message a value that is not a boolean is refused with (F10; L14.3). The switch has no other shape: `null` and an
 * absent value are no switch at all, exactly like a string that spells a state, so a client always sends a boolean.
 */
export const OPENING_ANIMATION_ISSUE = "openingAnimation must be true or false";

/**
 * The public shape of one itinerary moment (F1; L3.1, L3.3): the wall clock, the title, and the place and address
 * when they say something. The projection carries the validated moments and no version.
 */
export type ItineraryMoment = InvitationItinerary["items"][number];

/**
 * One gallery photo as a guest renders it (M8 S4): the absolute API URL of the image, the dimensions the layout
 * reserves, and the creator's alt text. It lives in the domain because it is part of what a guest may see, and it
 * carries no storage key, provider, or owner.
 */
export interface PublicGalleryPhoto {
  url: string;
  width: number;
  height: number;
  alt: string | null;
}

/**
 * One photo of the guests' album as a guest renders it (F8; L11.4): the absolute API URL of the published image and the
 * name its uploader typed, or null when they chose to stay anonymous. It carries no storage key, no status, no row id,
 * and no invitation: a guest sees a published photo and nothing about the ones waiting for the owner.
 */
export interface PublicGuestAlbumPhoto {
  url: string;
  uploaderName: string | null;
}

/**
 * The album of one invitation as a guest renders it (F8; L11.4): the newest published photos — at most 60 — and how
 * many published photos the invitation holds in total, which is the count the artboard's line states. Pending and
 * hidden photos are never here, so the read cannot leak one even by accident.
 */
export interface PublicGuestAlbum {
  readonly photos: readonly PublicGuestAlbumPhoto[];
  readonly count: number;
}

/** The album of an invitation that published no photo: what a granted package answers before the first approval. */
export const EMPTY_PUBLIC_GUEST_ALBUM: PublicGuestAlbum = { photos: [], count: 0 };

/**
 * How an invitation accepts attendance answers (M6 S4): the open form when the package grants `RSVP` and no guest
 * list, personal links when it grants `GUEST_LIST` (G2), and nothing otherwise. The names are answers, never code
 * paths: the key is compared whole and the API decides what each answer does.
 */
export type RsvpMode = "open" | "guest-list" | null;

/**
 * The RSVP mode of an invitation, from the pinned package's catalog keys alone (M6 S4). A guest list wins over
 * the open form: with personal links there is no public form to submit. Keys are compared whole and
 * case-sensitively, so a look-alike never selects a mode.
 */
export function rsvpModeOf(includedFeatureKeys: readonly string[]): RsvpMode {
  if (includedFeatureKeys.includes(GUEST_LIST_FEATURE_KEY)) {
    return "guest-list";
  }
  return includedFeatureKeys.includes(RSVP_FEATURE_KEY) ? "open" : null;
}

/** Add-to-calendar is always available to a guest and is not a catalog feature (S4). */
export const CALENDAR_FEATURE_KEY = "CALENDAR";

/** The country code added to a Mexican ten-digit number (S4). */
export const MEXICAN_WHATSAPP_COUNTRY_CODE = "52";

/** `+` and fifteen digits: the longest E.164 number, and the width of `InvitationFeatureSettings.whatsappPhone`. */
export const WHATSAPP_PHONE_LENGTH = 16;

/** The country calling code and the national number E.164 accepts, without the leading `+`. */
const E164_DIGITS = /^[1-9][0-9]{7,14}$/;

/** A Mexican national number: exactly ten digits, stored with `+52` in front. */
const MEXICAN_NATIONAL_NUMBER = /^[0-9]{10}$/;

/** The separators S4 accepts inside a phone: spaces (including no-break spaces), dashes, and parentheses. */
const PHONE_SEPARATORS = /[\s()-]/gu;

/** The message a phone of an unrecognized shape is refused with. */
export const WHATSAPP_PHONE_SHAPE_ISSUE =
  "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +";

/** The message a phone that is not a string is refused with. */
export const WHATSAPP_PHONE_TYPE_ISSUE = "whatsappPhone must be a string or null";

/** The message a time zone outside the allow-list is refused with. */
export const INVITATION_TIME_ZONE_ISSUE = "timeZone must be one of the supported time zones";

/**
 * The longest playlist link an invitation may store (S7): the width of
 * `InvitationFeatureSettings.playlistUrl`, counted in characters so a non-ASCII path cannot overflow the column.
 */
export const PLAYLIST_URL_MAX_LENGTH = 500;

/**
 * The music services a playlist link may point at (S7), keyed by the exact host that names them. The host is
 * compared whole and case-insensitively; a sub-domain, a different port, or userinfo refuses the link, so a
 * value cannot borrow an allow-listed host to reach somewhere else. The key is the provider the public read
 * answers, and the web turns it into the Spanish name of the service.
 */
export const PLAYLIST_HOSTS: Readonly<Record<string, MusicProvider>> = {
  "open.spotify.com": "spotify",
  "music.apple.com": "apple_music",
  "music.youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "www.deezer.com": "deezer",
  "deezer.com": "deezer",
  "soundcloud.com": "soundcloud",
};

/** The allow-listed music services, in the order the contract lists their hosts (S7). */
export const MUSIC_PROVIDERS = [
  "spotify",
  "apple_music",
  "youtube",
  "deezer",
  "soundcloud",
] as const;

export type MusicProvider = (typeof MUSIC_PROVIDERS)[number];

/** The message a playlist link that is not a string is refused with. */
export const PLAYLIST_URL_TYPE_ISSUE = "playlistUrl must be a string or null";

/** The message a playlist link that is not `https` is refused with. */
export const PLAYLIST_URL_SCHEME_ISSUE = "playlistUrl must be an https link";

/** The message a playlist link on another host is refused with. */
export const PLAYLIST_URL_HOST_ISSUE =
  "playlistUrl must link to Spotify, Apple Music, YouTube, Deezer, or SoundCloud";

/** The message a playlist link wider than `PLAYLIST_URL_MAX_LENGTH` is refused with. */
export const PLAYLIST_URL_LENGTH_ISSUE = "playlistUrl must be at most 500 characters";

/**
 * The longest playlist title an invitation may store (S2): the width of `InvitationFeatureSettings.playlistTitle`,
 * counted in characters so a title with non-ASCII letters cannot overflow the column.
 */
export const PLAYLIST_TITLE_MAX_LENGTH = 200;

/** The longest cover URL an invitation may store (S2): the width of `playlistCoverUrl`. */
export const PLAYLIST_COVER_URL_MAX_LENGTH = 500;

/**
 * The image hosts a music provider's public oEmbed answer may point a cover at (S2): Spotify's `i.scdn.co` and
 * YouTube's `i.ytimg.com`. The host is compared whole and case-insensitively, and a different port, userinfo, or
 * scheme refuses the value, so a provider answer can never make a guest page load an image from somewhere else.
 */
export const MUSIC_COVER_HOSTS = ["i.scdn.co", "i.ytimg.com"] as const;

/**
 * Spotify's image CDN: `image-cdn-<label>.spotifycdn.com`. Spotify answers `i.scdn.co` today, and its newer CDN
 * names a per-region label, so the host is matched by shape instead of by one literal.
 */
const SPOTIFY_IMAGE_CDN_HOST = /^image-cdn-[a-z0-9-]+\.spotifycdn\.com$/;

const MUSIC_COVER_HOST_SET: ReadonlySet<string> = new Set(MUSIC_COVER_HOSTS);

/**
 * A whitespace or control character in a cover URL (S2). The URL parser trims spaces and drops tabs and line breaks,
 * but the column stores and the guest page renders the value the provider gave verbatim, and the column's own check
 * requires it to start with `https://`. A value the parser accepts after such a change is no cover this API can
 * store, so it is refused instead of failing the whole save on a constraint.
 */
const URL_UNSTORABLE_CHARACTERS = /[\p{Cc}\s]/u;

/**
 * The control characters a provider title must not carry into the column or the card (S2): a line break, a tab, and
 * a NUL all become one space, because a playlist title is a single line the card renders.
 */
const TITLE_CONTROL_CHARACTERS = /\p{Cc}+/gu;

/**
 * The invisible format characters a title must not carry (S2): bidi controls, zero-width spaces and joiners that only
 * reorder or hide text. U+200D stays, because an emoji sequence legitimately joins with it.
 */
const TITLE_INVISIBLE_CHARACTERS =
  /[\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff]/gu;

/** A run of whitespace, including the non-breaking space a provider may answer (S2). */
const TITLE_WHITESPACE_RUN = /\s+/gu;

/** The grapheme boundaries of the installed ICU data, so a cut never answers half of a rendered character (S2). */
const TITLE_GRAPHEMES = new Intl.Segmenter("es", { granularity: "grapheme" });

/**
 * The first `PLAYLIST_TITLE_MAX_LENGTH` code points of a text, cut at a grapheme boundary. The width is counted in
 * code points because that is what the column stores; the cut follows a boundary so a title never ends in half of an
 * accent, a variation selector, or a joined emoji.
 */
function cutPlaylistTitle(text: string): string {
  let kept = "";
  let width = 0;

  for (const { segment } of TITLE_GRAPHEMES.segment(text)) {
    const segmentWidth = [...segment].length;
    if (width + segmentWidth > PLAYLIST_TITLE_MAX_LENGTH) {
      break;
    }
    kept += segment;
    width += segmentWidth;
  }

  return kept;
}

/**
 * The playlist metadata a provider answered (S2): the title it named and the cover this API allows, each null
 * when that provider named nothing usable. It carries no HTML, no player, and nothing else the provider sent.
 */
export interface PlaylistMetadata {
  readonly title: string | null;
  readonly coverUrl: string | null;
}

/**
 * A stored playlist title (S2): one line of visible text, trimmed and at most `PLAYLIST_TITLE_MAX_LENGTH` characters,
 * or null when the value says nothing. A provider's line break, tab, NUL, bidi control, or zero-width character never
 * reaches the column or the guest page, and a run of spaces is one space. A longer title is cut at the bound instead
 * of being refused, because a provider's title is data the owner never typed; the column is the second bound.
 */
export function normalizePlaylistTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(TITLE_CONTROL_CHARACTERS, " ")
    .replace(TITLE_INVISIBLE_CHARACTERS, "")
    .replace(TITLE_WHITESPACE_RUN, " ")
    .trim();

  if (normalized === "") {
    return null;
  }

  const cut = cutPlaylistTitle(normalized);

  return cut === "" ? null : cut.trimEnd();
}

/**
 * Whether a value is a cover URL this deployment renders (S2, S3): `https`, no port and no userinfo, one of the
 * allow-listed image hosts, and no whitespace or control character. Anything else is no cover at all, so a guest
 * page never loads an image from a host the API did not allow and the stored value always satisfies the
 * `playlistCoverUrl` https check.
 */
export function isMusicCoverUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > PLAYLIST_COVER_URL_MAX_LENGTH) {
    return false;
  }
  if (URL_UNSTORABLE_CHARACTERS.test(value)) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" || parsed.port !== "") {
    return false;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return false;
  }

  return MUSIC_COVER_HOST_SET.has(parsed.hostname) || SPOTIFY_IMAGE_CDN_HOST.test(parsed.hostname);
}

/** A normalized playlist link: the stored URL, or null when the invitation has none. */
export type PlaylistUrlNormalization =
  | { readonly ok: true; readonly url: string | null }
  | { readonly ok: false; readonly issue: string };

/**
 * The service a stored playlist link points at, or null when it names no allow-listed host (S7). This is also
 * the second gate of the music feature: a link the API cannot place is never shown to a guest.
 */
export function musicProviderOf(value: unknown): MusicProvider | null {
  if (typeof value !== "string") {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  if (parsed.port !== "") {
    return null;
  }
  return Object.hasOwn(PLAYLIST_HOSTS, parsed.hostname)
    ? (PLAYLIST_HOSTS[parsed.hostname] as MusicProvider)
    : null;
}

/**
 * Normalizes a playlist link (S7). Only an `https` URL on an allow-listed host is stored, at most
 * `PLAYLIST_URL_MAX_LENGTH` characters; the surrounding spaces are trimmed and the `URL` parser lower-cases the
 * scheme and the host, which is the whole normalization — the path, the query, and the fragment are kept
 * verbatim, so a playlist keeps its exact address. `null`, `undefined`, and a blank string mean "no link" and
 * store null, which is how the creator clears it. The stored value always satisfies the
 * `InvitationFeatureSettings_playlistUrl_https` check.
 */
export function normalizePlaylistUrl(value: unknown): PlaylistUrlNormalization {
  if (value === null || value === undefined) {
    return { ok: true, url: null };
  }
  if (typeof value !== "string") {
    return { ok: false, issue: PLAYLIST_URL_TYPE_ISSUE };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, url: null };
  }
  if ([...trimmed].length > PLAYLIST_URL_MAX_LENGTH) {
    return { ok: false, issue: PLAYLIST_URL_LENGTH_ISSUE };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // A value that is not a URL at all is a link this API cannot store, and it names no service.
    return { ok: false, issue: PLAYLIST_URL_SCHEME_ISSUE };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, issue: PLAYLIST_URL_SCHEME_ISSUE };
  }
  if (parsed.port !== "") {
    return { ok: false, issue: PLAYLIST_URL_HOST_ISSUE };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return { ok: false, issue: PLAYLIST_URL_HOST_ISSUE };
  }
  if (musicProviderOf(parsed.href) === null) {
    return { ok: false, issue: PLAYLIST_URL_HOST_ISSUE };
  }
  // The parser percent-encodes non-ASCII path characters, so the stored value can be wider than the typed one.
  if ([...parsed.href].length > PLAYLIST_URL_MAX_LENGTH) {
    return { ok: false, issue: PLAYLIST_URL_LENGTH_ISSUE };
  }

  return { ok: true, url: parsed.href };
}

/** A normalized phone: the E.164 value, or null when the invitation has none. */
export type WhatsAppPhoneNormalization =
  | { readonly ok: true; readonly phone: string | null }
  | { readonly ok: false; readonly issue: string };

/**
 * Normalizes a WhatsApp phone to E.164 (S4). Spaces, dashes, and parentheses may separate the digits. A number
 * without `+` is a Mexican national number and must be exactly ten digits, which stores as `+52` and those
 * digits; a number with `+` must carry eight to fifteen digits after it. `null`, `undefined`, and a blank string
 * mean "no phone" and store null, which is how the creator clears it. Nothing else is accepted, and the stored
 * value always satisfies the `InvitationFeatureSettings_whatsappPhone_format` check.
 */
export function normalizeWhatsAppPhone(value: unknown): WhatsAppPhoneNormalization {
  if (value === null || value === undefined) {
    return { ok: true, phone: null };
  }
  if (typeof value !== "string") {
    return { ok: false, issue: WHATSAPP_PHONE_TYPE_ISSUE };
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: true, phone: null };
  }

  const compact = trimmed.replaceAll(PHONE_SEPARATORS, "");

  if (compact.startsWith("+")) {
    const digits = compact.slice(1);
    return E164_DIGITS.test(digits) ? { ok: true, phone: `+${digits}` } : refuseShape();
  }
  if (MEXICAN_NATIONAL_NUMBER.test(compact)) {
    return { ok: true, phone: `+${MEXICAN_WHATSAPP_COUNTRY_CODE}${compact}` };
  }
  return refuseShape();
}

function refuseShape(): WhatsAppPhoneNormalization {
  return { ok: false, issue: WHATSAPP_PHONE_SHAPE_ISSUE };
}

/** The feature settings a creator saves: the time zone, the stored E.164 phone, the playlist link, and the plan. */
export interface InvitationFeatureSettingsValue {
  readonly timeZone: InvitationTimeZone;
  readonly whatsappPhone: string | null;
  /** A normalized `https` link on an allow-listed music host, or null (S7). */
  readonly playlistUrl: string | null;
  /** The validated plan of the day, or null when the invitation has none (F1; L3.1). */
  readonly itinerary: InvitationItinerary | null;
  /** The validated gift registry, or null when the invitation has none or it would show nothing (F2; L4.1). */
  readonly giftRegistry: InvitationGiftRegistry | null;
  /** The validated lodging, or null when the invitation has none or it would show nothing (F4; L7.1). */
  readonly lodging: InvitationLodging | null;
  /** The validated livestream, or null when the invitation has none (F9; L12.1). */
  readonly livestream: InvitationLivestream | null;
  /**
   * The owner's opening animation switch (F10; L14.3), on by default. It is stored whether or not the pinned package
   * grants the key; only the public read decides whether the page draws the overlay.
   */
  readonly openingAnimation: boolean;
  /**
   * The validated WhatsApp reminder switches, or null while the owner switched nothing on (F6; L9.1). They decide
   * whether the command sends a reminder and never what a guest sees, so they take no part in the feature gate.
   */
  readonly reminders: InvitationReminders | null;
}

/** The feature settings a request asked for, validated, or every issue that refuses them. */
export type InvitationFeatureSettingsValidation =
  | { readonly ok: true; readonly value: InvitationFeatureSettingsValue }
  | { readonly ok: false; readonly issues: string[] };

/**
 * Validates a feature-settings request (S4, S7, F1, F2, F4, F6): the zone must be an allow-list member, the phone must
 * normalize, the playlist link must be an `https` link on an allow-listed host, the itinerary must be the versioned
 * payload of L3.1 or absent, the gift registry the versioned payload of L4.1 or absent, the lodging the versioned
 * payload of L7.1 or absent, the reminders the versioned pair of switches of L9.1 or absent, the livestream the
 * versioned payload of L12.1 or absent, and the opening animation switch a boolean (F10; L14.3). Every issue is
 * reported, the zone, then the phone, then the playlist, then the
 * itinerary, then the gift registry, then the lodging, then the reminders, then the livestream, then the opening
 * animation, and nothing is
 * transformed except the phone, the link, and the texts of the moments, the registry, and the livestream. A refused
 * request stores nothing.
 */
export function validateInvitationFeatureSettings(input: {
  readonly timeZone: unknown;
  readonly whatsappPhone: unknown;
  readonly playlistUrl: unknown;
  readonly itinerary: unknown;
  readonly giftRegistry: unknown;
  readonly lodging: unknown;
  readonly reminders: unknown;
  readonly livestream: unknown;
  readonly openingAnimation: unknown;
}): InvitationFeatureSettingsValidation {
  const issues: string[] = [];

  if (!isInvitationTimeZone(input.timeZone)) {
    issues.push(INVITATION_TIME_ZONE_ISSUE);
  }

  const phone = normalizeWhatsAppPhone(input.whatsappPhone);
  if (!phone.ok) {
    issues.push(phone.issue);
  }

  const playlist = normalizePlaylistUrl(input.playlistUrl);
  if (!playlist.ok) {
    issues.push(playlist.issue);
  }

  const itinerary = validateItinerary(input.itinerary);
  if (!itinerary.ok) {
    issues.push(...itinerary.issues);
  }

  const giftRegistry = validateGiftRegistry(input.giftRegistry);
  if (!giftRegistry.ok) {
    issues.push(...giftRegistry.issues);
  }

  const lodging = validateLodging(input.lodging);
  if (!lodging.ok) {
    issues.push(...lodging.issues);
  }

  const reminders = validateReminders(input.reminders);
  if (!reminders.ok) {
    issues.push(...reminders.issues);
  }

  const livestream = validateLivestream(input.livestream);
  if (!livestream.ok) {
    issues.push(...livestream.issues);
  }

  // The opening animation switch is the last value the write validates (F10; L14.3): it is a boolean and nothing else,
  // so a client that sends a word, a number, or nothing at all reads its own issue instead of a stored guess.
  if (typeof input.openingAnimation !== "boolean") {
    issues.push(OPENING_ANIMATION_ISSUE);
  }

  if (
    issues.length > 0 ||
    !phone.ok ||
    !playlist.ok ||
    !itinerary.ok ||
    !giftRegistry.ok ||
    !lodging.ok ||
    !reminders.ok ||
    !livestream.ok ||
    typeof input.openingAnimation !== "boolean" ||
    !isInvitationTimeZone(input.timeZone)
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      timeZone: input.timeZone,
      whatsappPhone: phone.phone,
      playlistUrl: playlist.url,
      itinerary: itinerary.value,
      giftRegistry: giftRegistry.value,
      lodging: lodging.value,
      reminders: reminders.value,
      livestream: livestream.value,
      openingAnimation: input.openingAnimation,
    },
  };
}

/** What the gate reads: the pinned package's included catalog keys and the stored feature data. */
export interface InvitationFeatureGate {
  readonly includedFeatureKeys: readonly string[];
  readonly whatsappPhone: string | null;
  /** The stored playlist link; MUSIC stays off while it is null or names no allow-listed service (S7). */
  readonly playlistUrl: string | null;
  /** The stored playlist title the provider answered, or null when there is none (S2). */
  readonly playlistTitle: string | null;
  /** The stored cover URL the provider answered, or null when there is none (S2). */
  readonly playlistCoverUrl: string | null;
  /** The stored plan of the day, or null when there is none (F1; L3.1). */
  readonly itinerary: InvitationItinerary | null;
  /** The stored gift registry, or null when there is none (F2; L4.1). */
  readonly giftRegistry: InvitationGiftRegistry | null;
  /** The stored lodging, or null when there is none (F4; L7.1). */
  readonly lodging: InvitationLodging | null;
  /** The stored livestream, or null when there is none (F9; L12.1). */
  readonly livestream: InvitationLivestream | null;
  /**
   * The owner's opening animation switch (F10; L14.3, L14.4). The public read plays the overlay only while the pinned
   * package grants `OPENING_ANIMATION` and this is true, so a package that withdraws the key stops it even for an
   * invitation whose switch is on.
   */
  readonly openingAnimation: boolean;
  /** The owner's RSVP deadline, or null for one that never closes (M6 S4). */
  readonly rsvpDeadline: Date | null;
  /** The owner's party limit, 1 to 10 (M6 S4). */
  readonly rsvpPartyLimit: number;
}

/**
 * The feature keys an invitation may show (S4, S7): the package's keys intersected with
 * `IMPLEMENTED_INVITATION_FEATURES`, in that allow-list's order, with `CALENDAR` appended because it is always
 * available and is not catalog data. WhatsApp is dropped while no phone is stored, music while no usable playlist
 * link is stored, and the itinerary while no moment is stored. Duplicates and unknown keys never appear, and the
 * package name plays no part. `GIFT_REGISTRY` stays while the package grants it, because the same key also lets each
 * layout draw an older invitation's content text field (F2; L4.3).
 */
export function availableFeatureKeys(gate: InvitationFeatureGate): string[] {
  const included = new Set(gate.includedFeatureKeys);
  const keys: string[] = [];

  for (const featureKey of IMPLEMENTED_INVITATION_FEATURES) {
    if (!included.has(featureKey)) {
      continue;
    }
    if (featureKey === "WHATSAPP" && gate.whatsappPhone === null) {
      continue;
    }
    if (featureKey === "MUSIC" && musicProviderOf(gate.playlistUrl) === null) {
      continue;
    }
    if (featureKey === ITINERARY_FEATURE_KEY && (gate.itinerary?.items.length ?? 0) === 0) {
      continue;
    }
    // The lodging follows the same rule as the itinerary: the key is offered only while there is something to draw
    // (F4; L7.2, L7.3).
    if (featureKey === LODGING_FEATURE_KEY && !lodgingHasContent(gate.lodging)) {
      continue;
    }
    // And the livestream too (F9; L12.2): the key is offered only while there is a link to draw.
    if (featureKey === LIVESTREAM_FEATURE_KEY && !livestreamHasContent(gate.livestream)) {
      continue;
    }
    keys.push(featureKey);
  }
  keys.push(CALENDAR_FEATURE_KEY);
  return keys;
}

/** What a guest's feature block renders; `calendar` is always true (S4). */
export interface PublicInvitationFeatures {
  readonly countdown: boolean;
  readonly map: boolean;
  readonly calendar: true;
  /** The E.164 phone the WhatsApp button dials, or null when the feature is not available. */
  readonly whatsapp: { readonly phone: string } | null;
  /**
   * The playlist link, the service it names, and the metadata the provider answered, or null when the feature is
   * not available (S7, S2). `title` and `coverUrl` are null when no lookup stored one, so the shape is stable and
   * a layout always reads the same keys.
   */
  readonly music: {
    readonly url: string;
    readonly provider: MusicProvider;
    readonly title: string | null;
    readonly coverUrl: string | null;
  } | null;
  /**
   * The moments of the day, in the owner's order, or null when the package does not grant `ITINERARY` or the
   * invitation stores none (F1; L3.3). The payload's version stays in the API: a guest page reads the list.
   */
  readonly itinerary: { readonly items: readonly ItineraryMoment[] } | null;
  /**
   * Whether the pinned package grants `GIFT_REGISTRY`, which is also what lets each layout draw an older invitation's
   * content text field (F2; L4.3). It keeps the boolean the field always answered, so a page deployed before the
   * structured registry still reads it as the gate: it is the gate, not the data.
   */
  readonly giftRegistry: boolean;
  /**
   * The structured gift registry a guest's card draws, or null when the package does not grant `GIFT_REGISTRY` or the
   * invitation stores nothing a card would show (F2; L4.3). The payload's version stays in the API, and the transfer
   * and note are answered as null so a page always reads the same keys.
   */
  readonly giftRegistryDetails: PublicGiftRegistry | null;
  /**
   * The hotel cards and the transport line a guest's block draws, or null when the package does not grant `LODGING` or
   * the invitation stores nothing there (F4; L7.3). The payload's version stays in the API, and the transport is
   * answered as null so a page always reads the same keys.
   */
  readonly lodging: PublicLodging | null;
  /**
   * The livestream link a guest's block draws, the video id the API resolved when that link is an embeddable YouTube
   * one, and the note — or null when the package does not grant `LIVESTREAM` or the invitation stores no link (F9;
   * L12.3). The video id is answered instead of an embed URL, so the web builds the only origin it renders.
   */
  readonly livestream: PublicLivestream | null;
  /**
   * Whether the guest page draws the opening animation (F10; L14.4): true only while the pinned package grants
   * `OPENING_ANIMATION` and the owner's switch is on. It is the decision itself, never the stored switch, so the page
   * draws no overlay for a package that withdrew the key. A body written before F10 answers no field at all, and the
   * web reads that as off, so a page deployed before the API never hides the invitation behind an overlay (L20).
   */
  readonly openingAnimation: boolean;
  /**
   * The guestbook a guest's wall draws (F7; L10.4): the visible entries newest first, at most 50, each one the
   * signature and the message a guest signed. It is the list itself rather than a switch — an empty array is a wall
   * waiting for its first message — and it is null only when the pinned package does not grant `GUESTBOOK`, so a
   * stored message the package does not grant stays private.
   */
  readonly guestbook: readonly PublicGuestbookEntry[] | null;
  /**
   * The album of the guests' photos a guest may see (F8; L11.4): the newest published photos — at most 60 — and the
   * total number of published photos. It is the album itself rather than a switch — an empty list is an album waiting
   * for its first photo — and it is null only when the pinned package does not grant `GUEST_ALBUM`, so a photo the
   * package does not grant stays private.
   */
  readonly guestAlbum: PublicGuestAlbum | null;
  /**
   * The gallery photos the page renders, ordered by position (M8 S4). Empty when the package does not grant
   * `GALLERY`, so the shape is stable and a layout can always read an array; an empty array and an absent gallery
   * look the same to the guest, which is exactly right: there is nothing to render either way.
   */
  readonly gallery: readonly PublicGalleryPhoto[];
  /**
   * How the guest page accepts attendance answers (M6 S1, S4): the open form (`open`), personal links
   * (`guest-list`, G2), or nothing (`null`), together with the creator's deadline and party limit and whether the
   * guest-list access pass is granted. The mode is an answer about the page, not a package name, a price, or a
   * feature key list.
   */
  readonly rsvp: {
    readonly mode: RsvpMode;
    readonly deadline: Date | null;
    readonly partyLimit: number;
    /**
     * Whether a confirmed guest's personal page may show the access QR (M6 G2; S4). It is true only while the
     * package grants `QR_PASS` and the package grants the guest list together with it, because the pass belongs
     * to a personal link: without one there is no guest to admit.
     */
    readonly qrPass: boolean;
  };
}

/**
 * The guest's view of the gated features (S4, S7, M6 S4): the same intersection `availableFeatureKeys` decides,
 * shaped as the booleans the public read returns. WhatsApp answers the stored phone only while the package
 * includes WHATSAPP, and music answers the stored link only while the package includes MUSIC and the link names an
 * allow-listed service; a stored value the package does not grant stays private. The structured gift registry is
 * answered only to a package that grants `GIFT_REGISTRY` and only while it would show something (F2; L4.3), together
 * with the grant itself, which the layouts keep reading for an older invitation's content text field. The livestream is
 * answered the same way (F9; L12.3). The RSVP mode is decided from the package's keys directly, together with the
 * deadline, the party limit, and whether the guest-list access pass is granted (M6 G2).
 */
export function publicInvitationFeatures(
  gate: InvitationFeatureGate,
  galleryPhotos: readonly PublicGalleryPhoto[] = [],
  guestbookEntries: readonly PublicGuestbookEntry[] = [],
  guestAlbum: PublicGuestAlbum = EMPTY_PUBLIC_GUEST_ALBUM,
): PublicInvitationFeatures {
  const keys = new Set(availableFeatureKeys(gate));
  // A row written around the API reads as no itinerary at all, exactly like a title or a cover it refuses (S2, F1).
  const itinerary = storedItinerary(gate.itinerary);
  const provider = keys.has("MUSIC") ? musicProviderOf(gate.playlistUrl) : null;
  const mode = rsvpModeOf(gate.includedFeatureKeys);
  // A stored value the deployment does not allow is not shown, even if a row was written around the API (S2).
  const title = normalizePlaylistTitle(gate.playlistTitle);
  const coverUrl = isMusicCoverUrl(gate.playlistCoverUrl) ? gate.playlistCoverUrl : null;
  // A row written around the API reads as no registry, exactly like an itinerary it refuses (F2; L4.1).
  const registry = storedGiftRegistry(gate.giftRegistry);
  // The same rule for the lodging: a row no rule validated draws nothing (F4; L7.1).
  const lodging = storedLodging(gate.lodging);
  // The same rule for the livestream (F9; L12.1): a row no rule validated draws nothing.
  const livestream = storedLivestream(gate.livestream);

  return {
    countdown: keys.has("COUNTDOWN"),
    map: keys.has("MAP"),
    calendar: true,
    whatsapp:
      keys.has("WHATSAPP") && gate.whatsappPhone !== null ? { phone: gate.whatsappPhone } : null,
    music:
      provider === null || gate.playlistUrl === null
        ? null
        : { url: gate.playlistUrl, provider, title, coverUrl },
    itinerary:
      keys.has(ITINERARY_FEATURE_KEY) && itinerary !== null ? { items: itinerary.items } : null,
    giftRegistry: keys.has(GIFT_REGISTRY_FEATURE_KEY),
    giftRegistryDetails:
      keys.has(GIFT_REGISTRY_FEATURE_KEY) && giftRegistryHasContent(registry)
        ? publicGiftRegistry(registry)
        : null,
    lodging:
      keys.has(LODGING_FEATURE_KEY) && lodgingHasContent(lodging) ? publicLodging(lodging) : null,
    livestream:
      keys.has(LIVESTREAM_FEATURE_KEY) && livestreamHasContent(livestream)
        ? publicLivestream(livestream)
        : null,
    // The animation is the one feature whose data is a switch rather than a payload: the grant decides whether the
    // owner's choice counts at all, and the switch decides whether the page draws the envelope (F10; L14.4).
    openingAnimation: keys.has(OPENING_ANIMATION_FEATURE_KEY) && gate.openingAnimation,
    // The wall is the feature, not its data: a granted package answers its visible entries even while there are none.
    guestbook: keys.has(GUESTBOOK_FEATURE_KEY) ? [...guestbookEntries] : null,
    // The album follows the same rule (F8; L11.4): the grant carries the published photos the read collected, and a
    // package without the key answers null even when a caller passes photos.
    guestAlbum: keys.has(GUEST_ALBUM_FEATURE_KEY)
      ? { photos: [...guestAlbum.photos], count: guestAlbum.count }
      : null,
    // Only a package that grants GALLERY renders photos; the read passes none otherwise, and this repeats the gate.
    gallery: keys.has(GALLERY_FEATURE_KEY) ? galleryPhotos : [],
    rsvp: {
      mode,
      deadline: gate.rsvpDeadline,
      partyLimit: gate.rsvpPartyLimit,
      // The pass belongs to the guest list: a package that grants QR_PASS without GUEST_LIST offers no QR (G2).
      qrPass: mode === "guest-list" && keys.has(QR_PASS_FEATURE_KEY),
    },
  };
}
