/**
 * The livestream of a guest invitation (F9; S2.9, L12.1, L12.3, L12.5). The owner keeps the link of the transmission they
 * will stream and an optional note as feature data of one invitation, and every layout draws the same card from it. The
 * API validates the payload and answers `features.livestream` as the link, the video id it resolved when that link is an
 * embeddable YouTube one, and the note, or null when the pinned package does not grant `LIVESTREAM` or nothing is stored.
 * This module is the web's strict reader of that answer, the one embed origin it renders, and the copy of the card.
 *
 * The provider allow-list is narrow on purpose (L12.3): only a YouTube link whose id is exactly the eleven characters
 * YouTube uses is embedded, and the embed address is built here from that id on `https://www.youtube-nocookie.com`, never
 * from an untrusted path. Every other `https` link is a link the guest opens in a new tab.
 */

/** The only payload version this deployment reads and writes; a later shape needs its own reader (L12.1). */
export const LIVESTREAM_VERSION = 1;

/** The widest link one livestream stores, mirroring the API's rule (L12.1). */
export const LIVESTREAM_URL_MAX_LENGTH = 500;

/** The longest note of one livestream, mirroring the API's rule (L12.1). */
export const LIVESTREAM_NOTE_MAX_LENGTH = 120;

/** The one origin this deployment frames: YouTube's privacy-enhanced embed host (L12.3). */
export const LIVESTREAM_EMBED_ORIGIN = "https://www.youtube-nocookie.com";

/** The section heading the artboard draws above the player (L12.5). */
export const LIVESTREAM_SECTION_TITLE = "Míralo en vivo";

/** The action that opens a stream this deployment does not embed, and the facade's own play label (L12.3, L12.4). */
export const LIVESTREAM_OPEN_LABEL = "Abrir la transmisión";
export const LIVESTREAM_PLAY_LABEL = "Reproducir la transmisión";

/** The fallback link the card always offers, whether or not the player loaded (L12.5). */
export const LIVESTREAM_FALLBACK_LABEL = "Si no carga, ábrela aquí";

/** The accessible name of the player's frame, which a screen reader announces (L12.4). */
export const LIVESTREAM_IFRAME_TITLE = "Transmisión en vivo";

/** The sandbox of the player: what playback needs and nothing else (L12.4). */
export const LIVESTREAM_IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation";

/** The permissions the player asks the frame for, which YouTube's own player uses (L12.4). */
export const LIVESTREAM_IFRAME_ALLOW = "autoplay; encrypted-media; picture-in-picture; fullscreen";

/** The eleven characters a YouTube video id is made of, and the whole of it (L12.3). */
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The hosts whose links may be embedded, compared whole after the parser lower-cases them (L12.3). */
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

/** A whitespace or control character in a link: no URL the API stores carries one. */
const URL_UNSTORABLE_CHARACTERS = /[\p{Cc}\s]/u;

/** The livestream a guest draws: the link, the resolved video id or null, and the note or null. */
export interface Livestream {
  readonly url: string;
  readonly videoId: string | null;
  readonly note: string | null;
}

/** The payload one invitation stores, as the owner read and the write carry it (F9; L12.1). */
export interface LivestreamPayload {
  readonly version: typeof LIVESTREAM_VERSION;
  readonly url: string;
  readonly note?: string;
}

/** The only keys the guest's livestream carries. */
const LIVESTREAM_KEYS: ReadonlySet<string> = new Set(["url", "videoId", "note"]);

/** The only keys the owner's payload carries. */
const PAYLOAD_KEYS: ReadonlySet<string> = new Set(["version", "url", "note"]);

/** A JSON object as a response answers it; arrays, null, and primitives are not objects. */
function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Whether a record carries a key outside the shape this contract documents. */
function hasOtherKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).some((key) => !allowed.has(key));
}

/**
 * Whether a value is an `https` link this deployment renders (L12.1): at most 500 characters, no whitespace or control
 * character, and a URL the parser reads whose scheme is `https` with a host. Any host is allowed, because a link the
 * page does not embed is still a stream the guest may open.
 */
