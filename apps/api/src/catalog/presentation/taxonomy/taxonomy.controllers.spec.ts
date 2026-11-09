import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { MemoryCatalogTaxonomyRepository } from "../../../../test/memory-catalog-taxonomy.repository";
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
  CATEGORY_REPOSITORY,
  FEATURE_REPOSITORY,
} from "../../application/taxonomy/catalog-entry.repository";
import { CATALOG_TAXONOMY_USE_CASES } from "../../catalog.module";
import { CategoriesController } from "./categories.controller";
import { FeaturesController } from "./features.controller";

// Admin catalog taxonomy (M3 T6a; S1, S2, S9): categories and features through the shared createApp
// boundary, the project-owned guard, and Better Auth on the in-memory adapter. The repositories are
// in memory, so the suite needs no network and no database; the Prisma adapter is proved in
// `prisma-taxonomy.repository.db-spec.ts`.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

type Row = Record<string, unknown>;

interface Kind {
  label: string;
  path: string;
  repository: MemoryCatalogTaxonomyRepository;
  key: string;
  otherKey: string;
  /** A key that is valid for the other kind only. */
  foreignKey: string;
  /** A valid key of this kind for the kebab-case words, such as `no-delete`. */
  makeKey: (words: string) => string;
}

describe("admin catalog taxonomy: categories and features", () => {
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
  const categories = new MemoryCatalogTaxonomyRepository();
  const features = new MemoryCatalogTaxonomyRepository();
  const kinds: Kind[] = [
    {
      label: "categories",
      path: "/admin/catalog/categories",
      repository: categories,
      key: "baby-shower",
      otherKey: "birthday",
      foreignKey: "GUEST_LIST",
      makeKey: (words) => words,
    },
    {
      label: "features",
      path: "/admin/catalog/features",
      repository: features,
      key: "GUEST_LIST",
      otherKey: "RSVP",
      foreignKey: "baby-shower",
      makeKey: (words) => words.toUpperCase().replaceAll("-", "_"),
    },
  ];
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
      controllers: [CategoriesController, FeaturesController],
      providers: [
        ...CATALOG_TAXONOMY_USE_CASES,
        { provide: CATEGORY_REPOSITORY, useValue: categories },
        { provide: FEATURE_REPOSITORY, useValue: features },
      ],
    })
    class CatalogTestModule {}

    app = await createApp(CatalogTestModule, { logger: false });
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
      { email: `t6a-catalog-${userCounter}@example.test`, name: "", emailVerified: true },
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

  for (const kind of kinds) {
    describe(kind.label, () => {
      const { path, repository } = kind;
      let sequence = 0;

      async function created(cookie: string, key: string, extra: Row = {}) {
        const response = await send("POST", path, cookie, { key, name: "Nombre", ...extra });
        assert.equal(response.status, 201);
        return (await response.json()) as Row;
      }

      describe("access control", () => {
        const requests: Array<[string, () => [string, string, unknown?]]> = [
          ["GET", () => ["GET", path]],
          ["POST", () => ["POST", path, { key: kind.otherKey, name: "Otro" }]],
          ["PATCH", () => ["PATCH", `${path}/${UNKNOWN_ID}`, { name: "Otro" }]],
        ];

        it("answers 401 without a valid session, before validating the body, and stores nothing", async () => {
          const cookie = await signedIn("ADMIN");
          const headers = [
            undefined,
            `${SESSION_COOKIE}=not-a-session`,
            `${cookie.slice(0, -4)}AAAA`,
          ];

          for (const header of headers) {
            for (const [label, build] of requests) {
              const [method, target, body] = build();
              assert.equal((await send(method, target, header, body)).status, 401, label);
            }
            assert.equal(
              (await send("POST", path, header, { key: 42, role: "ADMIN" })).status,
              401,
            );
          }
          assert.equal(repository.entries.length, 0);
        });

        it("answers 403 to a customer session and stores nothing", async () => {
          const cookie = await signedIn("CUSTOMER");

          for (const [label, build] of requests) {
            const [method, target, body] = build();
            const response = await send(method, target, cookie, body);
            assert.equal(response.status, 403, label);
          }
          assert.equal(repository.entries.length, 0);
        });

        it("answers 401 to an administrator who has not enrolled an authenticator app", async () => {
          const cookie = await signedIn("ADMIN");
          const user = database.user?.at(-1);
          assert.ok(user);
          user.twoFactorEnabled = false;

          assert.equal((await send("GET", path, cookie)).status, 401);
        });
      });

      describe(`GET ${path}`, () => {
        it("lists every entry ordered by key with the stable shape", async () => {
          const cookie = await signedIn("ADMIN");
          const first = await created(cookie, kind.key, { description: "Texto" });
          const second = await created(cookie, kind.otherKey);

          const response = await send("GET", path, cookie);

          assert.equal(response.status, 200);
          const body = (await response.json()) as Array<{ key: string }>;
          const keys = body.map((item) => item.key);
          assert.deepEqual(keys, [...keys].sort());
          assert.deepEqual(
            body.filter((item) => item.key === first.key || item.key === second.key),
            [first, second],
          );
          assert.deepEqual(Object.keys(first).sort(), [
            "createdAt",
            "description",
            "id",
            "isActive",
            "key",
            "name",
            "updatedAt",
          ]);
        });
      });

      describe(`POST ${path}`, () => {
        it("answers 201 with the stored, trimmed entry", async () => {
          const cookie = await signedIn("ADMIN");
          const before = repository.entries.length;
          const key = kind.makeKey("new-entry");

          const response = await send("POST", path, cookie, {
            key,
            name: "  Nombre nuevo  ",
            description: "  Texto  ",
          });
          const body = (await response.json()) as Row;

          assert.equal(response.status, 201);
          assert.match(String(body.id), /^[0-9a-f-]{36}$/);
          assert.equal(body.key, key);
          assert.equal(body.name, "Nombre nuevo");
          assert.equal(body.description, "Texto");
          assert.equal(body.isActive, true);
          assert.equal(new Date(String(body.createdAt)).toISOString(), body.createdAt);
          assert.equal(new Date(String(body.updatedAt)).toISOString(), body.updatedAt);
          assert.equal(repository.entries.length, before + 1);
        });

        it("stores a missing description as null", async () => {
          const cookie = await signedIn("ADMIN");
          const key = kind.makeKey("no-description");

          assert.equal((await created(cookie, key)).description, null);
        });

        it("answers 409 CATALOG_KEY_TAKEN for a duplicate key and keeps the stored entry", async () => {
          const cookie = await signedIn("ADMIN");
          const key = kind.makeKey("dup-key");
          const first = await created(cookie, key, { name: "Primero" });
          const before = structuredClone(repository.entries);

          const response = await send("POST", path, cookie, { key, name: "Segundo" });

          assert.equal(response.status, 409);
          assert.deepEqual(await response.json(), { code: "CATALOG_KEY_TAKEN" });
          assert.deepEqual(repository.entries, before);
          assert.equal(repository.entries.find((entry) => entry.key === key)?.name, first.name);
        });

        const invalid: Array<[string, (kind: Kind) => unknown]> = [
          ["a key of the other kind", (k) => ({ key: k.foreignKey, name: "N" })],
          ["a key with padding", (k) => ({ key: ` ${k.otherKey}`, name: "N" })],
          ["an empty key", () => ({ key: "", name: "N" })],
          [
            "a key over 100 characters",
            (k) => ({ key: `${k.key[0]}${k.key[0]?.repeat(100)}`, name: "N" }),
          ],
          ["a missing key", () => ({ name: "N" })],
          ["a numeric key", () => ({ key: 7, name: "N" })],
          ["a missing name", (k) => ({ key: k.otherKey })],
          ["a blank name", (k) => ({ key: k.otherKey, name: "   " })],
          ["a name over 120 characters", (k) => ({ key: k.otherKey, name: "a".repeat(121) })],
          ["a name with a newline", (k) => ({ key: k.otherKey, name: "a\nb" })],
          [
            "a description over 1000 characters",
            (k) => ({ key: k.otherKey, name: "N", description: "a".repeat(1001) }),
          ],
          ["a numeric description", (k) => ({ key: k.otherKey, name: "N", description: 5 })],
          ["an unknown field", (k) => ({ key: k.otherKey, name: "N", sort: 1 })],
          ["a client-supplied id", (k) => ({ key: k.otherKey, name: "N", id: UNKNOWN_ID })],
          ["a client-supplied isActive", (k) => ({ key: k.otherKey, name: "N", isActive: false })],
          ["a JSON array body", () => "[]"],
          ["an empty body", () => ({})],
        ];

        for (const [label, build] of invalid) {
          it(`answers 400 for ${label} and stores nothing`, async () => {
            const cookie = await signedIn("ADMIN");
            const before = structuredClone(repository.entries);

            const response = await send("POST", path, cookie, build(kind));

            assert.equal(response.status, 400);
            assert.deepEqual(repository.entries, before);
          });
        }
      });

      describe(`PATCH ${path}/:id`, () => {
        it("updates name, description, and isActive, keeps the key, and moves updatedAt", async () => {
          const cookie = await signedIn("ADMIN");
          const key = kind.makeKey("to-update");
          const entry = await created(cookie, key, { description: "Antes" });

          const renamed = await send("PATCH", `${path}/${entry.id}`, cookie, { name: " Nuevo " });
          assert.equal(renamed.status, 200);
          const body = (await renamed.json()) as Row;
          assert.deepEqual(
            { ...body, updatedAt: undefined },
            {
              ...entry,
              name: "Nuevo",
              updatedAt: undefined,
            },
          );
          assert.ok(String(body.updatedAt) >= String(entry.updatedAt));

          const cleared = await send("PATCH", `${path}/${entry.id}`, cookie, {
            description: null,
            isActive: false,
          });
          assert.equal(cleared.status, 200);
          assert.deepEqual(
            await cleared.json().then((row: Row) => ({ ...row, updatedAt: undefined })),
            { ...entry, name: "Nuevo", description: null, isActive: false, updatedAt: undefined },
          );
          assert.equal(repository.entries.find((stored) => stored.id === entry.id)?.key, key);
        });

        it("answers 404 for an unknown id and for an id that is not a UUID", async () => {
          const cookie = await signedIn("ADMIN");
          const before = structuredClone(repository.entries);

          for (const id of [UNKNOWN_ID, "not-a-uuid", "1"]) {
            const response = await send("PATCH", `${path}/${id}`, cookie, { name: "Otro" });
            assert.equal(response.status, 404, id);
          }
          assert.deepEqual(repository.entries, before);
        });

        const invalid: Array<[string, unknown]> = [
          ["an empty body", {}],
          ["a key, which is immutable", { key: "other-key", name: "Nuevo" }],
          ["only a key", { key: "other-key" }],
          ["isActive as a string", { isActive: "yes" }],
          ["isActive as null", { isActive: null }],
          ["a null name", { name: null }],
          ["a blank name", { name: "  " }],
          ["a name over 120 characters", { name: "a".repeat(121) }],
          ["a description over 1000 characters", { description: "a".repeat(1001) }],
          ["a numeric description", { description: 5 }],
          ["an unknown field", { name: "Nuevo", sort: 1 }],
          ["a client-supplied id", { name: "Nuevo", id: UNKNOWN_ID }],
          ["a client-supplied createdAt", { name: "Nuevo", createdAt: "2020-01-01T00:00:00.000Z" }],
          ["a JSON array body", "[]"],
        ];

        for (const [label, body] of invalid) {
          it(`answers 400 for ${label} and leaves the entry unchanged`, async () => {
            const cookie = await signedIn("ADMIN");
            const key = kind.makeKey(`keep-me-${++sequence}`);
            const entry = await created(cookie, key, { description: "Intacta" });
            const before = structuredClone(repository.entries);

            const response = await send("PATCH", `${path}/${entry.id}`, cookie, body);

            assert.equal(response.status, 400);
            assert.deepEqual(repository.entries, before);
          });
        }
      });

      it("offers no delete route", async () => {
        const cookie = await signedIn("ADMIN");
        const entry = await created(cookie, kind.makeKey("no-delete"));
        const before = structuredClone(repository.entries);

        for (const method of ["DELETE", "PUT"]) {
          const response = await send(method, `${path}/${entry.id}`, cookie);
          assert.equal(response.status, 404, method);
        }
        assert.deepEqual(repository.entries, before);
      });
    });
  }

  it("keeps categories and features apart: the same text is a valid key of one kind only", async () => {
    const cookie = await signedIn("ADMIN");
    const before = [categories.entries.length, features.entries.length];

    assert.equal(
      (await send("POST", kinds[0]?.path ?? "", cookie, { key: "RSVP", name: "N" })).status,
      400,
    );
    assert.equal(
      (await send("POST", kinds[1]?.path ?? "", cookie, { key: "rsvp", name: "N" })).status,
      400,
    );
    assert.deepEqual([categories.entries.length, features.entries.length], before);
  });
});
