import { formatMxn } from "../admin/catalog/price.ts";
import { FEATURE_LABELS } from "../landing/pricing.ts";
import { publicInvitationPath } from "../public/invitation-page.ts";
import type {
  CreatorPackage,
  CreatorTemplate,
  InvitationFailure,
  InvitationListItem,
  InvitationResult,
  InvitationStatus,
  InvitationsClient,
} from "../server/invitations-api.ts";
import { isInvitationId } from "../server/invitations-api.ts";
import {
  INVITATION_COPY,
  INVITATION_ERROR_COPY,
  INVITATION_FIELD_LABELS,
  INVITATION_NOTICE_COPY,
  INVITATION_STATUS_LABELS,
  type InvitationErrorCode,
  type InvitationNoticeCode,
  OMITTABLE_SECTION_LABELS,
  PUBLISH_ISSUE_COPY,
} from "./copy.ts";
import { invitationHeading } from "./editor-progress.ts";
import { FEATURE_ERROR_CODE, featureIssueMessages } from "./feature-issues.ts";
import { NAVIGATION_COPY } from "./navigation-copy.ts";
import { RSVP_SETTINGS_ERROR_CODE, rsvpSettingsIssueMessages } from "./rsvp-issue.ts";

/**
 * What the invitation pages under `/cuenta` render and how their forms answer (M4 T5; S1, S6, S7). The API
 * is the authority on ownership, on the pinned schema, and on the lifecycle; these functions only turn the
 * creator catalog into a form, turn the submitted form into the JSON the API validates, and turn each
 * outcome of a server action into the redirect a page can show. Copy lives in `copy.ts`.
 */

export const INVITATION_PATHS = {
  list: "/cuenta/invitaciones",
  create: "/cuenta/invitaciones/nueva",
  detail: (id: string) => `/cuenta/invitaciones/${id}`,
} as const;

// The query parameters of the «Paso a paso» chooser on the create page (S10, S12). The chooser itself reads and
// writes them (`lib/customer/template-steps.ts`), and a refused create rebuilds the step-3 URL from them, so
// both sides take the names from here instead of repeating the strings.

/** The current step, counting from 1. */
export const STEP_PARAM = "paso";
/** The chosen design: its allow-listed `componentKey`, never a name. */
export const DESIGN_PARAM = "diseno";
/** The chosen theme: the published version id, which is also what the create form posts. */
export const THEME_PARAM = "tema";
/** The occasion: the catalog category key that has published templates. */
export const OCCASION_PARAM = "ocasion";
/** The chosen package. */
export const PACKAGE_PARAM = "paquete";
/** The error code a page shows as a Spanish message. */
const ERROR_PARAM = "error";

/** Where a customer signs in; the customer pages share it with `/cuenta`. */
export const CUSTOMER_SIGN_IN_PATH = "/ingresar";

/** The primitive types a renderer schema may declare, and the only ones this form can edit. */
const FIELD_TYPES = ["string", "integer", "number", "boolean"] as const;
export type ContentFieldType = (typeof FIELD_TYPES)[number];

/**
 * The control a field is edited with (M4 T8; S11), derived only from its own property of the pinned
 * schema: the JSON Schema `format`, `pattern`, `minimum`, `maximum`, and `maxLength`, never the
 * template's name or key. `min`/`max` become the input's own bounds, so a browser refuses a negative
 * age before anything is sent, and `parseContentChanges` (`invitation-autosave.ts`) refuses it again on
 * the server when the field is saved.
 */
export type FieldInput =
  | { kind: "checkbox" }
  | { kind: "date" }
  | { kind: "time" }
  | { kind: "url"; maxLength?: number }
  | { kind: "number"; min?: number; max?: number; step: "1" | "any" }
  | { kind: "text"; maxLength?: number }
  | { kind: "textarea"; maxLength?: number; rows: number };

/** One editable property of the pinned version's schema, with its Spanish label and its control. */
export interface ContentField {
  name: string;
  type: ContentFieldType;
  label: string;
  /**
   * Whether the schema requires the field. It is never the HTML `required` attribute, because a draft
   * may stay partial (S7); the editor marks it «Necesario para publicar» instead.
   */
  required: boolean;
  input: FieldInput;
}

/** A string longer than this is edited in a multi-line field, not a single-line input. */
export const TEXTAREA_THRESHOLD = 200;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isFieldType(value: unknown): value is ContentFieldType {
  return FIELD_TYPES.some((type) => type === value);
}

