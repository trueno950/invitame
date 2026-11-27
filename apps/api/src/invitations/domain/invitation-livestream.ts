/**
 * The livestream of one invitation (F9; S2.9, L12.1). The owner pastes the link of the transmission they will stream and
 * an optional note, and every layout draws the same card from it, so changing the template never loses it.
 *
 * The stored value is a small, versioned presentation payload and nothing else:
 *
 * ```json
 * { "version": 1, "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "note": "Inicia a las 17:00 h" }
 * ```
 *
 * The rules are the ones the column cannot state: the version is exactly 1, the link is `https`, at most 500 characters
 * and carries no whitespace or control character, and the note is at most 120 trimmed characters. A blank note is absent
 * instead of stored as an empty string, and a payload without a link means the invitation has no livestream, which is
 * why `null` is a valid value of the whole payload.
 *
 * The provider allow-list is a separate, narrower rule (L12.3): only a YouTube link is embedded, and only while it names
 * a video id of exactly eleven characters. The API resolves that id and the public read answers it, so the web renders
 * `https://www.youtube-nocookie.com/embed/<id>` and nothing else; every other `https` link is a link the guest opens in
 * a new tab. Nothing here reads a template, a package, or a framework: the gate compares catalog keys and this module
 * decides what a livestream is.
 */

/** The only payload version this API stores; a later shape needs a new version and its own reader (L12.1). */
export const LIVESTREAM_VERSION = 1;

/** The widest link one livestream stores, counted in characters (L12.1). */
export const LIVESTREAM_URL_MAX_LENGTH = 500;

/** The longest note of one livestream, counted in characters after trimming (L12.1). */
export const LIVESTREAM_NOTE_MAX_LENGTH = 120;

/** A whitespace or control character in a link: no URL this API stores carries one. */
const URL_UNSTORABLE_CHARACTERS = /[\p{Cc}\s]/u;

/** The eleven characters a YouTube video id is made of, and the whole of it (L12.3). */
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The hosts whose links may be embedded (L12.3). The host is compared whole and case-insensitively (the `URL` parser
 * lower-cases it); a different port, userinfo, or a look-alike domain refuses the link, so it can never borrow an
 * allow-listed host to reach somewhere else.
 */
const YOUTUBE_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

/** The message a payload that is not an object is refused with. */
export const LIVESTREAM_TYPE_ISSUE = "livestream must be an object or null";

/** The message a payload of another version is refused with. */
export const LIVESTREAM_VERSION_ISSUE = "livestream.version must be 1";

/** The message a link outside its bounds is refused with. */
export const LIVESTREAM_URL_ISSUE =
  "livestream.url must be an https link of at most 500 characters";

/** The message a note outside its bounds is refused with. */
export const LIVESTREAM_NOTE_ISSUE = "livestream.note must be a string of at most 120 characters";

/** A validated livestream: the version the reader understands, the link, and the optional note. */
export interface InvitationLivestream {
  readonly version: typeof LIVESTREAM_VERSION;
  readonly url: string;
  readonly note?: string;
}

/**
 * The livestream as a guest page reads it (F9; L12.3): the link, the video id the API resolved when the link is an
 * embeddable YouTube one, or `null` when the guest may only open the link. The note is always answered, as `null` when
 * the owner wrote none, so a card always reads the same keys.
 */
export interface PublicLivestream {
  readonly url: string;
  readonly videoId: string | null;
  readonly note: string | null;
}

/** A validated payload, or every deterministic English issue that refuses it. */
export type LivestreamValidation =
  | { readonly ok: true; readonly value: InvitationLivestream | null }
  | { readonly ok: false; readonly issues: readonly string[] };

/** A JSON object as a request or a `Json` column answers it; arrays, null, and primitives are not objects. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is an `https` link this API stores (L12.1): at most 500 characters, no whitespace or control
 * character, and a URL the parser reads whose scheme is `https` with a host. Any host is allowed, because a link the
 * API does not embed is still a stream the owner may open; the allow-list decides the embed, not the storage.
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
 * The YouTube video id a stored link names, or null when the link is no embeddable YouTube link (L12.3). The three
 * shapes the allow-list names are read — `youtube.com/watch?v=<id>`, `youtube.com/live/<id>`, and `youtu.be/<id>` — and
 * the id must be exactly the eleven characters YouTube uses. A link with another path, another host, a port, or
 * userinfo resolves nothing, so a guest sees only its open link. The answer is the id itself, never a URL built from
 * an untrusted path: the embed address is the web's own constant.
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
 * Validates the livestream of one feature-settings request (F9; L12.1). `null`, `undefined`, and a payload without a
 * link all mean "no livestream" and answer `null`, which is how the owner clears it: a note alone has nothing to show.
 * Every other value must be the versioned payload this API stores; each issue is reported in a deterministic order —
 * the version, the link, then the note — so a client shows them without guessing. The stored value always satisfies the
 * rules above, which is the only shape the column trusts.
 */
export function validateLivestream(value: unknown): LivestreamValidation {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }
  if (!isJsonObject(value)) {
    return { ok: false, issues: [LIVESTREAM_TYPE_ISSUE] };
  }

  const issues: string[] = [];

  if (value.version !== LIVESTREAM_VERSION) {
    issues.push(LIVESTREAM_VERSION_ISSUE);
  }

  const rawUrl = value.url;
  let url: string | null = null;

  if (typeof rawUrl === "string") {
    const trimmed = rawUrl.trim();

    if (trimmed !== "") {
      if (isLivestreamUrl(trimmed)) {
        url = trimmed;
      } else {
        issues.push(LIVESTREAM_URL_ISSUE);
      }
    }
  } else if (rawUrl !== undefined && rawUrl !== null) {
    issues.push(LIVESTREAM_URL_ISSUE);
  }

  let note: string | undefined;

  if (value.note !== undefined && value.note !== null) {
    if (typeof value.note !== "string") {
      issues.push(LIVESTREAM_NOTE_ISSUE);
    } else {
      const trimmed = value.note.trim();

      if ([...trimmed].length > LIVESTREAM_NOTE_MAX_LENGTH) {
        issues.push(LIVESTREAM_NOTE_ISSUE);
      } else if (trimmed !== "") {
        note = trimmed;
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  if (url === null) {
    return { ok: true, value: null };
  }

  return {
    ok: true,
    value: { version: LIVESTREAM_VERSION, url, ...(note === undefined ? {} : { note }) },
  };
}

/**
 * Whether a validated livestream has something a guest would see (F9; L12.3): a link is the whole card, because the
 * owner's note only travels with it. That is the same rule the validator uses to answer `null`, so the API's gate and
 * the web's own reader all read one definition of an empty livestream.
 */
export function livestreamHasContent(
  livestream: InvitationLivestream | null | undefined,
): livestream is InvitationLivestream {
  return livestream !== null && livestream !== undefined && livestream.url !== "";
}

/** The public projection of one validated livestream, as the guest read answers it (F9; L12.3). */
export function publicLivestream(livestream: InvitationLivestream): PublicLivestream {
  return {
    url: livestream.url,
    videoId: youtubeVideoIdOf(livestream.url),
    note: livestream.note ?? null,
  };
}

/**
 * The livestream a stored row carries, or null when the row cannot be one this deployment renders (F9; L12.1). A row
 * written around the API — another version, a link that is not `https`, a note outside its bound, a payload without a
 * link — shows no livestream instead of reaching a guest as a value no rule validated.
 */
export function storedLivestream(value: unknown): InvitationLivestream | null {
  if (value === null || value === undefined) {
    return null;
  }

  const validated = validateLivestream(value);

  return validated.ok ? validated.value : null;
}
