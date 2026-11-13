import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { createApp } from "../../../app.setup";
import { AccessControlModule } from "../../../auth/access-control/access-control.module";
import { createAuth } from "../../../auth/auth.factory";
import { BackgroundTasks } from "../../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../../config/config.module";
import { EmailDeliveryService } from "../../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../../email/infrastructure/system-email-delivery-runtime";
import {
  CATALOG_PUBLIC_READER,
  type CatalogPackageEntitlements,
  type CatalogPublicReader,
  type CreatorPackageSummary,
  type CreatorTemplateSummary,
  type PublishedTemplateVersion,
  type StoredVersionSchema,
} from "../../application/public/catalog-public-reader";
import { CreatorCatalogController } from "./creator-catalog.controller";

// The creator catalog read (M4 T4; S8, A5) through the shared createApp boundary, the project-owned guard, and
// Better Auth on the in-memory adapter. The catalog contract is an in-memory fake here, so the suite needs no
// database; the SQL that selects the rows is proved in `prisma-catalog-public-reader.db-spec.ts`. What this suite
// owns is the HTTP contract: a route without `@Public()` answers 401 before any read, a signed-in customer (not
// only an administrator) reads the catalog, and only published templates with a published version and active
// packages are listed, in the documented shape.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const TEMPLATES_PATH = "/catalog/templates";
const PACKAGES_PATH = "/catalog/packages";

type Row = Record<string, unknown>;

interface TemplateRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  category: { key: string; name: string };
  versions: Array<{
    id: string;
    version: number;
    status: "DRAFT" | "PUBLISHED" | "RETIRED";
    componentKey: string;
    schema: unknown;
    configuration?: unknown;
  }>;
}

interface PackageRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  featureKeys: Array<{ key: string; included: boolean }>;
  /** The prices in force, one per currency, ordered by currency. */
  currentPrices: Array<{ currency: string; amountMinor: number }>;
}

/** The renderer keys the in-code registry knows; a published version with another key cannot be rendered. */
const KNOWN_RENDERER_KEYS = ["birthday-poster-01", "wedding-story-01", "birthday-map-01"];

/**
 * The catalog's public contract in memory. The two `list` methods mirror the queries of
 * `PrismaCatalogPublicReader`: a template is listed only while it and one of its versions are PUBLISHED and its
 * renderer is registered, a package only while it is ACTIVE, and both are ordered by key.
 */
class MemoryCatalogPublicReader implements CatalogPublicReader {
  constructor(
    readonly templates: TemplateRow[],
    readonly packages: PackageRow[],
  ) {}

  async findPublishedVersion(versionId: string): Promise<PublishedTemplateVersion | null> {
    for (const template of this.templates) {
      const version = template.versions.find(
        (stored) => stored.id === versionId && stored.status === "PUBLISHED",
      );
      if (version && template.status === "PUBLISHED") {
        return {
          id: version.id,
          templateId: template.id,
          componentKey: version.componentKey,
          schema: version.schema,
          requiredFeatureKeys: [],
        };
      }
    }
    return null;
  }

  async findVersionSchema(versionId: string): Promise<StoredVersionSchema | null> {
    for (const template of this.templates) {
      const version = template.versions.find((stored) => stored.id === versionId);
      if (version) {
        return { id: version.id, templateId: template.id, schema: version.schema };
      }
    }
    return null;
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    const found = this.packages.find((stored) => stored.id === packageId);
    if (!found) {
      return null;
    }
    return {
      packageId: found.id,
      status: found.status,
      includedFeatureKeys: found.featureKeys
        .filter((feature) => feature.included)
        .map((feature) => feature.key)
        .sort(),
    };
  }