export function isLivestreamUrl(value: string): boolean {
  if ([...value].length > LIVESTREAM_URL_MAX_LENGTH) {
    return false;
  }
  if (URL_UNSTORABLE_CHARACTERS.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);

    return parsed.protocol === "https:" && parsed.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * The YouTube video id a link names, or null when the link is no embeddable YouTube link (L12.3). The three shapes the
 * allow-list names are read — `youtube.com/watch?v=<id>`, `youtube.com/live/<id>`, and `youtu.be/<id>` — and the id must
 * be exactly the eleven characters YouTube uses. The API resolves the id for the public read; the web re-checks it, so a
 * body written around the API can never frame an address of its own.
 */
export function youtubeVideoIdOf(value: unknown): string | null {
  if (typeof value !== "string" || URL_UNSTORABLE_CHARACTERS.test(value)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.port !== "") {
    return null;
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return null;
  }
  if (!YOUTUBE_HOSTS.has(parsed.hostname)) {
    return null;
  }

  if (parsed.hostname === "youtu.be") {
    const id = parsed.pathname.replace(/^\//u, "").replace(/\/$/u, "");

    return YOUTUBE_VIDEO_ID.test(id) ? id : null;
  }
  if (parsed.pathname === "/watch") {
    const id = parsed.searchParams.get("v");

    return id !== null && YOUTUBE_VIDEO_ID.test(id) ? id : null;
  }
  if (parsed.pathname.startsWith("/live/")) {
    const id = parsed.pathname.slice("/live/".length).replace(/\/$/u, "");

    return YOUTUBE_VIDEO_ID.test(id) ? id : null;
  }
  return null;
}

/**
 * The only embed address this deployment frames (L12.3): the privacy-enhanced YouTube host and the id, or null when the
 * value is no strict video id. A body that carries something else never reaches the player as an address.
 */
export function livestreamEmbedUrl(videoId: unknown): string | null {
  return typeof videoId === "string" && YOUTUBE_VIDEO_ID.test(videoId)
    ? `${LIVESTREAM_EMBED_ORIGIN}/embed/${videoId}`
    : null;
}

/** One optional text, trimmed, or null when it says nothing; undefined when it is no bounded text at all. */
function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.trim();

  return [...text].length <= maxLength ? (text === "" ? null : text) : undefined;
}

/**
 * The livestream of one invitation as a guest page reads it (F9; L12.3): the link, the resolved video id or null, and
 * the note or null; `null` when the read answered no livestream (or an older API did not answer the field at all); or
 * `undefined` when the body is not this contract — another key, a link that is not `https`, a video id outside the strict
 * pattern, or a note outside its bound. A value written around the API never reaches a guest.
 */
export function parseLivestream(value: unknown): Livestream | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const livestream = record(value);

  if (livestream === undefined || hasOtherKeys(livestream, LIVESTREAM_KEYS)) {
    return undefined;
  }
  // The guaranteed keys are the whole shape: the API answers the id and the note as null when there are none, so a body
  // without them is not this contract.
  if (!Object.hasOwn(livestream, "videoId") || !Object.hasOwn(livestream, "note")) {
    return undefined;
  }

  const url = optionalText(livestream.url, LIVESTREAM_URL_MAX_LENGTH);
  const note = optionalText(livestream.note, LIVESTREAM_NOTE_MAX_LENGTH);
  const videoId = livestream.videoId;

  if (url === null || url === undefined || note === undefined) {
    return undefined;
  }
  if (!isLivestreamUrl(url)) {
    return undefined;
  }
  if (!(videoId === null || (typeof videoId === "string" && YOUTUBE_VIDEO_ID.test(videoId)))) {
    return undefined;
  }
  // The id and the link must agree, so a body can never pair an embeddable link with another stream's id (L12.3).
  if (videoId !== youtubeVideoIdOf(url)) {
    return undefined;
  }
  return { url, videoId, note };
}

/**
 * The livestream payload of the owner's read (F9; L12.1): `{ version: 1, url, note? }`, `null` when the invitation stores
 * none (or a body written before the field existed), or `undefined` when the body is not the payload this deployment
 * writes. The version is part of the owner's shape because the editor sends the same payload back; the guest read answers
 * the link, the id, and the note only.
 */
export function parseLivestreamPayload(value: unknown): LivestreamPayload | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }

  const payload = record(value);

  if (
    payload === undefined ||
    payload.version !== LIVESTREAM_VERSION ||
    hasOtherKeys(payload, PAYLOAD_KEYS)
  ) {
    return undefined;
  }

  const url = optionalText(payload.url, LIVESTREAM_URL_MAX_LENGTH);
  const note = optionalText(payload.note, LIVESTREAM_NOTE_MAX_LENGTH);

  if (url === undefined || note === undefined) {
    return undefined;
  }
  // A payload with no link is what the API normalizes to NULL before writing, so the owner read never answers one.
  if (url === null) {
    return null;
  }
  if (!isLivestreamUrl(url)) {
    return undefined;
  }

  return { version: LIVESTREAM_VERSION, url, ...(note === null ? {} : { note }) };
}

/**
 * The public view of one stored payload (F9; L12.3): the link, the id resolved from it, and the note or null. The owner's
 * preview draws with it, so the editor shows exactly the card a guest would see.
 */
export function livestreamOf(payload: LivestreamPayload): Livestream {
  return {
    url: payload.url,
    videoId: youtubeVideoIdOf(payload.url),
    note: payload.note ?? null,
  };
}

/** Whether a livestream has something a guest would see (F9; L12.3): a link is the whole card. */
export function livestreamHasContent(
  livestream: Livestream | null | undefined,
): livestream is Livestream {
  return livestream !== null && livestream !== undefined && livestream.url !== "";
}
