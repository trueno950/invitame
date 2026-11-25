import type { GalleryPhoto } from "../invitation-features/gallery.ts";
import { isE164Phone } from "../invitation-features/invitation-features.ts";
import { type MusicLink, musicServiceOf } from "../invitation-features/music.ts";
import { parseStoredPlaces, type StoredPlaces } from "../invitation-features/place-point.ts";
import { isInvitationTimeZone } from "../invitation-features/time-zones.ts";
import { ApiClientError, type ApiClientOptions, sendApiRequest } from "./api-client.ts";
import {
  GUEST_NAME_MAX_LENGTH,
  GUEST_SEATS_MAX,
  GUEST_SEATS_MIN,
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
  /** Whether the layouts render their gift registry block (S7). */
  readonly giftRegistry: boolean;
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
 * service it names or null, and `giftRegistry` is the boolean the layouts gate their own block with.
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
    features.calendar !== true ||
    typeof features.giftRegistry !== "boolean"
  ) {
    return undefined;
  }

  const music = features.music === null ? null : musicServiceOf(features.music);
  const rsvp = parsePublicRsvp(features.rsvp);
  const gallery = parseGallery(features.gallery, apiOrigin);

  if (music === undefined || rsvp === undefined || gallery === undefined) {
    return undefined;
  }

  const whatsapp = features.whatsapp;
  const base = {
    countdown: features.countdown,
    map: features.map,
    calendar: true,
    giftRegistry: features.giftRegistry,
    music,
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
  readonly response: {
    readonly attending: boolean;
    readonly partySize: number;
    readonly message: string | null;
  } | null;
  /** Whether the pass is offered: only for a confirmed guest of a package that grants `QR_PASS` (S4). */
  readonly qrPass: boolean;
}

/** The personal page: the public projection of A7 plus one guest block (S4). */
export interface PublicGuestInvitation extends PublicInvitation {
  readonly guest: PublicGuestResponse;
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

  if (
    typeof attending !== "boolean" ||
    typeof partySize !== "number" ||
    !Number.isSafeInteger(partySize) ||
    partySize < 0 ||
    partySize > seats ||
    (attending && partySize < 1) ||
    (!attending && partySize !== 0) ||
    !(message === null || typeof message === "string")
  ) {
    return undefined;
  }

  return { attending, partySize, message };
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

  const { name, seats, qrPass } = guest;

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    [...name].length > GUEST_NAME_MAX_LENGTH ||
    typeof seats !== "number" ||
    !Number.isInteger(seats) ||
    seats < GUEST_SEATS_MIN ||
    seats > GUEST_SEATS_MAX ||
    typeof qrPass !== "boolean"
  ) {
    return undefined;
  }

  const response = guest.response === null ? null : parsePublicGuestResponse(guest.response, seats);

  if (response === undefined) {
    return undefined;
  }

  return { ...page, guest: { name, seats, response, qrPass } };
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

/** One guest's open RSVP answer, as the form submits it (M6 G3; S4). */
export interface PublicRsvpSubmission {
  readonly name: string;
  readonly attending: boolean;
  readonly partySize: number;
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

/** The status and code pairing each refusal this deployment implements; anything else fails closed. */
const RSVP_REFUSALS: Readonly<Record<string, { status: number; failure: string }>> = {
  PUBLIC_INVITATION_NOT_FOUND: { status: 404, failure: "not-found" },
  RSVP_NOT_OPEN: { status: 409, failure: "not-open" },
  RSVP_RATE_LIMITED: { status: 429, failure: "rate-limited" },
  INVALID_RSVP: { status: 400, failure: "invalid" },
};

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
  };
}
