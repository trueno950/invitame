import type { AdminCatalogClient, CatalogResult } from "../../server/admin-catalog-client.ts";
import {
  DEFAULT_PACKAGE_DURATION_DAYS,
  isCatalogId,
  MAX_PACKAGE_DURATION_DAYS,
  MIN_PACKAGE_DURATION_DAYS,
  PACKAGE_STATUSES,
  type PackageStatus,
  TEMPLATE_STATUSES,
  type TemplateStatus,
} from "../../server/admin-catalog-validators.ts";
import {
  CATALOG_PATHS,
  type CatalogErrorCode,
  type CatalogNoticeCode,
  type EntrySection,
  VERSION_COPY,
} from "./copy.ts";
import { errorMessage, errorTarget, noticeTarget } from "./notices.ts";
import { parsePesos } from "./price.ts";
import {
  parseSnapshotJson,
  type SnapshotJsonFailure,
  type VersionFormState,
  type VersionFormValues,
} from "./versions.ts";

/**
 * The logic of the catalog server actions (M3 T8a and T8b; S1, S4, S5, S8, S9). Each command reads the submitted
 * form, calls the API client at most once, and answers the path to redirect to, always a 303 after
 * POST, with the outcome as a code in the query (`notices.ts`). The API validates every field and
 * authorizes the call; the only checks made here are those needed to build a request at all: a text
 * field is a string, an id is a UUID, a status is on the list, and a price is a whole number of
 * centavos (`price.ts`). A refused write changes nothing and returns to the form. The `"use server"`
 * files in `app/admin/catalogo` only pass `FormData` in and `redirect` out.
 */

export const SIGN_IN_PATH = "/admin/ingresar";

const NEW_SEGMENT: Record<EntrySection | "packages" | "templates", string> = {
  categories: "nueva",
  features: "nueva",
  packages: "nuevo",
  templates: "nueva",
};

type Section = EntrySection | "packages" | "templates";

const listPath = (section: Section): string => CATALOG_PATHS[section];
const newPath = (section: Section): string => `${CATALOG_PATHS[section]}/${NEW_SEGMENT[section]}`;
const editPath = (section: Section, id: string): string => `${CATALOG_PATHS[section]}/${id}`;

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * The duration field of a package form (S1, T1): a whole number of days from 1 to 3650, the bounds the API states.
 * A form that does not carry the field at all keeps the behavior it had before the field existed — the basic month on
 * creation, no change on a save — while a value that is present and malformed is refused before any request.
 */
type DurationField =
  | { readonly kind: "absent" }
  | { readonly kind: "days"; readonly value: number }
  | { readonly kind: "invalid" };

function durationDays(form: FormData): DurationField {
  const value = text(form, "durationDays")?.trim();

  if (value === undefined || value === "") {
    return { kind: "absent" };
  }
  if (!/^\d{1,4}$/.test(value)) {
    return { kind: "invalid" };
  }
  const days = Number(value);

  return days >= MIN_PACKAGE_DURATION_DAYS && days <= MAX_PACKAGE_DURATION_DAYS
    ? { kind: "days", value: days }
    : { kind: "invalid" };
}

/** The description field: blank is no description (`null`), and a non-text value is `undefined`. */
function description(form: FormData): string | null | undefined {
  const value = form.get("description") ?? "";

  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim() === "" ? null : value.trim();
}

/**
 * Runs the API call and turns its outcome into the redirect target. `signed-out` goes to sign-in, a
 * missing record to the list, and every other refusal back to `formPath` with its code. A thrown error
 * (an unreachable or unexpected API) is already logged by the server wrapper and shown as unavailable.
 */
async function finish<T>(
  send: () => Promise<CatalogResult<T>>,
  success: string | ((value: T) => string),
  section: Section,
  formPath: string,
): Promise<string> {
  let result: CatalogResult<T>;

  try {
    result = await send();
  } catch {
    return errorTarget(formPath, "unavailable");
  }

  if (result.ok) {
    return typeof success === "string" ? success : success(result.value);
  }
  if (result.failure === "signed-out") {
    return SIGN_IN_PATH;
  }
  if (result.failure === "not-found") {
    return errorTarget(listPath(section), "not-found");
  }
  return errorTarget(formPath, result.failure);
}

function invalid(path: string, code: CatalogErrorCode = "invalid-form"): string {
  return errorTarget(path, code);
}

function created(section: Section): string {
  return noticeTarget(listPath(section), "created");
}

function saved(path: string, code: CatalogNoticeCode = "saved"): string {
  return noticeTarget(path, code);
}

/** Creates a category or a feature from `key`, `name`, and `description`. */
export async function createEntry(
  api: AdminCatalogClient,
  section: EntrySection,
  form: FormData,
): Promise<string> {
  const key = text(form, "key")?.trim();
  const name = text(form, "name")?.trim();
  const note = description(form);

  if (key === undefined || name === undefined || note === undefined) {
    return invalid(newPath(section));
  }

  return finish(
    () => api[section].create({ key, name, description: note }),
    created(section),
    section,
    newPath(section),
  );
}

