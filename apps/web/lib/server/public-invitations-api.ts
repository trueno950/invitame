import { isE164Phone } from "../invitation-features/invitation-features.ts";
import { isInvitationTimeZone } from "../invitation-features/time-zones.ts";
import { ApiClientError, type ApiClientOptions, sendApiRequest } from "./api-client.ts";
import { isInvitationSlug } from "./invitations-api.ts";

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

/** The features the API gated for one invitation, as a guest page reads them (S4). */
export interface PublicInvitationFeatures {
  readonly countdown: boolean;
  readonly map: boolean;
  /** Add-to-calendar is always on for a published invitation, so the read always says `true` (S4). */
  readonly calendar: true;
  readonly whatsapp: { readonly phone: string } | null;
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
 * The gated features of a guest page (S4). The read always says `calendar: true`, because add-to-calendar is
 * not a catalog feature; a body that says otherwise is not this contract, so it is refused instead of being
 * normalized. `whatsapp` is the stored E.164 contact or null.
 */
function parsePublicFeatures(value: unknown): PublicInvitationFeatures | undefined {
  const features = record(value);

  if (
    features === undefined ||
    typeof features.countdown !== "boolean" ||
    typeof features.map !== "boolean" ||
    features.calendar !== true
  ) {
    return undefined;
  }

  const whatsapp = features.whatsapp;

  if (whatsapp === null) {
    return { countdown: features.countdown, map: features.map, calendar: true, whatsapp: null };
  }

  const phone = record(whatsapp)?.phone;

  if (typeof phone !== "string" || !isE164Phone(phone)) {
    return undefined;
  }

  return {
    countdown: features.countdown,
    map: features.map,
    calendar: true,
    whatsapp: { phone },
  };
}

/**
 * The public invitation of a success body, or `undefined` when it breaks the documented contract. Only
 * the fields of the projection are kept: a body that grows an owner, a package, a price, a status, or an id
 * never reaches the page.
 */
export function parsePublicInvitation(value: unknown): PublicInvitation | undefined {
  const invitation = record(value);

  if (invitation === undefined) {
    return undefined;
  }

  const configuration = record(invitation.configuration);
  const content = record(invitation.content);
  const componentKey = invitation.componentKey;
  const features = parsePublicFeatures(invitation.features);

  if (
    !isInvitationSlug(invitation.slug) ||
    typeof componentKey !== "string" ||
    componentKey.length === 0 ||
    componentKey.length > MAX_COMPONENT_KEY_LENGTH ||
    configuration === undefined ||
    content === undefined ||
    features === undefined ||
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
  };
}

const NOT_FOUND: PublicInvitationResult = { ok: false, failure: "not-found" };

const readsBody = (status: number): boolean => (status >= 200 && status < 300) || status === 404;

export interface PublicInvitationsClient {
  /** `GET /public/invitations/:slug`: the guest's page, or `not-found` (A3). */
  getBySlug(slug: string): Promise<PublicInvitationResult>;
}

/**
 * A stateless client of the public read. A slug that cannot be one names nothing, so no request is made;
 * an unusually shaped slug never becomes a path segment the API could interpret differently.
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

      const invitation = parsePublicInvitation(payload);

      if (invitation === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { ok: true, value: invitation };
    },
  };
}
