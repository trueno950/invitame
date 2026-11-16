import { isE164Phone, isInvitationFeatureKey } from "../invitation-features/invitation-features.ts";
import { PLAYLIST_URL_MAX_LENGTH } from "../invitation-features/music.ts";
import { isInvitationTimeZone } from "../invitation-features/time-zones.ts";
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
  featureSettings: { whatsappPhone: string | null; playlistUrl: string | null };
  /**
   * The gated feature keys the guest page will show, `CALENDAR` included (S4). The package's other keys are
   * never here, and a key this deployment does not implement is refused by the parser.
   */
  availableFeatures: string[];
}

/** The feature data a creator saves: `PUT /invitations/:id/features` (F1, F3, F6; S3, S4, S7). */
export interface InvitationFeatureInput {
  timeZone: string;
  /** The text the creator typed, or null/empty to clear it; the API normalizes it to E.164. */
  whatsappPhone: string | null;
  /** The link the creator pasted, or null/empty to clear it; the API validates and normalizes it (S7). */
  playlistUrl: string | null;
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
  readonly phone: string | null;
  readonly message: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The totals of one invitation's answers: confirmed people, declines, and rows (S1, S4). */
export interface RsvpTotals {
  readonly attendingPeople: number;
  readonly declinedCount: number;
  readonly responses: number;
}

/** The owner's read: settings, every response newest first, and the totals of the page (S1, S4). */
export interface RsvpRead {
  readonly settings: RsvpSettings;
  readonly responses: RsvpResponseItem[];
  readonly totals: RsvpTotals;
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
 * - `validation`: 400 without a known code, the API refused a field of the request;
 * - `not-editable`: 409 `INVITATION_NOT_EDITABLE`, the draft is archived (A3, S7);
 * - `already-archived`: 409 `INVITATION_ALREADY_ARCHIVED`;
 * - `not-publishable`: 409 `INVITATION_NOT_PUBLISHABLE`, the readiness rule named the issues (S7, A1);
 * - `already-published`: 409 `INVITATION_ALREADY_PUBLISHED`, a repeated publish (A2, S7);
 * - `not-published`: 409 `INVITATION_NOT_PUBLISHED`, an unpublish of a draft (A2, S7);
 * - `payment-required`: 402 `INVITATION_PAYMENT_REQUIRED`, the publication gate asked for a payment
 *   that this milestone never requires (S6).
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
  | "validation"
  | "not-editable"
  | "already-archived"
  | "not-publishable"
  | "already-published"
  | "not-published"
  | "payment-required";

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
 * The draft content: a plain object whose values are the primitives the pinned schema validates. An own
 * `__proto__` key stays a plain property (`Object.fromEntries` never assigns a prototype), so a stored
 * key can never change the object the page reads.
 */
function parseContent(value: unknown): Record<string, unknown> | undefined {
  const content = record(value);

  if (content === undefined) {
    return undefined;
  }

  const entries = Object.entries(content);
  return entries.every(([, item]) => isPrimitive(item)) ? Object.fromEntries(entries) : undefined;
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
function parseFeatureSettings(
  value: unknown,
): { whatsappPhone: string | null; playlistUrl: string | null } | undefined {
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

  return { whatsappPhone: phone, playlistUrl: playlist };
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

  if (
    content === undefined ||
    missing === undefined ||
    featureSettings === undefined ||
    availableFeatures === undefined ||
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
    availableFeatures,
  };
}

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

  if (
    !isInvitationId(id) ||
    !isNonEmptyString(name) ||
    typeof attending !== "boolean" ||
    !isCount(partySize) ||
    partySize > RSVP_PARTY_LIMIT_MAX ||
    !(phone === null || typeof phone === "string") ||
    !(message === null || typeof message === "string") ||
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt)
  ) {
    return undefined;
  }

  return { id, name, attending, partySize, phone, message, createdAt, updatedAt };
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

  return { attendingPeople, declinedCount, responses };
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

const CODE_FAILURES: Record<string, InvitationFailure> = {
  INVITATION_NOT_FOUND: "not-found",
  INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED: "version-not-published",
  INVITATION_PACKAGE_NOT_FOUND: "package-not-found",
  INVITATION_PACKAGE_DOES_NOT_FIT: "package-does-not-fit",
  INVALID_INVITATION_CONTENT: "content-invalid",
  INVALID_INVITATION_FEATURES: "features-invalid",
  INVALID_RSVP_SETTINGS: "rsvp-settings-invalid",
  INVITATION_NOT_EDITABLE: "not-editable",
  INVITATION_ALREADY_ARCHIVED: "already-archived",
  INVITATION_NOT_PUBLISHABLE: "not-publishable",
  INVITATION_ALREADY_PUBLISHED: "already-published",
  INVITATION_NOT_PUBLISHED: "not-published",
  INVITATION_PAYMENT_REQUIRED: "payment-required",
};

const SIGNED_OUT: InvitationResult<never> = { ok: false, failure: "signed-out" };
const NOT_FOUND: InvitationResult<never> = { ok: false, failure: "not-found" };

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
    failure === "rsvp-settings-invalid"
      ? issuesOf(body)
      : undefined;
  return { ok: false, failure, ...(issues === undefined ? {} : { issues }) };
}

const readsBody = (status: number): boolean =>
  (status >= 200 && status <= 299) ||
  status === 400 ||
  status === 402 ||
  status === 404 ||
  status === 409;

/** The content type and the attachment filename the RSVP CSV route answers with (M6 G3; S4). */
const RSVP_CSV_CONTENT_TYPE = "text/csv";
const RSVP_CSV_DISPOSITION = /^attachment; filename="[A-Za-z0-9._-]{1,80}"$/;

const INVITATIONS = "/invitations";

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps
 * nothing between calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createInvitationsClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  async function call<T>(
    method: "GET" | "POST" | "PUT",
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

    if (
      failure !== undefined &&
      (status === 400 || status === 402 || status === 404 || status === 409)
    ) {
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

  async function onDraft<T>(
    id: string,
    suffix: string,
    send: (path: string) => Promise<InvitationResult<T>>,
  ): Promise<InvitationResult<T>> {
    const path = draftPath(id, suffix);
    return path === undefined ? NOT_FOUND : send(path);
  }

  return {
    /** `GET /invitations`: the session user's drafts, newest first (S1). */
    list: (): Promise<InvitationResult<InvitationSummary[]>> =>
      call("GET", INVITATIONS, undefined, parseInvitationSummaries),
    /** `GET /invitations/:id`: one own draft with its content and missing fields (S7). */
    get: (id: string): Promise<InvitationResult<OwnedInvitation>> =>
      onDraft(id, "", (path) => call("GET", path, undefined, parseOwnedInvitation)),
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
    ): Promise<InvitationResult<OwnedInvitation>> =>
      onDraft(id, "/content", (path) => call("PUT", path, { content }, parseOwnedInvitation)),
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