/** Saves a category's or a feature's `name`, `description`, and `isActive` (a checked box). */
export async function updateEntry(
  api: AdminCatalogClient,
  section: EntrySection,
  form: FormData,
): Promise<string> {
  const id = text(form, "id");
  const name = text(form, "name")?.trim();
  const note = description(form);

  if (id === undefined || !isCatalogId(id)) {
    return invalid(listPath(section), "not-found");
  }

  const path = editPath(section, id);
  if (name === undefined || note === undefined) {
    return invalid(path);
  }

  return finish(
    () =>
      api[section].update(id, {
        name,
        description: note,
        isActive: text(form, "isActive") === "true",
      }),
    saved(path),
    section,
    path,
  );
}

export async function createPackage(api: AdminCatalogClient, form: FormData): Promise<string> {
  const key = text(form, "key")?.trim();
  const name = text(form, "name")?.trim();
  const note = description(form);
  const duration = durationDays(form);

  if (
    key === undefined ||
    name === undefined ||
    note === undefined ||
    duration.kind === "invalid"
  ) {
    return invalid(newPath("packages"));
  }

  return finish(
    () =>
      api.packages.create({
        key,
        name,
        description: note,
        // A form that names no duration keeps the basic month the API defaults to (S1, T1).
        durationDays: duration.kind === "days" ? duration.value : DEFAULT_PACKAGE_DURATION_DAYS,
      }),
    created("packages"),
    "packages",
    newPath("packages"),
  );
}

function packageStatus(value: string | undefined): PackageStatus | undefined {
  return PACKAGE_STATUSES.find((status) => status === value);
}

/** Saves a package's `name`, `description`, `status`, and `durationDays`. */
export async function updatePackage(api: AdminCatalogClient, form: FormData): Promise<string> {
  const id = text(form, "id");
  const name = text(form, "name")?.trim();
  const note = description(form);
  const status = packageStatus(text(form, "status"));
  const duration = durationDays(form);

  if (id === undefined || !isCatalogId(id)) {
    return invalid(listPath("packages"), "not-found");
  }

  const path = editPath("packages", id);
  if (
    name === undefined ||
    note === undefined ||
    status === undefined ||
    duration.kind === "invalid"
  ) {
    return invalid(path);
  }

  return finish(
    () =>
      api.packages.update(id, {
        name,
        description: note,
        status,
        // A form that names no duration changes nothing; the stored one stays as it is (S1, T1).
        ...(duration.kind === "days" ? { durationDays: duration.value } : {}),
      }),
    saved(path),
    "packages",
    path,
  );
}

/** Replaces the package's included features with the checked `featureId` values (possibly none). */
export async function setPackageFeatures(api: AdminCatalogClient, form: FormData): Promise<string> {
  const id = text(form, "id");

  if (id === undefined || !isCatalogId(id)) {
    return invalid(listPath("packages"), "not-found");
  }

  const path = editPath("packages", id);
  const featureIds = new Set<string>();
  for (const value of form.getAll("featureId")) {
    if (typeof value !== "string" || !isCatalogId(value)) {
      return invalid(path);
    }
    featureIds.add(value.toLowerCase());
  }

  return finish(
    () => api.packages.setFeatures(id, [...featureIds]),
    saved(path, "features-saved"),
    "packages",
    path,
  );
}

/** Sets the package's MXN price from `price`, typed in pesos (`parsePesos`). */
export async function setPackagePrice(api: AdminCatalogClient, form: FormData): Promise<string> {
  const id = text(form, "id");
  const price = text(form, "price");

  if (id === undefined || !isCatalogId(id)) {
    return invalid(listPath("packages"), "not-found");
  }

  const path = editPath("packages", id);
  if (price === undefined) {
    return invalid(path);
  }

  const parsed = parsePesos(price);
  if (!parsed.ok) {
    return invalid(path, `price-${parsed.reason}`);
  }

  return finish(
    () => api.packages.setPrice(id, parsed.amountMinor),
    saved(path, "price-saved"),
    "packages",
    path,
  );
}

function templateStatus(value: string | undefined): TemplateStatus | undefined {
  return TEMPLATE_STATUSES.find((status) => status === value);
}

/**
 * Creates a template from `key`, `name`, `description`, and the chosen `categoryId`, then opens its edit
 * page, where its versions are created.
 */
export async function createTemplate(api: AdminCatalogClient, form: FormData): Promise<string> {
  const key = text(form, "key")?.trim();
  const name = text(form, "name")?.trim();
  const note = description(form);
  const categoryId = text(form, "categoryId");

  if (
    key === undefined ||
    name === undefined ||
    note === undefined ||
    categoryId === undefined ||
    !isCatalogId(categoryId)
  ) {
    return invalid(newPath("templates"));
  }

  return finish(
    () => api.templates.create({ key, name, description: note, categoryId }),
    (stored) => saved(editPath("templates", stored.id), "created"),
    "templates",
    newPath("templates"),
  );
}