  async listPublishedTemplates(): Promise<CreatorTemplateSummary[]> {
    return this.templates
      .filter((template) => template.status === "PUBLISHED")
      .sort((left, right) => left.key.localeCompare(right.key))
      .flatMap((template) => {
        const published = template.versions
          .filter((version) => version.status === "PUBLISHED")
          .sort((left, right) => right.version - left.version)[0];
        // A published version the registry no longer knows cannot be rendered: it is not offered (fail closed).
        if (!published || !KNOWN_RENDERER_KEYS.includes(published.componentKey)) {
          return [];
        }
        return [
          {
            id: template.id,
            key: template.key,
            name: template.name,
            description: template.description,
            category: { key: template.category.key, name: template.category.name },
            publishedVersion: {
              id: published.id,
              version: published.version,
              componentKey: published.componentKey,
              schema: published.schema,
              configuration: published.configuration,
            },
          },
        ];
      });
  }

  async listActivePackages(): Promise<CreatorPackageSummary[]> {
    return this.packages
      .filter((stored) => stored.status === "ACTIVE")
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((stored) => {
        const current = [...stored.currentPrices].sort((left, right) =>
          left.currency.localeCompare(right.currency),
        )[0];
        return {
          id: stored.id,
          key: stored.key,
          name: stored.name,
          description: stored.description,
          currentPrice: current
            ? { amountMinor: current.amountMinor, currency: current.currency }
            : null,
          includedFeatureKeys: stored.featureKeys
            .filter((feature) => feature.included)
            .map((feature) => feature.key)
            .sort(),
        };
      });
  }
}

function template(overrides: Partial<TemplateRow> & { key: string }): TemplateRow {
  return {
    id: randomUUID(),
    name: "Plantilla",
    description: null,
    status: "PUBLISHED",
    category: { key: "birthday", name: "Cumpleaños" },
    versions: [],
    ...overrides,
  };
}

function packageRow(overrides: Partial<PackageRow> & { key: string }): PackageRow {
  return {
    id: randomUUID(),
    name: "Paquete",
    description: null,
    status: "ACTIVE",
    featureKeys: [],
    currentPrices: [],
    ...overrides,
  };
}

