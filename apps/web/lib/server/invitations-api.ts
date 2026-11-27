import { OMITTED_SECTIONS_PROPERTY, parseOmittedSections } from "../customer/omittable-sections.ts";
import { isE164Phone, isInvitationFeatureKey } from "../invitation-features/invitation-features.ts";
import {
  type GiftRegistryPayload,
  parseGiftRegistryPayload,
} from "../invitation-features/gift-registry.ts";
import { type ItineraryPayload, parseItineraryPayload } from "../invitation-features/itinerary.ts";
import { type LodgingPayload, parseLodgingPayload } from "../invitation-features/lodging.ts";
import { type RemindersPayload, parseRemindersPayload } from "../invitation-features/reminders.ts";
import {
  musicCoverUrlOf,
  musicTitleOf,
  PLAYLIST_URL_MAX_LENGTH,
} from "../invitation-features/music.ts";
import {
  isAddressFieldName,
  PLACE_QUERY_MAX_LENGTH,
  PLACE_QUERY_MIN_LENGTH,
  type PlacePoint,
  parsePlacePoints,
  parseStoredPlaces,
  type StoredPlaces,
} from "../invitation-features/place-point.ts";
import { isInvitationTimeZone } from "../invitation-features/time-zones.ts";
import {
  RSVP_COMPANIONS_MAX,
  RSVP_COMPANION_NAME_MAX_LENGTH,
  RSVP_DIETARY_NOTES_MAX_LENGTH,
  type RsvpCompanionValue,
} from "../public/rsvp-companions.ts";
import {
  ApiClientError,
  type ApiClientOptions,
  sendApiDownload,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the invitation API and of the creator catalog (M4 T5; S1, S6, S7, S8). CORS
 * allows no `PUT` and no `PATCH` from a browser (L8), so server components and server actions call these
 * routes here with the session cookie and the shared secret, like `admin-catalog-client.ts`, whose request
 * primitive this client reuses. The API authorizes every call and owns the owner of a resource (S9): this
 * client only maps its answers.
 *
 * Outcomes the pages handle come back as an `InvitationResult` value. Anything else fails closed with an
 * `ApiClientError` that never carries a response body: a 5xx, a timeout, or an unreachable API is
 * `unavailable`, an unexpected status or code is `rejected`, and a success whose body fails its validator
 * is `invalid-response`. Neither the cookie nor a body is logged or kept.
 *
 * This module deliberately has no `server-only` marker, so `node --test` can load it and prove the
 * mapping; the cookie-reading wiring that imports it lives in `app/cuenta/invitaciones/_lib/api.ts` and
 * is `server-only`.
 */

export const INVITATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** The stable REST shape of one row of "Mis invitaciones". */
export interface InvitationSummary {
  id: string;
  templateVersionId: string;
  packageId: string;
  slug: string;
  status: InvitationStatus;
  /** Set exactly while the invitation is `PUBLISHED` (M5 T1; S7, A2). */
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One invitation as its owner edits it: the stored fields, the content, and what it still lacks (S7). */
export interface OwnedInvitation extends InvitationSummary {
  content: Record<string, unknown>;
  missingRequiredFields: string[];
  /** The stored IANA zone the guest's countdown and calendar use (S4). */
  timeZone: string;
  /**
   * The stored feature data: a phone is E.164, and the playlist link is an `https` URL on an allow-listed music
   * host; each is null when the invitation has none (S4, S7).
   */
  /**
   * The stored feature data: the E.164 phone, the playlist link, and the title and cover the API stored for that link
   * (S4, S7, S2). The metadata is absent from a body written before the lookup existed and null when it stored
   * nothing, so a reader treats both as "no metadata".
   */
  featureSettings: {
    whatsappPhone: string | null;
    playlistUrl: string | null;
    playlistTitle?: string | null;
    playlistCoverUrl?: string | null;
    /**
     * The stored plan of the day as the API's validated payload `{ version: 1, items: [...] }`, or null when the
     * invitation has none (F1; L3.1). It is absent from a body written before the column existed, and a reader treats
     * that as "no itinerary" exactly like null.
     */
    itinerary?: ItineraryPayload | null;
    /**
     * The stored gift registry as the API's validated payload `{ version: 1, stores, transfer?, envelopes, note? }`, or
     * null when the invitation has none (F2; L4.1). It is absent from a body written before the field existed, and a
     * reader treats that as "no registry" exactly like null.
     */
    giftRegistry?: GiftRegistryPayload | null;
    /**
     * The stored lodging as the API's validated payload `{ version: 1, hotels, transport? }`, or null when the
     * invitation has none (F4; L7.1). It is absent from a body written before the field existed, and a reader treats
     * that as "no lodging" exactly like null.
     */
    lodging?: LodgingPayload | null;
    /**
     * The stored reminder switches as the API's validated payload `{ version: 1, pendingRsvp, eventEve }`, or null while
     * the owner switched nothing on (F6; L9.1). It is absent from a body written before the switches existed, and a
     * reader treats that as "no settings" exactly like null.
     */
    reminders?: RemindersPayload | null;
  };
  /**
   * Whether this deployment can deliver a WhatsApp reminder at all (F6; S6, L9.5). It is a capability, never a secret:
   * false is what the editor shows as «Aún no está activo». It is absent from a body written before F6, and a reader
   * treats that as false.
   */
  remindersConfigured?: boolean;
  /**
   * The gated feature keys the guest page will show, `CALENDAR` included (S4). The package's other keys are
   * never here, and a key this deployment does not implement is refused by the parser.
   */
  availableFeatures: string[];
  /**
   * Every point the owner stored, keyed by the content field it belongs to (S1, S2). The editor reads it to say
   * whether an address is still confirmed; the guest page never sees this read.
   */
  places: StoredPlaces;
}

/** The feature data a creator saves: `PUT /invitations/:id/features` (F1, F3, F6; S3, S4, S7). */
export interface InvitationFeatureInput {
  timeZone: string;
  /** The text the creator typed, or null/empty to clear it; the API normalizes it to E.164. */
  whatsappPhone: string | null;
  /** The link the creator pasted, or null/empty to clear it; the API validates and normalizes it (S7). */
  playlistUrl: string | null;
  /** The moments the owner stored, or null to clear the plan (F1; L3.1). The API validates the payload. */
  itinerary: ItineraryPayload | null;
  /**
   * The gift registry the owner stored, or null to clear it (F2; L4.1). The API validates the payload; a field the
   * editor does not change travels as the stored one, because the PUT replaces the whole feature data.
   */
  giftRegistry: GiftRegistryPayload | null;
  /**
   * The lodging the owner stored, or null to clear it (F4; L7.1, L7.3). The API validates the payload and accepts an
   * omitted value as "keep the stored one"; a field the editor does not change still travels as the stored one, because
   * the PUT replaces the whole feature data.
   */
  lodging?: LodgingPayload | null;
  /**
   * The reminder switches the owner stored, or null to clear them (F6; L9.1). The API validates the payload and accepts an
   * omitted value as "keep the stored one"; a field the editor does not change still travels as the stored pair, because
   * the PUT replaces the whole feature data.
   */
  reminders?: RemindersPayload | null;
}

// The RSVP routes of the owner (M6 G1, G3; S1, S4). The deadline is an ISO instant or null, the party limit is how
// many people one answer may name, and the read carries the settings, the responses, and the totals.

/** The creator's settings of one invitation: when answers close, and how many people one may name (S4). */
export interface RsvpSettings {
  /** The deadline as an ISO instant, or null when the invitation accepts answers until it is unpublished. */
  readonly deadline: string | null;
  readonly partyLimit: number;
}

/** The party limits the API accepts, mirrored so the creator form never offers a value it refuses (S4). */
export const RSVP_PARTY_LIMIT_MIN = 1;
export const RSVP_PARTY_LIMIT_MAX = 10;

/** One response as the owner reads it (S4); the internal dedupe key is never part of this shape. */
export interface RsvpResponseItem {
  readonly id: string;
  readonly name: string;
  readonly attending: boolean;
  readonly partySize: number;
  /** The companions of the answer, or null for an answer stored before they existed (F3; L6.1). */
  readonly companions: readonly RsvpCompanionValue[] | null;
  readonly dietaryNotes: string | null;
  readonly phone: string | null;
  readonly message: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * The totals of one invitation's answers: confirmed people, the adults and children among them, declines, and rows
 * (S1, S4, F3). The adults and the children always add up to the confirmed people.
 */
export interface RsvpTotals {
  readonly attendingPeople: number;
  readonly attendingAdults: number;
  readonly attendingChildren: number;
  readonly declinedCount: number;
  readonly responses: number;
}

/** The owner's read: settings, every response newest first, and the totals of the page (S1, S4). */
export interface RsvpRead {
  readonly settings: RsvpSettings;
  readonly responses: RsvpResponseItem[];
  readonly totals: RsvpTotals;
}

/** One guestbook entry as the owner's moderation screen reads it (F7; L10.6). */
export interface GuestbookEntry {
  readonly id: string;
  readonly authorName: string;
  readonly message: string;
  /** Whether the entry is hidden from the wall. False is published at once. */
  readonly hidden: boolean;
  readonly createdAt: string;
}

/** The owner's read of one invitation's guestbook: every entry and the counts of the two tabs (F7; L10.6). */
export interface GuestbookRead {
  readonly entries: GuestbookEntry[];
  readonly visibleCount: number;
  readonly hiddenCount: number;
}

/** The owner's CSV download: the file and the headers the API sent it with (S1, S4). */
export interface RsvpCsv {
  readonly body: string;
  readonly contentType: string;
  readonly contentDisposition: string;
}

/** One template a creator may start from, with the version the draft will be pinned to (S8). */
export interface CreatorTemplate {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: { key: string; name: string };
  publishedVersion: {
    id: string;
    version: number;
    componentKey: string;
    schema: unknown;
    /**
     * The version's stored configuration snapshot (S9). The chooser previews the template with it and
     * reads a theme from here, never from the catalog name; a snapshot a renderer refuses is that
     * renderer's answer, so this client keeps it unread rather than validating it again.
     */
    configuration: unknown;
  };
}

/** One package a creator may choose, with its price in force and the feature keys it includes (S8). */
export interface CreatorPackage {
  id: string;
  key: string;
  name: string;
  description: string | null;
  currentPrice: { amountMinor: number; currency: string } | null;
  includedFeatureKeys: string[];
}

/**
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `not-found`: 404 `INVITATION_NOT_FOUND`, or an id that is not a UUID, so nothing was sent (A4: a
 *   foreign id and an unknown id answer the same);
 * - `version-not-published`: 404 `INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED`;
 * - `package-not-found`: 404 `INVITATION_PACKAGE_NOT_FOUND`;
 * - `package-does-not-fit`: 400 `INVITATION_PACKAGE_DOES_NOT_FIT`, the chosen package lacks a renderer
 *   feature (S6, A1);
 * - `content-invalid`: 400 `INVALID_INVITATION_CONTENT`, the pinned schema refused a value (S7);
 * - `features-invalid`: 400 `INVALID_INVITATION_FEATURES`, the feature data was refused and `issues` names
 *   why (S4);
 * - `rsvp-settings-invalid`: 400 `INVALID_RSVP_SETTINGS`, the deadline or the party limit was refused and
 *   `issues` names why (M6 G3; S4);
 * - `invalid-guest`: 400 `INVALID_GUEST`, the guest's name, seats, phone, or note was refused and `issues`
 *   names why (M6 G4; S4);
 * - `place-query-invalid`: 400 `INVALID_PLACE_QUERY`, the text is not the 3 to 120 characters a search asks about
 *   (S1, S2), refused here already so a short text never costs a request;
 * - `place-search-rate-limited`: 429 `PLACE_SEARCH_RATE_LIMITED`, the owner used up the searches of the window, so
 *   the field shows a quiet note and keeps accepting text (S2);
 * - `place-invalid`: 400 `INVALID_INVITATION_PLACE`, the field is not an address field of the pinned schema or the
 *   point breaks the bounds of the columns (S2);
 * - `guest-list-unavailable`: 409 `GUEST_LIST_NOT_AVAILABLE`, the package does not grant the guest list (G4);
 * - `guest-not-found`: 404 `GUEST_NOT_FOUND`, the guest is not part of this invitation (G4);
 * - `guest-not-confirmed`: 409 `GUEST_NOT_CONFIRMED`, the guest has not confirmed, so there is no party to
 *   admit (G4);
 * - `guest-seats-below-response`: 409 `GUEST_SEATS_BELOW_RESPONSE`, the seats would not hold the party the guest
 *   already confirmed (G4);
 * - `qr-pass-unavailable`: 409 `QR_PASS_NOT_AVAILABLE`, the package does not grant the access pass (G4);
 * - `validation`: 400 without a known code, the API refused a field of the request;
 * - `not-editable`: 409 `INVITATION_NOT_EDITABLE`, the draft is archived (A3, S7);
 * - `content-conflict`: 409 `INVITATION_CONTENT_CONFLICT`, a content write named a version another writer moved (S2);
 * - `already-archived`: 409 `INVITATION_ALREADY_ARCHIVED`;
 * - `not-publishable`: 409 `INVITATION_NOT_PUBLISHABLE`, the readiness rule named the issues (S7, A1);
 * - `already-published`: 409 `INVITATION_ALREADY_PUBLISHED`, a repeated publish (A2, S7);
 * - `not-published`: 409 `INVITATION_NOT_PUBLISHED`, an unpublish of a draft (A2, S7);
 * - `payment-required`: 402 `INVITATION_PAYMENT_REQUIRED`, the publication gate refused because the invitation's
 *   package still has to be paid (M7 S1, S4); the page sends the owner to «Pagar y publicar»;
 * - `payments-disabled`: 409 `PAYMENTS_DISABLED`, the deployment runs `PAYMENTS_MODE=free` and sells nothing;
 * - `payment-not-required`: 409 `PAYMENT_NOT_REQUIRED`, the package's current price is 0;
 * - `payment-price-unavailable`: 409 `PAYMENT_PRICE_UNAVAILABLE`, the catalog cannot price the package;
 * - `payment-already-paid`: 409 `PAYMENT_ALREADY_PAID`, this invitation already has a verified payment;
 * - `payment-package-locked`: 409 `INVITATION_PACKAGE_LOCKED_BY_PAYMENT`, a paid payment belongs to another
 *   package, so the money is never reused;
 * - `payment-provider-unavailable`: 503 `PAYMENT_PROVIDER_UNAVAILABLE`, the provider could not open the checkout;
 * - `simulated-payment-disabled`: 409 `PAYMENT_SIMULATED_DISABLED`, the emit was asked of a deployment that is not
 *   running the simulated provider (M7 S4);
 * - `payment-not-found`: 404 `PAYMENT_NOT_FOUND`, the payment is missing, foreign, or not a UUID;
 * - `payment-redirect-refused`: the web's own refusal, never the API's: a checkout answered a redirect that leaves
 *   this site's origin or names another invitation, so nothing is followed (M7 T2).
 *
 * Any other status, including the 503 `INVITATION_SLUG_UNAVAILABLE` the API answers when it cannot draw a
 * storable slug, fails closed: a 5xx (or a timeout) is `unavailable`, and any other status is `rejected`.
 */
export type InvitationFailure =
  | "signed-out"
  | "not-found"
  | "version-not-published"
  | "package-not-found"
  | "package-does-not-fit"
  | "content-invalid"
  | "features-invalid"
  | "rsvp-settings-invalid"
  | "place-query-invalid"
  | "place-search-rate-limited"
  | "place-invalid"
  | "invalid-guest"
  | "guest-list-unavailable"
  | "guest-not-found"
  | "guest-not-confirmed"
  | "guestbook-entry-not-found"
  | "guest-seats-below-response"
  | "qr-pass-unavailable"
  | "validation"
  | "not-editable"
  | "content-conflict"
  | "already-archived"
  | "not-publishable"
  | "already-published"
  | "not-published"
  | "payment-required"
  | "payments-disabled"
  | "payment-not-required"
  | "payment-price-unavailable"
  | "payment-already-paid"
  | "payment-package-locked"
  | "payment-provider-unavailable"
  | "simulated-payment-disabled"
  | "payment-not-found"
  | "payment-redirect-refused";

/**
 * A refused call, plus the readiness `issues` the API returned for a publish it refused: English
 * sentences the page maps to Spanish and never shows raw (S7).
 */
export type InvitationResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: InvitationFailure; issues?: string[] };

/** A draft to create: the published version to pin and the package whose features are checked (S6). */
export interface InvitationInput {
  templateVersionId: string;
  packageId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `Invitation_slug_format` and the `VARCHAR(60)` column, as the API generates and stores a slug (S5). */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 60;

/** Whether the text is a canonical UUID: the only shape of an invitation id, so also safe in a path. */
export function isInvitationId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** An ISO-8601 instant as the API serializes it (`Date#toISOString`). */
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isInvitationStatus(value: unknown): value is InvitationStatus {
  return INVITATION_STATUSES.some((status) => status === value);
}

/**
 * Whether the text is a canonical invitation slug (S5): lower-case letters, digits, and single hyphens,
 * at most 60 characters. It is the shape the API generates, and the only text the public page puts in a
 * path.
 */
export function isInvitationSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SLUG_LENGTH && SLUG.test(value);
}

function isPrimitive(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function mapAll<T>(items: unknown, parse: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(items)) {
    return undefined;
  }

  const parsed: T[] = [];
  for (const item of items) {
    const value = parse(item);
    if (value === undefined) {
      return undefined;
    }
    parsed.push(value);
  }
  return parsed;
}

export function parseInvitationSummary(value: unknown): InvitationSummary | undefined {
  const summary = record(value);

  if (
    summary === undefined ||
    !isInvitationId(summary.id) ||
    !isInvitationId(summary.templateVersionId) ||
    !isInvitationId(summary.packageId) ||
    !isInvitationSlug(summary.slug) ||
    !isInvitationStatus(summary.status) ||
    !(summary.publishedAt === null || isTimestamp(summary.publishedAt)) ||
    !(summary.archivedAt === null || isTimestamp(summary.archivedAt)) ||
    !isTimestamp(summary.createdAt) ||
    !isTimestamp(summary.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: summary.id,
    templateVersionId: summary.templateVersionId,
    packageId: summary.packageId,
    slug: summary.slug,
    status: summary.status,
    publishedAt: summary.publishedAt,
    archivedAt: summary.archivedAt,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
  };
}

export function parseInvitationSummaries(value: unknown): InvitationSummary[] | undefined {
  return mapAll(value, parseInvitationSummary);
}

/**
 * One row of `GET /invitations` (T2; S2.6): the summary plus what the list card renders it from — the stored content,
 * the `componentKey` of the pinned version, and that version's configuration. The card shows the celebration's name,
 * its date, and a miniature of the real renderer, and falls back to the slug while one of them is missing.
 */
export interface InvitationListItem extends InvitationSummary {
  content: Record<string, unknown>;
  /** The renderer of the pinned version, or null when the catalog answers no render data for it. */
  componentKey: string | null;
  /** The version's stored configuration, kept unread: the renderer's own parser decides whether it draws. */
  configuration: unknown;
}

/**
 * One list row. The three fields a card needs are additive, so a row of a deployment that predates them still lists:
 * an absent `content` is an empty content and an absent renderer is `null`, which the card renders as the slug and no
 * miniature (S3). A field that is present but broken refuses the whole row, exactly like the summary's own fields.
 */
export function parseInvitationListItem(value: unknown): InvitationListItem | undefined {
  const summary = parseInvitationSummary(value);
  const item = record(value);

  if (summary === undefined || item === undefined) {
    return undefined;
  }

  const content = item.content === undefined ? {} : parseContent(item.content);
  const componentKey = item.componentKey ?? null;

  if (content === undefined || !(componentKey === null || isNonEmptyString(componentKey))) {
    return undefined;
  }

  return {
    ...summary,
    content,
    componentKey,
    configuration: item.configuration ?? null,
  };
}

export function parseInvitationListItems(value: unknown): InvitationListItem[] | undefined {
  return mapAll(value, parseInvitationListItem);
}

/**
 * The draft content: a plain object whose values are the primitives the pinned schema validates, plus the one list
 * the omittable-section contract stores — `omittedSections`, read strictly by its own rule (T4; S8.2). An own
 * `__proto__` key stays a plain property (`Object.fromEntries` never assigns a prototype), so a stored key can never
 * change the object the page reads, and any other non-primitive value still refuses the whole content.
 */
function parseContent(value: unknown): Record<string, unknown> | undefined {
  const content = record(value);

  if (content === undefined) {
    return undefined;
  }

  const entries = Object.entries(content);
  const primitives = entries.filter(([name]) => name !== OMITTED_SECTIONS_PROPERTY);

  if (!primitives.every(([, item]) => isPrimitive(item))) {
    return undefined;
  }

  const parsed: Record<string, unknown> = Object.fromEntries(primitives);

  // An absent list stays absent: a draft that omits nothing reads exactly as it did before the contract existed.
  if (Object.hasOwn(content, OMITTED_SECTIONS_PROPERTY)) {
    const omittedSections = parseOmittedSections(content[OMITTED_SECTIONS_PROPERTY]);

    if (omittedSections === undefined) {
      return undefined;
    }
    parsed[OMITTED_SECTIONS_PROPERTY] = omittedSections;
  }
  return parsed;
}

function parseNames(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((name) => typeof name === "string")
    ? [...value]
    : undefined;
}

/**
 * A list of allow-listed names, refused whole when any entry is not one: a value this deployment does not
 * implement never reaches a page.
 */
function parseAllowedNames(
  value: unknown,
  allowed: (item: unknown) => boolean,
): string[] | undefined {
  const names = parseNames(value);

  return names === undefined || !names.every((name) => allowed(name)) ? undefined : names;
}

/**
 * The stored feature data of a draft (S4, S7): a phone that is E.164 or null, and a playlist link that is an
 * `https` URL of bounded length or null. The API stores nothing else, so another shape means the response is not
 * the contract this client reads and the whole body is refused.
 */
function parseFeatureSettings(value: unknown): OwnedInvitation["featureSettings"] | undefined {
  const settings = record(value);

  if (settings === undefined) {
    return undefined;
  }

  const phone = settings.whatsappPhone;
  const playlist = settings.playlistUrl;

  if (!(phone === null || (typeof phone === "string" && isE164Phone(phone)))) {
    return undefined;
  }
  if (
    !(
      playlist === null ||
      (typeof playlist === "string" &&
        playlist.startsWith("https://") &&
        playlist.length <= PLAYLIST_URL_MAX_LENGTH)
    )
  ) {
    return undefined;
  }

  // The itinerary is the versioned payload or nothing: an absent value (a body written before the column existed)
  // reads as no itinerary, and a value of another shape refuses the whole body instead of reaching the editor (F1).
  const itinerary = parseItineraryPayload(settings.itinerary);

  if (itinerary === undefined) {
    return undefined;
  }

  // The gift registry is the versioned payload or nothing (F2; L4.1): an absent value reads as no registry, and any
  // other shape refuses the whole body instead of reaching the editor.
  const giftRegistry = parseGiftRegistryPayload(settings.giftRegistry);

  if (giftRegistry === undefined) {
    return undefined;
  }

  // The lodging follows the same rule (F4; L7.1): an absent value reads as no lodging, and any other shape refuses the
  // whole body instead of reaching the editor.
  const lodging = parseLodgingPayload(settings.lodging);

  if (lodging === undefined) {
    return undefined;
  }

  // The reminder switches follow the same rule (F6; L9.1): an absent value reads as no settings, and any other shape
  // refuses the whole body instead of reaching the editor.
  const reminders = parseRemindersPayload(settings.reminders);

  if (reminders === undefined) {
    return undefined;
  }

  // The stored metadata follows the same rules the guest page applies to a public body (S2): a title of at most 200
  // characters and a cover on an allow-listed image host over `https`. A value this deployment does not accept is
  // dropped to null instead of refusing the whole invitation, because the link is still the owner's playlist.
  return {
    whatsappPhone: phone,
    playlistUrl: playlist,
    playlistTitle:
      settings.playlistTitle == null ? null : (musicTitleOf(settings.playlistTitle) ?? null),
    playlistCoverUrl:
      settings.playlistCoverUrl == null
        ? null
        : (musicCoverUrlOf(settings.playlistCoverUrl) ?? null),
    itinerary,
    giftRegistry,
    lodging,
    reminders,
  };
}

/** The price in force, `null` when the package has none, or `undefined` when the value is unreadable. */
function parseCurrentPrice(value: unknown): CreatorPackage["currentPrice"] | undefined {
  if (value === null) {
    return null;
  }

  const price = record(value);

  return price === undefined ||
    typeof price.amountMinor !== "number" ||
    !Number.isSafeInteger(price.amountMinor) ||
    price.amountMinor < 0 ||
    !isNonEmptyString(price.currency)
    ? undefined
    : { amountMinor: price.amountMinor, currency: price.currency };
}

export function parseOwnedInvitation(value: unknown): OwnedInvitation | undefined {
  const summary = parseInvitationSummary(value);
  const owned = record(value);

  if (summary === undefined || owned === undefined) {
    return undefined;
  }

  const content = parseContent(owned.content);
  const missing = parseNames(owned.missingRequiredFields);
  const featureSettings = parseFeatureSettings(owned.featureSettings);
  const availableFeatures = parseAllowedNames(owned.availableFeatures, isInvitationFeatureKey);
  const places = parseStoredPlaces(owned.places);
  // A body written before F6 carries no capability at all, which reads as "not configured" (L20); an explicit value
  // is a boolean or the body is refused, so a shape nobody writes never becomes a capability.
  const remindersConfigured =
    owned.remindersConfigured === undefined ? false : owned.remindersConfigured;

  if (
    content === undefined ||
    missing === undefined ||
    featureSettings === undefined ||
    availableFeatures === undefined ||
    places === undefined ||
    typeof remindersConfigured !== "boolean" ||
    !isInvitationTimeZone(owned.timeZone)
  ) {
    return undefined;
  }

  return {
    ...summary,
    content,
    missingRequiredFields: missing,
    timeZone: owned.timeZone,
    featureSettings,
    remindersConfigured,
    availableFeatures,
    places,
  };
}

/**
 * The suggestions of one search (S1, S2): at most five points, refused whole when any entry is not one. It is the
 * same reading the stored map uses, so a suggestion and a stored point have exactly one shape in this process.
 */
export const parsePlaceSuggestions = parsePlacePoints;

export function parseCreatorTemplate(value: unknown): CreatorTemplate | undefined {
  const template = record(value);
  const category = record(template?.category);
  const version = record(template?.publishedVersion);

  if (
    template === undefined ||
    category === undefined ||
    version === undefined ||
    !isInvitationId(template.id) ||
    !isNonEmptyString(template.key) ||
    !isNonEmptyString(template.name) ||
    !(typeof template.description === "string" || template.description === null) ||
    !isNonEmptyString(category.key) ||
    !isNonEmptyString(category.name) ||
    !isInvitationId(version.id) ||
    typeof version.version !== "number" ||
    !Number.isSafeInteger(version.version) ||
    version.version < 1 ||
    !isNonEmptyString(version.componentKey)
  ) {
    return undefined;
  }

  return {
    id: template.id,
    key: template.key,
    name: template.name,
    description: template.description,
    category: { key: category.key, name: category.name },
    publishedVersion: {
      id: version.id,
      version: version.version,
      componentKey: version.componentKey,
      // The schema and the configuration stay unread here: the pages read the schema with
      // `contentFields` and the configuration through the renderer's own parser, both of which fail
      // closed (S8, S9).
      schema: version.schema,
      configuration: version.configuration,
    },
  };
}

export function parseCreatorTemplates(value: unknown): CreatorTemplate[] | undefined {
  return mapAll(value, parseCreatorTemplate);
}

export function parseCreatorPackage(value: unknown): CreatorPackage | undefined {
  const stored = record(value);
  const price = parseCurrentPrice(stored?.currentPrice);
  const featureKeys = parseNames(stored?.includedFeatureKeys);

  if (
    stored === undefined ||
    price === undefined ||
    featureKeys === undefined ||
    !isInvitationId(stored.id) ||
    !isNonEmptyString(stored.key) ||
    !isNonEmptyString(stored.name) ||
    !(typeof stored.description === "string" || stored.description === null)
  ) {
    return undefined;
  }

  return {
    id: stored.id,
    key: stored.key,
    name: stored.name,
    description: stored.description,
    currentPrice: price,
    includedFeatureKeys: featureKeys,
  };
}

export function parseCreatorPackages(value: unknown): CreatorPackage[] | undefined {
  return mapAll(value, parseCreatorPackage);
}

// The payment routes of the owner (M7 S4): the checkout, the state the panel and the return page render, and the
// development-only emit. Nothing here carries a provider payload, a signature, a secret, or an amount the API did
// not read from its own stored payment.

/** The payment states the API stores; the web renders each one and decides nothing about it (S4). */
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "expired", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** The widest provider or simulated redirect this client keeps; longer text is not a URL it follows (T2). */
const MAX_REDIRECT_URL_LENGTH = 2048;

/** `POST /invitations/:id/checkout`: the payment, the redirect, and the snapshot the owner will pay (S4). */
export interface Checkout {
  readonly paymentId: string;
  /** The provider's page; the caller allow-lists it before following it, never here (T2, S4). */
  readonly redirectUrl: string;
  readonly amountMinor: number;
  readonly currency: string;
}

/** `GET /invitations/:id/payment`: every fact the panel and the return page render (S4). */
export interface InvitationPayment {
  /** Whether the publication gate still asks for a payment; when false the panel is not rendered. */
  readonly paymentRequired: boolean;
  readonly status: PaymentStatus | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly paidAt: string | null;
}

/** `POST /payments/simulated/:paymentId/emit`: `processed`, or `duplicate` for the same event twice (S4). */
export interface PaymentEmit {
  readonly outcome: "processed" | "duplicate";
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return PAYMENT_STATUSES.some((status) => status === value);
}

/** An optional amount: a non-negative whole number of minor units, or null when the API has none (S4). */
function isOptionalAmount(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

/**
 * The checkout answer, refused whole when it is not the documented shape. The redirect is kept as text and its
 * origin, protocol, path, query, and fragment are checked by `checkoutRedirectPath` before it is ever followed
 * (T2): this parser only refuses a value that could not be a URL at all.
 */
export function parseCheckout(value: unknown): Checkout | undefined {
  const checkout = record(value);

  if (checkout === undefined) {
    return undefined;
  }

  const { paymentId, redirectUrl, amountMinor, currency } = checkout;

  if (
    !isInvitationId(paymentId) ||
    !isNonEmptyString(redirectUrl) ||
    redirectUrl.length > MAX_REDIRECT_URL_LENGTH ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    !isNonEmptyString(currency)
  ) {
    return undefined;
  }

  return { paymentId, redirectUrl, amountMinor, currency };
}

/** The owner's payment read, refused whole when any field is outside the contract (S4). */
export function parseInvitationPayment(value: unknown): InvitationPayment | undefined {
  const payment = record(value);

  if (payment === undefined) {
    return undefined;
  }

  const { paymentRequired, status, amountMinor, currency, paidAt } = payment;

  if (
    typeof paymentRequired !== "boolean" ||
    !(status === null || isPaymentStatus(status)) ||
    !isOptionalAmount(amountMinor) ||
    !(currency === null || isNonEmptyString(currency)) ||
    !(paidAt === null || isTimestamp(paidAt))
  ) {
    return undefined;
  }

  return { paymentRequired, status, amountMinor, currency, paidAt };
}

/** The emit's answer: `processed` or `duplicate`, and nothing else (S4). */
export function parsePaymentEmit(value: unknown): PaymentEmit | undefined {
  const outcome = record(value)?.outcome;

  return outcome === "processed" || outcome === "duplicate" ? { outcome } : undefined;
}

/** Whether a value is a party limit the API accepts: an integer from 1 to 10 (S4). */
function isPartyLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RSVP_PARTY_LIMIT_MIN &&
    value <= RSVP_PARTY_LIMIT_MAX
  );
}

/** A non-negative whole count, as a total or a party size is: `undefined` for anything else. */
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * The creator's RSVP settings (M6 G3; S4): a deadline that is an ISO instant or null, and a party limit from 1 to
 * 10. A body that says anything else is not this contract, so it is refused whole instead of being normalized.
 */
export function parseRsvpSettings(value: unknown): RsvpSettings | undefined {
  const settings = record(value);

  if (settings === undefined) {
    return undefined;
  }

  const deadline = settings.deadline;
  const partyLimit = settings.partyLimit;

  if (!(deadline === null || isTimestamp(deadline)) || !isPartyLimit(partyLimit)) {
    return undefined;
  }

  return { deadline, partyLimit };
}

/**
 * One response of the owner's read (M6 G3; S4). Only the fields the page renders are kept, so an extra key such as
 * the internal dedupe key never reaches a page even if a deployment sent one.
 */
export function parseRsvpResponseItem(value: unknown): RsvpResponseItem | undefined {
  const item = record(value);

  if (item === undefined) {
    return undefined;
  }

  const { id, name, attending, partySize, phone, message, createdAt, updatedAt } = item;
  const companions = parseStoredCompanions(item.companions);
  const dietaryNotes = parseStoredDietaryNotes(item.dietaryNotes);

  if (
    !isInvitationId(id) ||
    !isNonEmptyString(name) ||
    typeof attending !== "boolean" ||
    !isCount(partySize) ||
    partySize > RSVP_PARTY_LIMIT_MAX ||
    companions === undefined ||
    dietaryNotes === undefined ||
    !(phone === null || typeof phone === "string") ||
    !(message === null || typeof message === "string") ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    return undefined;
  }

  return {
    id,
    name,
    attending,
    partySize,
    companions,
    dietaryNotes,
    phone,
    message,
    createdAt,
    updatedAt,
  };
}

/**
 * The companions of a stored answer (F3; L6.1), mirrored from the API's own bounds: a list of `{ name, child }`, or
 * null. An absent field is an API written before F3 and reads as null, so both generations of the body parse during a
 * rolling deploy; a shape the API could not have stored refuses the whole response instead.
 */
function parseStoredCompanions(value: unknown): readonly RsvpCompanionValue[] | null | undefined {
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

/** The dietary notes of a stored answer (F3; L6.1): a bounded text, null, or absent for an older API. */
function parseStoredDietaryNotes(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string" || [...value].length > RSVP_DIETARY_NOTES_MAX_LENGTH) {
    return undefined;
  }
  return value;
}

/** The totals of one invitation's answers, or undefined when a count is not one (S1, S4). */
function parseRsvpTotals(value: unknown): RsvpTotals | undefined {
  const totals = record(value);

  if (totals === undefined) {
    return undefined;
  }

  const { attendingPeople, declinedCount, responses } = totals;

  if (!isCount(attendingPeople) || !isCount(declinedCount) || !isCount(responses)) {
    return undefined;
  }

  // An API written before F3 names no adults or children: the whole party counts as adults then, which is what those
  // answers mean, so a page deployed before the field still renders sane totals (L6.4).
  const attendingChildren = totals.attendingChildren ?? 0;
  const attendingAdults = totals.attendingAdults ?? attendingPeople;

  if (!isCount(attendingAdults) || !isCount(attendingChildren)) {
    return undefined;
  }

  return { attendingPeople, attendingAdults, attendingChildren, declinedCount, responses };
}

/** The owner's whole read: the settings, every response newest first, and the totals (M6 G3; S1, S4). */
export function parseRsvpRead(value: unknown): RsvpRead | undefined {
  const read = record(value);

  if (read === undefined) {
    return undefined;
  }

  const settings = parseRsvpSettings(read.settings);
  const responses = mapAll(read.responses, parseRsvpResponseItem);
  const totals = parseRsvpTotals(read.totals);

  if (settings === undefined || responses === undefined || totals === undefined) {
    return undefined;
  }

  return { settings, responses, totals };
}

// The guestbook routes of the owner (F7; L10.6). The read is every entry with its state and the two counts; the write
// answers the entry it changed. A guest's signature and message are plain text the page renders as text, and the entry
// id is an opaque row id the screen only echoes back, never a value the owner types.

/** The widest signature and message the API stores, mirrored so a body that says more is refused whole (F7; L10.1). */
const GUESTBOOK_AUTHOR_NAME_MAX_LENGTH = 60;
const GUESTBOOK_MESSAGE_MAX_LENGTH = 500;

/** One stored entry, or undefined when a field breaks the documented contract. */
export function parseGuestbookEntry(value: unknown): GuestbookEntry | undefined {
  const entry = record(value);

  if (entry === undefined) {
    return undefined;
  }

  const { id, authorName, message, hidden, createdAt } = entry;
  const nameWidth = typeof authorName === "string" ? [...authorName].length : 0;
  const messageWidth = typeof message === "string" ? [...message].length : 0;

  if (
    !isInvitationId(id) ||
    typeof authorName !== "string" ||
    nameWidth < 1 ||
    nameWidth > GUESTBOOK_AUTHOR_NAME_MAX_LENGTH ||
    typeof message !== "string" ||
    messageWidth < 1 ||
    messageWidth > GUESTBOOK_MESSAGE_MAX_LENGTH ||
    typeof hidden !== "boolean" ||
    !isTimestamp(createdAt)
  ) {
    return undefined;
  }

  return { id, authorName, message, hidden, createdAt };
}

/** A whole count of the guestbook read, never negative. */
function isGuestbookCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** The owner's read of the guestbook, or undefined when the body breaks the contract (F7; L10.6). */
export function parseGuestbookRead(value: unknown): GuestbookRead | undefined {
  const read = record(value);

  if (read === undefined) {
    return undefined;
  }

  const entries = mapAll(read.entries, parseGuestbookEntry);
  const { visibleCount, hiddenCount } = read;

  if (entries === undefined || !isGuestbookCount(visibleCount) || !isGuestbookCount(hiddenCount)) {
    return undefined;
  }
  // The counts the screen's tabs show are the entries themselves, so a body that disagrees is not this contract.
  const hidden = entries.filter((entry) => entry.hidden).length;
  if (visibleCount !== entries.length - hidden || hiddenCount !== hidden) {
    return undefined;
  }

  return { entries, visibleCount, hiddenCount };
}

// The guest-list routes of the owner (M6 G4; S1, S4). The list is the guests with the answer each one gave and
// their check-in state, never a personal token or a digest; a creation and a rotation answer the plain personal
// token exactly once, so only the server action that redirects reads it, and the check-in answers the guest, the
// seats, the confirmed party, and the first check-in instant. A token is 128 bits as 22 base64url characters, the
// only shape the API mints, so a value that cannot have been minted names no guest and no request is sent.

/** The widest guest name, in characters: the API's own bound on `Guest.name`. */
export const GUEST_NAME_MAX_LENGTH = 80;
/** The seats one guest may be given, mirrored so no page offers what the API refuses (S4). */
export const GUEST_SEATS_MIN = 1;
export const GUEST_SEATS_MAX = 10;
/** The widest guest note, in characters: the API's own bound on `Guest.note`. */
export const GUEST_NOTE_MAX_LENGTH = 200;
/** The widest table label, in characters: the API's own bound on `Guest.tableLabel` (F5; L8.1). */
export const GUEST_TABLE_LABEL_MAX_LENGTH = 12;
/** The exact width of a personal guest token: 128 bits, base64url-encoded without padding. */
export const GUEST_TOKEN_LENGTH = 22;

const GUEST_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Whether the text is one personal guest token (S4): exactly 22 base64url characters. Compared whole and never
 * trimmed, because a token with whitespace cannot have been minted and must name nothing.
 */
export function isGuestToken(value: unknown): value is string {
  return typeof value === "string" && GUEST_TOKEN.test(value);
}

/** One guest's answer, as the creator's list renders it (S4); the internal dedupe key is never part of it. */
export interface GuestResponseSummary {
  readonly attending: boolean;
  /** The people who come: 1 to the guest's seats when attending, 0 when not. */
  readonly partySize: number;
  /** The companions of the answer, or null for an answer stored before they existed (F3; L6.1). */
  readonly companions: readonly RsvpCompanionValue[] | null;
  readonly dietaryNotes: string | null;
  readonly message: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One guest of the creator's list: the stored fields, the answer, and the check-in state, never the token. */
export interface GuestItem {
  readonly id: string;
  readonly name: string;
  readonly seats: number;
  readonly phone: string | null;
  readonly note: string | null;
  /**
   * The table the owner assigned, or null when there is none (F5; L8.1). An API written before the column existed
   * answers no field, which reads as null, so a rolling deploy keeps this page working (L20).
   */
  readonly tableLabel: string | null;
  readonly tokenIssuedAt: string;
  readonly checkedInAt: string | null;
  readonly response: GuestResponseSummary | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The totals of one guest list (S1, S4), as the creator's page shows them. */
export interface GuestTotals {
  readonly guests: number;
  readonly seats: number;
  readonly attendingGuests: number;
  readonly attendingPeople: number;
  readonly attendingAdults: number;
  readonly attendingChildren: number;
  readonly declinedCount: number;
  readonly pendingCount: number;
  readonly checkedInCount: number;
}

/** The creator's guest list: the guests and the totals of the page (S1, S4). */
export interface GuestList {
  readonly guests: GuestItem[];
  readonly totals: GuestTotals;
}

/** The answer of a creation or a rotation: the guest plus the plain token, which is shown once (S4). */
export interface GuestWithToken {
  readonly guest: GuestItem;
  readonly token: string;
}

/** The answer of one check-in (S4): the guest, the seats, the confirmed party, and the first instant. */
export interface GuestCheckIn {
  readonly guestId: string;
  readonly name: string;
  readonly seats: number;
  readonly attendingPartySize: number;
  readonly checkedInAt: string;
}

/**
 * One guest as the creator's form sends it; `PUT` replaces every field, so a blank phone or note clears it. The table
 * is the one field a request may omit: an omitted one keeps the stored table, which is what a form rendered before the
 * column existed posts (F5; L8.3, L20).
 */
export interface GuestInput {
  readonly name: string;
  readonly seats: number;
  readonly phone?: string | null;
  readonly note?: string | null;
  readonly tableLabel?: string | null;
}

/** A whole count, as a total is: `undefined` for anything else. */
function isWholeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A guest's name: the API's own width, in characters, and never empty. */
function isGuestName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    [...value].length <= GUEST_NAME_MAX_LENGTH
  );
}

/** An optional stored text: a string, or null when the creator left it empty. */
function isOptionalText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * The table of one guest (F5; L8.1): a trimmed text of 1 to 12 characters, null when none is assigned, or null for an
 * API written before the column existed (L20). Any other shape refuses the whole guest instead of showing it.
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

/** The seats of one guest: an integer from 1 to 10 (S4). */
function isSeats(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= GUEST_SEATS_MIN &&
    value <= GUEST_SEATS_MAX
  );
}

/**
 * One guest's answer, refused whole when it names a party the seats could not hold: a confirmed answer names at
 * least one person, a decline names none, and neither may exceed the guest's seats. `seats` is the guest's own
 * count, so the answer and the seat count are read together.
 */
function parseGuestResponseSummary(
  value: unknown,
  seats: number,
): GuestResponseSummary | undefined {
  const summary = record(value);

  if (summary === undefined) {
    return undefined;
  }

  const { attending, partySize, message, createdAt, updatedAt } = summary;
  const companions = parseStoredCompanions(summary.companions);
  const dietaryNotes = parseStoredDietaryNotes(summary.dietaryNotes);

  if (
    typeof attending !== "boolean" ||
    !isWholeCount(partySize) ||
    partySize > seats ||
    (attending && partySize < 1) ||
    (!attending && partySize !== 0) ||
    companions === undefined ||
    dietaryNotes === undefined ||
    !isOptionalText(message) ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    return undefined;
  }

  return { attending, partySize, companions, dietaryNotes, message, createdAt, updatedAt };
}

/** One guest of the creator's list, or undefined when the body is not the documented shape (S4). */
export function parseGuestItem(value: unknown): GuestItem | undefined {
  const guest = record(value);

  if (guest === undefined) {
    return undefined;
  }

  const {
    id,
    name,
    seats,
    phone,
    note,
    tableLabel,
    tokenIssuedAt,
    checkedInAt,
    createdAt,
    updatedAt,
  } = guest;
  const storedTableLabel = parseStoredTableLabel(tableLabel);

  if (
    !isInvitationId(id) ||
    !isGuestName(name) ||
    !isSeats(seats) ||
    !isOptionalText(phone) ||
    !isOptionalText(note) ||
    storedTableLabel === undefined ||
    !isTimestamp(tokenIssuedAt) ||
    !(checkedInAt === null || isTimestamp(checkedInAt)) ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    return undefined;
  }

  const response =
    guest.response === null ? null : parseGuestResponseSummary(guest.response, seats);

  if (response === undefined) {
    return undefined;
  }

  return {
    id,
    name,
    seats,
    phone,
    note,
    tableLabel: storedTableLabel,
    tokenIssuedAt,
    checkedInAt,
    response,
    createdAt,
    updatedAt,
  };
}

/** The seven totals of one list, or undefined when a count is not one (S1, S4). */
function parseGuestTotals(value: unknown): GuestTotals | undefined {
  const totals = record(value);

  if (totals === undefined) {
    return undefined;
  }

  const {
    guests,
    seats,
    attendingGuests,
    attendingPeople,
    declinedCount,
    pendingCount,
    checkedInCount,
  } = totals;

  // An API written before F3 names no adults or children: the whole party counts as adults then (L6.4).
  const attendingChildren = totals.attendingChildren ?? 0;
  const attendingAdults = totals.attendingAdults ?? attendingPeople;

  if (
    !isWholeCount(guests) ||
    !isWholeCount(seats) ||
    !isWholeCount(attendingGuests) ||
    !isWholeCount(attendingPeople) ||
    !isWholeCount(attendingAdults) ||
    !isWholeCount(attendingChildren) ||
    !isWholeCount(declinedCount) ||
    !isWholeCount(pendingCount) ||
    !isWholeCount(checkedInCount)
  ) {
    return undefined;
  }

  return {
    guests,
    seats,
    attendingGuests,
    attendingPeople,
    attendingAdults,
    attendingChildren,
    declinedCount,
    pendingCount,
    checkedInCount,
  };
}

/** The creator's whole list: every guest and the totals of the page (S4). */
export function parseGuestList(value: unknown): GuestList | undefined {
  const list = record(value);

  if (list === undefined) {
    return undefined;
  }

  const guests = mapAll(list.guests, parseGuestItem);
  const totals = parseGuestTotals(list.totals);

  return guests === undefined || totals === undefined ? undefined : { guests, totals };
}

/** A creation or a rotation: the guest and the plain token, which the API answers exactly once (S4). */
export function parseGuestWithToken(value: unknown): GuestWithToken | undefined {
  const stored = record(value);

  if (stored === undefined) {
    return undefined;
  }

  const guest = parseGuestItem(stored.guest);

  return guest === undefined || !isGuestToken(stored.token)
    ? undefined
    : { guest, token: stored.token };
}

/** The answer of a removal (S4): nothing about the guest that was removed is echoed back. */
export function parseDeletedGuest(value: unknown): { status: "deleted" } | undefined {
  return record(value)?.status === "deleted" ? { status: "deleted" } : undefined;
}

/** The answer of one check-in (S4). */
export function parseGuestCheckIn(value: unknown): GuestCheckIn | undefined {
  const stored = record(value);

  if (stored === undefined) {
    return undefined;
  }

  const { guestId, name, seats, attendingPartySize, checkedInAt } = stored;

  if (
    !isInvitationId(guestId) ||
    !isGuestName(name) ||
    !isSeats(seats) ||
    !isWholeCount(attendingPartySize) ||
    attendingPartySize < 1 ||
    attendingPartySize > seats ||
    !isTimestamp(checkedInAt)
  ) {
    return undefined;
  }

  return { guestId, name, seats, attendingPartySize, checkedInAt };
}

const CODE_FAILURES: Record<string, InvitationFailure> = {
  INVITATION_NOT_FOUND: "not-found",
  PAYMENTS_DISABLED: "payments-disabled",
  PAYMENT_NOT_REQUIRED: "payment-not-required",
  PAYMENT_PRICE_UNAVAILABLE: "payment-price-unavailable",
  PAYMENT_ALREADY_PAID: "payment-already-paid",
  INVITATION_PACKAGE_LOCKED_BY_PAYMENT: "payment-package-locked",
  PAYMENT_PROVIDER_UNAVAILABLE: "payment-provider-unavailable",
  PAYMENT_SIMULATED_DISABLED: "simulated-payment-disabled",
  PAYMENT_NOT_FOUND: "payment-not-found",
  INVALID_GUEST: "invalid-guest",
  GUEST_LIST_NOT_AVAILABLE: "guest-list-unavailable",
  GUEST_NOT_FOUND: "guest-not-found",
  GUEST_NOT_CONFIRMED: "guest-not-confirmed",
  GUESTBOOK_ENTRY_NOT_FOUND: "guestbook-entry-not-found",
  GUEST_SEATS_BELOW_RESPONSE: "guest-seats-below-response",
  QR_PASS_NOT_AVAILABLE: "qr-pass-unavailable",
  INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED: "version-not-published",
  INVITATION_PACKAGE_NOT_FOUND: "package-not-found",
  INVITATION_PACKAGE_DOES_NOT_FIT: "package-does-not-fit",
  INVALID_INVITATION_CONTENT: "content-invalid",
  INVALID_INVITATION_FEATURES: "features-invalid",
  INVALID_RSVP_SETTINGS: "rsvp-settings-invalid",
  INVALID_PLACE_QUERY: "place-query-invalid",
  PLACE_SEARCH_RATE_LIMITED: "place-search-rate-limited",
  INVALID_INVITATION_PLACE: "place-invalid",
  INVITATION_NOT_EDITABLE: "not-editable",
  INVITATION_CONTENT_CONFLICT: "content-conflict",
  INVITATION_ALREADY_ARCHIVED: "already-archived",
  INVITATION_NOT_PUBLISHABLE: "not-publishable",
  INVITATION_ALREADY_PUBLISHED: "already-published",
  INVITATION_NOT_PUBLISHED: "not-published",
  INVITATION_PAYMENT_REQUIRED: "payment-required",
};

const SIGNED_OUT: InvitationResult<never> = { ok: false, failure: "signed-out" };
const NOT_FOUND: InvitationResult<never> = { ok: false, failure: "not-found" };
/** The answer a payment route gives without a request: a payment id that is not a UUID names no payment. */
const PAYMENT_NOT_FOUND_RESULT: InvitationResult<never> = {
  ok: false,
  failure: "payment-not-found",
};
/** The answer a search gives without a request: a text the API would refuse anyway, so it costs nothing (S2). */
const PLACE_QUERY_REFUSED: InvitationResult<never> = {
  ok: false,
  failure: "place-query-invalid",
};
/** The answer a guest route gives without a request: an id or a token that names no guest of this invitation. */
const GUEST_NOT_FOUND_RESULT: InvitationResult<never> = { ok: false, failure: "guest-not-found" };

/** The most readiness issues one refusal is read with, so a hostile body cannot grow the list. */
const MAX_ISSUES = 20;
/** The most characters one readiness issue is read with. */
const MAX_ISSUE_LENGTH = 200;

/** The readiness issue strings of a refusal body, or nothing when the list is not a list of strings. */
function issuesOf(body: unknown): string[] | undefined {
  const issues = record(body)?.issues;

  if (!Array.isArray(issues) || issues.length > MAX_ISSUES) {
    return undefined;
  }

  const texts: string[] = [];
  for (const issue of issues) {
    if (typeof issue !== "string" || issue.length === 0 || issue.length > MAX_ISSUE_LENGTH) {
      return undefined;
    }
    texts.push(issue);
  }
  return texts;
}

/**
 * The refusal of a failure body: only a `code` from the fixed set is read, never the message. The body
 * of a 409 `INVITATION_NOT_PUBLISHABLE` also carries the readiness `issues` the page maps to Spanish, and
 * the body of a 400 `INVALID_INVITATION_FEATURES` carries the feature issues it does the same way.
 */
function refusalOf(text: string | undefined): InvitationResult<never> | undefined {
  let body: unknown;
  try {
    body = JSON.parse(text ?? "");
  } catch {
    return undefined;
  }

  const code = record(body)?.code;
  const failure =
    typeof code === "string" && Object.hasOwn(CODE_FAILURES, code)
      ? CODE_FAILURES[code]
      : undefined;

  if (failure === undefined) {
    return undefined;
  }

  const issues =
    failure === "not-publishable" ||
    failure === "features-invalid" ||
    failure === "rsvp-settings-invalid" ||
    failure === "invalid-guest"
      ? issuesOf(body)
      : undefined;
  return { ok: false, failure, ...(issues === undefined ? {} : { issues }) };
}

/**
 * The statuses whose body this client reads. A 503 is read only so a documented provider refusal keeps its own
 * failure instead of becoming a generic outage; every other 5xx stays unread, so a failure body never reaches this
 * process's memory (M7 S4).
 */
const readsBody = (status: number): boolean =>
  (status >= 200 && status <= 299) ||
  status === 400 ||
  status === 402 ||
  status === 404 ||
  status === 409 ||
  status === 429 ||
  status === 503;

/** The statuses whose fixed code this client maps; anything else keeps its own default outcome. */
const REFUSAL_STATUSES: readonly number[] = [400, 402, 404, 409, 429, 503];

/** The content type and the attachment filename the RSVP CSV route answers with (M6 G3; S4). */
const RSVP_CSV_CONTENT_TYPE = "text/csv";
const RSVP_CSV_DISPOSITION = /^attachment; filename="[A-Za-z0-9._-]{1,80}"$/;

const INVITATIONS = "/invitations";
const PAYMENTS = "/payments";

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps
 * nothing between calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createInvitationsClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  async function call<T>(
    method: "DELETE" | "GET" | "POST" | "PUT",
    path: string,
    body: unknown,
    parse: (value: unknown) => T | undefined,
  ): Promise<InvitationResult<T>> {
    const cookie = sessionCookieHeader(await readCookieHeader());

    if (cookie === undefined) {
      return SIGNED_OUT;
    }

    const { status, text } = await sendApiRequest(
      options,
      { cookie, method, path, ...(body === undefined ? {} : { body }) },
      readsBody,
    );

    if (status >= 200 && status < 300) {
      let payload: unknown;
      try {
        payload = JSON.parse(text ?? "");
      } catch {
        payload = undefined;
      }

      const value = parse(payload);
      if (value === undefined) {
        throw new ApiClientError("invalid-response", status);
      }
      return { ok: true, value };
    }

    if (status === 401) {
      return SIGNED_OUT;
    }

    const failure = refusalOf(text);

    if (failure !== undefined && REFUSAL_STATUSES.includes(status)) {
      return failure;
    }
    if (status === 404) {
      return NOT_FOUND;
    }
    if (status === 400) {
      return { ok: false, failure: "validation" };
    }

    throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
  }

  /** The path of one draft; an id that is not a UUID names nothing, so no request is made. */
  function draftPath(id: string, suffix = ""): string | undefined {
    return isInvitationId(id) ? `${INVITATIONS}/${id}${suffix}` : undefined;
  }

  /**
   * The path of one address field's point (S1, S2), or undefined when the field is not an address field name: the
   * API derives the same rule from the pinned schema, so this client refuses a name no schema could declare instead
   * of letting it become a path segment.
   */
  function placePath(id: string, field: string): string | undefined {
    return isAddressFieldName(field)
      ? draftPath(id, `/places/${encodeURIComponent(field)}`)
      : undefined;
  }

  async function onDraft<T>(
    id: string,
    suffix: string,
    send: (path: string) => Promise<InvitationResult<T>>,
  ): Promise<InvitationResult<T>> {
    const path = draftPath(id, suffix);
    return path === undefined ? NOT_FOUND : send(path);
  }

  /**
   * The path of one guest route (M6 G4; S4), or undefined when the invitation id or the guest id is not a UUID: an
   * id that is not one names nothing, so no request is made and the guest never becomes a path segment the API
   * could read differently.
   */
  function guestPath(id: string, guestId?: string, suffix = ""): string | undefined {
    if (!isInvitationId(id)) {
      return undefined;
    }
    if (guestId === undefined) {
      return `${INVITATIONS}/${id}/guests${suffix}`;
    }
    return isInvitationId(guestId) ? `${INVITATIONS}/${id}/guests/${guestId}${suffix}` : undefined;
  }

  /** The path of one guestbook entry of one invitation, or undefined when either id cannot be one (F7; L10.6). */
  function guestbookEntryPath(id: string, entryId: string): string | undefined {
    return isInvitationId(id) && isInvitationId(entryId)
      ? `${INVITATIONS}/${id}/guestbook/${entryId}`
      : undefined;
  }

  async function onGuest<T>(
    id: string,
    guestId: string,
    suffix: string,
    send: (path: string) => Promise<InvitationResult<T>>,
  ): Promise<InvitationResult<T>> {
    const path = guestPath(id, guestId, suffix);
    return path === undefined ? GUEST_NOT_FOUND_RESULT : send(path);
  }

  return {
    /**
     * `GET /invitations`: the session user's invitations, newest first, each with the content and the pinned
     * version's renderer its card draws (S1; T2, S2.6).
     */
    list: (): Promise<InvitationResult<InvitationListItem[]>> =>
      call("GET", INVITATIONS, undefined, parseInvitationListItems),
    /** `GET /invitations/:id`: one own draft with its content and missing fields (S7). */
    get: (id: string): Promise<InvitationResult<OwnedInvitation>> =>
      onDraft(id, "", (path) => call("GET", path, undefined, parseOwnedInvitation)),
    /**
     * `GET /invitations/:id/places/search?q=`: at most five points the text matches (S1, S2). Called from a server
     * action while the owner types, so the browser never reaches the geocoder directly. A text shorter than three
     * characters, or longer than an address, is refused here and sends no request.
     */
    searchPlaces: (id: string, query: string): Promise<InvitationResult<PlacePoint[]>> => {
      const text = query.trim();
      const length = [...text].length;

      return length < PLACE_QUERY_MIN_LENGTH || length > PLACE_QUERY_MAX_LENGTH
        ? Promise.resolve(PLACE_QUERY_REFUSED)
        : onDraft(id, `/places/search?q=${encodeURIComponent(text)}`, (path) =>
            call("GET", path, undefined, parsePlaceSuggestions),
          );
    },
    /**
     * `PUT /invitations/:id/places/:field`: stores the point the owner chose for one address field and answers the
     * invitation with its stored points (S1, S2). Called from a server action; `PUT` because the whole point is
     * replaced.
     */
    savePlace: (
      id: string,
      field: string,
      point: PlacePoint,
    ): Promise<InvitationResult<OwnedInvitation>> => {
      const path = placePath(id, field);

      return path === undefined
        ? Promise.resolve(NOT_FOUND)
        : call("PUT", path, point, parseOwnedInvitation);
    },
    /**
     * `DELETE /invitations/:id/places/:field`: clears the point of one address field and keeps the words the owner
     * typed (S1, S2). The same field rule and the same 404 as the write.
     */
    clearPlace: (id: string, field: string): Promise<InvitationResult<OwnedInvitation>> => {
      const path = placePath(id, field);

      return path === undefined
        ? Promise.resolve(NOT_FOUND)
        : call("DELETE", path, undefined, parseOwnedInvitation);
    },
    /** `POST /invitations`: a free draft pinned to a PUBLISHED version (S1, S6). */
    create: (input: InvitationInput): Promise<InvitationResult<OwnedInvitation>> =>
      call(
        "POST",
        INVITATIONS,
        { templateVersionId: input.templateVersionId, packageId: input.packageId },
        parseOwnedInvitation,
      ),
    /** `PUT /invitations/:id/content`: replaces the whole content; called from a server action (L8). */
    replaceContent: (
      id: string,
      content: Record<string, unknown>,
      expectedUpdatedAt?: string,
    ): Promise<InvitationResult<OwnedInvitation>> =>
      onDraft(id, "/content", (path) =>
        call(
          "PUT",
          path,
          expectedUpdatedAt === undefined ? { content } : { content, expectedUpdatedAt },
          parseOwnedInvitation,
        ),
      ),
    /**
     * `PUT /invitations/:id/features`: the invitation's time zone, WhatsApp contact, and playlist link; called
     * from a server action (F3, F6; S3, S4, S7). Every field is always sent, because the API replaces all three.
     */
    updateInvitationFeatures: (
      id: string,
      features: InvitationFeatureInput,
    ): Promise<InvitationResult<OwnedInvitation>> =>
      onDraft(id, "/features", (path) => call("PUT", path, features, parseOwnedInvitation)),
    /** `POST /invitations/:id/archive`: the draft becomes read-only and stays stored (S7, A3). */
    archive: (id: string): Promise<InvitationResult<InvitationSummary>> =>
      onDraft(id, "/archive", (path) => call("POST", path, undefined, parseInvitationSummary)),
    /** `POST /invitations/:id/publish`: the draft becomes visible at `/i/:slug` (M5 T4; S7, S9). */
    publish: (id: string): Promise<InvitationResult<OwnedInvitation>> =>
      onDraft(id, "/publish", (path) => call("POST", path, undefined, parseOwnedInvitation)),
    /** `POST /invitations/:id/unpublish`: back to draft, and the public URL stops answering (S7). */
    unpublish: (id: string): Promise<InvitationResult<InvitationSummary>> =>
      onDraft(id, "/unpublish", (path) => call("POST", path, undefined, parseInvitationSummary)),
    /** `GET /catalog/templates`: the PUBLISHED templates with their published version (S8). */
    templates: (): Promise<InvitationResult<CreatorTemplate[]>> =>
      call("GET", "/catalog/templates", undefined, parseCreatorTemplates),
    /** `GET /catalog/packages`: the ACTIVE packages with price and feature keys (S8). */
    packages: (): Promise<InvitationResult<CreatorPackage[]>> =>
      call("GET", "/catalog/packages", undefined, parseCreatorPackages),
    /**
     * `POST /invitations/:id/checkout`: creates or resumes the one pending payment of the invitation's package and
     * answers the provider's redirect with the amount the owner will pay (M7 S4). The redirect is allow-listed by
     * the caller before it is followed; this client only refuses a value that is not the documented shape.
     */
    checkout: (id: string): Promise<InvitationResult<Checkout>> =>
      onDraft(id, "/checkout", (path) => call("POST", path, undefined, parseCheckout)),
    /**
     * `GET /invitations/:id/payment`: whether the gate still asks for a payment, its state, its snapshot, and when it
     * was paid (M7 S4). The panel and the return page render this answer and never a query parameter.
     */
    payment: (id: string): Promise<InvitationResult<InvitationPayment>> =>
      onDraft(id, "/payment", (path) => call("GET", path, undefined, parseInvitationPayment)),
    /**
     * `POST /payments/simulated/:paymentId/emit`: the development-only shortcut that signs an event and posts it
     * through the same verified intake (M7 S4). The owner comes from the session, so a foreign or unknown payment is
     * the same 404, and an id that is not a UUID names nothing and sends no request.
     */
    emitSimulatedPayment: (
      paymentId: string,
      outcome: "paid" | "failed",
    ): Promise<InvitationResult<PaymentEmit>> =>
      isInvitationId(paymentId)
        ? call("POST", `${PAYMENTS}/simulated/${paymentId}/emit`, { outcome }, parsePaymentEmit)
        : Promise.resolve(PAYMENT_NOT_FOUND_RESULT),
    /** `GET /invitations/:id/rsvp`: the settings, every response, and the totals (M6 G3; S1, S4). */
    readRsvp: (id: string): Promise<InvitationResult<RsvpRead>> =>
      onDraft(id, "/rsvp", (path) => call("GET", path, undefined, parseRsvpRead)),
    /**
     * `PUT /invitations/:id/rsvp-settings`: the deadline and the party limit as one pair; `null` clears the
     * deadline. Called from a server action, because a browser cannot send `PUT` (L8; S4).
     */
    updateRsvpSettings: (
      id: string,
      settings: RsvpSettings,
    ): Promise<InvitationResult<RsvpSettings>> =>
      onDraft(id, "/rsvp-settings", (path) => call("PUT", path, settings, parseRsvpSettings)),
    /** `GET /invitations/:id/guestbook`: every entry with its state and the two counts (F7; L10.6). */
    guestbook: (id: string): Promise<InvitationResult<GuestbookRead>> =>
      onDraft(id, "/guestbook", (path) => call("GET", path, undefined, parseGuestbookRead)),
    /**
     * `PUT /invitations/:id/guestbook/:entryId`: hides one entry or shows it again, and answers the stored entry
     * (F7; L10.6). Called from a server action, because a browser cannot send `PUT`.
     */
    setGuestbookEntryHidden: (
      id: string,
      entryId: string,
      hidden: boolean,
    ): Promise<InvitationResult<GuestbookEntry>> => {
      const path = guestbookEntryPath(id, entryId);

      return path === undefined
        ? Promise.resolve({ ok: false, failure: "guestbook-entry-not-found" })
        : call("PUT", path, { hidden }, parseGuestbookEntry);
    },
    /**
     * `GET /invitations/:id/guests`: the guests with their answers, their check-in state, and the totals (M6 G4;
     * S1, S4). Owner-only; a package without the guest list is `guest-list-unavailable`.
     */
    guests: (id: string): Promise<InvitationResult<GuestList>> => {
      const path = guestPath(id);
      return path === undefined
        ? Promise.resolve(NOT_FOUND)
        : call("GET", path, undefined, parseGuestList);
    },
    /**
     * `POST /invitations/:id/guests`: adds one guest and answers the personal token exactly once (M6 G4; S4). Only
     * the server action reads it, and it never becomes part of a URL or a log.
     */
    createGuest: (id: string, guest: GuestInput): Promise<InvitationResult<GuestWithToken>> => {
      const path = guestPath(id);
      return path === undefined
        ? Promise.resolve(NOT_FOUND)
        : call("POST", path, guest, parseGuestWithToken);
    },
    /** `PUT /invitations/:id/guests/:guestId`: replaces the whole guest; the token and the check-in stay (S4). */
    updateGuest: (
      id: string,
      guestId: string,
      guest: GuestInput,
    ): Promise<InvitationResult<GuestItem>> =>
      onGuest(id, guestId, "", (path) => call("PUT", path, guest, parseGuestItem)),
    /** `DELETE /invitations/:id/guests/:guestId`: removes the guest together with the answer they gave (S4). */
    removeGuest: (id: string, guestId: string): Promise<InvitationResult<{ status: "deleted" }>> =>
      onGuest(id, guestId, "", (path) => call("DELETE", path, undefined, parseDeletedGuest)),
    /**
     * `POST /invitations/:id/guests/:guestId/token`: replaces the personal link and answers the new token once, so
     * the owner can revoke a link that leaked; the previous link stops resolving at the same instant (S4).
     */
    rotateGuestToken: (id: string, guestId: string): Promise<InvitationResult<GuestWithToken>> =>
      onGuest(id, guestId, "/token", (path) => call("POST", path, undefined, parseGuestWithToken)),
    /**
     * `POST /invitations/:id/guests/check-in`: marks the guest named by the token present and answers the first
     * check-in instant, so showing the same QR twice is idempotent (M6 G4; S4). A token that cannot have been minted
     * names no guest, so no request is made.
     */
    checkInGuest: (id: string, token: string): Promise<InvitationResult<GuestCheckIn>> => {
      const path = guestPath(id, undefined, "/check-in");

      return path === undefined || !isGuestToken(token)
        ? Promise.resolve(GUEST_NOT_FOUND_RESULT)
        : call("POST", path, { token }, parseGuestCheckIn);
    },
    /**
     * `GET /invitations/:id/rsvp.csv`: the same read as a file (M6 G3; S1, S4). The API's own content type and
     * attachment filename are kept, because the route that answers the browser passes them through.
     */
    rsvpCsv: async (id: string): Promise<InvitationResult<RsvpCsv>> => {
      const path = draftPath(id, "/rsvp.csv");

      if (path === undefined) {
        return NOT_FOUND;
      }
      const cookie = sessionCookieHeader(await readCookieHeader());

      if (cookie === undefined) {
        return SIGNED_OUT;
      }

      const answer = await sendApiDownload(options, { cookie, method: "GET", path });

      if (answer.status === 401) {
        await answer.body?.cancel();
        return SIGNED_OUT;
      }
      if (answer.status === 404) {
        await answer.body?.cancel();
        return NOT_FOUND;
      }

      const contentType = answer.headers.get("content-type") ?? "";
      const contentDisposition = answer.headers.get("content-disposition") ?? "";

      if (
        answer.status !== 200 ||
        !contentType.startsWith(RSVP_CSV_CONTENT_TYPE) ||
        !RSVP_CSV_DISPOSITION.test(contentDisposition)
      ) {
        await answer.body?.cancel();
        throw new ApiClientError(
          answer.status >= 500
            ? "unavailable"
            : answer.status === 200
              ? "invalid-response"
              : "rejected",
          answer.status,
        );
      }

      let body: string;
      try {
        body = answer.body === null ? "" : await new Response(answer.body).text();
      } catch (error) {
        throw new ApiClientError("unavailable", answer.status, { cause: error });
      }

      return { ok: true, value: { body, contentType, contentDisposition } };
    },
  };
}

export type InvitationsClient = ReturnType<typeof createInvitationsClient>;