/** Saves a template's `name`, `description`, `categoryId`, and `status`. */
export async function updateTemplate(api: AdminCatalogClient, form: FormData): Promise<string> {
  const id = text(form, "id");
  const name = text(form, "name")?.trim();
  const note = description(form);
  const categoryId = text(form, "categoryId");
  const status = templateStatus(text(form, "status"));

  if (id === undefined || !isCatalogId(id)) {
    return invalid(listPath("templates"), "not-found");
  }

  const path = editPath("templates", id);
  if (
    name === undefined ||
    note === undefined ||
    categoryId === undefined ||
    !isCatalogId(categoryId) ||
    status === undefined
  ) {
    return invalid(path);
  }

  return finish(
    () => api.templates.update(id, { name, description: note, categoryId, status }),
    saved(path),
    "templates",
    path,
  );
}

/** The two version transitions, which take the same two ids and differ in the call and the notice. */
async function moveVersion(
  api: AdminCatalogClient,
  form: FormData,
  transition: "publishVersion" | "retireVersion",
  notice: CatalogNoticeCode,
): Promise<string> {
  const id = text(form, "id");
  const versionId = text(form, "versionId");

  if (id === undefined || !isCatalogId(id)) {
    return invalid(listPath("templates"), "not-found");
  }

  const path = editPath("templates", id);
  if (versionId === undefined || !isCatalogId(versionId)) {
    return invalid(path);
  }

  return finish(
    () => api.templates[transition](id, versionId),
    saved(path, notice),
    "templates",
    path,
  );
}

/** Publishes the DRAFT version `versionId`; the API retires the one published before (S5). */
export function publishTemplateVersion(api: AdminCatalogClient, form: FormData): Promise<string> {
  return moveVersion(api, form, "publishVersion", "version-published");
}

/** Retires the PUBLISHED version `versionId` of a template that is not itself published. */
export function retireTemplateVersion(api: AdminCatalogClient, form: FormData): Promise<string> {
  return moveVersion(api, form, "retireVersion", "version-retired");
}

export type CreateVersionOutcome =
  | { kind: "redirect"; target: string }
  | { kind: "state"; state: VersionFormState & { status: "error" } };

const JSON_MESSAGE: Record<SnapshotJsonFailure, (subject: string) => string> = {
  empty: VERSION_COPY.jsonEmpty,
  syntax: VERSION_COPY.jsonSyntax,
  "too-large": VERSION_COPY.jsonTooLarge,
};

/**
 * Appends a DRAFT version from `componentKey` and the `schema` and `configuration` typed as JSON (S8:
 * a version is never edited in place). Text that is not valid JSON, or is over the size bound, is
 * refused here without calling the API. A refusal stays on the form as state and not as a redirect:
 * the API's `issues` (bounded by the client) and the typed JSON must not travel in a URL. Success
 * redirects to the template page (303 after POST).
 */
export async function createTemplateVersion(
  api: AdminCatalogClient,
  form: FormData,
): Promise<CreateVersionOutcome> {
  const id = text(form, "id");

  if (id === undefined || !isCatalogId(id)) {
    return { kind: "redirect", target: invalid(listPath("templates"), "not-found") };
  }

  const path = editPath("templates", id);
  const componentKey = text(form, "componentKey");
  const schema = text(form, "schema");
  const configuration = text(form, "configuration");

  if (componentKey === undefined || schema === undefined || configuration === undefined) {
    return { kind: "redirect", target: invalid(path) };
  }

  const values: VersionFormValues = { componentKey, schema, configuration };
  const refused = (message: string, issues: readonly string[] = []): CreateVersionOutcome => ({
    kind: "state",
    state: { status: "error", message, issues, values },
  });

  const schemaJson = parseSnapshotJson(schema);
  if (!schemaJson.ok) {
    return refused(JSON_MESSAGE[schemaJson.reason](VERSION_COPY.schemaName));
  }
  const configurationJson = parseSnapshotJson(configuration);
  if (!configurationJson.ok) {
    return refused(JSON_MESSAGE[configurationJson.reason](VERSION_COPY.configurationName));
  }

  let result: CatalogResult<unknown>;
  try {
    result = await api.templates.createVersion(id, {
      componentKey,
      schema: schemaJson.value,
      configuration: configurationJson.value,
    });
  } catch {
    return refused(errorMessage("unavailable"));
  }

  if (result.ok) {
    return { kind: "redirect", target: saved(path, "version-created") };
  }

  switch (result.failure) {
    case "signed-out":
      return { kind: "redirect", target: SIGN_IN_PATH };
    case "not-found":
      return { kind: "redirect", target: invalid(listPath("templates"), "not-found") };
    case "contract-invalid":
      return refused(VERSION_COPY.contractInvalid, result.issues ?? []);
    case "validation":
      return refused(VERSION_COPY.validation);
    default:
      return refused(errorMessage(result.failure));
  }
}