function own(definition: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(definition, key) ? definition[key] : undefined;
}

/** A numeric keyword the schema declares, or nothing; a non-finite value is not a usable bound. */
function declaredNumber(definition: Record<string, unknown>, key: string): number | undefined {
  const value = own(definition, key);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function declaredText(definition: Record<string, unknown>, key: string): string | undefined {
  const value = own(definition, key);
  return typeof value === "string" ? value : undefined;
}

/**
 * Whether a declared regex accepts every 24-hour time and refuses anything else, so a pattern such as
 * `^([01]\d|2[0-3]):[0-5]\d$` is recognized as a time and an unrelated pattern stays a text field.
 * A pattern that no engine compiles is not one this form can honor, so it stays text.
 */
export function isTimeOfDayPattern(pattern: string): boolean {
  let expression: RegExp;
  try {
    expression = new RegExp(pattern);
  } catch {
    return false;
  }

  const accepted = ["00:00", "09:05", "23:59"];
  const refused = ["24:00", "12:60", "1:00", "12:00:00", "ab:cd", ""];
  return (
    accepted.every((time) => expression.test(time)) &&
    refused.every((time) => !expression.test(time))
  );
}

/** The rows a multi-line field shows for its declared length: a hint, never a cap on the text. */
function textareaRows(maxLength: number): number {
  return Math.min(6, Math.max(3, Math.ceil(maxLength / 120)));
}

/** The control of one property, from that property's own keywords (S11). */
function fieldInput(definition: Record<string, unknown>, type: ContentFieldType): FieldInput {
  if (type === "boolean") {
    return { kind: "checkbox" };
  }
  if (type === "integer" || type === "number") {
    const min = declaredNumber(definition, "minimum");
    const max = declaredNumber(definition, "maximum");

    return {
      kind: "number",
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      step: type === "integer" ? "1" : "any",
    };
  }

  const declared = declaredNumber(definition, "maxLength");
  const maxLength =
    declared !== undefined && Number.isSafeInteger(declared) && declared >= 0
      ? declared
      : undefined;
  const bounded = maxLength === undefined ? {} : { maxLength };
  const format = declaredText(definition, "format");
  const pattern = declaredText(definition, "pattern");

  if (format === "date") {
    return { kind: "date" };
  }
  if (format === "time" || (pattern !== undefined && isTimeOfDayPattern(pattern))) {
    return { kind: "time" };
  }
  if (format === "uri") {
    return { kind: "url", ...bounded };
  }
  if (maxLength !== undefined && maxLength > TEXTAREA_THRESHOLD) {
    return { kind: "textarea", maxLength, rows: textareaRows(maxLength) };
  }
  return { kind: "text", ...bounded };
}

/** The label of a data property: the copy map first, then the property name itself. */
export function fieldLabel(name: string): string {
  return Object.hasOwn(INVITATION_FIELD_LABELS, name)
    ? (INVITATION_FIELD_LABELS[name] ?? name)
    : name;
}

/**
 * One field per property of the pinned version's schema, in the schema's own order: the `required`
 * properties first, then the ones it declares without requiring them. A property whose declared type is
 * not a primitive this form can edit is left out, and an unreadable schema declares no field at all, so
 * the page falls back to showing the stored content read-only instead of guessing a form.
 */
export function contentFields(schema: unknown): ContentField[] {
  const root = record(schema);
  const properties = record(root?.properties);

  if (root === undefined || properties === undefined) {
    return [];
  }

  const declared = Object.keys(properties);
  const requiredNames = root.required;
  const required = Array.isArray(requiredNames)
    ? requiredNames.filter((name): name is string => typeof name === "string")
    : [];
  const ordered = [
    ...required.filter((name) => declared.includes(name)),
    ...declared.filter((name) => !required.includes(name)),
  ];

  const fields: ContentField[] = [];
  for (const name of ordered) {
    const definition = record(properties[name]);
    const type = definition?.type;

    if (isFieldType(type) && definition !== undefined) {
      fields.push({
        name,
        type,
        label: fieldLabel(name),
        required: required.includes(name),
        input: fieldInput(definition, type),
      });
    }
  }
  return fields;
}

/** The short groups of the draft's form, in the order the editor shows them. */
const SECTION_KEYS = [
  "celebrant",
  "when",
  "where",
  "ceremony",
  "reception",
  "content",
  "other",
] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * Which group a property belongs to. Keyed by the property name, because the group is about what the
 * data is, not about which template declares it: another renderer's own property falls into `other`.
 */
const FIELD_SECTIONS: Readonly<Record<string, SectionKey>> = {
  celebrantName: "celebrant",
  age: "celebrant",
  date: "when",
  time: "when",
  location: "where",
  address: "where",
  mainPhoto: "content",
  message: "content",
  // Baby shower and themed baptism (T7c; S13). The two places of a baptism are their own groups, so the
  // form reads as «quién», «cuándo», «ceremonia», «recepción», and «contenido» instead of one long list.
  hosts: "celebrant",
  babyName: "celebrant",
  genderReveal: "celebrant",
  parents: "celebrant",
  godparents: "celebrant",
  ceremonyPlace: "ceremony",
  ceremonyAddress: "ceremony",
  ceremonyTime: "ceremony",
  receptionPlace: "reception",
  receptionAddress: "reception",
  receptionTime: "reception",
  giftRegistry: "content",
  rsvpContact: "content",
  // Elegant XV años and weddings (E3c; S4): the couple, the honor sponsors, the chambelanes, and the
  // wedding's two families belong with the celebrant; the dress code, the hashtag, and the gifts with the
  // rest of the content.
  coupleNameOne: "celebrant",
  coupleNameTwo: "celebrant",
  honorSponsors: "celebrant",
  chambelanes: "celebrant",
  firstFamilyParents: "celebrant",
  secondFamilyParents: "celebrant",
  weddingSponsors: "celebrant",
  dressCode: "content",
  hashtag: "content",
};

const SECTION_TITLES: Readonly<Record<SectionKey, string>> = {
  celebrant: INVITATION_COPY.sectionCelebrant,
  when: INVITATION_COPY.sectionWhen,
  where: INVITATION_COPY.sectionWhere,
  ceremony: INVITATION_COPY.sectionCeremony,
  reception: INVITATION_COPY.sectionReception,
  content: INVITATION_COPY.sectionContent,
  other: INVITATION_COPY.sectionOther,
};

/** One group of the draft's form: a fieldset with its legend and its fields in schema order. */
export interface ContentSection {
  key: SectionKey;
  title: string;
  fields: ContentField[];
}

function sectionOf(name: string): SectionKey {
  return Object.hasOwn(FIELD_SECTIONS, name) ? (FIELD_SECTIONS[name] ?? "other") : "other";
}

/**
 * The fields grouped into the short sections of the editor (S11, S13), so the form reads in a few blocks
 * instead of one long list: «Festejado», «Cuándo», «Dónde», «Ceremonia», «Recepción», «Contenido», and one
 * last group for any property those do not name. A group with no field is left out, and the schema order of
 * the fields is kept inside each group.
 */
export function contentSections(fields: readonly ContentField[]): ContentSection[] {
  const grouped = new Map<SectionKey, ContentField[]>();
  for (const field of fields) {
    const key = sectionOf(field.name);
    const group = grouped.get(key);

    if (group === undefined) {
      grouped.set(key, [field]);
    } else {
      group.push(field);
    }
  }

  const sections: ContentSection[] = [];
  for (const key of SECTION_KEYS) {
    const group = grouped.get(key);

    if (group !== undefined) {
      sections.push({ key, title: SECTION_TITLES[key], fields: group });
    }
  }
  return sections;
}

/** The version that an invitation is pinned to, with the fields of its schema (A2). */
export interface PinnedFields {
  template: CreatorTemplate;
  fields: ContentField[];
}

/**
 * Finds the published version an invitation is pinned to in the creator catalog. A version that is no
 * longer published (retired) is not in that list, and comments M4 cannot change the pin (A2), so its
 * content is shown read-only.
 */
export function invitationFieldsFor(
  templates: readonly CreatorTemplate[],
  templateVersionId: string,
): PinnedFields | undefined {
  const template = templates.find(
    (candidate) => candidate.publishedVersion.id === templateVersionId,
  );

  return template === undefined
    ? undefined
    : { template, fields: contentFields(template.publishedVersion.schema) };
}

/** The stored value of a field as its input shows it; empty when the draft does not have it (S7). */
export function fieldValue(field: ContentField, content: Record<string, unknown>): string {
  const value = Object.hasOwn(content, field.name) ? content[field.name] : undefined;

  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "boolean" ? String(value) : String(value);
}

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "America/Mexico_City",
});

