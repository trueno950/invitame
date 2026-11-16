import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import {
  MemoryCatalogTemplateRepository,
  themedVersionInput,
} from "../../../../test/memory-catalog-templates.repository";
import { createApp } from "../../../app.setup";
import { AccessControlModule } from "../../../auth/access-control/access-control.module";
import { createAuth } from "../../../auth/auth.factory";
import { BackgroundTasks } from "../../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../../config/config.module";
import { EmailDeliveryService } from "../../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../../email/infrastructure/system-email-delivery-runtime";
import { TEMPLATE_REPOSITORY } from "../../application/templates/template.repository";
import { CATALOG_TEMPLATE_USE_CASES } from "../../catalog.module";
import { CatalogConcurrentUpdateError } from "../../domain/catalog-errors";
import { RenderersController } from "./renderers.controller";
import { TemplatesController } from "./templates.controller";

// Admin catalog templates, versions, and renderers (M3 T6c; S1, S5, S6, S8, S9, L4) through the shared
// createApp boundary, the project-owned guard, and Better Auth on the in-memory adapter. The repository
// is in memory, so the suite needs no network and no database; the Prisma adapter is proved in
// `prisma-template.repository.db-spec.ts`.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PATH = "/admin/catalog/templates";
const RENDERERS_PATH = "/admin/catalog/renderers";

type Row = Record<string, unknown>;
type Created = Row & { id: string; key: string };

