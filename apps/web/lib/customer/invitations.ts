import { formatMxn } from "../admin/catalog/price.ts";
import type {
  CreatorPackage,
  CreatorTemplate,
  InvitationFailure,
  InvitationResult,
  InvitationsClient,
  InvitationStatus,
  InvitationSummary,
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

/** Where a customer signs in; the customer pages share it with `/cuenta`. */
export const CUSTOMER_SIGN_IN_PATH = "/ingresar";

/** The primitive types a renderer schema may declare, and the only ones this form can edit. */
const FIELD_TYPES = ["string", "integer", "number", "boolean"] as const;
export type ContentFieldType = (typeof FIELD_TYPES)[number];

/** One editable property of the pinned version's schema, with its Spanish label. */
export interface ContentField {
  name: string;
  type: ContentFieldType;
  label: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isFieldType(value: unknown): value is ContentFieldType {
  return FIELD_TYPES.some((type) => type === value);
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

    if (isFieldType(type)) {
      fields.push({ name, type, label: fieldLabel(name) });
    }
  }
  return fields;
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

/**
 * The content a submitted form asks to store. Only the fields of the pinned schema are read, so a
 * submitted key the schema does not declare is never sent (the API refuses one anyway). An empty input is
 * omitted, because a draft may stay partial (S7); an integer is converted here, because the API validates
 * an integer and a form sends text; a value this form cannot read refuses the whole submission instead of
 * being dropped silently. A checkbox is `true` when it was checked and `false` when it was not.
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

/** One row of "Mis invitaciones": what the list shows about a draft, and where it links. */
export interface InvitationRow {
  id: string;
  href: string;
  slug: string;
  statusLabel: string;
  createdOn: string;
}

export function invitationRows(items: readonly InvitationSummary[]): InvitationRow[] {
  return items.map((item) => ({
    id: item.id,
    href: INVITATION_PATHS.detail(item.id),
    slug: item.slug,
    statusLabel: statusLabel(item.status),
    createdOn: formatDate(item.createdAt),
  }));
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Each template to start from, named with its category; the value is the version to pin. */
export function templateOptions(templates: readonly CreatorTemplate[]): SelectOption[] {
  return templates.map((template) => ({
    value: template.publishedVersion.id,
    label: `${template.name} (${template.category.name})`,
  }));
}

/** Each package to choose, with its price in force (S6); a free package shows `sin precio`. */
export function packageOptions(packages: readonly CreatorPackage[]): SelectOption[] {
  return packages.map((stored) => ({
    value: stored.id,
    label: `${stored.name}: ${
      stored.currentPrice === null
        ? INVITATION_COPY.priceMissing
        : formatMxn(stored.currentPrice.amountMinor, stored.currentPrice.currency)
    }`,
  }));
}

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export function invitationNoticeTarget(path: string, code: InvitationNoticeCode): string {
  return `${path}?notice=${code}`;
}

export function invitationErrorTarget(path: string, code: InvitationErrorCode): string {
  return `${path}?error=${code}`;
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
}

/** The messages a page shows for its query; an unknown or repeated value shows nothing (as in M3). */
export function invitationPageNotices(parameters: SearchParameters): InvitationPageNotices {
  const { notice, error } = parameters;
  return {
    ...(lookup(INVITATION_NOTICE_COPY, notice) ? { notice: INVITATION_NOTICE_COPY[notice] } : {}),
    ...(lookup(INVITATION_ERROR_COPY, error) ? { error: INVITATION_ERROR_COPY[error] } : {}),
  };
}

/** A failed call the client classified, or any failure it could not classify. */
type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; failure: InvitationFailure | "unavailable" };

/** Runs one call, turning a thrown failure (already logged by the server wrapper) into `unavailable`. */
async function send<T>(call: () => Promise<InvitationResult<T>>): Promise<Outcome<T>> {
  try {
    const result = await call();
    return result.ok ? { ok: true, value: result.value } : { ok: false, failure: result.failure };
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

/** Creates a free draft and goes to it (S1, S6). */
export async function createInvitation(api: InvitationsClient, form: FormData): Promise<string> {
  const templateVersionId = text(form, "templateVersionId");
  const packageId = text(form, "packageId");

  if (templateVersionId === undefined || packageId === undefined) {
    return invitationErrorTarget(INVITATION_PATHS.create, "invalid-form");
  }

  const created = await send(() => api.create({ templateVersionId, packageId }));

  return created.ok
    ? invitationNoticeTarget(INVITATION_PATHS.detail(created.value.id), "created")
    : failureTarget(INVITATION_PATHS.create, created.failure);
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