/** An ISO instant as `11 nov 2026` in Mexico City time; empty when it is not a date. */
export function formatDate(value: string): string {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : dateFormatter.format(time);
}

/** `5 dic 2026`: the same style, read as the calendar date it is and never shifted by a zone (S2.6). */
const eventDateFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** The four digits, two digits, and two digits of a stored calendar date, and one that rolls over is not one. */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The stored `date` field of an invitation as `5 dic 2026`, or null when it is not a calendar date (S2.6). The value
 * is a calendar date, not an instant: `2026-12-05` stays 5 December in every zone, and `2026-02-31`, which
 * `Date.parse` would roll into March, is refused so a card never shows a day nobody chose.
 */
export function eventDateLabel(value: unknown): string | null {
  const match = typeof value === "string" ? CALENDAR_DATE.exec(value) : null;

  if (match === null) {
    return null;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day, 12);
  const date = new Date(time);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return eventDateFormatter.format(time);
}

/**
 * The renderer data of one card (S2.6): the `componentKey` of the pinned version, its stored configuration, and the
 * content the owner has typed. It is data only — the page decides with `registry.ts` and the renderer's own contract
 * whether it can be drawn, so a customer module never turns a key into code.
 */
export interface InvitationRenderer {
  componentKey: string;
  configuration: unknown;
  content: Record<string, unknown>;
}

