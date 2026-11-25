import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
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
  type CatalogCurrentPrice,
  type CatalogPackageEntitlements,
  type CatalogPublicReader,
  type CreatorPackageSummary,
  type CreatorTemplateSummary,
  type PublishedTemplateVersion,
  type StoredVersionSchema,
} from "../../application/public/catalog-public-reader";
import { PublicCatalogController } from "./public-catalog.controller";

// The landing's price list (T4; S4) through the shared createApp boundary and the project-owned global guard. A
// visitor of the landing has no session, so the route is `@Public()`: it answers without reading one. The catalog
// contract is an in-memory fake here, so the suite needs no database; the SQL that selects the rows is proved in
// `prisma-catalog-public-reader.db-spec.ts`. What this suite owns is the HTTP contract: the route is reachable
// without a session, only ACTIVE packages are listed, ordered by key, each with the current MXN price or null and
// the feature keys it includes, and nothing an administrator or an owner owns leaks into the body.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const PACKAGES_PATH = "/public/catalog/packages";

type Row = Record<string, unknown>;

interface PackageRow {
  key: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  featureKeys: Array<{ key: string; included: boolean }>;
  /** The prices in force, one per currency. */
  currentPrices: Array<{ currency: string; amountMinor: number }>;
}

/**
 * The catalog's public contract in memory. Only `listActivePackages` is exercised by the landing's read; the other
 * methods answer as the empty catalog does, because this route never asks for them.
 */
class MemoryCatalogPublicReader implements CatalogPublicReader {
  constructor(readonly packages: PackageRow[]) {}

  async findPublishedVersion(): Promise<PublishedTemplateVersion | null> {
    return null;
  }

  async findVersionSchema(): Promise<StoredVersionSchema | null> {
    return null;
  }

  async findPackageEntitlements(): Promise<CatalogPackageEntitlements | null> {
    return null;
  }

  async findCurrentPackagePrice(): Promise<CatalogCurrentPrice | null> {
    return null;
  }

  async listPublishedTemplates(): Promise<CreatorTemplateSummary[]> {
    return [];
  }

  /** ACTIVE only, ordered by key, each with the feature keys it includes and the price in force. */
  async listActivePackages(): Promise<CreatorPackageSummary[]> {
    return this.packages
      .filter((stored) => stored.status === "ACTIVE")
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((stored) => {
        const current = [...stored.currentPrices].sort((left, right) =>
          left.currency.localeCompare(right.currency),
        )[0];
        return {
          id: randomUUID(),
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

function packageRow(overrides: Partial<PackageRow> & { key: string }): PackageRow {
  return {
    name: "Paquete",
    description: null,
    status: "ACTIVE",
    featureKeys: [],
    currentPrices: [],
    ...overrides,
  };
}

describe(`public catalog: GET ${PACKAGES_PATH}`, () => {
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

  const catalog = new MemoryCatalogPublicReader([
    packageRow({
      key: "basic",
      name: "Basic",
      description: "Una selección inicial para empezar a planificar.",
      featureKeys: [
        { key: "COUNTDOWN", included: true },
        { key: "MAP", included: true },
        // An excluded feature is not an entitlement and never appears in the public list (A1).
        { key: "GALLERY", included: false },
        { key: "WHATSAPP", included: true },
      ],
      currentPrices: [{ currency: "MXN", amountMinor: 19_900 }],
    }),
    packageRow({
      key: "premium",
      name: "Premium",
      featureKeys: [
        { key: "MUSIC", included: true },
        { key: "RSVP", included: true },
      ],
      currentPrices: [{ currency: "MXN", amountMinor: 39_900 }],
    }),
    // A package an administrator has not priced yet: the landing shows «Precio por definir» instead of failing.
    packageRow({ key: "aa-unpriced", name: "Sin precio" }),
    // A price in another currency is not the landing's MXN price (S4), so it answers null like an unpriced one.
    packageRow({
      key: "bb-foreign-currency",
      name: "En dólares",
      currentPrices: [{ currency: "USD", amountMinor: 9_900 }],
    }),
    packageRow({ key: "cc-draft", name: "Borrador", status: "DRAFT" }),
    packageRow({ key: "dd-archived", name: "Archivado", status: "ARCHIVED" }),
  ]);

  let app: INestApplication;
  let baseUrl: string;

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
      controllers: [PublicCatalogController],
      providers: [{ provide: CATALOG_PUBLIC_READER, useValue: catalog }],
    })
    class PublicCatalogTestModule {}

    app = await createApp(PublicCatalogTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  function get(cookie?: string): Promise<Response> {
    return fetch(`${baseUrl}${PACKAGES_PATH}`, { headers: cookie ? { cookie } : {} });
  }

  async function listed(): Promise<Row[]> {
    const response = await get();

    assert.equal(response.status, 200);
    return (await response.json()) as Row[];
  }

  it("answers without any session, because a landing's visitor has none", async () => {
    assert.equal((await get()).status, 200);
    // A stale or forged cookie cannot break the public read either: the route never reads a session.
    assert.equal((await get(`${SESSION_COOKIE}=not-a-session`)).status, 200);
  });

  it("lists only ACTIVE packages, ordered by key", async () => {
    const keys = (await listed()).map((item) => item.key);

    assert.deepEqual(keys, ["aa-unpriced", "basic", "bb-foreign-currency", "premium"]);
  });

  it("answers the public shape only, with no administrator or owner field", async () => {
    const [first] = await listed();

    assert.deepEqual(Object.keys(first ?? {}).sort(), [
      "description",
      "features",
      "key",
      "name",
      "price",
    ]);
  });

  it("answers the current MXN price of each package, or null when it has none", async () => {
    const body = await listed();

    assert.deepEqual(body[1], {
      key: "basic",
      name: "Basic",
      description: "Una selección inicial para empezar a planificar.",
      features: ["COUNTDOWN", "MAP", "WHATSAPP"],
      price: { amountMinor: 19_900, currency: "MXN" },
    });
    // No price row, and a price in another currency: the landing renders its own «Precio por definir» (S4).
    assert.equal(body[0]?.price, null);
    assert.equal(body[2]?.price, null);
  });

  it("excludes DRAFT and ARCHIVED packages", async () => {
    const keys = (await listed()).map((item) => String(item.key));

    assert.equal(keys.includes("cc-draft"), false);
    assert.equal(keys.includes("dd-archived"), false);
  });
});
