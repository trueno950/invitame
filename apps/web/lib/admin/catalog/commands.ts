import type { AdminCatalogClient, CatalogResult } from "../../server/admin-catalog-client.ts";
import {
  isCatalogId,
  PACKAGE_STATUSES,
  type PackageStatus,
} from "../../server/admin-catalog-validators.ts";
import {
  CATALOG_PATHS,
  type CatalogErrorCode,
  type CatalogNoticeCode,
  type EntrySection,
} from "./copy.ts";
import { errorTarget, noticeTarget } from "./notices.ts";
import { parsePesos } from "./price.ts";

/**
 * The logic of the catalog server actions (M3 T8a; S1, S4, S9). Each command reads the submitted
 * form, calls the API client at most once, and answers the path to redirect to, always a 303 after
 * POST, with the outcome as a code in the query (`notices.ts`). The API validates every field and
 * authorizes the call; the only checks made here are those needed to build a request at all: a text
 * field is a string, an id is a UUID, a status is on the list, and a price is a whole number of
 * centavos (`price.ts`). A refused write changes nothing and returns to the form. The `"use server"`
 * files in `app/admin/catalogo` only pass `FormData` in and `redirect` out.
 */

export const SIGN_IN_PATH = "/admin/ingresar";

const NEW_SEGMENT: Record<EntrySection | "packages", string> = {
  categories: "nueva",
  features: "nueva",
  packages: "nuevo",
};

type Section = EntrySection | "packages";

const listPath = (section: Section): string => CATALOG_PATHS[section];
const newPath = (section: Section): string => `${CATALOG_PATHS[section]}/${NEW_SEGMENT[section]}`;
const editPath = (section: Section, id: string): string => `${CATALOG_PATHS[section]}/${id}`;

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
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
async function finish(
  send: () => Promise<CatalogResult<unknown>>,
  success: string,
  section: Section,
  formPath: string,
): Promise<string> {
  let result: CatalogResult<unknown>;

  try {
    result = await send();
  } catch {
    return errorTarget(formPath, "unavailable");
  }

  if (result.ok) {
    return success;
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

  if (key === undefined || name === undefined || note === undefined) {
    return invalid(newPath("packages"));
  }

  return finish(
    () => api.packages.create({ key, name, description: note }),
    created("packages"),
    "packages",
    newPath("packages"),
  );
}

function packageStatus(value: string | undefined): PackageStatus | undefined {
  return PACKAGE_STATUSES.find((status) => status === value);
}

/** Saves a package's `name`, `description`, and `status`. */
export async function updatePackage(api: AdminCatalogClient, form: FormData): Promise<string> {
  const id = text(form, "id");
  const name = text(form, "name")?.trim();
  const note = description(form);
  const status = packageStatus(text(form, "status"));

  if (id === undefined || !isCatalogId(id)) {
    return invalid(listPath("packages"), "not-found");
  }

  const path = editPath("packages", id);
  if (name === undefined || note === undefined || status === undefined) {
    return invalid(path);
  }

  return finish(
    () => api.packages.update(id, { name, description: note, status }),
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