export function statusLabel(status: InvitationStatus): string {
  return INVITATION_STATUS_LABELS[status];
}

/** «Faltan: Edad, Fecha.», or nothing when the draft has every required field (S7). */
export function missingFieldsMessage(names: readonly string[]): string | null {
  return names.length === 0 ? null : INVITATION_COPY.missingLabel(names.map(fieldLabel).join(", "));
}

/**
 * One row of "Mis invitaciones": what the list shows about an invitation, and where it links (T2; S2.6). The card
 * names the celebration, states its date, and draws a miniature of its own renderer, so the owner recognizes an
 * invitation without reading its generated slug. A published one also links to its public page, which is the only
 * page a guest sees (S7).
 */
export interface InvitationRow {
  id: string;
  href: string;
  slug: string;
  /** The celebration's name, or «Tu invitación» while the content names nobody yet. */
  title: string;
  /** The stored event date as `5 dic 2026`, or null while the content states none. */
  eventDate: string | null;
  /** The renderer of the pinned version with the stored content, or null while the API answered none. */
  renderer: InvitationRenderer | null;
  statusLabel: string;
  /** `/i/<slug>` while the invitation is published; null while it is a draft or archived. */
  publicHref: string | null;
  createdOn: string;
}

/**
 * One row per invitation. The name comes from the same `invitationHeading` the editor's heading uses, so the list and
 * the editor never disagree about what the invitation is called; the date is the `date` field every content schema
 * declares, and a card whose data is missing still lists with its slug and no miniature (S2.6, S3).
 */
export function invitationRows(items: readonly InvitationListItem[]): InvitationRow[] {
  return items.map((item) => ({
    id: item.id,
    href: INVITATION_PATHS.detail(item.id),
    slug: item.slug,
    title: invitationHeading(item.content, undefined, NAVIGATION_COPY.cardTitle),
    eventDate: eventDateLabel(item.content.date),
    renderer:
      item.componentKey === null
        ? null
        : {
            componentKey: item.componentKey,
            configuration: item.configuration,
            content: item.content,
          },
    statusLabel: statusLabel(item.status),
    publicHref: item.status === "PUBLISHED" ? publicInvitationPath(item.slug) : null,
    createdOn: formatDate(item.createdAt),
  }));
}

/** One package of «Nueva invitación» as a selectable card: what the form sends, and its text. */
export interface ChoiceCard {
  value: string;
  name: string;
  /** The price in force of a package, always shown with the name. */
  meta: string;
  description: string | null;
  /** The included features as Spanish labels, in the catalog's order. */
  features: string[];
  /** Whether this is the recommended package (premium), shown with a badge. */
  featured: boolean;
}

/**
 * Each package to choose, with its price in force in its own currency (S6); a free one says so. The cards are
 * ordered by price, cheapest first, so the pricing table reads as a ladder and the recommended middle plan sits
 * in the middle of the row; a package with no price in force goes last. The order comes from the price, never
 * from a key or a name.
 */
