import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it, mock } from "node:test";

import { type INestApplication, Logger, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { createApp } from "../../app.setup";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import { InvitationSlugTakenError } from "../application/invitation.application.errors";
import {
  type CatalogPackageEntitlements,
  type CatalogTemplateVersionSnapshot,
  type CatalogVersionRenderData,
  type CatalogVersionSchema,
  INVITATION_CATALOG,
  type InvitationCatalog,
} from "../application/invitation-catalog";
import {
  INVITATION_REPOSITORY,
  type InvitationRecord,
  type InvitationRepository,
  type NewInvitation,
} from "../application/invitation.repository";
import {
  INVITATION_PAYMENT_GATE,
  type InvitationPaymentDecision,
  type InvitationPaymentGate,
} from "../application/invitation-payment-gate";
import type { JsonObject } from "../domain/invitation-content";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import { INVITATION_USE_CASES } from "../invitations.module";
import { InvitationsController } from "./invitations.controller";
import { PublicInvitationsController } from "./public-invitations.controller";

// `/invitations` (M4 T4 and M5 T4; S1, S2, S3, S7, S9, A3, A4, A7) and the `@Public()` public read of a
// published slug, through the shared createApp boundary, the project-owned guard, and Better Auth on the in-memory
// adapter. The invitation port and the catalog contract are in-memory fakes, so the suite needs no network and no
// database; their Prisma adapters are proved in the `*.db-spec.ts` suites, and the use cases themselves in
// `invitation.use-cases.spec.ts`. What this suite owns is the HTTP contract: the session is the only source of the
// owner (S9), no response carries `ownerId`, an id that is not a UUID is refused before it reaches a port, every
// application or domain error maps to its documented status and body, and the public page carries only the
// allow-listed projection with one identical 404 for every slug a guest must not render (A3, A7).

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const PATH = "/invitations";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PUBLISHED_VERSION_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_PACKAGE_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_VERSION_ID = "44444444-4444-4444-8444-444444444444";
/** PUBLISHED, but its `componentKey` is outside the API's renderer allow-list (A3). */
const UNRENDERABLE_VERSION_ID = "55555555-5555-4555-8555-555555555555";
const RENDERER = "birthday-adventure-01";
const UNREGISTERED_RENDERER = "unregistered-renderer-99";
const SCHEMA = {
  type: "object",
  required: ["title"],
  properties: { title: { type: "string", maxLength: 120 } },
};

type Row = Record<string, unknown>;

/** The invitation port in memory: owner scoping, a unique slug, and the lifecycle writes the adapter runs. */
class MemoryInvitationRepository implements InvitationRepository {
  readonly rows: InvitationRecord[] = [];
  /** How many upcoming creates collide on the slug; the create use case retries and then answers 503. */
  slugCollisions = 0;
  private sequence = 0;

  async create(input: NewInvitation): Promise<InvitationRecord> {
    if (this.slugCollisions > 0) {
      this.slugCollisions -= 1;
      throw new InvitationSlugTakenError(input.slug);
    }
    if (this.rows.some((row) => row.slug === input.slug)) {
      throw new InvitationSlugTakenError(input.slug);
    }
    this.sequence += 1;
    const at = new Date(Date.UTC(2026, 10, 11, 12, 0, this.sequence));
    const row: InvitationRecord = {
      id: randomUUID(),
      ...input,
      content: structuredClone(input.content),
      status: "DRAFT",
      archivedAt: null,
      publishedAt: null,
      expiresAt: null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return structuredClone(row);
  }

  async findOwned(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    return row ? structuredClone(row) : null;
  }

  async listOwned(ownerId: string): Promise<InvitationRecord[]> {
    return this.rows
      .filter((row) => row.ownerId === ownerId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((row) => structuredClone(row));
  }

  async updateContent(
    ownerId: string,
    id: string,
    content: JsonObject,
  ): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // A DRAFT or a PUBLISHED invitation changes; a published one changes live (S7).
    if (row.status === "ARCHIVED") {
      throw new InvitationNotEditableError(row.status);
    }
    row.content = structuredClone(content);
    return structuredClone(row);
  }

  async archive(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    // Archiving is allowed from DRAFT or from PUBLISHED, and clears the publication marker (A2).
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "ARCHIVED";
    row.archivedAt = new Date();
    row.publishedAt = null;
    return structuredClone(row);
  }

  async publish(ownerId: string, id: string, at: Date): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "PUBLISHED") {
      throw new InvitationAlreadyPublishedError();
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "PUBLISHED";
    row.publishedAt = at;
    row.updatedAt = at;
    return structuredClone(row);
  }

  async unpublish(ownerId: string, id: string): Promise<InvitationRecord | null> {
    const row = this.rows.find((stored) => stored.id === id && stored.ownerId === ownerId);
    if (!row) {
      return null;
    }
    if (row.status === "DRAFT") {
      throw new InvitationNotPublishedError();
    }
    if (row.status === "ARCHIVED") {
      throw new InvitationAlreadyArchivedError();
    }
    row.status = "DRAFT";
    row.publishedAt = null;
    return structuredClone(row);
  }

  async findPublishedBySlug(slug: string): Promise<InvitationRecord | null> {
    const now = Date.now();
    const row = this.rows.find(
      (stored) =>
        stored.slug === slug &&
        stored.status === "PUBLISHED" &&
        (stored.expiresAt === null || stored.expiresAt.getTime() > now),
    );
    return row ? structuredClone(row) : null;
  }
}

/**
 * The catalog contract in memory: one PUBLISHED version, one DRAFT version, and one ACTIVE and one DRAFT
 * package. An unpublished version answers `findPublishedVersion` with null and `findVersionSchema` with its
 * schema, exactly as the catalog contract states (S3). One extra version is PUBLISHED but names a renderer the
 * API's allow-list does not know, so the public read can be shown refusing it (A3).
 */
class MemoryInvitationCatalog implements InvitationCatalog {
  readonly versions = new Map<
    string,
    { published: boolean; schema: unknown; componentKey?: string }
  >([
    [PUBLISHED_VERSION_ID, { published: true, schema: SCHEMA }],
    [DRAFT_VERSION_ID, { published: false, schema: SCHEMA }],
    [
      UNRENDERABLE_VERSION_ID,
      { published: true, schema: SCHEMA, componentKey: UNREGISTERED_RENDERER },
    ],
  ]);
  readonly packages = new Map<string, CatalogPackageEntitlements>([
    [ACTIVE_PACKAGE_ID, { status: "ACTIVE", includedFeatureKeys: [] }],
    [DRAFT_PACKAGE_ID, { status: "DRAFT", includedFeatureKeys: [] }],
  ]);

  /** Every version renders with the allow-listed component unless it says otherwise. */
  private componentKeyOf(versionId: string): string {
    return this.versions.get(versionId)?.componentKey ?? RENDERER;
  }

  async findPublishedVersion(versionId: string): Promise<CatalogTemplateVersionSnapshot | null> {
    const stored = this.versions.get(versionId);
    if (!stored?.published) {
      return null;
    }

    return {
      id: versionId,
      templateId: randomUUID(),
      componentKey: this.componentKeyOf(versionId),
      schema: stored.schema,
      requiredFeatureKeys: [],
    };
  }

  async findVersionSchema(versionId: string): Promise<CatalogVersionSchema | null> {
    const stored = this.versions.get(versionId);
    return stored ? { id: versionId, schema: stored.schema } : null;
  }

  async findPackageEntitlements(packageId: string): Promise<CatalogPackageEntitlements | null> {
    return this.packages.get(packageId) ?? null;
  }

  async findVersionRenderData(versionId: string): Promise<CatalogVersionRenderData | null> {
    const stored = this.versions.get(versionId);
    if (!stored) {
      return null;
    }
    const componentKey = this.componentKeyOf(versionId);

    return {
      componentKey,
      configuration: { componentKey },
      schema: stored.schema,
    };
  }

  isRendererRegistered(componentKey: string): boolean {
    return componentKey === RENDERER;
  }
}

/**
 * The publication payment gate in memory (S6): it answers "no payment required" until a test asks it to
 * refuse, so the 402 outcome can be observed even though Milestone 5 binds the always-free adapter.
 */
class MemoryPaymentGate implements InvitationPaymentGate {
  refusalReason: string | null = null;
  asked = 0;

  async publicationPaymentRequired(): Promise<InvitationPaymentDecision> {
    this.asked += 1;
    return this.refusalReason === null
      ? { required: false }
      : { required: true, reason: this.refusalReason };
  }
}

describe("invitations routes: /invitations", () => {
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
  const repository = new MemoryInvitationRepository();
  const catalog = new MemoryInvitationCatalog();
  const paymentGate = new MemoryPaymentGate();
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
      controllers: [InvitationsController, PublicInvitationsController],
      providers: [
        ...INVITATION_USE_CASES,
        { provide: INVITATION_REPOSITORY, useValue: repository },
        { provide: INVITATION_CATALOG, useValue: catalog },
        // Publication is free in Milestone 5; the publish use case asks this gate (S6).
        { provide: INVITATION_PAYMENT_GATE, useValue: paymentGate },
      ],
    })
    class InvitationsTestModule {}

    app = await createApp(InvitationsTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  /** A stored customer and a signed session cookie for them, as an email-code sign-in leaves them. */
  async function signedInCustomer(): Promise<{ userId: string; cookie: string }> {
    userCounter += 1;
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      { email: `m4-t4-invitations-${userCounter}@example.test`, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    const session = await context.internalAdapter.createSession(created.id);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      userId: created.id,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    };
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

  const draftBody = () => ({
    templateVersionId: PUBLISHED_VERSION_ID,
    packageId: ACTIVE_PACKAGE_ID,
  });

  async function createDraft(cookie: string) {
    const response = await send("POST", PATH, cookie, draftBody());
    assert.equal(response.status, 201);
    return (await response.json()) as Row & { id: string; slug: string };
  }

  const SUMMARY_KEYS = [
    "archivedAt",
    "createdAt",
    "id",
    "packageId",
    "publishedAt",
    "slug",
    "status",
    "templateVersionId",
    "updatedAt",
  ];
  const OWNED_KEYS = [...SUMMARY_KEYS, "content", "missingRequiredFields"].sort();

  describe("access control", () => {
    const requests: Array<[string, string, string, unknown?]> = [
      ["create", "POST", PATH, { templateVersionId: 42, role: "ADMIN" }],
      ["list", "GET", PATH],
      ["read", "GET", `${PATH}/${UNKNOWN_ID}`],
      ["replace content", "PUT", `${PATH}/${UNKNOWN_ID}/content`, { content: "not-an-object" }],
      ["archive", "POST", `${PATH}/${UNKNOWN_ID}/archive`],
      ["publish", "POST", `${PATH}/${UNKNOWN_ID}/publish`],
      ["unpublish", "POST", `${PATH}/${UNKNOWN_ID}/unpublish`],
    ];

    it("answers 401 without a valid session, before validating the body, and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const headers = [undefined, `${SESSION_COOKIE}=not-a-session`, `${cookie.slice(0, -4)}AAAA`];

      for (const header of headers) {
        for (const [label, method, target, body] of requests) {
          assert.equal((await send(method, target, header, body)).status, 401, label);
        }
      }
      assert.equal(repository.rows.length, 0);
    });

    it("lets a signed-in customer reach every route (none answers 401 or 403)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const [label, method, target, body] of requests) {
        const patched = target.replace(UNKNOWN_ID, draft.id);
        const response = await send(method, patched, cookie, body ?? undefined);
        assert.ok(
          response.status !== 401 && response.status !== 403,
          `${label}: ${response.status}`,
        );
      }
    });
  });

  describe("POST /invitations", () => {
    it("creates a DRAFT owned by the session user and answers 201 with the owned invitation", async () => {
      const { userId, cookie } = await signedInCustomer();

      const response = await send("POST", PATH, cookie, draftBody());

      assert.equal(response.status, 201);
      const body = (await response.json()) as Row & { id: string };
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.archivedAt, null);
      assert.equal(body.templateVersionId, PUBLISHED_VERSION_ID);
      assert.equal(body.packageId, ACTIVE_PACKAGE_ID);
      assert.match(String(body.slug), /^[a-z0-9]+(-[a-z0-9]+)*$/);
      assert.deepEqual(body.content, {});
      assert.deepEqual(body.missingRequiredFields, ["title"]);
      for (const field of ["createdAt", "updatedAt"]) {
        assert.equal(new Date(String(body[field])).toISOString(), body[field], field);
      }

      const stored = repository.rows.find((row) => row.id === body.id);
      assert.ok(stored);
      assert.equal(stored.ownerId, userId);
    });

    it("takes the owner from the session and never from the body", async () => {
      const { userId, cookie } = await signedInCustomer();
      const other = await signedInCustomer();

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        ownerId: other.userId,
      });

      // An unknown field is refused by the global pipe, so no request can even offer an owner.
      assert.equal(response.status, 400);
      assert.equal(
        repository.rows.some((row) => row.ownerId === other.userId),
        false,
      );

      const accepted = await createDraft(cookie);
      assert.equal(repository.rows.find((row) => row.id === accepted.id)?.ownerId, userId);
    });

    it("answers 400 for a body the DTO refuses and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;
      const bodies: unknown[] = [
        {},
        { templateVersionId: PUBLISHED_VERSION_ID },
        { packageId: ACTIVE_PACKAGE_ID },
        { templateVersionId: "not-a-uuid", packageId: ACTIVE_PACKAGE_ID },
        { templateVersionId: PUBLISHED_VERSION_ID, packageId: "not-a-uuid" },
        { ...draftBody(), slug: "chosen-by-the-client" },
        { ...draftBody(), status: "ARCHIVED" },
        "not-json",
      ];

      for (const body of bodies) {
        const response = await send("POST", PATH, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.equal(repository.rows.length, before);
    });

    it("answers 404 INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED for a version that is missing or not published", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      for (const templateVersionId of [UNKNOWN_ID, DRAFT_VERSION_ID]) {
        const response = await send("POST", PATH, cookie, {
          ...draftBody(),
          templateVersionId,
        });

        assert.equal(response.status, 404, templateVersionId);
        assert.deepEqual(await response.json(), {
          code: "INVITATION_TEMPLATE_VERSION_NOT_PUBLISHED",
        });
      }
      assert.equal(repository.rows.length, before);
    });

    it("answers 404 INVITATION_PACKAGE_NOT_FOUND for a package that does not exist", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        packageId: UNKNOWN_ID,
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_PACKAGE_NOT_FOUND" });
      assert.equal(repository.rows.length, before);
    });

    it("answers 400 INVITATION_PACKAGE_DOES_NOT_FIT for a package that does not fit and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;

      const response = await send("POST", PATH, cookie, {
        ...draftBody(),
        packageId: DRAFT_PACKAGE_ID,
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "INVITATION_PACKAGE_DOES_NOT_FIT" });
      assert.equal(repository.rows.length, before);
    });

    it("answers 503 INVITATION_SLUG_UNAVAILABLE when no slug can be stored and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const before = repository.rows.length;
      repository.slugCollisions = Number.MAX_SAFE_INTEGER;

      try {
        const response = await send("POST", PATH, cookie, draftBody());

        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { code: "INVITATION_SLUG_UNAVAILABLE" });
        assert.equal(repository.rows.length, before);
      } finally {
        repository.slugCollisions = 0;
      }
    });
  });

  describe("GET /invitations", () => {
    it("lists only the session user's invitations, newest first, with no ownerId", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const first = await createDraft(owner.cookie);
      const second = await createDraft(owner.cookie);
      await createDraft(other.cookie);

      const response = await send("GET", PATH, owner.cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row[];
      assert.deepEqual(
        body.map((item) => item.id),
        [second.id, first.id],
      );
      for (const item of body) {
        assert.deepEqual(Object.keys(item).sort(), SUMMARY_KEYS);
        assert.equal(item.ownerId, undefined);
      }
    });

    it("answers an empty list to an owner without invitations", async () => {
      const { cookie } = await signedInCustomer();

      const response = await send("GET", PATH, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), []);
    });
  });

  describe("GET /invitations/:id", () => {
    it("answers the owner's invitation with its content and missing required fields", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("GET", `${PATH}/${draft.id}`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.ownerId, undefined);
      assert.deepEqual(body.content, {});
      assert.deepEqual(body.missingRequiredFields, ["title"]);
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("GET", `${PATH}/${id}`, other.cookie);
        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
    });

    it("answers 400 for an id that is not a UUID", async () => {
      const { cookie } = await signedInCustomer();

      const probes: Array<[string, string, unknown?]> = [
        ["GET", `${PATH}/not-a-uuid`],
        ["GET", `${PATH}/1`],
        ["PUT", `${PATH}/1/content`, { content: {} }],
        ["POST", `${PATH}/1/archive`],
        ["POST", `${PATH}/1/publish`],
        ["POST", `${PATH}/1/unpublish`],
      ];

      for (const [method, path, body] of probes) {
        const response = await send(method, path, cookie, body);
        assert.equal(response.status, 400, `${method} ${path}`);
      }
    });
  });

  describe("PUT /invitations/:id/content", () => {
    it("replaces the content, validates it against the pinned version, and answers the owned invitation", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Cumpleaños de Ana" },
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.deepEqual(body.content, { title: "Cumpleaños de Ana" });
      assert.deepEqual(body.missingRequiredFields, []);
      assert.equal(body.ownerId, undefined);
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, {
        title: "Cumpleaños de Ana",
      });
    });

    it("answers 400 INVALID_INVITATION_CONTENT with its issues and keeps the stored content", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });
      const before = structuredClone(repository.rows.find((row) => row.id === draft.id)?.content);

      for (const content of [{ title: 42 }, { subtitle: "x" }, "not-an-object", []]) {
        const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content });

        assert.equal(response.status, 400, JSON.stringify(content));
        const body = (await response.json()) as { code: string; issues: string[] };
        assert.equal(body.code, "INVALID_INVITATION_CONTENT");
        assert.ok(Array.isArray(body.issues) && body.issues.length > 0);
      }
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, before);
    });

    it("answers 400 for a body without content or with an unknown field, and changes nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      for (const body of [{}, { content: {}, templateVersionId: UNKNOWN_ID }, { content: "x" }]) {
        const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, body);
        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.deepEqual(repository.rows.find((row) => row.id === draft.id)?.content, {});
    });

    it("answers 409 INVITATION_NOT_EDITABLE for an archived invitation and keeps it unchanged", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Ana" },
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_EDITABLE" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.deepEqual(stored?.content, {});
    });

    it("answers 404 for another customer's invitation and changes nothing", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      const response = await send("PUT", `${PATH}/${draft.id}/content`, other.cookie, {
        content: { title: "Ana" },
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.deepEqual(stored?.content, {});
      assert.equal(stored?.status, "DRAFT");
    });
  });

  describe("POST /invitations/:id/archive", () => {
    it("archives a DRAFT and answers 200 with the summary", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), SUMMARY_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.status, "ARCHIVED");
      assert.equal(new Date(String(body.archivedAt)).toISOString(), body.archivedAt);
      assert.equal(body.ownerId, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.ok(stored?.archivedAt);
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for a repeated archive", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
    });

    it("answers 404 for another customer's invitation and keeps it a DRAFT", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await createDraft(owner.cookie);

      const response = await send("POST", `${PATH}/${draft.id}/archive`, other.cookie);

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.status, "DRAFT");
    });
  });

  describe("POST /invitations/:id/publish", () => {
    /** A draft that satisfies the pinned schema, so readiness passes and only the transition is observed. */
    async function publishableDraft(cookie: string) {
      const draft = await createDraft(cookie);
      const filled = await send("PUT", `${PATH}/${draft.id}/content`, cookie, {
        content: { title: "Cumpleaños de Ana" },
      });
      assert.equal(filled.status, 200);
      return draft;
    }

    it("publishes a ready DRAFT and answers 200 with the owned invitation and its publishedAt", async () => {
      const { userId, cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      const asked = paymentGate.asked;

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), OWNED_KEYS);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.expiresAt, undefined, "Milestone 5 never exposes an expiry (S8)");
      assert.equal(body.status, "PUBLISHED");
      assert.equal(new Date(String(body.publishedAt)).toISOString(), body.publishedAt);
      assert.deepEqual(body.missingRequiredFields, []);
      assert.equal(paymentGate.asked, asked + 1, "the payment gate is asked once (S6)");

      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.ok(stored);
      assert.equal(stored.ownerId, userId);
      assert.equal(stored.status, "PUBLISHED");
      assert.equal(stored.publishedAt?.toISOString(), body.publishedAt);
    });

    it("answers 409 INVITATION_NOT_PUBLISHABLE with its issues for an incomplete draft, and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        code: "INVITATION_NOT_PUBLISHABLE",
        issues: ["content.title is required to publish"],
      });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 409 INVITATION_ALREADY_PUBLISHED for a repeated publish", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      const first = await send("POST", `${PATH}/${draft.id}/publish`, cookie);
      assert.equal(first.status, 200);
      const publishedAt = ((await first.json()) as Row).publishedAt;

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_PUBLISHED" });
      assert.equal(
        repository.rows.find((row) => row.id === draft.id)?.publishedAt?.toISOString(),
        publishedAt,
        "the first publishedAt is kept",
      );
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for an archived invitation, and keeps it archived", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      assert.equal((await send("POST", `${PATH}/${draft.id}/archive`, cookie)).status, 200);

      const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 402 INVITATION_PAYMENT_REQUIRED with the gate's reason and stores nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishableDraft(cookie);
      paymentGate.refusalReason = "SUBSCRIPTION_REQUIRED";

      try {
        const response = await send("POST", `${PATH}/${draft.id}/publish`, cookie);

        assert.equal(response.status, 402);
        assert.deepEqual(await response.json(), {
          code: "INVITATION_PAYMENT_REQUIRED",
          reason: "SUBSCRIPTION_REQUIRED",
        });
        const stored = repository.rows.find((row) => row.id === draft.id);
        assert.equal(stored?.status, "DRAFT");
        assert.equal(stored?.publishedAt, null);
      } finally {
        paymentGate.refusalReason = null;
      }
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await publishableDraft(owner.cookie);

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("POST", `${PATH}/${id}/publish`, other.cookie);

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });
  });

  describe("POST /invitations/:id/unpublish", () => {
    /** Publishes through the API, so the unpublish test starts from a row the transitions really produced. */
    async function publishedDraft(cookie: string) {
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });
      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      return draft;
    }

    it("returns a PUBLISHED invitation to DRAFT and answers 200 with the summary", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishedDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), SUMMARY_KEYS);
      assert.equal(body.id, draft.id);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.publishedAt, null);
      assert.equal(body.archivedAt, null);
      assert.equal(body.ownerId, undefined);
      assert.equal(body.expiresAt, undefined);
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "DRAFT");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 409 INVITATION_NOT_PUBLISHED for a draft that was never published, and changes nothing", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_PUBLISHED" });
      assert.equal(repository.rows.find((row) => row.id === draft.id)?.status, "DRAFT");
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for an archived invitation, and keeps it archived", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await publishedDraft(cookie);
      assert.equal((await send("POST", `${PATH}/${draft.id}/archive`, cookie)).status, 200);

      const response = await send("POST", `${PATH}/${draft.id}/unpublish`, cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "ARCHIVED");
      assert.equal(stored?.publishedAt, null);
    });

    it("answers 404 INVITATION_NOT_FOUND for another customer's invitation and for an unknown id", async () => {
      const owner = await signedInCustomer();
      const other = await signedInCustomer();
      const draft = await publishedDraft(owner.cookie);
      const publishedAt = repository.rows.find((row) => row.id === draft.id)?.publishedAt;

      for (const id of [draft.id, UNKNOWN_ID]) {
        const response = await send("POST", `${PATH}/${id}/unpublish`, other.cookie);

        assert.equal(response.status, 404, id);
        assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
      }
      const stored = repository.rows.find((row) => row.id === draft.id);
      assert.equal(stored?.status, "PUBLISHED");
      assert.equal(stored?.publishedAt, publishedAt);
    });
  });

  describe("GET /public/invitations/:slug", () => {
    const PUBLIC_PATH = "/public/invitations";
    /** Every key a guest receives (A7): nothing else may appear. */
    const PUBLIC_KEYS = ["componentKey", "configuration", "content", "publishedAt", "slug"];
    /** Everything a public body must never carry: owner, package, price, status, ids, and the expiry (A7, S8). */
    const PRIVATE_KEYS = [
      "archivedAt",
      "createdAt",
      "expiresAt",
      "id",
      "missingRequiredFields",
      "ownerId",
      "packageId",
      "status",
      "templateVersionId",
      "updatedAt",
    ];

    /**
     * A stored row inserted directly, because the public read is the only thing under test here: the owner
     * routes already write these states. `content` keeps one undeclared key (`subtitle`), so the projection
     * that drops it is observed (A7).
     */
    function seed(overrides: {
      slug: string;
      status: InvitationStatus;
      templateVersionId?: string;
      expiresAt?: Date | null;
    }): InvitationRecord {
      const at = new Date(Date.UTC(2026, 9, 12, 9, 0, 0));
      const row: InvitationRecord = {
        id: randomUUID(),
        ownerId: randomUUID(),
        templateVersionId: overrides.templateVersionId ?? PUBLISHED_VERSION_ID,
        packageId: ACTIVE_PACKAGE_ID,
        slug: overrides.slug,
        status: overrides.status,
        content: { title: "Cumpleaños de Ana", subtitle: "una nota que el esquema no declara" },
        archivedAt: overrides.status === "ARCHIVED" ? at : null,
        publishedAt: overrides.status === "PUBLISHED" ? at : null,
        expiresAt: overrides.expiresAt ?? null,
        createdAt: at,
        updatedAt: at,
      };
      repository.rows.push(row);
      return row;
    }

    it("answers exactly the public projection, without any session", async () => {
      const row = seed({ slug: "invitacion-k7m2qx", status: "PUBLISHED" });

      const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_KEYS);
      assert.equal(body.slug, row.slug);
      assert.equal(body.componentKey, RENDERER);
      assert.deepEqual(body.configuration, { componentKey: RENDERER });
      // Only the keys the pinned schema declares; the stored `subtitle` never reaches a guest (A7).
      assert.deepEqual(body.content, { title: "Cumpleaños de Ana" });
      assert.equal(new Date(String(body.publishedAt)).toISOString(), body.publishedAt);
      for (const key of PRIVATE_KEYS) {
        assert.equal(body[key], undefined, key);
      }
      assert.equal(
        JSON.stringify(body).includes(row.ownerId),
        false,
        "the owner id never reaches a guest",
      );
      assert.equal(response.headers.get("cache-control"), "no-store");
    });

    it("serves the same page with a valid session and with a forged cookie, never reading one", async () => {
      const { cookie } = await signedInCustomer();
      const row = seed({ slug: "invitacion-cookie", status: "PUBLISHED" });

      for (const header of [
        undefined,
        `${SESSION_COOKIE}=forged.value`,
        `${cookie.slice(0, -4)}AAAA`,
        cookie,
      ]) {
        const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`, header);

        assert.equal(response.status, 200, String(header));
        assert.deepEqual(Object.keys((await response.json()) as Row).sort(), PUBLIC_KEYS);
      }
    });

    it("answers one identical uncacheable 404 for a malformed, unknown, draft, archived, expired, or unrenderable slug (A3)", async () => {
      const cases: Array<[string, string]> = [
        ["malformed", "Invitacion-K7M2QX"],
        ["unknown", "invitacion-never0"],
        ["draft", seed({ slug: "invitacion-draft0", status: "DRAFT" }).slug],
        ["archived", seed({ slug: "invitacion-archiv", status: "ARCHIVED" }).slug],
        [
          "expired",
          seed({
            slug: "invitacion-expird",
            status: "PUBLISHED",
            expiresAt: new Date(Date.now() - 1_000),
          }).slug,
        ],
        [
          "unregistered renderer",
          seed({
            slug: "invitacion-norend",
            status: "PUBLISHED",
            templateVersionId: UNRENDERABLE_VERSION_ID,
          }).slug,
        ],
        [
          "pinned version missing",
          seed({ slug: "invitacion-novers", status: "PUBLISHED", templateVersionId: UNKNOWN_ID })
            .slug,
        ],
      ];
      const answers = new Map<string, Row>();

      for (const [label, slug] of cases) {
        const response = await send("GET", `${PUBLIC_PATH}/${slug}`);
        answers.set(label, {
          status: response.status,
          body: await response.json(),
          cacheControl: response.headers.get("cache-control"),
        });
      }

      const [expected] = [...answers.values()];
      assert.deepEqual(expected, {
        status: 404,
        body: { code: "PUBLIC_INVITATION_NOT_FOUND" },
        cacheControl: "no-store",
      });
      for (const [label, answer] of answers) {
        assert.deepEqual(answer, expected, label);
      }
    });

    it("logs one structured line for a renderer the API does not know, with no content and no owner", async () => {
      const row = seed({
        slug: "invitacion-norend2",
        status: "PUBLISHED",
        templateVersionId: UNRENDERABLE_VERSION_ID,
      });
      const recorded: unknown[][] = [];
      const spy = mock.method(Logger.prototype, "warn", (...args: unknown[]) => {
        recorded.push(args);
      });

      try {
        const response = await send("GET", `${PUBLIC_PATH}/${row.slug}`);

        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });
      } finally {
        spy.mock.restore();
      }

      const lines = recorded.filter(
        ([first]) =>
          (first as { event?: string } | undefined)?.event === "public-invitation-not-renderable",
      );
      assert.equal(lines.length, 1, "the fault is reported once");
      const event = lines[0]?.[0] as Row;
      assert.deepEqual(Object.keys(event).sort(), ["componentKey", "event", "slug"]);
      assert.equal(event.componentKey, UNREGISTERED_RENDERER);
      assert.equal(event.slug, row.slug);
      const text = JSON.stringify(event);
      assert.equal(text.includes(row.ownerId), false, "the owner is never logged");
      assert.equal(text.includes("Cumpleaños"), false, "the content is never logged");
    });

    it("stops resolving the slug after unpublishing and resolves it again after republishing (S7)", async () => {
      const { cookie } = await signedInCustomer();
      const draft = await createDraft(cookie);
      await send("PUT", `${PATH}/${draft.id}/content`, cookie, { content: { title: "Ana" } });

      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      const published = await send("GET", `${PUBLIC_PATH}/${draft.slug}`);
      assert.equal(published.status, 200);
      assert.equal(((await published.json()) as Row).slug, draft.slug);

      assert.equal((await send("POST", `${PATH}/${draft.id}/unpublish`, cookie)).status, 200);
      const unpublished = await send("GET", `${PUBLIC_PATH}/${draft.slug}`);
      assert.equal(unpublished.status, 404);
      assert.deepEqual(await unpublished.json(), { code: "PUBLIC_INVITATION_NOT_FOUND" });

      assert.equal((await send("POST", `${PATH}/${draft.id}/publish`, cookie)).status, 200);
      assert.equal((await send("GET", `${PUBLIC_PATH}/${draft.slug}`)).status, 200);
    });
  });
});
