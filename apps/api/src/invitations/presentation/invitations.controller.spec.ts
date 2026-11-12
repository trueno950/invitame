import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
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
import { INVITATION_PAYMENT_GATE } from "../application/invitation-payment-gate";
import type { JsonObject } from "../domain/invitation-content";
import {
  InvitationAlreadyArchivedError,
  InvitationAlreadyPublishedError,
  InvitationNotEditableError,
  InvitationNotPublishedError,
} from "../domain/invitation.errors";
import { NoPaymentRequiredGate } from "../infrastructure/no-payment-required";
import { INVITATION_USE_CASES } from "../invitations.module";
import { InvitationsController } from "./invitations.controller";

// `/invitations` (M4 T4; S1, S3, S7, S9, A3, A4) through the shared createApp boundary, the project-owned guard,
// and Better Auth on the in-memory adapter. The invitation port and the catalog contract are in-memory fakes, so
// the suite needs no network and no database; their Prisma adapters are proved in the `*.db-spec.ts` suites, and
// the use cases themselves in `invitation.use-cases.spec.ts`. What this suite owns is the HTTP contract: the
// session is the only source of the owner (S9), no response carries `ownerId`, an id that is not a UUID is refused
// before it reaches a port, and every application or domain error maps to its documented status and body.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const PATH = "/invitations";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PUBLISHED_VERSION_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVE_PACKAGE_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_PACKAGE_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_VERSION_ID = "44444444-4444-4444-8444-444444444444";
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
 * schema, exactly as the catalog contract states (S3).
 */
class MemoryInvitationCatalog implements InvitationCatalog {
  readonly versions = new Map<string, { published: boolean; schema: unknown }>([
    [PUBLISHED_VERSION_ID, { published: true, schema: SCHEMA }],
    [DRAFT_VERSION_ID, { published: false, schema: SCHEMA }],
  ]);
  readonly packages = new Map<string, CatalogPackageEntitlements>([
    [ACTIVE_PACKAGE_ID, { status: "ACTIVE", includedFeatureKeys: [] }],
    [DRAFT_PACKAGE_ID, { status: "DRAFT", includedFeatureKeys: [] }],
  ]);

  async findPublishedVersion(versionId: string): Promise<CatalogTemplateVersionSnapshot | null> {
    const stored = this.versions.get(versionId);
    if (!stored?.published) {
      return null;
    }

    return {
      id: versionId,
      templateId: randomUUID(),
      componentKey: "birthday-adventure-01",
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
    return stored
      ? {
          componentKey: "birthday-adventure-01",
          configuration: { componentKey: "birthday-adventure-01" },
          schema: stored.schema,
        }
      : null;
  }

  isRendererRegistered(componentKey: string): boolean {
    return componentKey === "birthday-adventure-01";
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
      controllers: [InvitationsController],
      providers: [
        ...INVITATION_USE_CASES,
        { provide: INVITATION_REPOSITORY, useValue: repository },
        { provide: INVITATION_CATALOG, useValue: catalog },
        // Publication is free in Milestone 5; the publish use case asks this gate (S6).
        { provide: INVITATION_PAYMENT_GATE, useValue: new NoPaymentRequiredGate() },
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
});