export function packageChoices(packages: readonly CreatorPackage[]): ChoiceCard[] {
  return [...packages]
    .sort((left, right) => {
      const a = left.currentPrice?.amountMinor;
      const b = right.currentPrice?.amountMinor;

      if (a === undefined) {
        return b === undefined ? 0 : 1;
      }
      return b === undefined ? -1 : a - b;
    })
    .map((stored) => ({
      value: stored.id,
      name: stored.name,
      meta:
        stored.currentPrice === null
          ? INVITATION_COPY.priceMissing
          : `${formatMxn(stored.currentPrice.amountMinor, stored.currentPrice.currency)} ${stored.currentPrice.currency}`,
      description: stored.description,
      features: stored.includedFeatureKeys.map((key) => FEATURE_LABELS[key] ?? key),
      featured: stored.key === "premium",
    }));
}

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export function invitationNoticeTarget(path: string, code: InvitationNoticeCode): string {
  return `${path}?notice=${code}`;
}

export function invitationErrorTarget(path: string, code: InvitationErrorCode): string {
  return `${path}?${ERROR_PARAM}=${code}`;
}

function lookup<T extends string>(
  table: Readonly<Record<T, string>>,
  value: string | string[] | undefined,
): value is T {
  return typeof value === "string" && Object.hasOwn(table, value);
}

export interface InvitationPageNotices {
  notice?: string;
  error?: string;
  /**
   * The Spanish sentences of a refusal, when the query names known issue codes: a publication's readiness
   * issues (S7), or the issues of a refused feature save (F3; S4).
   */
  issues?: string[];
}

/** The messages a page shows for its query; an unknown or repeated value shows nothing (as in M3). */
export function invitationPageNotices(parameters: SearchParameters): InvitationPageNotices {
  const { notice, error } = parameters;
  const issues =
    error === "not-publishable"
      ? publishIssueMessages(parameters.issues)
      : error === FEATURE_ERROR_CODE
        ? featureIssueMessages(parameters.issues)
        : error === RSVP_SETTINGS_ERROR_CODE
          ? rsvpSettingsIssueMessages(parameters.issues)
          : [];

  return {
    ...(lookup(INVITATION_NOTICE_COPY, notice) ? { notice: INVITATION_NOTICE_COPY[notice] } : {}),
    ...(lookup(INVITATION_ERROR_COPY, error) ? { error: INVITATION_ERROR_COPY[error] } : {}),
    ...(issues.length === 0 ? {} : { issues }),
  };
}

/** A failed call the client classified, or any failure it could not classify. */
type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; failure: InvitationFailure | "unavailable"; issues?: string[] };

/** Runs one call, turning a thrown failure (already logged by the server wrapper) into `unavailable`. */
export async function sendInvitationCall<T>(
  call: () => Promise<InvitationResult<T>>,
): Promise<Outcome<T>> {
  try {
    const result = await call();
    return result.ok
      ? { ok: true, value: result.value }
      : {
          ok: false,
          failure: result.failure,
          ...(result.issues === undefined ? {} : { issues: result.issues }),
        };
  } catch {
    return { ok: false, failure: "unavailable" };
  }
}

/** An ended session goes to sign-in; every other refusal comes back to the page with its code. */
export function invitationFailureTarget(
  path: string,
  failure: InvitationFailure | "unavailable",
): string {
  return failure === "signed-out" ? CUSTOMER_SIGN_IN_PATH : invitationErrorTarget(path, failure);
}

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

/** The shape of one carried selection value: a catalog key, a version id, or a package id (S12). */
const SELECTION_VALUE = /^[A-Za-z0-9._-]{1,64}$/;

/** One selection value the form carried, or nothing when it is missing or not shaped like an id (S12). */
function carriedSelection(form: FormData, name: string): string | undefined {
  const value = text(form, name);
  return value !== undefined && SELECTION_VALUE.test(value) ? value : undefined;
}

/**
 * Step 3 of the chooser with the selection the form carried, plus the error code (S12), so a refused create
 * lands where the customer was instead of on a bare create URL. The theme and the package are the version id
 * and the package id the same form already posts, so the URL repeats them from those values instead of a
 * second copy that could disagree with them. Nothing here trusts a carried value beyond its shape: the page
 * resolves every parameter against the creator catalog again, so a stale or tampered one only loses the
 * selection it names and falls back to the nearest step that still holds.
 */