describe("creator catalog: GET /catalog/templates and GET /catalog/packages", () => {
  const database: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database),
    // No probe here requests a sign-in code.
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });

  const birthday = template({
    key: "aa-birthday",
    name: "Aventura de cumpleaños",
    description: "Una aventura",
    versions: [
      {
        id: randomUUID(),
        version: 1,
        status: "RETIRED",
        componentKey: "birthday-poster-01",
        schema: { type: "object", required: [], properties: {} },
      },
      {
        id: randomUUID(),
        version: 2,
        status: "PUBLISHED",
        componentKey: "birthday-poster-01",
        schema: { type: "object", required: ["title"], properties: { title: { type: "string" } } },
        configuration: {
          componentKey: "birthday-poster-01",
          theme: "dinosaurs",
        },
      },
    ],
  });
  const wedding = template({
    key: "ff-wedding",
    name: "Boda",
    category: { key: "wedding", name: "Boda" },
    versions: [
      {
        id: randomUUID(),
        version: 1,
        status: "PUBLISHED",
        componentKey: "wedding-story-01",
        schema: { type: "object", required: [], properties: {} },
      },
    ],
  });
  // A themed layout: the chooser groups it by `componentKey` and labels each switch with its own
  // `configuration.theme` (S9), so both must reach the web unchanged.
  const mapTheme = template({
    key: "gg-map-dinosaurs",
    name: "Mapa · Dinosaurios",
    versions: [
      {
        id: randomUUID(),
        version: 1,
        status: "PUBLISHED",
        componentKey: "birthday-map-01",
        schema: { type: "object", required: [], properties: {} },
        configuration: { componentKey: "birthday-map-01", theme: "dinosaurs" },
      },
    ],
  });
  const catalog = new MemoryCatalogPublicReader(
    [
      birthday,
      // A PUBLISHED version whose renderer the registry does not know cannot be rendered (fail closed).
      template({
        key: "bb-unknown-renderer",
        versions: [
          {
            id: randomUUID(),
            version: 1,
            status: "PUBLISHED",
            componentKey: "retired-renderer-99",
            schema: {},
          },
        ],
      }),
      // A DRAFT template whose version is already PUBLISHED is not offered yet.
      template({
        key: "cc-draft-template",
        status: "DRAFT",
        versions: [
          {
            id: randomUUID(),
            version: 1,
            status: "PUBLISHED",
            componentKey: "birthday-poster-01",
            schema: {},
          },
        ],
      }),
      // A PUBLISHED template without any PUBLISHED version cannot start an invitation.
      template({
        key: "dd-draft-version",
        versions: [
          {
            id: randomUUID(),
            version: 1,
            status: "DRAFT",
            componentKey: "birthday-poster-01",
            schema: {},
          },
        ],
      }),
      // An ARCHIVED template is gone from the creator catalog.
      template({
        key: "ee-archived",
        status: "ARCHIVED",
        versions: [
          {
            id: randomUUID(),
            version: 1,
            status: "PUBLISHED",
            componentKey: "birthday-poster-01",
            schema: {},
          },
        ],
      }),
      wedding,
      mapTheme,
    ],
    [
      packageRow({
        key: "aa-basic",
        name: "Básico",
        description: "Lo esencial",
        featureKeys: [
          { key: "RSVP", included: true },
          { key: "GALLERY", included: false },
        ],
        currentPrices: [{ currency: "MXN", amountMinor: 19_900 }],
      }),
      packageRow({ key: "bb-free", name: "Gratis" }),
      packageRow({ key: "cc-draft", name: "Borrador", status: "DRAFT" }),
      packageRow({ key: "dd-archived", name: "Archivado", status: "ARCHIVED" }),
    ],
  );

  let app: INestApplication;
  let baseUrl: string;
  let userCounter = 0;

  before(async () => {
    @Module({
      imports: [
        createConfigModule({
          NODE_ENV: "development",
          CORS_ORIGIN: TRUSTED_ORIGIN,
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL,
        }),
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
      ],
      controllers: [CreatorCatalogController],
      providers: [{ provide: CATALOG_PUBLIC_READER, useValue: catalog }],
    })
    class CreatorCatalogTestModule {}

    app = await createApp(CreatorCatalogTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  /** A stored customer and a signed session cookie for them, as an email-code sign-in leaves them. */
  async function signedIn(): Promise<string> {
    userCounter += 1;
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      { email: `m4-t4-creator-${userCounter}@example.test`, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    const session = await context.internalAdapter.createSession(created.id);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`;
  }

  function get(path: string, cookie?: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  }

  describe("access control (A5)", () => {
    it("answers 401 without a valid session on both routes", async () => {
      const cookie = await signedIn();

      for (const header of [
        undefined,
        `${SESSION_COOKIE}=not-a-session`,
        `${cookie.slice(0, -4)}AAAA`,
      ]) {
        for (const path of [TEMPLATES_PATH, PACKAGES_PATH]) {
          assert.equal((await get(path, header)).status, 401, path);
        }
      }
    });

    it("lets a signed-in customer read both routes: they are signed-in, not administrator-only", async () => {
      const cookie = await signedIn();

      for (const path of [TEMPLATES_PATH, PACKAGES_PATH]) {
        const response = await get(path, cookie);
        assert.equal(response.status, 200, path);
      }
    });
  });

  describe(`GET ${TEMPLATES_PATH}`, () => {
    it("lists only PUBLISHED templates with a PUBLISHED version, ordered by key", async () => {
      const cookie = await signedIn();

      const response = await get(TEMPLATES_PATH, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row[];
      assert.deepEqual(
        body.map((item) => item.key),
        ["aa-birthday", "ff-wedding", "gg-map-dinosaurs"],
      );
    });

    it("answers the published version's configuration so the chooser can preview it (S9)", async () => {
      const cookie = await signedIn();

      const body = (await (await get(TEMPLATES_PATH, cookie)).json()) as Row[];
      const themed = body.find((item) => item.key === "gg-map-dinosaurs");

      // The stored snapshot travels as stored: the web reads the theme from it and never from the name.
      assert.deepEqual((themed?.publishedVersion ?? {}) as Row, {
        id: mapTheme.versions[0]?.id,
        version: 1,
        componentKey: "birthday-map-01",
        schema: { type: "object", required: [], properties: {} },
        configuration: { componentKey: "birthday-map-01", theme: "dinosaurs" },
      });
      assert.equal(themed?.name, "Mapa · Dinosaurios");
    });

    it("answers each template with its category and published version only", async () => {
      const cookie = await signedIn();

      const body = (await (await get(TEMPLATES_PATH, cookie)).json()) as Row[];
      const listed = body[0];

      assert.deepEqual(Object.keys(listed ?? {}).sort(), [
        "category",
        "description",
        "id",
        "key",
        "name",
        "publishedVersion",
      ]);
      assert.deepEqual(listed?.category, { key: "birthday", name: "Cumpleaños" });
      assert.deepEqual(Object.keys((listed?.publishedVersion ?? {}) as Row).sort(), [
        "componentKey",
        "configuration",
        "id",
        "schema",
        "version",
      ]);
      // The PUBLISHED version, never the retired one, with the snapshot the chooser previews (S9).
      assert.deepEqual(listed?.publishedVersion, {
        id: birthday.versions[1]?.id,
        version: 2,
        componentKey: "birthday-poster-01",
        schema: { type: "object", required: ["title"], properties: { title: { type: "string" } } },
        configuration: {
          componentKey: "birthday-poster-01",
          theme: "dinosaurs",
        },
      });
      assert.equal(listed?.description, "Una aventura");
      assert.equal(listed?.id, birthday.id);
    });

    it("excludes DRAFT and ARCHIVED templates, a template without a published version, and an unregistered renderer", async () => {
      const cookie = await signedIn();

      const body = (await (await get(TEMPLATES_PATH, cookie)).json()) as Row[];
      const keys = body.map((item) => String(item.key));

      for (const excluded of [
        "bb-unknown-renderer",
        "cc-draft-template",
        "dd-draft-version",
        "ee-archived",
      ]) {
        assert.equal(keys.includes(excluded), false, excluded);
      }
    });
  });

  describe(`GET ${PACKAGES_PATH}`, () => {
    it("lists only ACTIVE packages, ordered by key, with no owner or admin fields", async () => {
      const cookie = await signedIn();

      const response = await get(PACKAGES_PATH, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row[];
      assert.deepEqual(
        body.map((item) => item.key),
        ["aa-basic", "bb-free"],
      );
      for (const item of body) {
        assert.deepEqual(Object.keys(item).sort(), [
          "currentPrice",
          "description",
          "id",
          "includedFeatureKeys",
          "key",
          "name",
        ]);
      }
    });

    it("answers the current price and the included feature keys, or a null price", async () => {
      const cookie = await signedIn();

      const body = (await (await get(PACKAGES_PATH, cookie)).json()) as Row[];

      assert.deepEqual(body[0]?.currentPrice, { amountMinor: 19_900, currency: "MXN" });
      // An excluded feature is not an entitlement and never appears as a key (A1).
      assert.deepEqual(body[0]?.includedFeatureKeys, ["RSVP"]);
      assert.equal(body[0]?.description, "Lo esencial");
      assert.equal(body[1]?.currentPrice, null);
      assert.deepEqual(body[1]?.includedFeatureKeys, []);
    });

    it("excludes DRAFT and ARCHIVED packages", async () => {
      const cookie = await signedIn();

      const body = (await (await get(PACKAGES_PATH, cookie)).json()) as Row[];
      const keys = body.map((item) => String(item.key));

      assert.equal(keys.includes("cc-draft"), false);
      assert.equal(keys.includes("dd-archived"), false);
    });
  });
});
