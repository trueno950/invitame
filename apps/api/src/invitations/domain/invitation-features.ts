// Per-invitation feature data (F1, F6, F7; S3, S4, S7). The package decides which catalog keys an invitation may
// show; this module decides what the API implements and what a guest sees. Five pure rules live here:
//
// - the time zone allow-list: an invitation stores one IANA zone from this list, and the Spanish labels belong
//   to the web, never to the domain;
// - WhatsApp phone normalization: a Mexican ten-digit number or an international `+` number, stored as E.164;
// - playlist link normalization: an `https` link on an allow-listed music host, at most 500 characters;
// - playlist metadata bounds: the title the provider answered trimmed to 200 characters, and a cover only from an
//   allow-listed image host over `https` (S2);
// - feature gating: the package's feature keys intersected with the implemented allow-list, plus the add-to-
//   calendar feature, which is not catalog data; WhatsApp also needs a stored phone, and music a usable link.
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
 * gallery (M8 S3, S4). The order is the order the owner's feature list follows.
 */
export const IMPLEMENTED_INVITATION_FEATURES = [
  "COUNTDOWN",
  "MAP",
  "RSVP",
  "WHATSAPP",
  "MUSIC",
  "GIFT_REGISTRY",
  "GUEST_LIST",
  "QR_PASS",
  "GALLERY",
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
 * The playlist metadata a provider answered (S2): the title it named and the cover this API allows, each null
 * when that provider named nothing usable. It carries no HTML, no player, and nothing else the provider sent.
 */
export interface PlaylistMetadata {
  readonly title: string | null;
  readonly coverUrl: string | null;
}

/**
 * A stored playlist title (S2): the surrounding spaces trimmed and at most `PLAYLIST_TITLE_MAX_LENGTH`
 * characters, or null when the value says nothing. A longer title is cut at the bound instead of being refused,
 * because a provider's title is data the owner never typed; the column is the second bound.
 */
export function normalizePlaylistTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const characters = [...trimmed];

  return characters.length > PLAYLIST_TITLE_MAX_LENGTH
    ? characters.slice(0, PLAYLIST_TITLE_MAX_LENGTH).join("").trimEnd()
    : trimmed;
}

/**
 * Whether a value is a cover URL this deployment renders (S2, S3): `https`, no port and no userinfo, and one of the
 * allow-listed image hosts. Anything else is no cover at all, so a guest page never loads an image from a host the
 * API did not allow and the stored value always satisfies the `playlistCoverUrl` https check.
 */
export function isMusicCoverUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > PLAYLIST_COVER_URL_MAX_LENGTH) {
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

/** The feature settings a creator saves: the time zone, the stored E.164 phone, and the playlist link. */
export interface InvitationFeatureSettingsValue {
  readonly timeZone: InvitationTimeZone;
  readonly whatsappPhone: string | null;
  /** A normalized `https` link on an allow-listed music host, or null (S7). */
  readonly playlistUrl: string | null;
}

/** The feature settings a request asked for, validated, or every issue that refuses them. */
export type InvitationFeatureSettingsValidation =
  | { readonly ok: true; readonly value: InvitationFeatureSettingsValue }
  | { readonly ok: false; readonly issues: string[] };

/**
 * Validates a feature-settings request (S4, S7): the zone must be an allow-list member, the phone must
 * normalize, and the playlist link must be an `https` link on an allow-listed host. Every issue is reported, the
 * zone, then the phone, then the playlist, and nothing is transformed except the phone and the link. A refused
 * request stores nothing.
 */
export function validateInvitationFeatureSettings(input: {
  readonly timeZone: unknown;
  readonly whatsappPhone: unknown;
  readonly playlistUrl: unknown;
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

  if (issues.length > 0 || !phone.ok || !playlist.ok || !isInvitationTimeZone(input.timeZone)) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      timeZone: input.timeZone,
      whatsappPhone: phone.phone,
      playlistUrl: playlist.url,
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
  /** The owner's RSVP deadline, or null for one that never closes (M6 S4). */
  readonly rsvpDeadline: Date | null;
  /** The owner's party limit, 1 to 10 (M6 S4). */
  readonly rsvpPartyLimit: number;
}

/**
 * The feature keys an invitation may show (S4, S7): the package's keys intersected with
 * `IMPLEMENTED_INVITATION_FEATURES`, in that allow-list's order, with `CALENDAR` appended because it is always
 * available and is not catalog data. WhatsApp is dropped while no phone is stored, and music while no usable
 * playlist link is stored. Duplicates and unknown keys never appear, and the package name plays no part.
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
  /** Whether the layouts render their gift registry block (S7); the content decides its value, not the API. */
  readonly giftRegistry: boolean;
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
 * allow-listed service; a stored value the package does not grant stays private. The gift registry is a boolean
 * because the layout, not the API, knows whether the content has a value to show. The RSVP mode is decided from
 * the package's keys directly, together with the deadline, the party limit, and whether the guest-list access
 * pass is granted (M6 G2).
 */
export function publicInvitationFeatures(
  gate: InvitationFeatureGate,
  galleryPhotos: readonly PublicGalleryPhoto[] = [],
): PublicInvitationFeatures {
  const keys = new Set(availableFeatureKeys(gate));
  const provider = keys.has("MUSIC") ? musicProviderOf(gate.playlistUrl) : null;
  const mode = rsvpModeOf(gate.includedFeatureKeys);
  // A stored value the deployment does not allow is not shown, even if a row was written around the API (S2).
  const title = normalizePlaylistTitle(gate.playlistTitle);
  const coverUrl = isMusicCoverUrl(gate.playlistCoverUrl) ? gate.playlistCoverUrl : null;

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
    giftRegistry: keys.has("GIFT_REGISTRY"),
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