function failedCreateTarget(
  form: FormData,
  choice: { templateVersionId?: string | undefined; packageId?: string | undefined },
  code: InvitationErrorCode,
): string {
  const parameters = new URLSearchParams([[STEP_PARAM, "3"]]);
  const put = (name: string, value: string | undefined) => {
    if (value !== undefined) {
      parameters.set(name, value);
    }
  };

  put(OCCASION_PARAM, carriedSelection(form, OCCASION_PARAM));
  put(DESIGN_PARAM, carriedSelection(form, DESIGN_PARAM));
  put(THEME_PARAM, choice.templateVersionId);
  put(PACKAGE_PARAM, choice.packageId);
  parameters.set(ERROR_PARAM, code);

  return `${INVITATION_PATHS.create}?${parameters.toString()}#paso-paquete`;
}

/** Creates a free draft and goes to it (S1, S6); a refusal returns to step 3 with the selection kept (S12). */
export async function createInvitation(api: InvitationsClient, form: FormData): Promise<string> {
  const templateVersionId = text(form, "templateVersionId");
  const packageId = text(form, "packageId");
  const choice = { templateVersionId, packageId };

  if (templateVersionId === undefined || packageId === undefined) {
    return failedCreateTarget(form, choice, "invalid-form");
  }

  const created = await sendInvitationCall(() => api.create({ templateVersionId, packageId }));

  if (created.ok) {
    return invitationNoticeTarget(INVITATION_PATHS.detail(created.value.id), "created");
  }
  return created.failure === "signed-out"
    ? CUSTOMER_SIGN_IN_PATH
    : failedCreateTarget(form, choice, created.failure);
}

/** Archives a draft: it stays stored and becomes read-only (S7, A3). */
export async function archiveInvitation(api: InvitationsClient, form: FormData): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const archived = await sendInvitationCall(() => api.archive(id));

  return archived.ok
    ? invitationNoticeTarget(path, "archived")
    : invitationFailureTarget(path, archived.failure);
}

/**
 * The readiness issues the API answers for a publish it refused (M5 T5; S7, A1). The API's rule
 * (`apps/api/src/invitations/domain/publication-readiness.ts`) writes deterministic English sentences;
 * the web mirrors the three patterns it can act on and maps every other issue to one generic code, so no
 * English text ever reaches the customer and nothing is guessed about an issue it does not know.
 */
const REQUIRED_FIELD_ISSUE = /^content\.([A-Za-z0-9_]+) is required to publish$/;
/**
 * The API's own `x-require-one` issue (T4; S8.3): the content omits every section of a set, so the invitation would be
 * published without the place it needs. The issue names the set's own keys, in the version's order.
 */
const REQUIRE_ONE_ISSUE =
  /^content\.([a-z][A-Za-z0-9]{0,39}(?:,[a-z][A-Za-z0-9]{0,39}){0,7}) needs one shown$/;
const PACKAGE_FIT_ISSUE = "package does not include the template's required features";
const VERSION_RETIRED_ISSUE = "template version is no longer published";

/** The most issue codes one redirect carries, and the most sentences the page shows. */
export const MAX_PUBLISH_ISSUE_CODES = 8;
export const MAX_PUBLISH_ISSUES_SHOWN = 10;

/** `field:<property>`, `sections:<keys>`, or one of the three issues that are not about a field. */
const ISSUE_CODE =
  /^(?:field:[A-Za-z0-9_]{1,60}|sections:[a-z][A-Za-z0-9]{0,39}(?:\.[a-z][A-Za-z0-9]{0,39}){0,7}|package|version|other)$/;

const FIELD_CODE_PREFIX = "field:";
const SECTIONS_CODE_PREFIX = "sections:";

/**
 * The separator of the keys inside one `sections:` code. It is a dot and not a comma because a comma separates the
 * codes of the query itself (`invitationIssuesTarget`), and a comma inside one would be read as two codes.
 */
const SECTIONS_CODE_SEPARATOR = ".";

/**
 * Each raw issue as a small code the page can put in its query: `field:date` for a missing required field,
 * `sections:ceremony.reception` for the set that must keep one shown, `package`, `version`, or `other` for anything
 * this module does not recognize, deduplicated and bounded.
 */
