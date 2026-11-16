import { formatMxn } from "../admin/catalog/price.ts";
import { publicInvitationPath } from "../public/invitation-page.ts";
import type {
  CreatorPackage,
  CreatorTemplate,
  InvitationFailure,
  InvitationResult,
  InvitationStatus,
  InvitationSummary,
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
  PUBLISH_ISSUE_COPY,
} from "./copy.ts";

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
 * age before anything is sent, and `parseContentForm` refuses it again on the server.
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

/** A full date as `input type="date"` submits it and as JSON Schema's `format: "date"` declares it. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A 24-hour time as `input type="time"` submits it, down to the minute. */
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

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

export type ContentFormParse = { ok: true; content: Record<string, unknown> } | { ok: false };

const INTEGER = /^-?\d+$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;

/** Whether the text is a real calendar day in the schema's `format: "date"` shape. */
function isCalendarDate(text: string): boolean {
  const match = ISO_DATE.exec(text);

  if (match === null) {
    return false;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Whether the control refuses the text on its own: a malformed date or time, or text longer than the
 * schema's `maxLength`. The browser applies the same rules from the input's attributes, so this is the
 * server's own check, and it refuses instead of trimming or clamping.
 */
function stringRefused(input: FieldInput, text: string): boolean {
  switch (input.kind) {
    case "date":
      return !isCalendarDate(text);
    case "time":
      return !TIME_OF_DAY.test(text);
    case "text":
    case "textarea":
    case "url":
      return input.maxLength !== undefined && [...text].length > input.maxLength;
    default:
      return false;
  }
}

/** Whether a number is outside the `minimum`/`maximum` the schema declares (S7, S11). */
function numberRefused(input: FieldInput, value: number): boolean {
  if (input.kind !== "number") {
    return false;
  }
  return (
    (input.min !== undefined && value < input.min) || (input.max !== undefined && value > input.max)
  );
}

/**
 * The content a submitted form asks to store. Only the fields of the pinned schema are read, so a
 * submitted key the schema does not declare is never sent (the API refuses one anyway). An empty input is
 * omitted, because a draft may stay partial (S7); an integer is converted here, because the API validates
 * an integer and a form sends text; a value the form cannot read, a number outside the schema's range, or
 * a malformed date or time refuses the whole submission instead of being dropped or clamped. A checkbox
 * is `true` when it was checked and `false` when it was not.
 */
export function parseContentForm(
  fields: readonly ContentField[],
  form: FormData,
): ContentFormParse {
  const content: Record<string, unknown> = {};

  for (const field of fields) {
    const submitted = form.get(field.name);

    if (submitted !== null && typeof submitted !== "string") {
      return { ok: false };
    }
    if (field.type === "boolean") {
      content[field.name] = submitted !== null;
      continue;
    }
    if (submitted === null) {
      continue;
    }

    const text = submitted.trim();
    if (text === "") {
      continue;
    }
    if (field.type === "string") {
      if (stringRefused(field.input, text)) {
        return { ok: false };
      }
      content[field.name] = text;
      continue;
    }

    const whole = field.type === "integer";
    if (!(whole ? INTEGER : NUMBER).test(text)) {
      return { ok: false };
    }
    const value = Number(text);
    if (!(whole ? Number.isSafeInteger(value) : Number.isFinite(value))) {
      return { ok: false };
    }
    if (numberRefused(field.input, value)) {
      return { ok: false };
    }
    content[field.name] = value;
  }

  return { ok: true, content };
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

export function statusLabel(status: InvitationStatus): string {
  return INVITATION_STATUS_LABELS[status];
}

/** «Faltan: Edad, Fecha.», or nothing when the draft has every required field (S7). */
export function missingFieldsMessage(names: readonly string[]): string | null {
  return names.length === 0 ? null : INVITATION_COPY.missingLabel(names.map(fieldLabel).join(", "));
}

/**
 * One row of "Mis invitaciones": what the list shows about an invitation, and where it links. A published
 * one also links to its public page, which is the only page a guest sees (S7).
 */
export interface InvitationRow {
  id: string;
  href: string;
  slug: string;
  statusLabel: string;
  /** `/i/<slug>` while the invitation is published; null while it is a draft or archived. */
  publicHref: string | null;
  createdOn: string;
}

export function invitationRows(items: readonly InvitationSummary[]): InvitationRow[] {
  return items.map((item) => ({
    id: item.id,
    href: INVITATION_PATHS.detail(item.id),
    slug: item.slug,
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
}

/** Each package to choose, with its price in force in its own currency (S6); a free one says so. */
export function packageChoices(packages: readonly CreatorPackage[]): ChoiceCard[] {
  return packages.map((stored) => ({
    value: stored.id,
    name: stored.name,
    meta:
      stored.currentPrice === null
        ? INVITATION_COPY.priceMissing
        : `${formatMxn(stored.currentPrice.amountMinor, stored.currentPrice.currency)} ${stored.currentPrice.currency}`,
    description: stored.description,
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
  /** The Spanish sentences of a refused publication, when the query names known issue codes (S7). */
  issues?: string[];
}

/** The messages a page shows for its query; an unknown or repeated value shows nothing (as in M3). */
export function invitationPageNotices(parameters: SearchParameters): InvitationPageNotices {
  const { notice, error } = parameters;
  const issues = error === "not-publishable" ? publishIssueMessages(parameters.issues) : [];

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
async function send<T>(call: () => Promise<InvitationResult<T>>): Promise<Outcome<T>> {
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
function failureTarget(path: string, failure: InvitationFailure | "unavailable"): string {
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

  return `${INVITATION_PATHS.create}?${parameters.toString()}`;
}

/** Creates a free draft and goes to it (S1, S6); a refusal returns to step 3 with the selection kept (S12). */
export async function createInvitation(api: InvitationsClient, form: FormData): Promise<string> {
  const templateVersionId = text(form, "templateVersionId");
  const packageId = text(form, "packageId");
  const choice = { templateVersionId, packageId };

  if (templateVersionId === undefined || packageId === undefined) {
    return failedCreateTarget(form, choice, "invalid-form");
  }

  const created = await send(() => api.create({ templateVersionId, packageId }));

  if (created.ok) {
    return invitationNoticeTarget(INVITATION_PATHS.detail(created.value.id), "created");
  }
  return created.failure === "signed-out"
    ? CUSTOMER_SIGN_IN_PATH
    : failedCreateTarget(form, choice, created.failure);
}

/**
 * Saves the draft's content through `PUT /invitations/:id/content` (S3, S7). The fields come from the
 * creator catalog again, on the server, so the browser never decides which keys or types are sent; when
 * the pinned version is no longer in the catalog, nothing is sent and the page keeps the stored content.
 */
export async function saveInvitationContent(
  api: InvitationsClient,
  form: FormData,
): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const read = await send(() => api.get(id));

  if (!read.ok) {
    return failureTarget(path, read.failure);
  }

  const catalog = await send(() => api.templates());

  if (!catalog.ok) {
    return failureTarget(path, catalog.failure);
  }

  const pinned = invitationFieldsFor(catalog.value, read.value.templateVersionId);

  if (pinned === undefined) {
    return invitationErrorTarget(path, "content-unavailable");
  }

  const parsed = parseContentForm(pinned.fields, form);

  if (!parsed.ok) {
    return invitationErrorTarget(path, "invalid-form");
  }

  const written = await send(() => api.replaceContent(id, parsed.content));

  return written.ok ? invitationNoticeTarget(path, "saved") : failureTarget(path, written.failure);
}

/** Archives a draft: it stays stored and becomes read-only (S7, A3). */
export async function archiveInvitation(api: InvitationsClient, form: FormData): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isInvitationId(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const path = INVITATION_PATHS.detail(id);
  const archived = await send(() => api.archive(id));

  return archived.ok
    ? invitationNoticeTarget(path, "archived")
    : failureTarget(path, archived.failure);
}

/**
 * The readiness issues the API answers for a publish it refused (M5 T5; S7, A1). The API's rule
 * (`apps/api/src/invitations/domain/publication-readiness.ts`) writes deterministic English sentences;
 * the web mirrors the three patterns it can act on and maps every other issue to one generic code, so no
 * English text ever reaches the customer and nothing is guessed about an issue it does not know.
 */
const REQUIRED_FIELD_ISSUE = /^content\.([A-Za-z0-9_]+) is required to publish$/;
const PACKAGE_FIT_ISSUE = "package does not include the template's required features";
const VERSION_RETIRED_ISSUE = "template version is no longer published";

/** The most issue codes one redirect carries, and the most sentences the page shows. */
export const MAX_PUBLISH_ISSUE_CODES = 8;
export const MAX_PUBLISH_ISSUES_SHOWN = 10;

/** `field:<property>`, or one of the three issues that are not about a field. */
const ISSUE_CODE = /^(?:field:[A-Za-z0-9_]{1,60}|package|version|other)$/;

const FIELD_CODE_PREFIX = "field:";

/**
 * Each raw issue as a small code the page can put in its query: `field:date` for a missing required field,
 * `package`, `version`, or `other` for anything this module does not recognize, deduplicated and bounded.
 */
export function publishIssueCodes(issues: readonly string[]): string[] {
  const codes: string[] = [];

  for (const issue of issues) {
    const name = REQUIRED_FIELD_ISSUE.exec(issue)?.[1];
    const code =
      name === undefined
        ? issue === PACKAGE_FIT_ISSUE
          ? "package"
          : issue === VERSION_RETIRED_ISSUE
            ? "version"
            : "other"
        : `${FIELD_CODE_PREFIX}${name}`;

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
  const published = await send(() => api.publish(id));

  if (published.ok) {
    return invitationNoticeTarget(path, "published");
  }
  if (published.failure === "not-publishable") {
    return invitationIssuesTarget(path, publishIssueCodes(published.issues ?? []));
  }
  return failureTarget(path, published.failure);
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
  const unpublished = await send(() => api.unpublish(id));

  return unpublished.ok
    ? invitationNoticeTarget(path, "unpublished")
    : failureTarget(path, unpublished.failure);
}
