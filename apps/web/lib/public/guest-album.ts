import { GUEST_ALBUM_NOTICE_COPY } from "../customer/copy.ts";
import {
  GUEST_ALBUM_UPLOADER_NAME_MAX_LENGTH,
  type GuestAlbumValue,
} from "../invitation-features/guest-album.ts";
import type {
  GuestAlbumBlockView,
  RsvpFormAction,
} from "../invitation-features/invitation-features.ts";
import { isGuestToken, isInvitationSlug } from "../server/invitations-api.ts";
import type { PublicInvitationsClient } from "../server/public-invitations-api.ts";

/**
 * The guest's album on `/i/[slug]` (F8; S2.8, L11.5). The API owns the gate, the upload validation, the caps, the rate
 * limit, and the moderation; this module only decides five things:
 *
 * - whether the page shows the album at all: only when the API answered `features.guestAlbum`, which it does only while
 *   the pinned package grants `GUEST_ALBUM`;
 * - what the submitted form becomes: the guest's file, the optional name, and nothing else;
 * - which request the server action sends, with the guest's address read from the incoming request headers;
 * - which query the page reads on the way back;
 * - which Spanish sentence each refusal becomes, so no API body ever reaches a guest.
 *
 * Nothing here logs. The photo's bytes and the name are what the guest chose to publish, and the only place they travel
 * is the request the API authorizes.
 */

/** The server action a form posts to; the page's action module owns it. */
export type { RsvpFormAction };

/** The one query parameter of the page's notice, and the closed set of codes it may carry. */
export const GUEST_ALBUM_NOTICE_PARAM = "foto";
export const GUEST_ALBUM_NOTICE_CODES = [
  "uploaded",
  "invalid",
  "closed",
  "full",
  "pending-full",
  "limited",
  "unavailable",
  // The invitation asked for its password before the photo reached it (F13; L18.2).
  "locked",
] as const;
export type GuestAlbumNoticeCode = (typeof GUEST_ALBUM_NOTICE_CODES)[number];

/**
 * The album of one guest page, or undefined when this invitation's package does not grant `GUEST_ALBUM`. The photos
 * arrive newest first and bounded from the API, so this module never sorts or filters them: it hands the block exactly
 * what a guest may see. An expired invitation keeps the album and closes its form with a note (S2, L11.5).
 */
export function publicGuestAlbumBlock(
  album: GuestAlbumValue | null,
  slug: string,
  action: RsvpFormAction | undefined,
  closed = false,
  guestToken?: string,
): GuestAlbumBlockView | undefined {
  if (album === null || !isInvitationSlug(slug)) {
    return undefined;
  }

  return {
    slug,
    photos: album.photos,
    count: album.count,
    closed,
    ...(guestToken === undefined || !isGuestToken(guestToken) ? {} : { guestToken }),
    ...(action === undefined ? {} : { action }),
  };
}

/** One submitted form, as the upload the API receives. */
export type GuestAlbumFormParse =
  | { readonly ok: true; readonly slug: string; readonly value: PublicGuestAlbumFormValue }
  | { readonly ok: false; readonly slug: string | undefined };

/** The upload the API receives, without the address: that one comes from the request, never the form. */
export interface PublicGuestAlbumFormValue {
  readonly bytes: Uint8Array;
  /** The name the guest typed, trimmed, or null when they left the field empty. */
  readonly uploaderName: string | null;
  /**
   * The guest's own token, only when the form was drawn on their personal page. A value that cannot be one is dropped
   * instead of refused: it only decides which page the notice comes back to, and the API never receives it.
   */
  readonly guestToken?: string;
}

/** A form value as text, or undefined when the field is missing or repeated. */
function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** The one file of the submission, or undefined when the field is missing, empty, or not a file. */
function uploadedFile(form: FormData): File | undefined {
  const file = form.get("file");

  return file instanceof File && file.size > 0 ? file : undefined;
}

/**
 * One submitted form, as the upload the API receives. The local rules are only the ones a form can get wrong without
 * any judgement — a missing slug, a missing file, and a name past the API's own bound — so the API stays the authority
 * on the bytes, the caps, the gate, the expiry, and the rate limit. A value refused here never becomes a request.
 */
