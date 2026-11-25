import {
  boundContractIssues,
  type CatalogEntry,
  type CatalogPackage,
  type CatalogPriceHistoryEntry,
  type CatalogRenderer,
  type CatalogTemplate,
  type CatalogTemplateVersion,
  isCatalogId,
  type PackageStatus,
  parseCatalogEntries,
  parseCatalogEntry,
  parseCatalogPackage,
  parseCatalogPackages,
  parseCatalogRenderers,
  parseCatalogTemplate,
  parseCatalogTemplates,
  parseCatalogTemplateVersion,
  parseCatalogTemplateVersions,
  parsePriceHistory,
  type TemplateStatus,
} from "./admin-catalog-validators.ts";
import {
  ApiClientError,
  type ApiClientOptions,
  sendApiRequest,
  sessionCookieHeader,
} from "./api-client.ts";

/**
 * The web server's client of the administrator catalog API (M3 T8a and T8b; S1, S5, S6, S9, L8). CORS lists no `PATCH`
 * or `PUT`, so the browser never calls these endpoints: server components and server actions call them
 * here with the session cookie and the shared secret, like `api-client.ts`, which supplies the request
 * primitive. The API authorizes every call; this client only maps its answers.
 *
 * Outcomes the pages handle come back as a `CatalogFailure` value. Anything else fails closed with an
 * `ApiClientError` that never carries a response body: a 5xx or an unreachable API is `unavailable`, an
 * unexpected status or code is `rejected`, and a success whose body fails its validator is
 * `invalid-response`. Neither the cookie nor a body is logged or kept.
 */

/**
 * - `signed-out`: 401, or no session cookie, so nothing was sent;
 * - `forbidden`: 403, the stored role is not ADMIN;
 * - `not-found`: 404, or an id that is not a UUID, so nothing was sent;
 * - `validation`: 400 without a known code, the API refused a field;
 * - `feature-not-found`: `CATALOG_FEATURE_NOT_FOUND`, a listed feature does not exist;
 * - `key-taken`: 409 `CATALOG_KEY_TAKEN`;
 * - `concurrent-update`: 409 `CATALOG_CONCURRENT_UPDATE`;
 * - `category-not-found`: 400 `CATALOG_CATEGORY_NOT_FOUND`, the chosen category does not exist;
 * - `template-not-publishable`: 409 `CATALOG_TEMPLATE_NOT_PUBLISHABLE`, the template has no published
 *   version to be PUBLISHED, or is PUBLISHED while its version is retired;
 * - `transition-not-allowed`: 409 `CATALOG_VERSION_TRANSITION_NOT_ALLOWED`;
 * - `contract-invalid`: 400 or 409 `CATALOG_RENDERER_CONTRACT_INVALID`; the result also carries the
 *   API's `issues`, bounded (`boundContractIssues`).
 */
export type CatalogFailure =
  | "signed-out"
  | "forbidden"
  | "not-found"
  | "validation"
  | "feature-not-found"
  | "key-taken"
  | "concurrent-update"
  | "category-not-found"
  | "template-not-publishable"
  | "transition-not-allowed"
  | "contract-invalid";

export type CatalogResult<T> =
  | { ok: true; value: T }
  | { ok: false; failure: CatalogFailure; issues?: readonly string[] };

export interface CatalogEntryCreate {
  key: string;
  name: string;
  description: string | null;
}

/** The body of `POST /admin/catalog/packages`: the entry fields plus the package's own duration (S1, T1). */
export interface CatalogPackageCreate extends CatalogEntryCreate {
  durationDays: number;
}

