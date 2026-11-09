import "server-only";

import { cookies } from "next/headers";

import { type AdminCatalogClient, createAdminCatalogClient } from "./admin-catalog-client.ts";
import { logAdminCatalogFailure } from "./admin-catalog-log.ts";
import { getWebServerConfig } from "./config.ts";

/**
 * The administrator catalog API for server components and server actions (M3 T8a and T8b; S1, S9, L8). One
 * stateless client per server process, created on first use; each call reads the current request's
 * cookies and keeps nothing. `server-only` makes a client-component import fail the build, so the
 * cookie and the proxy secret never reach a browser bundle. An unexpected failure (a thrown
 * `ApiClientError`) is logged once by its classes (`admin-catalog-log.ts`) and rethrown.
 */
let client: AdminCatalogClient | undefined;

function catalogClient(): AdminCatalogClient {
  client ??= createAdminCatalogClient({ config: getWebServerConfig() }, async () =>
    (await cookies()).toString(),
  );
  return client;
}

async function logged<T>(call: (client: AdminCatalogClient) => Promise<T>): Promise<T> {
  try {
    return await call(catalogClient());
  } catch (error) {
    logAdminCatalogFailure(error);
    throw error;
  }
}

type Params<K extends keyof AdminCatalogClient["packages"]> = Parameters<
  AdminCatalogClient["packages"][K]
>;
type TemplateParams<K extends keyof AdminCatalogClient["templates"]> = Parameters<
  AdminCatalogClient["templates"][K]
>;
type EntryParams<K extends keyof AdminCatalogClient["categories"]> = Parameters<
  AdminCatalogClient["categories"][K]
>;

const entries = (kind: "categories" | "features") => ({
  list: () => logged((api) => api[kind].list()),
  create: (...args: EntryParams<"create">) => logged((api) => api[kind].create(...args)),
  update: (...args: EntryParams<"update">) => logged((api) => api[kind].update(...args)),
});

/** Has the shape of `AdminCatalogClient`, so the logic in `lib/admin/catalog` accepts either. */
export const adminCatalog = {
  categories: entries("categories"),
  features: entries("features"),
  packages: {
    list: () => logged((api) => api.packages.list()),
    create: (...args: Params<"create">) => logged((api) => api.packages.create(...args)),
    update: (...args: Params<"update">) => logged((api) => api.packages.update(...args)),
    setFeatures: (...args: Params<"setFeatures">) =>
      logged((api) => api.packages.setFeatures(...args)),
    setPrice: (...args: Params<"setPrice">) => logged((api) => api.packages.setPrice(...args)),
    priceHistory: (...args: Params<"priceHistory">) =>
      logged((api) => api.packages.priceHistory(...args)),
  },
  templates: {
    list: () => logged((api) => api.templates.list()),
    create: (...args: TemplateParams<"create">) => logged((api) => api.templates.create(...args)),
    update: (...args: TemplateParams<"update">) => logged((api) => api.templates.update(...args)),
    versions: (...args: TemplateParams<"versions">) =>
      logged((api) => api.templates.versions(...args)),
    createVersion: (...args: TemplateParams<"createVersion">) =>
      logged((api) => api.templates.createVersion(...args)),
    publishVersion: (...args: TemplateParams<"publishVersion">) =>
      logged((api) => api.templates.publishVersion(...args)),
    retireVersion: (...args: TemplateParams<"retireVersion">) =>
      logged((api) => api.templates.retireVersion(...args)),
  },
  renderers: {
    list: () => logged((api) => api.renderers.list()),
  },
};
