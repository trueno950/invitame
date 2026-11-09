import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { MemoryCatalogPackageRepository } from "../../../../test/memory-catalog-packages.repository";
import { createApp } from "../../../app.setup";
import { AccessControlModule } from "../../../auth/access-control/access-control.module";
import { createAuth } from "../../../auth/auth.factory";
import { BackgroundTasks } from "../../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../../config/config.module";
import { EmailDeliveryService } from "../../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../../email/infrastructure/system-email-delivery-runtime";
import { PACKAGE_REPOSITORY } from "../../application/packages/package.repository";
import { CATALOG_PACKAGE_USE_CASES } from "../../catalog.module";
import { CatalogConcurrentUpdateError } from "../../domain/catalog-errors";
import { PackagesController } from "./packages.controller";

// Admin catalog packages (M3 T6b; S1, S4, S9) through the shared createApp boundary, the project-owned
// guard, and Better Auth on the in-memory adapter. The repository is in memory, so the suite needs no
// network and no database; the Prisma adapter is proved in `prisma-package.repository.db-spec.ts`.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PATH = "/admin/catalog/packages";

type Row = Record<string, unknown>;
type Created = Row & { id: string; key: string };

function uuids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

describe("admin catalog packages", () => {
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
  const repository = new MemoryCatalogPackageRepository();
  let app: INestApplication;
  let baseUrl: string;
  let userCounter = 0;
  let sequence = 0;

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
      controllers: [PackagesController],
      providers: [
        ...CATALOG_PACKAGE_USE_CASES,
        { provide: PACKAGE_REPOSITORY, useValue: repository },
      ],
    })
    class PackagesTestModule {}

    app = await createApp(PackagesTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  /** A stored user and a signed session cookie for them, as an email-code sign-in leaves them. */
  async function signedIn(role: "CUSTOMER" | "ADMIN"): Promise<string> {
    userCounter += 1;
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      { email: `t6b-catalog-${userCounter}@example.test`, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    const session = await context.internalAdapter.createSession(created.id);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    const user = database.user?.find((row) => row.id === created.id);
    assert.ok(user);

    if (role === "ADMIN") {
      // An enrolled administrator whose session passed the second factor; an un-enrolled one holds
      // no authority at all (S21, S52).
      user.role = "ADMIN";
      user.twoFactorEnabled = true;
      for (const row of database.session?.filter((stored) => stored.userId === created.id) ?? []) {
        row.secondFactorVerified = true;
      }
    }
    return `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`;
  }

  function send(method: string, path: string, cookie?: string, body?: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
  }

  async function created(cookie: string, key = `pkg-${++sequence}`, extra: Row = {}) {
    const response = await send("POST", PATH, cookie, { key, name: "Paquete", ...extra });
    assert.equal(response.status, 201);
    return (await response.json()) as Created;
  }

  describe("access control", () => {
    const requests: Array<[string, string, string, unknown?]> = [
      ["list", "GET", PATH],
      ["create", "POST", PATH, { key: "denied", name: "Otro" }],
      ["update", "PATCH", `${PATH}/${UNKNOWN_ID}`, { name: "Otro" }],
      ["features", "PUT", `${PATH}/${UNKNOWN_ID}/features`, { featureIds: [] }],
      ["price", "PUT", `${PATH}/${UNKNOWN_ID}/price`, { currency: "MXN", amountMinor: 100 }],
      ["history", "GET", `${PATH}/${UNKNOWN_ID}/prices`],
    ];

    it("answers 401 without a valid session, before validating the body, and stores nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const headers = [undefined, `${SESSION_COOKIE}=not-a-session`, `${cookie.slice(0, -4)}AAAA`];

      for (const header of headers) {
        for (const [label, method, target, body] of requests) {
          assert.equal((await send(method, target, header, body)).status, 401, label);
        }
        assert.equal((await send("POST", PATH, header, { key: 42, role: "ADMIN" })).status, 401);
      }
      assert.equal(repository.packages.length, 0);
      assert.equal(repository.prices.length, 0);
    });

    it("answers 403 to a customer session and stores nothing", async () => {
      const cookie = await signedIn("CUSTOMER");

      for (const [label, method, target, body] of requests) {
        assert.equal((await send(method, target, cookie, body)).status, 403, label);
      }
      assert.equal(repository.packages.length, 0);
    });

    it("answers 401 to an administrator who has not enrolled an authenticator app", async () => {
      const cookie = await signedIn("ADMIN");
      const user = database.user?.at(-1);
      assert.ok(user);
      user.twoFactorEnabled = false;

      assert.equal((await send("GET", PATH, cookie)).status, 401);
    });
  });

  describe(`GET ${PATH}`, () => {
    it("lists packages ordered by key with their features and current prices", async () => {
      const cookie = await signedIn("ADMIN");
      const second = await created(cookie, "list-b");
      const first = await created(cookie, "list-a", { description: "Texto" });
      const alpha = repository.addFeature("LIST_ALPHA");
      const beta = repository.addFeature("LIST_BETA");
      const linked = await send("PUT", `${PATH}/${first.id}/features`, cookie, {
        featureIds: [beta.id, alpha.id],
      });
      assert.equal(linked.status, 200);
      const priced = await send("PUT", `${PATH}/${first.id}/price`, cookie, {
        currency: "MXN",
        amountMinor: 49900,
      });
      assert.equal(priced.status, 200);

      const response = await send("GET", PATH, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row[];
      const keys = body.map((item) => String(item.key));
      assert.deepEqual(keys, [...keys].sort());
      const listed = body.filter((item) => item.key === "list-a" || item.key === "list-b");
      assert.deepEqual(
        listed.map((item) => item.key),
        ["list-a", "list-b"],
      );
      const [listedFirst, listedSecond] = listed;
      assert.deepEqual(Object.keys(listedFirst ?? {}).sort(), [
        "createdAt",
        "currentPrices",
        "description",
        "features",
        "id",
        "key",
        "name",
        "status",
        "updatedAt",
      ]);
      assert.equal(listedFirst?.id, first.id);
      assert.equal(listedFirst?.status, "DRAFT");
      assert.deepEqual(listedFirst?.features, [
        { id: alpha.id, key: "LIST_ALPHA", name: alpha.name, included: true },
        { id: beta.id, key: "LIST_BETA", name: beta.name, included: true },
      ]);
      const prices = listedFirst?.currentPrices as Row[];
      assert.equal(prices.length, 1);
      assert.deepEqual(Object.keys(prices[0] ?? {}).sort(), [
        "amountMinor",
        "createdAt",
        "currency",
      ]);
      assert.equal(prices[0]?.currency, "MXN");
      assert.equal(prices[0]?.amountMinor, 49900);
      assert.equal(new Date(String(prices[0]?.createdAt)).toISOString(), prices[0]?.createdAt);
      assert.equal(listedSecond?.id, second.id);
      assert.deepEqual(listedSecond?.features, []);
      assert.deepEqual(listedSecond?.currentPrices, []);
    });
  });

  describe(`POST ${PATH}`, () => {
    it("answers 201 with the stored, trimmed package in DRAFT", async () => {
      const cookie = await signedIn("ADMIN");
      const before = repository.packages.length;

      const response = await send("POST", PATH, cookie, {
        key: "new-package",
        name: "  Paquete nuevo  ",
        description: "  Texto  ",
      });
      const body = (await response.json()) as Row;

      assert.equal(response.status, 201);
      assert.match(String(body.id), /^[0-9a-f-]{36}$/);
      assert.equal(body.key, "new-package");
      assert.equal(body.name, "Paquete nuevo");
      assert.equal(body.description, "Texto");
      assert.equal(body.status, "DRAFT");
      assert.deepEqual(body.features, []);
      assert.deepEqual(body.currentPrices, []);
      assert.equal(new Date(String(body.createdAt)).toISOString(), body.createdAt);
      assert.equal(new Date(String(body.updatedAt)).toISOString(), body.updatedAt);
      assert.equal(repository.packages.length, before + 1);
    });

    it("stores a missing description as null", async () => {
      const cookie = await signedIn("ADMIN");

      assert.equal((await created(cookie)).description, null);
    });

    it("answers 409 CATALOG_KEY_TAKEN for a duplicate key and keeps the stored package", async () => {
      const cookie = await signedIn("ADMIN");
      const first = await created(cookie, "dup-key", { name: "Primero" });
      const before = structuredClone(repository.packages);

      const response = await send("POST", PATH, cookie, { key: "dup-key", name: "Segundo" });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "CATALOG_KEY_TAKEN" });
      assert.deepEqual(repository.packages, before);
      assert.equal(repository.packages.find((stored) => stored.id === first.id)?.name, "Primero");
    });

    const invalid: Array<[string, unknown]> = [
      ["an upper-case key", { key: "Basic", name: "N" }],
      ["a feature-style key", { key: "GUEST_LIST", name: "N" }],
      ["a key with padding", { key: " basic", name: "N" }],
      ["an empty key", { key: "", name: "N" }],
      ["a key over 100 characters", { key: "a".repeat(101), name: "N" }],
      ["a missing key", { name: "N" }],
      ["a numeric key", { key: 7, name: "N" }],
      ["a missing name", { key: "bad-input" }],
      ["a blank name", { key: "bad-input", name: "   " }],
      ["a name over 120 characters", { key: "bad-input", name: "a".repeat(121) }],
      ["a name with a newline", { key: "bad-input", name: "a\nb" }],
      [
        "a description over 1000 characters",
        { key: "bad-input", name: "N", description: "a".repeat(1001) },
      ],
      ["a numeric description", { key: "bad-input", name: "N", description: 5 }],
      ["an unknown field", { key: "bad-input", name: "N", sort: 1 }],
      ["a client-supplied id", { key: "bad-input", name: "N", id: UNKNOWN_ID }],
      ["a client-supplied status", { key: "bad-input", name: "N", status: "ACTIVE" }],
      ["a client-supplied price", { key: "bad-input", name: "N", price: 100 }],
      ["a JSON array body", "[]"],
      ["an empty body", {}],
    ];

    for (const [label, body] of invalid) {
      it(`answers 400 for ${label} and stores nothing`, async () => {
        const cookie = await signedIn("ADMIN");
        const before = structuredClone(repository.packages);

        const response = await send("POST", PATH, cookie, body);

        assert.equal(response.status, 400);
        assert.deepEqual(repository.packages, before);
      });
    }
  });

  describe(`PATCH ${PATH}/:id`, () => {
    it("updates name, description, and status, keeps the key, and moves updatedAt", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie, "to-update", { description: "Antes" });

      const renamed = await send("PATCH", `${PATH}/${item.id}`, cookie, { name: " Nuevo " });
      assert.equal(renamed.status, 200);
      const body = (await renamed.json()) as Row;
      assert.deepEqual(
        { ...body, updatedAt: undefined },
        { ...item, name: "Nuevo", updatedAt: undefined },
      );
      assert.ok(String(body.updatedAt) >= String(item.updatedAt));

      for (const status of ["ACTIVE", "ARCHIVED", "DRAFT"]) {
        const response = await send("PATCH", `${PATH}/${item.id}`, cookie, { status });
        assert.equal(response.status, 200);
        assert.equal(((await response.json()) as Row).status, status);
      }

      const cleared = await send("PATCH", `${PATH}/${item.id}`, cookie, { description: null });
      assert.equal(((await cleared.json()) as Row).description, null);
      assert.equal(repository.packages.find((stored) => stored.id === item.id)?.key, "to-update");
    });

    it("returns the features and current prices of the package", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const feature = repository.addFeature(`PATCH_FEATURE_${sequence}`);
      await send("PUT", `${PATH}/${item.id}/features`, cookie, { featureIds: [feature.id] });
      await send("PUT", `${PATH}/${item.id}/price`, cookie, { currency: "MXN", amountMinor: 100 });

      const response = await send("PATCH", `${PATH}/${item.id}`, cookie, { name: "Con datos" });
      const body = (await response.json()) as Row;

      assert.equal((body.features as unknown[]).length, 1);
      assert.equal((body.currentPrices as unknown[]).length, 1);
    });

    it("answers 404 for an unknown id and for an id that is not a UUID", async () => {
      const cookie = await signedIn("ADMIN");
      const before = structuredClone(repository.packages);

      for (const id of [UNKNOWN_ID, "not-a-uuid", "1"]) {
        const response = await send("PATCH", `${PATH}/${id}`, cookie, { name: "Otro" });
        assert.equal(response.status, 404, id);
      }
      assert.deepEqual(repository.packages, before);
    });

    const invalid: Array<[string, unknown]> = [
      ["an empty body", {}],
      ["a key, which is immutable", { key: "other-key", name: "Nuevo" }],
      ["only a key", { key: "other-key" }],
      ["a status outside the allow-list", { status: "PUBLISHED" }],
      ["a lower-case status", { status: "active" }],
      ["a null status", { status: null }],
      ["a null name", { name: null }],
      ["a blank name", { name: "  " }],
      ["a name over 120 characters", { name: "a".repeat(121) }],
      ["a description over 1000 characters", { description: "a".repeat(1001) }],
      ["a numeric description", { description: 5 }],
      ["an unknown field", { name: "Nuevo", sort: 1 }],
      ["a client-supplied id", { name: "Nuevo", id: UNKNOWN_ID }],
      ["a client-supplied price", { name: "Nuevo", amountMinor: 1 }],
      ["a JSON array body", "[]"],
    ];

    for (const [label, body] of invalid) {
      it(`answers 400 for ${label} and leaves the package unchanged`, async () => {
        const cookie = await signedIn("ADMIN");
        const item = await created(cookie, undefined, { description: "Intacto" });
        const before = structuredClone(repository.packages);

        const response = await send("PATCH", `${PATH}/${item.id}`, cookie, body);

        assert.equal(response.status, 400);
        assert.deepEqual(repository.packages, before);
      });
    }
  });

  describe(`PUT ${PATH}/:id/features`, () => {
    it("replaces the links, ordered by feature key, and answers the package", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const one = repository.addFeature(`REPL_A_${sequence}`);
      const two = repository.addFeature(`REPL_B_${sequence}`);
      const three = repository.addFeature(`REPL_C_${sequence}`);

      const first = await send("PUT", `${PATH}/${item.id}/features`, cookie, {
        featureIds: [two.id, one.id],
      });
      assert.equal(first.status, 200);
      const firstBody = (await first.json()) as { id: string; features: Row[] };
      assert.equal(firstBody.id, item.id);
      assert.deepEqual(
        firstBody.features.map((feature) => feature.key),
        [one.key, two.key],
      );

      const second = await send("PUT", `${PATH}/${item.id}/features`, cookie, {
        featureIds: [three.id, two.id],
      });
      assert.deepEqual(
        ((await second.json()) as { features: Row[] }).features.map((feature) => feature.key),
        [two.key, three.key],
      );

      const empty = await send("PUT", `${PATH}/${item.id}/features`, cookie, { featureIds: [] });
      assert.equal(empty.status, 200);
      assert.deepEqual(((await empty.json()) as Row).features, []);
    });

    it("answers 400 CATALOG_FEATURE_NOT_FOUND for an unknown feature and changes nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const known = repository.addFeature(`KNOWN_${sequence}`);
      await send("PUT", `${PATH}/${item.id}/features`, cookie, { featureIds: [known.id] });
      const before = structuredClone(repository.links);

      const response = await send("PUT", `${PATH}/${item.id}/features`, cookie, {
        featureIds: [known.id, UNKNOWN_ID],
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "CATALOG_FEATURE_NOT_FOUND" });
      assert.deepEqual(repository.links, before);
    });

    it("answers 404 for an unknown package and for an id that is not a UUID", async () => {
      const cookie = await signedIn("ADMIN");
      const before = structuredClone(repository.links);

      for (const id of [UNKNOWN_ID, "not-a-uuid"]) {
        const response = await send("PUT", `${PATH}/${id}/features`, cookie, { featureIds: [] });
        assert.equal(response.status, 404, id);
      }
      assert.deepEqual(repository.links, before);
    });

    const invalid: Array<[string, () => unknown]> = [
      ["an empty body", () => ({})],
      ["featureIds that is not a list", () => ({ featureIds: UNKNOWN_ID })],
      ["featureIds as null", () => ({ featureIds: null })],
      ["an id that is not a UUID", () => ({ featureIds: ["not-a-uuid"] })],
      ["a numeric id", () => ({ featureIds: [1] })],
      ["a duplicate id", () => ({ featureIds: [UNKNOWN_ID, UNKNOWN_ID] })],
      ["more than 100 ids", () => ({ featureIds: uuids(101) })],
      ["an unknown field", () => ({ featureIds: [], included: false })],
      ["a JSON array body", () => "[]"],
    ];

    for (const [label, build] of invalid) {
      it(`answers 400 for ${label} and changes nothing`, async () => {
        const cookie = await signedIn("ADMIN");
        const item = await created(cookie);
        const known = repository.addFeature(`INVALID_${sequence}`);
        await send("PUT", `${PATH}/${item.id}/features`, cookie, { featureIds: [known.id] });
        const before = structuredClone(repository.links);

        const response = await send("PUT", `${PATH}/${item.id}/features`, cookie, build());

        assert.equal(response.status, 400);
        assert.deepEqual(repository.links, before);
      });
    }

    it("accepts exactly 100 ids", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const features = Array.from({ length: 100 }, (_, index) =>
        repository.addFeature(`BULK_${sequence}_${index}`),
      );

      const response = await send("PUT", `${PATH}/${item.id}/features`, cookie, {
        featureIds: features.map((feature) => feature.id),
      });

      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as { features: unknown[] }).features.length, 100);
    });
  });

  describe(`PUT ${PATH}/:id/price and GET ${PATH}/:id/prices`, () => {
    it("sets the price, then replaces it, and keeps the history newest first", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);

      const first = await send("PUT", `${PATH}/${item.id}/price`, cookie, {
        currency: "MXN",
        amountMinor: 49900,
      });
      assert.equal(first.status, 200);
      const firstBody = (await first.json()) as { id: string; currentPrices: Row[] };
      assert.equal(firstBody.id, item.id);
      assert.equal(firstBody.currentPrices[0]?.amountMinor, 49900);

      const second = await send("PUT", `${PATH}/${item.id}/price`, cookie, {
        currency: "MXN",
        amountMinor: 59900,
      });
      const secondBody = (await second.json()) as { currentPrices: Row[] };
      assert.equal(secondBody.currentPrices.length, 1);
      assert.equal(secondBody.currentPrices[0]?.amountMinor, 59900);

      const history = await send("GET", `${PATH}/${item.id}/prices`, cookie);
      assert.equal(history.status, 200);
      const rows = (await history.json()) as Row[];
      assert.deepEqual(
        rows.map((row) => [row.currency, row.amountMinor]),
        [
          ["MXN", 59900],
          ["MXN", 49900],
        ],
      );
      assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), [
        "amountMinor",
        "createdAt",
        "currency",
        "retiredAt",
      ]);
      assert.equal(rows[0]?.retiredAt, null);
      assert.equal(new Date(String(rows[1]?.retiredAt)).toISOString(), rows[1]?.retiredAt);
      assert.equal(new Date(String(rows[1]?.createdAt)).toISOString(), rows[1]?.createdAt);
    });

    it("is a no-op when the amount equals the current price", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const body = { currency: "MXN", amountMinor: 100 };
      await send("PUT", `${PATH}/${item.id}/price`, cookie, body);
      const before = structuredClone(repository.prices);

      const response = await send("PUT", `${PATH}/${item.id}/price`, cookie, body);

      assert.equal(response.status, 200);
      const answered = (await response.json()) as { currentPrices: unknown[] };
      assert.equal(answered.currentPrices.length, 1);
      assert.deepEqual(repository.prices, before);
    });

    it("answers an empty history for a package without prices", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);

      const response = await send("GET", `${PATH}/${item.id}/prices`, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
    });

    it("answers 404 for an unknown package and for an id that is not a UUID", async () => {
      const cookie = await signedIn("ADMIN");
      const before = structuredClone(repository.prices);

      for (const id of [UNKNOWN_ID, "not-a-uuid"]) {
        const set = await send("PUT", `${PATH}/${id}/price`, cookie, {
          currency: "MXN",
          amountMinor: 100,
        });
        assert.equal(set.status, 404, id);
        assert.equal((await send("GET", `${PATH}/${id}/prices`, cookie)).status, 404, id);
      }
      assert.deepEqual(repository.prices, before);
    });

    it("answers 400 with the domain message for an unsupported currency", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const before = structuredClone(repository.prices);

      const response = await send("PUT", `${PATH}/${item.id}/price`, cookie, {
        currency: "USD",
        amountMinor: 100,
      });

      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as Row).message, 'Unsupported price currency: "USD"');
      assert.deepEqual(repository.prices, before);
    });

    it("answers 400 with the domain message for an invalid amount", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const before = structuredClone(repository.prices);

      const response = await send("PUT", `${PATH}/${item.id}/price`, cookie, {
        currency: "MXN",
        amountMinor: 12.5,
      });

      assert.equal(response.status, 400);
      assert.equal(((await response.json()) as Row).message, "Invalid price amount: 12.5");
      assert.deepEqual(repository.prices, before);
    });

    const invalid: Array<[string, unknown]> = [
      ["an empty body", {}],
      ["a missing currency", { amountMinor: 100 }],
      ["a missing amount", { currency: "MXN" }],
      ["a lower-case currency", { currency: "mxn", amountMinor: 100 }],
      ["a numeric currency", { currency: 1, amountMinor: 100 }],
      ["a negative amount", { currency: "MXN", amountMinor: -1 }],
      ["a string amount", { currency: "MXN", amountMinor: "100" }],
      ["a null amount", { currency: "MXN", amountMinor: null }],
      ["an amount over the column limit", { currency: "MXN", amountMinor: 2_147_483_648 }],
      ["an unknown field", { currency: "MXN", amountMinor: 100, retiredAt: null }],
      ["a JSON array body", "[]"],
    ];

    for (const [label, body] of invalid) {
      it(`answers 400 for ${label} and leaves the prices unchanged`, async () => {
        const cookie = await signedIn("ADMIN");
        const item = await created(cookie);
        await send("PUT", `${PATH}/${item.id}/price`, cookie, {
          currency: "MXN",
          amountMinor: 100,
        });
        const before = structuredClone(repository.prices);

        const response = await send("PUT", `${PATH}/${item.id}/price`, cookie, body);

        assert.equal(response.status, 400);
        assert.deepEqual(repository.prices, before);
      });
    }

    it("answers 409 CATALOG_CONCURRENT_UPDATE when a concurrent price set wins", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const original = repository.setPrice.bind(repository);
      repository.setPrice = async () => {
        throw new CatalogConcurrentUpdateError();
      };

      try {
        const response = await send("PUT", `${PATH}/${item.id}/price`, cookie, {
          currency: "MXN",
          amountMinor: 100,
        });

        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "CATALOG_CONCURRENT_UPDATE" });
      } finally {
        repository.setPrice = original;
      }
    });
  });

  it("offers no delete route and no route to change the key", async () => {
    const cookie = await signedIn("ADMIN");
    const item = await created(cookie);
    const before = structuredClone(repository.packages);

    for (const [method, path] of [
      ["DELETE", `${PATH}/${item.id}`],
      ["PUT", `${PATH}/${item.id}`],
      ["POST", `${PATH}/${item.id}/price`],
    ] as const) {
      assert.equal((await send(method, path, cookie)).status, 404, `${method} ${path}`);
    }
    assert.deepEqual(repository.packages, before);
  });
});