export interface CatalogEntryUpdate {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface CatalogPackageUpdate {
  name?: string;
  description?: string | null;
  status?: PackageStatus;
  /** The package's lifetime in days (S1, T1), already validated against the boundaries the API states. */
  durationDays?: number;
}

export interface CatalogTemplateCreate {
  key: string;
  name: string;
  description: string | null;
  categoryId: string;
}

export interface CatalogTemplateUpdate {
  name?: string;
  description?: string | null;
  categoryId?: string;
  status?: TemplateStatus;
}

/** The snapshot of a new version: the renderer key and the two parsed JSON values. */
export interface CatalogVersionCreate {
  componentKey: string;
  schema: unknown;
  configuration: unknown;
}

export type CatalogEntryKind = "categories" | "features";

const CODE_FAILURES: Record<string, CatalogFailure> = {
  CATALOG_KEY_TAKEN: "key-taken",
  CATALOG_CONCURRENT_UPDATE: "concurrent-update",
  CATALOG_FEATURE_NOT_FOUND: "feature-not-found",
  CATALOG_CATEGORY_NOT_FOUND: "category-not-found",
  CATALOG_TEMPLATE_NOT_PUBLISHABLE: "template-not-publishable",
  CATALOG_VERSION_TRANSITION_NOT_ALLOWED: "transition-not-allowed",
  CATALOG_RENDERER_CONTRACT_INVALID: "contract-invalid",
};

const NOT_FOUND: CatalogResult<never> = { ok: false, failure: "not-found" };
const SIGNED_OUT: CatalogResult<never> = { ok: false, failure: "signed-out" };

/**
 * The status line of a failure body is never kept: only a `code` from the fixed set is read, and, for
 * a contract violation, the bounded `issues`.
 */
function failureOf(text: string | undefined): CatalogResult<never> | undefined {
  try {
    const body = JSON.parse(text ?? "") as { code?: unknown; issues?: unknown } | null;
    const code = body?.code;
    if (typeof code !== "string" || !Object.hasOwn(CODE_FAILURES, code)) {
      return undefined;
    }

    const failure = CODE_FAILURES[code] as CatalogFailure;
    return failure === "contract-invalid"
      ? { ok: false, failure, issues: boundContractIssues(body?.issues) }
      : { ok: false, failure };
  } catch {
    return undefined;
  }
}

const readsBody = (status: number): boolean =>
  (status >= 200 && status < 300) || status === 400 || status === 409;

/**
 * `readCookieHeader` supplies the current request's `Cookie` header at each call; the client keeps
 * nothing between calls. Only Better Auth's cookies are forwarded (`sessionCookieHeader`).
 */
export function createAdminCatalogClient(
  options: ApiClientOptions,
  readCookieHeader: () => Promise<string | null | undefined>,
) {
  async function call<T>(
    method: "GET" | "POST" | "PATCH" | "PUT",
    path: string,
    body: unknown,
    parse: (value: unknown) => T | undefined,
  ): Promise<CatalogResult<T>> {
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
    if (status === 403) {
      return { ok: false, failure: "forbidden" };
    }
    if (status === 404) {
      return NOT_FOUND;
    }
    if (status === 400 || status === 409) {
      const failure =
        failureOf(text) ??
        (status === 400 ? { ok: false, failure: "validation" as const } : undefined);
      if (failure !== undefined) {
        return failure;
      }
    }

    throw new ApiClientError(status >= 500 ? "unavailable" : "rejected", status);
  }

  /** The path of one record; an id that is not a UUID names nothing, so no request is made. */
  function recordPath(base: string, id: string, suffix = ""): string | undefined {
    return isCatalogId(id) ? `${base}/${id}${suffix}` : undefined;
  }

  /** The path of one version of a template; both ids must be UUIDs, or no request is made. */
  function versionPath(id: string, versionId: string, action: string): string | undefined {
    return isCatalogId(id) && isCatalogId(versionId)
      ? `${templates}/${id}/versions/${versionId}${action}`
      : undefined;
  }

  async function onRecord<T>(
    path: string | undefined,
    send: (path: string) => Promise<CatalogResult<T>>,
  ): Promise<CatalogResult<T>> {
    return path === undefined ? NOT_FOUND : send(path);
  }

  const entries = (kind: CatalogEntryKind) => {
    const base = `/admin/catalog/${kind}`;
    return {
      list: (): Promise<CatalogResult<CatalogEntry[]>> =>
        call("GET", base, undefined, parseCatalogEntries),
      create: (input: CatalogEntryCreate): Promise<CatalogResult<CatalogEntry>> =>
        call(
          "POST",
          base,
          { key: input.key, name: input.name, description: input.description },
          parseCatalogEntry,
        ),
      update: (id: string, input: CatalogEntryUpdate): Promise<CatalogResult<CatalogEntry>> =>
        onRecord(recordPath(base, id), (path) =>
          call("PATCH", path, { ...input }, parseCatalogEntry),
        ),
    };
  };

  const packages = "/admin/catalog/packages";
  const templates = "/admin/catalog/templates";

  return {
    categories: entries("categories"),
    features: entries("features"),
    packages: {
      list: (): Promise<CatalogResult<CatalogPackage[]>> =>
        call("GET", packages, undefined, parseCatalogPackages),
      create: (input: CatalogPackageCreate): Promise<CatalogResult<CatalogPackage>> =>
        call(
          "POST",
          packages,
          { key: input.key, name: input.name, description: input.description },
          parseCatalogPackage,
        ),
      update: (id: string, input: CatalogPackageUpdate): Promise<CatalogResult<CatalogPackage>> =>
        onRecord(recordPath(packages, id), (path) =>
          call("PATCH", path, { ...input }, parseCatalogPackage),
        ),
      /** Replaces the complete list of included features. */
      setFeatures: (
        id: string,
        featureIds: readonly string[],
      ): Promise<CatalogResult<CatalogPackage>> =>
        onRecord(recordPath(packages, id, "/features"), (path) =>
          call("PUT", path, { featureIds: [...featureIds] }, parseCatalogPackage),
        ),
      /** Replaces the current MXN price; the previous one moves to the history. */
      setPrice: (id: string, amountMinor: number): Promise<CatalogResult<CatalogPackage>> =>
        onRecord(recordPath(packages, id, "/price"), (path) =>
          call("PUT", path, { currency: "MXN", amountMinor }, parseCatalogPackage),
        ),
      priceHistory: (id: string): Promise<CatalogResult<CatalogPriceHistoryEntry[]>> =>
        onRecord(recordPath(packages, id, "/prices"), (path) =>
          call("GET", path, undefined, parsePriceHistory),
        ),
    },
    templates: {
      list: (): Promise<CatalogResult<CatalogTemplate[]>> =>
        call("GET", templates, undefined, parseCatalogTemplates),
      create: (input: CatalogTemplateCreate): Promise<CatalogResult<CatalogTemplate>> =>
        call(
          "POST",
          templates,
          {
            key: input.key,
            name: input.name,
            description: input.description,
            categoryId: input.categoryId,
          },
          parseCatalogTemplate,
        ),
      update: (id: string, input: CatalogTemplateUpdate): Promise<CatalogResult<CatalogTemplate>> =>
        onRecord(recordPath(templates, id), (path) =>
          call("PATCH", path, { ...input }, parseCatalogTemplate),
        ),
      /** The versions of a template, newest first. */
      versions: (id: string): Promise<CatalogResult<CatalogTemplateVersion[]>> =>
        onRecord(recordPath(templates, id, "/versions"), (path) =>
          call("GET", path, undefined, parseCatalogTemplateVersions),
        ),
      /** Appends a DRAFT version; a version is never edited in place (S8). */
      createVersion: (
        id: string,
        input: CatalogVersionCreate,
      ): Promise<CatalogResult<CatalogTemplateVersion>> =>
        onRecord(recordPath(templates, id, "/versions"), (path) =>
          call(
            "POST",
            path,
            {
              componentKey: input.componentKey,
              schema: input.schema,
              configuration: input.configuration,
            },
            parseCatalogTemplateVersion,
          ),
        ),
      /** Publishes a DRAFT version; the API retires the previously published one (S5). */
      publishVersion: (
        id: string,
        versionId: string,
      ): Promise<CatalogResult<CatalogTemplateVersion>> =>
        onRecord(versionPath(id, versionId, "/publish"), (path) =>
          call("POST", path, undefined, parseCatalogTemplateVersion),
        ),
      retireVersion: (
        id: string,
        versionId: string,
      ): Promise<CatalogResult<CatalogTemplateVersion>> =>
        onRecord(versionPath(id, versionId, "/retire"), (path) =>
          call("POST", path, undefined, parseCatalogTemplateVersion),
        ),
    },
    /** The renderer allow-list a version may name. */
    renderers: {
      list: (): Promise<CatalogResult<CatalogRenderer[]>> =>
        call("GET", "/admin/catalog/renderers", undefined, parseCatalogRenderers),
    },
  };
}

export type AdminCatalogClient = ReturnType<typeof createAdminCatalogClient>;