describe("admin catalog templates and versions", () => {
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
  const repository = new MemoryCatalogTemplateRepository();
  const category = repository.addCategory("birthday");
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
      controllers: [TemplatesController, RenderersController],
      providers: [
        ...CATALOG_TEMPLATE_USE_CASES,
        { provide: TEMPLATE_REPOSITORY, useValue: repository },
      ],
    })
    class TemplatesTestModule {}

    app = await createApp(TemplatesTestModule, { logger: false });
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
      { email: `t6c-catalog-${userCounter}@example.test`, name: "", emailVerified: true },
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

  async function created(cookie: string, key = `tpl-${++sequence}`, extra: Row = {}) {
    const response = await send("POST", PATH, cookie, {
      key,
      name: "Plantilla",
      categoryId: category.id,
      ...extra,
    });
    assert.equal(response.status, 201);
    return (await response.json()) as Created;
  }

  async function version(cookie: string, templateId: string, body: unknown) {
    const response = await send("POST", `${PATH}/${templateId}/versions`, cookie, body);
    assert.equal(response.status, 201);
    return (await response.json()) as Row & { id: string };
  }

  const snapshotsOf = () => structuredClone(repository.versions);

  describe("access control", () => {
    const requests: Array<[string, string, string, unknown?]> = [
      ["list", "GET", PATH],
      ["create", "POST", PATH, { key: "denied", name: "Otro", categoryId: UNKNOWN_ID }],
      ["update", "PATCH", `${PATH}/${UNKNOWN_ID}`, { name: "Otro" }],
      ["versions", "GET", `${PATH}/${UNKNOWN_ID}/versions`],
      ["create version", "POST", `${PATH}/${UNKNOWN_ID}/versions`, themedVersionInput()],
      ["publish", "POST", `${PATH}/${UNKNOWN_ID}/versions/${UNKNOWN_ID}/publish`],
      ["retire", "POST", `${PATH}/${UNKNOWN_ID}/versions/${UNKNOWN_ID}/retire`],
      ["renderers", "GET", RENDERERS_PATH],
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
      assert.equal(repository.templates.length, 0);
      assert.equal(repository.versions.length, 0);
    });

    it("answers 403 to a customer session and stores nothing", async () => {
      const cookie = await signedIn("CUSTOMER");

      for (const [label, method, target, body] of requests) {
        assert.equal((await send(method, target, cookie, body)).status, 403, label);
      }
      assert.equal(repository.templates.length, 0);
      assert.equal(repository.versions.length, 0);
    });

    it("answers 401 to an administrator who has not enrolled an authenticator app", async () => {
      const cookie = await signedIn("ADMIN");
      const user = database.user?.at(-1);
      assert.ok(user);
      user.twoFactorEnabled = false;

      assert.equal((await send("GET", PATH, cookie)).status, 401);
      assert.equal((await send("GET", RENDERERS_PATH, cookie)).status, 401);
    });

    it("lets an administrator reach every route (none answers 401 or 403)", async () => {
      const cookie = await signedIn("ADMIN");

      for (const [label, method, target, body] of requests) {
        const { status } = await send(method, target, cookie, body);
        assert.ok(status !== 401 && status !== 403, `${label}: ${status}`);
      }
    });
  });

  describe("there is no delete and no snapshot update", () => {
    it("answers 404 to DELETE, PUT, and PATCH on versions", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const draft = await version(cookie, item.id, themedVersionInput());
      const before = snapshotsOf();

      for (const [method, target] of [
        ["DELETE", `${PATH}/${item.id}`],
        ["DELETE", `${PATH}/${item.id}/versions/${draft.id}`],
        ["PUT", `${PATH}/${item.id}/versions/${draft.id}`],
        ["PATCH", `${PATH}/${item.id}/versions/${draft.id}`],
        ["PATCH", `${RENDERERS_PATH}/birthday-poster-01`],
        ["POST", RENDERERS_PATH],
      ] as const) {
        assert.equal((await send(method, target, cookie, { schema: {} })).status, 404, target);
      }
      assert.deepEqual(repository.versions, before);
      assert.ok(repository.templates.some((stored) => stored.id === item.id));
    });
  });

  describe(`GET ${RENDERERS_PATH}`, () => {
    it("lists the registry keys", async () => {
      const cookie = await signedIn("ADMIN");

      const response = await send("GET", RENDERERS_PATH, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), [
        { componentKey: "birthday-map-01" },
        { componentKey: "birthday-poster-01" },
        { componentKey: "birthday-story-01" },
        { componentKey: "baby-shower-classic-01" },
        { componentKey: "baptism-classic-01" },
        { componentKey: "xv-arch-01" },
        { componentKey: "wedding-arch-01" },
        { componentKey: "baptism-arch-01" },
      ]);
    });
  });

  describe(`GET ${PATH}`, () => {
    it("lists templates ordered by key with category, published version, and version count", async () => {
      const cookie = await signedIn("ADMIN");
      const second = await created(cookie, "list-b");
      const first = await created(cookie, "list-a", { description: "Texto" });
      const draft = repository.seedVersion(first.id, {
        ...themedVersionInput(),
        status: "RETIRED",
      });
      const published = repository.seedVersion(first.id, {
        ...themedVersionInput(),
        status: "PUBLISHED",
      });

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
        "category",
        "createdAt",
        "description",
        "id",
        "key",
        "name",
        "publishedVersion",
        "status",
        "updatedAt",
        "versionCount",
      ]);
      assert.equal(listedFirst?.id, first.id);
      assert.equal(listedFirst?.status, "DRAFT");
      assert.deepEqual(listedFirst?.category, {
        id: category.id,
        key: category.key,
        name: category.name,
      });
      assert.deepEqual(listedFirst?.publishedVersion, { id: published.id, version: 2 });
      assert.equal(listedFirst?.versionCount, 2);
      assert.equal(draft.version, 1);
      assert.equal(new Date(String(listedFirst?.createdAt)).toISOString(), listedFirst?.createdAt);
      assert.equal(listedSecond?.id, second.id);
      assert.equal(listedSecond?.publishedVersion, null);
      assert.equal(listedSecond?.versionCount, 0);
    });
  });

  describe(`POST ${PATH}`, () => {
    it("answers 201 with the stored, trimmed template in DRAFT", async () => {
      const cookie = await signedIn("ADMIN");
      const before = repository.templates.length;

      const response = await send("POST", PATH, cookie, {
        key: "new-template",
        name: "  Plantilla nueva  ",
        description: "  Texto  ",
        categoryId: category.id,
      });
      const body = (await response.json()) as Row;

      assert.equal(response.status, 201);
      assert.match(String(body.id), /^[0-9a-f-]{36}$/);
      assert.equal(body.key, "new-template");
      assert.equal(body.name, "Plantilla nueva");
      assert.equal(body.description, "Texto");
      assert.equal(body.status, "DRAFT");
      assert.deepEqual(body.category, { id: category.id, key: category.key, name: category.name });
      assert.equal(body.publishedVersion, null);
      assert.equal(body.versionCount, 0);
      assert.equal(new Date(String(body.createdAt)).toISOString(), body.createdAt);
      assert.equal(new Date(String(body.updatedAt)).toISOString(), body.updatedAt);
      assert.equal(repository.templates.length, before + 1);
    });

    it("stores a missing description as null", async () => {
      const cookie = await signedIn("ADMIN");

      assert.equal((await created(cookie)).description, null);
    });

    it("answers 409 CATALOG_KEY_TAKEN for a duplicate key and keeps the stored template", async () => {
      const cookie = await signedIn("ADMIN");
      const first = await created(cookie, "dup-key", { name: "Primero" });
      const before = structuredClone(repository.templates);

      const response = await send("POST", PATH, cookie, {
        key: "dup-key",
        name: "Segundo",
        categoryId: category.id,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "CATALOG_KEY_TAKEN" });
      assert.deepEqual(repository.templates, before);
      assert.equal(repository.templates.find((stored) => stored.id === first.id)?.name, "Primero");
    });

    it("answers 400 CATALOG_CATEGORY_NOT_FOUND for an unknown category and stores nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const before = structuredClone(repository.templates);

      const response = await send("POST", PATH, cookie, {
        key: "no-category",
        name: "N",
        categoryId: UNKNOWN_ID,
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "CATALOG_CATEGORY_NOT_FOUND" });
      assert.deepEqual(repository.templates, before);
    });

    const invalid: Array<[string, Row | string]> = [
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
      ["a missing category", { key: "bad-input", name: "N", categoryId: undefined }],
      ["a malformed category id", { key: "bad-input", name: "N", categoryId: "birthday" }],
      ["an unknown field", { key: "bad-input", name: "N", sort: 1 }],
      ["a client-supplied id", { key: "bad-input", name: "N", id: UNKNOWN_ID }],
      ["a client-supplied status", { key: "bad-input", name: "N", status: "PUBLISHED" }],
      ["a JSON array body", "[]"],
      ["an empty body", {}],
    ];

    for (const [label, body] of invalid) {
      it(`answers 400 for ${label} and stores nothing`, async () => {
        const cookie = await signedIn("ADMIN");
        const before = structuredClone(repository.templates);
        const payload = typeof body === "string" ? body : { categoryId: category.id, ...body };

        const response = await send("POST", PATH, cookie, payload);

        assert.equal(response.status, 400);
        assert.deepEqual(repository.templates, before);
      });
    }
  });

  describe(`PATCH ${PATH}/:id`, () => {
    it("changes name, description, category, and status and answers the stored template", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie, undefined, { description: "Antes" });
      const other = repository.addCategory(`other-${sequence}`);

      const response = await send("PATCH", `${PATH}/${item.id}`, cookie, {
        name: "  Nuevo  ",
        description: null,
        categoryId: other.id,
        status: "ARCHIVED",
      });
      const body = (await response.json()) as Row;

      assert.equal(response.status, 200);
      assert.equal(body.id, item.id);
      assert.equal(body.key, item.key);
      assert.equal(body.name, "Nuevo");
      assert.equal(body.description, null);
      assert.equal(body.status, "ARCHIVED");
      assert.deepEqual(body.category, { id: other.id, key: other.key, name: other.name });
    });

    it("answers 409 CATALOG_TEMPLATE_NOT_PUBLISHABLE for PUBLISHED without a PUBLISHED version and keeps the row", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      repository.seedVersion(item.id, { ...themedVersionInput(), status: "DRAFT" });
      repository.seedVersion(item.id, { ...themedVersionInput(), status: "RETIRED" });
      const before = structuredClone(repository.templates);

      const response = await send("PATCH", `${PATH}/${item.id}`, cookie, {
        name: "Otro",
        status: "PUBLISHED",
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "CATALOG_TEMPLATE_NOT_PUBLISHABLE" });
      assert.deepEqual(repository.templates, before);
    });

    it("answers 200 for PUBLISHED when the template has a PUBLISHED version", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const draft = await version(cookie, item.id, themedVersionInput());
      assert.equal(
        (await send("POST", `${PATH}/${item.id}/versions/${draft.id}/publish`, cookie)).status,
        200,
      );

      const response = await send("PATCH", `${PATH}/${item.id}`, cookie, { status: "PUBLISHED" });
      const body = (await response.json()) as Row;

      assert.equal(response.status, 200);
      assert.equal(body.status, "PUBLISHED");
      assert.deepEqual(body.publishedVersion, { id: draft.id, version: 1 });
    });

    it("answers 404 for an unknown or non-UUID id", async () => {
      const cookie = await signedIn("ADMIN");

      for (const id of [UNKNOWN_ID, "not-a-uuid"]) {
        assert.equal((await send("PATCH", `${PATH}/${id}`, cookie, { name: "N" })).status, 404, id);
      }
    });

    it("answers 400 CATALOG_CATEGORY_NOT_FOUND for an unknown category and keeps the row", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const before = structuredClone(repository.templates);

      const response = await send("PATCH", `${PATH}/${item.id}`, cookie, {
        name: "Otro",
        categoryId: UNKNOWN_ID,
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "CATALOG_CATEGORY_NOT_FOUND" });
      assert.deepEqual(repository.templates, before);
    });

    const invalid: Array<[string, unknown]> = [
      ["an empty body", {}],
      ["the immutable key", { key: "other-key" }],
      ["a blank name", { name: " " }],
      ["a name over 120 characters", { name: "a".repeat(121) }],
      ["a description over 1000 characters", { description: "a".repeat(1001) }],
      ["a malformed category id", { categoryId: "birthday" }],
      ["a RETIRED status", { status: "RETIRED" }],
      ["a lower-case status", { status: "draft" }],
      ["a numeric status", { status: 1 }],
      ["an unknown field", { sort: 1 }],
      ["a client-supplied id", { id: UNKNOWN_ID }],
      ["a JSON array body", "[]"],
    ];

    for (const [label, body] of invalid) {
      it(`answers 400 for ${label} and changes nothing`, async () => {
        const cookie = await signedIn("ADMIN");
        const item = await created(cookie);
        const before = structuredClone(repository.templates);

        const response = await send("PATCH", `${PATH}/${item.id}`, cookie, body);

        assert.equal(response.status, 400);
        assert.deepEqual(repository.templates, before);
      });
    }
  });

  describe(`GET ${PATH}/:id/versions`, () => {
    it("lists the versions newest first with their snapshot", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const input = themedVersionInput();
      const first = await version(cookie, item.id, input);
      const second = await version(cookie, item.id, input);

      const response = await send("GET", `${PATH}/${item.id}/versions`, cookie);
      const body = (await response.json()) as Row[];

      assert.equal(response.status, 200);
      assert.deepEqual(
        body.map((row) => row.id),
        [second.id, first.id],
      );
      assert.deepEqual(Object.keys(body[0] ?? {}).sort(), [
        "componentKey",
        "configuration",
        "createdAt",
        "id",
        "schema",
        "status",
        "version",
      ]);
      assert.equal(body[0]?.version, 2);
      assert.equal(body[0]?.status, "DRAFT");
      assert.equal(body[0]?.componentKey, "birthday-poster-01");
      assert.deepEqual(body[0]?.schema, input.schema);
      assert.deepEqual(body[0]?.configuration, input.configuration);
      assert.equal(new Date(String(body[0]?.createdAt)).toISOString(), body[0]?.createdAt);
    });

    it("answers an empty list for a template without versions and 404 for an unknown id", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);

      const empty = await send("GET", `${PATH}/${item.id}/versions`, cookie);
      assert.equal(empty.status, 200);
      assert.deepEqual(await empty.json(), []);
      for (const id of [UNKNOWN_ID, "not-a-uuid"]) {
        assert.equal((await send("GET", `${PATH}/${id}/versions`, cookie)).status, 404, id);
      }
    });
  });

  describe(`POST ${PATH}/:id/versions`, () => {
    it("answers 201 with a DRAFT version numbered max + 1 and the snapshot as sent", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const input = themedVersionInput();

      const first = await send("POST", `${PATH}/${item.id}/versions`, cookie, input);
      const firstBody = (await first.json()) as Row;
      const second = await send("POST", `${PATH}/${item.id}/versions`, cookie, input);
      const secondBody = (await second.json()) as Row;

      assert.equal(first.status, 201);
      assert.match(String(firstBody.id), /^[0-9a-f-]{36}$/);
      assert.equal(firstBody.version, 1);
      assert.equal(firstBody.status, "DRAFT");
      assert.equal(firstBody.componentKey, "birthday-poster-01");
      assert.deepEqual(firstBody.schema, input.schema);
      assert.deepEqual(firstBody.configuration, input.configuration);
      assert.equal(new Date(String(firstBody.createdAt)).toISOString(), firstBody.createdAt);
      assert.equal(second.status, 201);
      assert.equal(secondBody.version, 2);
    });

    it("answers 404 for an unknown or non-UUID template and stores nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const before = snapshotsOf();

      for (const id of [UNKNOWN_ID, "not-a-uuid"]) {
        const response = await send("POST", `${PATH}/${id}/versions`, cookie, themedVersionInput());
        assert.equal(response.status, 404, id);
      }
      assert.deepEqual(repository.versions, before);
    });

    it("answers 400 CATALOG_RENDERER_CONTRACT_INVALID with the issues for an unregistered renderer", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const before = snapshotsOf();

      const response = await send("POST", `${PATH}/${item.id}/versions`, cookie, {
        ...themedVersionInput(),
        componentKey: "unknown-renderer",
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        code: "CATALOG_RENDERER_CONTRACT_INVALID",
        issues: ['componentKey "unknown-renderer" is not a registered renderer'],
      });
      assert.deepEqual(repository.versions, before);
    });

    it("answers 400 CATALOG_RENDERER_CONTRACT_INVALID with the issues for a configuration the renderer refuses", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const valid = themedVersionInput();
      const before = snapshotsOf();

      const response = await send("POST", `${PATH}/${item.id}/versions`, cookie, {
        ...valid,
        configuration: { ...(valid.configuration as object), theme: "neon" },
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        code: "CATALOG_RENDERER_CONTRACT_INVALID",
        issues: [
          "configuration.theme must be one of: ice-kingdom, rescue-team, spider-hero, classic-mouse, dinosaurs, under-the-sea, fairytale-princess, blocks-and-pixels",
        ],
      });
      assert.deepEqual(repository.versions, before);
    });

    it("answers 400 CATALOG_RENDERER_CONTRACT_INVALID for a non-string component key or a schema that is not an object", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const valid = themedVersionInput();
      const before = snapshotsOf();

      for (const [body, issue] of [
        [{ ...valid, componentKey: 7 }, "componentKey must be a string"],
        [{ ...valid, schema: [] }, "schema must be a JSON object"],
      ] as const) {
        const response = await send("POST", `${PATH}/${item.id}/versions`, cookie, body);
        assert.equal(response.status, 400);
        const parsed = (await response.json()) as { code: string; issues: string[] };
        assert.equal(parsed.code, "CATALOG_RENDERER_CONTRACT_INVALID");
        assert.ok(parsed.issues.includes(issue), issue);
      }
      assert.deepEqual(repository.versions, before);
    });

    it("answers 400 for a schema or a configuration over 64 KiB, and stores nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const valid = themedVersionInput();
      const padding = "a".repeat(65 * 1024);
      const before = snapshotsOf();

      for (const body of [
        { ...valid, schema: { ...(valid.schema as object), padding } },
        { ...valid, configuration: { ...(valid.configuration as object), padding } },
      ]) {
        const response = await send("POST", `${PATH}/${item.id}/versions`, cookie, body);
        assert.equal(response.status, 400);
      }
      assert.deepEqual(repository.versions, before);
    });

    it("accepts a snapshot part just under 64 KiB when the registry contract allows it", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const valid = themedVersionInput();
      const schema = valid.schema as { properties: Record<string, unknown> };
      const bounded = {
        ...valid,
        schema: {
          ...schema,
          properties: {
            ...schema.properties,
            extra: { type: "string", title: "a".repeat(60 * 1024) },
          },
        },
      };

      const response = await send("POST", `${PATH}/${item.id}/versions`, cookie, bounded);

      assert.equal(response.status, 201);
    });

    const invalid: Array<[string, unknown]> = [
      ["an empty body", {}],
      ["a missing component key", { schema: {}, configuration: {} }],
      ["a missing schema", { componentKey: "birthday-poster-01", configuration: {} }],
      ["a missing configuration", { componentKey: "birthday-poster-01", schema: {} }],
      ["a null schema", { componentKey: "birthday-poster-01", schema: null, configuration: {} }],
      [
        "an unknown field",
        {
          componentKey: "birthday-poster-01",
          schema: {},
          configuration: {},
          status: "PUBLISHED",
        },
      ],
      ["a JSON array body", "[]"],
    ];

    for (const [label, body] of invalid) {
      it(`answers 400 for ${label} and stores nothing`, async () => {
        const cookie = await signedIn("ADMIN");
        const item = await created(cookie);
        const before = snapshotsOf();

        const response = await send("POST", `${PATH}/${item.id}/versions`, cookie, body);

        assert.equal(response.status, 400);
        assert.deepEqual(repository.versions, before);
      });
    }

    it("answers 409 CATALOG_CONCURRENT_UPDATE when a concurrent create wins the number", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const original = repository.createVersion.bind(repository);
      repository.createVersion = async () => {
        throw new CatalogConcurrentUpdateError();
      };

      try {
        const response = await send(
          "POST",
          `${PATH}/${item.id}/versions`,
          cookie,
          themedVersionInput(),
        );

        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "CATALOG_CONCURRENT_UPDATE" });
      } finally {
        repository.createVersion = original;
      }
    });
  });

  describe(`POST ${PATH}/:id/versions/:versionId/publish`, () => {
    it("answers 200 with the PUBLISHED version and retires the previously published one", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const first = await version(cookie, item.id, themedVersionInput());
      const second = await version(cookie, item.id, themedVersionInput());
      const firstPublish = await send(
        "POST",
        `${PATH}/${item.id}/versions/${first.id}/publish`,
        cookie,
      );
      assert.equal(firstPublish.status, 200);

      const response = await send(
        "POST",
        `${PATH}/${item.id}/versions/${second.id}/publish`,
        cookie,
      );
      const body = (await response.json()) as Row;

      assert.equal(response.status, 200);
      assert.equal(body.id, second.id);
      assert.equal(body.version, 2);
      assert.equal(body.status, "PUBLISHED");
      const listed = (await (
        await send("GET", `${PATH}/${item.id}/versions`, cookie)
      ).json()) as Row[];
      assert.deepEqual(
        listed.map((row) => [row.version, row.status]),
        [
          [2, "PUBLISHED"],
          [1, "RETIRED"],
        ],
      );
    });

    it("answers 409 CATALOG_VERSION_TRANSITION_NOT_ALLOWED for a version that is not DRAFT and changes nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const published = repository.seedVersion(item.id, {
        ...themedVersionInput(),
        status: "PUBLISHED",
      });
      const retired = repository.seedVersion(item.id, {
        ...themedVersionInput(),
        status: "RETIRED",
      });
      const before = snapshotsOf();

      for (const target of [published, retired]) {
        const response = await send(
          "POST",
          `${PATH}/${item.id}/versions/${target.id}/publish`,
          cookie,
        );
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
          code: "CATALOG_VERSION_TRANSITION_NOT_ALLOWED",
        });
      }
      assert.deepEqual(repository.versions, before);
    });

    it("answers 409 CATALOG_RENDERER_CONTRACT_INVALID with the issues when the renderer is no longer registered", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const current = repository.seedVersion(item.id, {
        ...themedVersionInput(),
        status: "PUBLISHED",
      });
      const stale = repository.seedVersion(item.id, {
        ...themedVersionInput(),
        componentKey: "removed-renderer",
        status: "DRAFT",
      });
      const before = snapshotsOf();

      const response = await send(
        "POST",
        `${PATH}/${item.id}/versions/${stale.id}/publish`,
        cookie,
      );

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        code: "CATALOG_RENDERER_CONTRACT_INVALID",
        issues: ['componentKey "removed-renderer" is not a registered renderer'],
      });
      assert.deepEqual(repository.versions, before);
      assert.equal(repository.versions.find((row) => row.id === current.id)?.status, "PUBLISHED");
    });

    it("answers 404 for unknown ids and for a version of another template, changing nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const other = await created(cookie);
      const foreign = await version(cookie, other.id, themedVersionInput());
      const before = snapshotsOf();

      for (const target of [
        `${PATH}/${item.id}/versions/${foreign.id}/publish`,
        `${PATH}/${item.id}/versions/${UNKNOWN_ID}/publish`,
        `${PATH}/${UNKNOWN_ID}/versions/${foreign.id}/publish`,
        `${PATH}/not-a-uuid/versions/${foreign.id}/publish`,
        `${PATH}/${other.id}/versions/not-a-uuid/publish`,
      ]) {
        assert.equal((await send("POST", target, cookie)).status, 404, target);
      }
      assert.deepEqual(repository.versions, before);
    });

    it("answers 409 CATALOG_CONCURRENT_UPDATE when a concurrent publish wins", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const draft = await version(cookie, item.id, themedVersionInput());
      const original = repository.publishVersion.bind(repository);
      repository.publishVersion = async () => {
        throw new CatalogConcurrentUpdateError();
      };

      try {
        const response = await send(
          "POST",
          `${PATH}/${item.id}/versions/${draft.id}/publish`,
          cookie,
        );

        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { code: "CATALOG_CONCURRENT_UPDATE" });
      } finally {
        repository.publishVersion = original;
      }
    });
  });

  describe(`POST ${PATH}/:id/versions/:versionId/retire`, () => {
    it("answers 200 with the RETIRED version when the template is not PUBLISHED", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const draft = await version(cookie, item.id, themedVersionInput());
      await send("POST", `${PATH}/${item.id}/versions/${draft.id}/publish`, cookie);

      const response = await send("POST", `${PATH}/${item.id}/versions/${draft.id}/retire`, cookie);
      const body = (await response.json()) as Row;

      assert.equal(response.status, 200);
      assert.equal(body.id, draft.id);
      assert.equal(body.status, "RETIRED");
    });

    it("answers 409 CATALOG_TEMPLATE_NOT_PUBLISHABLE for the published version of a PUBLISHED template, and works after archiving it", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const draft = await version(cookie, item.id, themedVersionInput());
      await send("POST", `${PATH}/${item.id}/versions/${draft.id}/publish`, cookie);
      await send("PATCH", `${PATH}/${item.id}`, cookie, { status: "PUBLISHED" });
      const before = snapshotsOf();

      const refused = await send("POST", `${PATH}/${item.id}/versions/${draft.id}/retire`, cookie);

      assert.equal(refused.status, 409);
      assert.deepEqual(await refused.json(), { code: "CATALOG_TEMPLATE_NOT_PUBLISHABLE" });
      assert.deepEqual(repository.versions, before);

      await send("PATCH", `${PATH}/${item.id}`, cookie, { status: "ARCHIVED" });
      const accepted = await send("POST", `${PATH}/${item.id}/versions/${draft.id}/retire`, cookie);
      assert.equal(accepted.status, 200);
    });

    it("answers 409 CATALOG_VERSION_TRANSITION_NOT_ALLOWED for a DRAFT or RETIRED version and changes nothing", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const draft = repository.seedVersion(item.id, {
        ...themedVersionInput(),
        status: "DRAFT",
      });
      const retired = repository.seedVersion(item.id, {
        ...themedVersionInput(),
        status: "RETIRED",
      });
      const before = snapshotsOf();

      for (const target of [draft, retired]) {
        const response = await send(
          "POST",
          `${PATH}/${item.id}/versions/${target.id}/retire`,
          cookie,
        );
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
          code: "CATALOG_VERSION_TRANSITION_NOT_ALLOWED",
        });
      }
      assert.deepEqual(repository.versions, before);
    });

    it("answers 404 for unknown ids and for a version of another template", async () => {
      const cookie = await signedIn("ADMIN");
      const item = await created(cookie);
      const other = await created(cookie);
      const foreign = repository.seedVersion(other.id, {
        ...themedVersionInput(),
        status: "PUBLISHED",
      });
      const before = snapshotsOf();

      for (const target of [
        `${PATH}/${item.id}/versions/${foreign.id}/retire`,
        `${PATH}/${item.id}/versions/${UNKNOWN_ID}/retire`,
        `${PATH}/${UNKNOWN_ID}/versions/${foreign.id}/retire`,
        `${PATH}/not-a-uuid/versions/${foreign.id}/retire`,
      ]) {
        assert.equal((await send("POST", target, cookie)).status, 404, target);
      }
      assert.deepEqual(repository.versions, before);
    });
  });
});