export function publishIssueCodes(issues: readonly string[]): string[] {
  const codes: string[] = [];

  for (const issue of issues) {
    const name = REQUIRED_FIELD_ISSUE.exec(issue)?.[1];
    const sections = REQUIRE_ONE_ISSUE.exec(issue)?.[1];
    const code =
      name !== undefined
        ? `${FIELD_CODE_PREFIX}${name}`
        : sections !== undefined
          ? `${SECTIONS_CODE_PREFIX}${sections.replaceAll(",", SECTIONS_CODE_SEPARATOR)}`
          : issue === PACKAGE_FIT_ISSUE
            ? "package"
            : issue === VERSION_RETIRED_ISSUE
              ? "version"
              : "other";

    if (!codes.includes(code)) {
      codes.push(code);
    }
    if (codes.length === MAX_PUBLISH_ISSUE_CODES) {
      break;
    }
  }

  return codes.length === 0 ? ["other"] : codes;
}

/** The target a refused publication comes back to: its error code and the issue codes it named. */
export function invitationIssuesTarget(path: string, codes: readonly string[]): string {
  return `${path}?error=not-publishable&issues=${codes.join(",")}`;
}

/** The Spanish sentence of one issue code; nothing at all for a code this page does not know. */
function issueMessage(code: string): string | undefined {
  if (code.startsWith(FIELD_CODE_PREFIX)) {
    return INVITATION_COPY.missingOneLabel(fieldLabel(code.slice(FIELD_CODE_PREFIX.length)));
  }
  if (code.startsWith(SECTIONS_CODE_PREFIX)) {
    // Every key is named in Spanish before the sentence is shown; one this deployment cannot name falls back to the
    // generic sentence instead of putting an English key in front of the customer (S8.4).
    const keys = code.slice(SECTIONS_CODE_PREFIX.length).split(SECTIONS_CODE_SEPARATOR);
    const names = keys.map((key) =>
      Object.hasOwn(OMITTABLE_SECTION_LABELS, key) ? OMITTABLE_SECTION_LABELS[key] : undefined,
    );

    return names.every((name): name is string => name !== undefined)
      ? PUBLISH_ISSUE_COPY.needsOne(names.join(" o "))
      : PUBLISH_ISSUE_COPY.other;
  }
  switch (code) {
    case "package":
      return PUBLISH_ISSUE_COPY.package;
    case "version":
      return PUBLISH_ISSUE_COPY.version;
    case "other":
      return PUBLISH_ISSUE_COPY.other;
    default:
      return undefined;
  }
}

/**
 * The Spanish sentences of an `issues` query value. Only a comma-separated list of known codes is read, so
 * a hand-edited or invented value shows nothing (or one generic sentence) instead of echoing text; a
 * parameter that is not a list of strings is refused whole.
 */
export function publishIssueMessages(value: string | string[] | undefined): string[] {
  const entries = typeof value === "string" ? value.split(",") : value;

  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
    return [];
  }

  const messages: string[] = [];
  for (const entry of entries) {
    if (messages.length === MAX_PUBLISH_ISSUES_SHOWN) {
      break;
    }
    if (!ISSUE_CODE.test(entry)) {
      continue;
    }
    const message = issueMessage(entry);
    if (message !== undefined && !messages.includes(message)) {
      messages.push(message);
    }
  }
  return messages;
}

/**
 * Publishes a draft through `POST /invitations/:id/publish` (S7, S9). The API is the authority on
 * completeness, package fit, and the pinned version; when it refuses, its issues travel back as codes the
 * page turns into Spanish, and nothing is stored.
 */
export async function publishInvitation(api: InvitationsClient, form: FormData): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const published = await sendInvitationCall(() => api.publish(id));

  if (published.ok) {
    return invitationNoticeTarget(path, "published");
  }
  if (published.failure === "not-publishable") {
    return invitationIssuesTarget(path, publishIssueCodes(published.issues ?? []));
  }
  return invitationFailureTarget(path, published.failure);
}

/**
 * Returns a published invitation to draft through `POST /invitations/:id/unpublish`, so its public URL
 * stops answering (S7). Publishing it again later is the same publish command.
 */
export async function unpublishInvitation(api: InvitationsClient, form: FormData): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const unpublished = await sendInvitationCall(() => api.unpublish(id));

  return unpublished.ok
    ? invitationNoticeTarget(path, "unpublished")
    : invitationFailureTarget(path, unpublished.failure);
}
