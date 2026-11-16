// Per-invitation feature data (F1, F6, F7; S3, S4, S7). The package decides which catalog keys an invitation may
// show; this module decides what the API implements and what a guest sees. Four pure rules live here:
//
// - the time zone allow-list: an invitation stores one IANA zone from this list, and the Spanish labels belong
//   to the web, never to the domain;
// - WhatsApp phone normalization: a Mexican ten-digit number or an international `+` number, stored as E.164;
// - playlist link normalization: an `https` link on an allow-listed music host, at most 500 characters;
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
 * `RSVP` joins when the open RSVP form ships (M6 G1); `GUEST_LIST` stays out until G2 implements the guest list,
 * but it still selects the RSVP mode below, because the mode is an answer about what the guest page shows.
 */
export const IMPLEMENTED_INVITATION_FEATURES = [
  "COUNTDOWN",
  "MAP",
  "RSVP",
  "WHATSAPP",
  "MUSIC",
  "GIFT_REGISTRY",
] as const;

export type ImplementedInvitationFeature = (typeof IMPLEMENTED_INVITATION_FEATURES)[number];

/** The catalog key that grants confirmation of attendance (M6 S3). */
export const RSVP_FEATURE_KEY = "RSVP";

/** The catalog key that grants a managed guest list with personal links (M6 S3; G2 implements it). */
export const GUEST_LIST_FEATURE_KEY = "GUEST_LIST";

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
  /** The playlist link and the service it names, or null when the feature is not available (S7). */
  readonly music: { readonly url: string; readonly provider: MusicProvider } | null;
  /** Whether the layouts render their gift registry block (S7); the content decides its value, not the API. */
  readonly giftRegistry: boolean;
  /**
   * How the guest page accepts attendance answers (M6 S1, S4): the open form (`open`), personal links
   * (`guest-list`, G2), or nothing (`null`), together with the creator's deadline and party limit. The mode is
   * an answer about the page, not a package name, a price, or a feature key list.
   */
  readonly rsvp: {
    readonly mode: RsvpMode;
    readonly deadline: Date | null;
    readonly partyLimit: number;
  };
}

/**
 * The guest's view of the gated features (S4, S7, M6 S4): the same intersection `availableFeatureKeys` decides,
 * shaped as the booleans the public read returns. WhatsApp answers the stored phone only while the package
 * includes WHATSAPP, and music answers the stored link only while the package includes MUSIC and the link names an
 * allow-listed service; a stored value the package does not grant stays private. The gift registry is a boolean
 * because the layout, not the API, knows whether the content has a value to show. The RSVP mode is decided from
 * the package's keys directly, because `GUEST_LIST` is not an implemented layout feature yet (M6 G2).
 */
export function publicInvitationFeatures(gate: InvitationFeatureGate): PublicInvitationFeatures {
  const keys = new Set(availableFeatureKeys(gate));
  const provider = keys.has("MUSIC") ? musicProviderOf(gate.playlistUrl) : null;

  return {
    countdown: keys.has("COUNTDOWN"),
    map: keys.has("MAP"),
    calendar: true,
    whatsapp:
      keys.has("WHATSAPP") && gate.whatsappPhone !== null ? { phone: gate.whatsappPhone } : null,
    music:
      provider === null || gate.playlistUrl === null ? null : { url: gate.playlistUrl, provider },
    giftRegistry: keys.has("GIFT_REGISTRY"),
    rsvp: {
      mode: rsvpModeOf(gate.includedFeatureKeys),
      deadline: gate.rsvpDeadline,
      partyLimit: gate.rsvpPartyLimit,
    },
  };
}