export async function parseGuestAlbumForm(form: FormData): Promise<GuestAlbumFormParse> {
  const slug = text(form, "slug");

  if (slug === undefined || !isInvitationSlug(slug)) {
    return { ok: false, slug: undefined };
  }

  const file = uploadedFile(form);
  const name = text(form, "uploaderName")?.trim() ?? "";

  if (file === undefined || [...name].length > GUEST_ALBUM_UPLOADER_NAME_MAX_LENGTH) {
    return { ok: false, slug };
  }

  const token = text(form, "guestToken");

  return {
    ok: true,
    slug,
    value: {
      bytes: new Uint8Array(await file.arrayBuffer()),
      uploaderName: name === "" ? null : name,
      ...(token === undefined || !isGuestToken(token) ? {} : { guestToken: token }),
    },
  };
}

/** The page's own path for one invitation, where the notice of an upload comes back. */
export function guestAlbumPagePath(slug: string): string {
  return `/i/${slug}`;
}

/**
 * The page's path with one notice code, which the page renders as a Spanish sentence (L11.5). A form drawn on a guest's
 * personal page comes back to that page, whose path is built from the slug and their own token — never from a path the
 * form carried, so a submission cannot send the guest anywhere else.
 */
export function guestAlbumResultTarget(
  slug: string,
  code: GuestAlbumNoticeCode,
  guestToken?: string,
): string {
  const path =
    guestToken === undefined || !isGuestToken(guestToken)
      ? guestAlbumPagePath(slug)
      : `${guestAlbumPagePath(slug)}/g/${guestToken}`;

  return `${path}?${GUEST_ALBUM_NOTICE_PARAM}=${code}`;
}

/** The notice the page renders, with the code it came from so a success and a refusal read differently. */
export interface GuestAlbumNotice {
  readonly code: GuestAlbumNoticeCode;
  readonly message: string;
}

/** The Spanish notice the page's query carries, or undefined for anything the page does not know. */
export function guestAlbumNotice(
  parameters: Record<string, string | string[] | undefined> = {},
): GuestAlbumNotice | undefined {
  const code = parameters[GUEST_ALBUM_NOTICE_PARAM];

  if (typeof code !== "string" || !Object.hasOwn(GUEST_ALBUM_NOTICE_COPY, code)) {
    return undefined;
  }

  return {
    code: code as GuestAlbumNoticeCode,
    message: GUEST_ALBUM_NOTICE_COPY[code as GuestAlbumNoticeCode],
  };
}

/** The Spanish sentence of the notice the page's query carries, or undefined for anything else. */
export function guestAlbumNoticeMessage(
  parameters: Record<string, string | string[] | undefined> = {},
): string | undefined {
  return guestAlbumNotice(parameters)?.message;
}

/** The client call this module needs, so a test can hand it a fake and see exactly what it sent. */
export type PublicGuestAlbumClient = Pick<PublicInvitationsClient, "uploadGuestPhoto">;

/** Each refusal of the API, as the notice the guest page shows (L11.5, L26). */
const RESULT_CODES: Readonly<
  Record<
    "invalid" | "closed" | "full" | "pending-full" | "rate-limited" | "not-found" | "locked",
    GuestAlbumNoticeCode
  >
> = {
  invalid: "invalid",
  closed: "closed",
  full: "full",
  "pending-full": "pending-full",
  "rate-limited": "limited",
  // The invitation stores an access code this device has not unlocked: the page draws its lock screen and says so
  // (F13; L18.2).
  locked: "locked",
  // The page itself answers 404 for a slug that no longer resolves, so the notice says nothing new.
  "not-found": "unavailable",
};

/**
 * Sends one photo and answers the path the action redirects to (L11.5). The guest's address is the one the caller read
 * from the incoming request's headers: it is never part of the form, and it is what the API's rate limit counts against.
 * Every failure becomes one of the page's own notices, so a refused photo never shows an API body and an outage never
 * breaks the invitation.
 */
export async function submitPublicGuestAlbumForm(
  client: PublicGuestAlbumClient,
  form: FormData,
  request: { clientAddress: string | undefined },
): Promise<string> {
  const parsed = await parseGuestAlbumForm(form);

  if (!parsed.ok) {
    return parsed.slug === undefined
      ? // Nothing in the form names an invitation: there is no page to come back to but the home page.
        "/"
      : guestAlbumResultTarget(parsed.slug, "invalid");
  }

  let code: GuestAlbumNoticeCode;

  try {
    const result = await client.uploadGuestPhoto(
      parsed.slug,
      parsed.value,
      request.clientAddress === undefined ? {} : { clientAddress: request.clientAddress },
    );

    code = result.ok ? "uploaded" : RESULT_CODES[result.failure];
  } catch {
    // Already logged by the server wrapper; the guest reads one sentence instead of an error page.
    code = "unavailable";
  }

  return guestAlbumResultTarget(parsed.slug, code, parsed.value.guestToken);
}
