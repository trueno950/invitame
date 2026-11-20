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
import type {
  AdminInvitationQuery,
  AdminInvitationRepository,
  AdminInvitationRow,
} from "../application/admin-invitation.repository";
import { ADMIN_INVITATION_REPOSITORY } from "../application/admin-invitation.repository";
import {
  GetAdminInvitationUseCase,
  ListAdminInvitationsUseCase,
} from "../application/admin-invitation.use-cases";
import type {
  InvitationMediaCountReader,
  InvitationMediaCounts,
} from "../application/invitation-media-counts";
import { INVITATION_MEDIA_COUNT_READER } from "../application/invitation-media-counts";
import type { InvitationOwnerEmailReader } from "../application/invitation-owner-email";
import { INVITATION_OWNER_EMAIL_READER } from "../application/invitation-owner-email";
import type {
  InvitationPaymentReader,
  InvitationPaymentSummary,
} from "../application/invitation-payment-summary";
import { INVITATION_PAYMENT_READER } from "../application/invitation-payment-summary";
import { AdminInvitationsController } from "./admin-invitations.controller";

// The administrator's invitation status routes (M9 T2; S1) through the shared `createApp` boundary, the project-owned
// guard, and Better Auth on the in-memory adapter. What this suite owns is the HTTP contract: 401 without a session,
// 403 for a signed-in customer, 400 for a malformed status, limit, cursor, unknown parameter, or id, 404 for an
// unknown invitation, and the exact response shape of the list and the detail — which is what the web pages parse.
// The ports are fakes, so no database and no network are involved; PostgreSQL behavior is proved in the `*.db-spec.ts`
// suite.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PATH = "/admin/invitations";
const OWNER = "11111111-1111-4111-8111-111111111111";
const OWNER_EMAIL = "duena@example.test";

type Row = Record<string, unknown>;

/** The admin read port over an in-memory table that applies the same filters and order as the Prisma adapter. */
class StubAdminInvitationRepository implements AdminInvitationRepository {
  readonly rows: AdminInvitationRow[] = [];
  readonly queries: AdminInvitationQuery[] = [];

  add(overrides: Partial<AdminInvitationRow> = {}): AdminInvitationRow {
    const row: AdminInvitationRow = {
      invitationId: randomUUID(),
      ownerId: OWNER,
      packageId: randomUUID(),
      templateVersionId: randomUUID(),
      slug: `invitacion-${this.rows.length}`,
      status: "DRAFT",
      createdAt: new Date(Date.UTC(2026, 10, 25, 10, 0, 0, this.rows.length)),
      publishedAt: null,
      firstPublishedAt: null,
      archivedAt: null,
      refundRequestedAt: null,
      ...overrides,
    };
    this.rows.push(row);
    return row;
  }

  async listForAdmin(query: AdminInvitationQuery) {
    this.queries.push(query);
    const prefix = query.slugPrefix?.toLowerCase() ?? null;

    return this.rows
      .filter((row) => query.status === null || row.status === query.status)
      .filter((row) => prefix === null || row.slug.toLowerCase().startsWith(prefix))
      .filter(
        (row) =>
          query.after === null ||
          row.createdAt < query.after.createdAt ||
          (row.createdAt.getTime() === query.after.createdAt.getTime() &&
            row.invitationId < query.after.id),
      )
      .sort((left, right) => {
        const byDate = right.createdAt.getTime() - left.createdAt.getTime();
        return byDate === 0 ? (left.invitationId < right.invitationId ? 1 : -1) : byDate;
      })
      .slice(0, query.limit);
  }

  async findForAdmin(invitationId: string) {
    return this.rows.find((row) => row.invitationId === invitationId) ?? null;
  }
}

class StubPaymentReader implements InvitationPaymentReader {
  readonly latest = new Map<string, InvitationPaymentSummary>();
  readonly detail = new Map<string, InvitationPaymentSummary[]>();

  async latestFor(invitationIds: readonly string[]) {
    const found = new Map<string, InvitationPaymentSummary>();
    for (const id of invitationIds) {
      const payment = this.latest.get(id);
      if (payment !== undefined) {
        found.set(id, payment);
      }
    }
    return found;
  }

  async listForInvitation(invitationId: string, limit: number) {
    return (this.detail.get(invitationId) ?? []).slice(0, limit);
  }
}

class StubMediaCountReader implements InvitationMediaCountReader {
  readonly counts = new Map<string, InvitationMediaCounts>();

  async countsFor(invitationIds: readonly string[]) {
    const found = new Map<string, InvitationMediaCounts>();
    for (const id of invitationIds) {
      const counts = this.counts.get(id);
      if (counts !== undefined) {
        found.set(id, counts);
      }
    }
    return found;
  }
}

class StubOwnerReader implements InvitationOwnerEmailReader {
  readonly emails = new Map<string, string>([[OWNER, OWNER_EMAIL]]);

  async emailsFor(ownerIds: readonly string[]) {
    const found = new Map<string, string>();
    for (const id of ownerIds) {
      const email = this.emails.get(id);
      if (email !== undefined) {
        found.set(id, email);
      }
    }
    return found;
  }
}

interface Harness {
  app: INestApplication;
  repository: StubAdminInvitationRepository;
  payments: StubPaymentReader;
  media: StubMediaCountReader;
  signIn(role: "CUSTOMER" | "ADMIN"): Promise<string>;
  send(path: string, options?: { cookie?: string }): Promise<Response>;
}

async function startHarness(): Promise<Harness> {
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
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });

  const repository = new StubAdminInvitationRepository();
  const payments = new StubPaymentReader();
  const media = new StubMediaCountReader();
  const owners = new StubOwnerReader();

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
    controllers: [AdminInvitationsController],
    providers: [
      { provide: ADMIN_INVITATION_REPOSITORY, useValue: repository },
      { provide: INVITATION_PAYMENT_READER, useValue: payments },
      { provide: INVITATION_MEDIA_COUNT_READER, useValue: media },
      { provide: INVITATION_OWNER_EMAIL_READER, useValue: owners },
      {
        provide: ListAdminInvitationsUseCase,
        useValue: new ListAdminInvitationsUseCase(repository, payments, media, owners),
      },
      {
        provide: GetAdminInvitationUseCase,
        useValue: new GetAdminInvitationUseCase(repository, payments, media, owners),
      },
    ],
  })
  class AdminInvitationsTestModule {}

  const app = await createApp(AdminInvitationsTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  let counter = 0;

  return {
    app,
    repository,
    payments,
    media,
    async signIn(role): Promise<string> {
      counter += 1;
      const context = await auth.$context;
      const created = await context.internalAdapter.createUser(
        {
          email: `t2-admin-invitations-${counter}-${randomBytes(4).toString("hex")}@example.test`,
          name: "",
          emailVerified: true,
        },
        { method: "email-otp" },
      );
      const session = await context.internalAdapter.createSession(created.id);
      const signature = createHmac("sha256", secret).update(session.token).digest("base64");
      const user = database.user?.find((row) => row.id === created.id);
      assert.ok(user);

      if (role === "ADMIN") {
        // An enrolled administrator whose session passed the second factor (S21, S52).
        user.role = "ADMIN";
        user.twoFactorEnabled = true;
        for (const row of database.session?.filter((stored) => stored.userId === created.id) ??
          []) {
          row.secondFactorVerified = true;
        }
      }

      return `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`;
    },
    send(path, options = {}) {
      return fetch(`${baseUrl}${path}`, {
        headers: options.cookie ? { cookie: options.cookie } : {},
      });
    },
  };
}

describe("admin invitation status routes (M9 T2; S1)", () => {
  let harness: Harness;
  let adminCookie: string;
  let customerCookie: string;

  before(async () => {
    harness = await startHarness();
    adminCookie = await harness.signIn("ADMIN");
    customerCookie = await harness.signIn("CUSTOMER");
  });

  after(async () => {
    await harness?.app.close();
  });

  describe("authorization", () => {
    it("answers 401 without a session and reaches no port", async () => {
      for (const path of [PATH, `${PATH}/${UNKNOWN_ID}`]) {
        const response = await harness.send(path);

        assert.equal(response.status, 401, path);
      }
      assert.deepEqual(harness.repository.queries, []);
    });

    it("answers 403 to a signed-in customer", async () => {
      for (const path of [PATH, `${PATH}/${UNKNOWN_ID}`]) {
        const response = await harness.send(path, { cookie: customerCookie });

        assert.equal(response.status, 403, path);
      }
      assert.deepEqual(harness.repository.queries, []);
    });
  });

  describe("bounded query", () => {
    it("answers 400 for a status outside the closed set, a limit outside 1..50, a bad cursor, and an unknown parameter", async () => {
      const queries = [
        "status=draft",
        "status=PAID",
        "limit=0",
        "limit=51",
        "limit=abc",
        "limit=1.5",
        `slug=${"a".repeat(61)}`,
        "cursor=not!base64url",
        `cursor=${Buffer.from("not json", "utf8").toString("base64url")}`,
        `cursor=${Buffer.from(JSON.stringify({ createdAt: "2030-01-01", id: UNKNOWN_ID })).toString("base64url")}`,
        "unknown=1",
      ];

      for (const query of queries) {
        const response = await harness.send(`${PATH}?${query}`, { cookie: adminCookie });

        assert.equal(response.status, 400, query);
      }
      assert.deepEqual(harness.repository.queries, [], "a refused query reads nothing");
    });

    it("answers 400 INVALID_CURSOR, not 500, for a canonical instant outside the stored range", async () => {
      // `+275760-09-13T00:00:00.000Z` is JavaScript's own maximum instant and PostgreSQL refuses it, so the cursor is
      // refused as malformed and the request never reaches a port.
      for (const createdAt of [
        "+275760-09-13T00:00:00.000Z",
        "+010000-01-01T00:00:00.000Z",
        "1969-12-31T23:59:59.999Z",
      ]) {
        const cursor = Buffer.from(JSON.stringify({ createdAt, id: UNKNOWN_ID }), "utf8").toString(
          "base64url",
        );
        const response = await harness.send(`${PATH}?cursor=${encodeURIComponent(cursor)}`, {
          cookie: adminCookie,
        });

        assert.equal(response.status, 400, createdAt);
        assert.deepEqual(await response.json(), { code: "INVALID_CURSOR" }, createdAt);
      }
      assert.deepEqual(harness.repository.queries, [], "a refused cursor reads nothing");
    });

    it("answers 400 for an id that is not a UUID, before reaching a port", async () => {
      const response = await harness.send(`${PATH}/not-a-uuid`, { cookie: adminCookie });

      assert.equal(response.status, 400);
    });

    it("reads one row more than the default page, so the answer stays bounded", async () => {
      const response = await harness.send(PATH, { cookie: adminCookie });

      assert.equal(response.status, 200);
      assert.equal(harness.repository.queries.at(-1)?.limit, 21);
    });
  });

  describe("list", () => {
    it("answers 200 with the contract's exact fields and the facets it read", async () => {
      const repository = harness.repository;
      const row = repository.add({ slug: "boda-ana-2026" });
      const createdAt = row.createdAt;
      const paidAt = new Date("2026-11-24T10:01:00.000Z");
      const payment = {
        paymentId: randomUUID(),
        status: "paid" as const,
        amountMinor: 25_000,
        currency: "MXN",
        createdAt: new Date("2026-11-24T10:00:00.000Z"),
        paidAt,
      };
      harness.payments.latest.set(row.invitationId, payment);
      harness.media.counts.set(row.invitationId, { mainPhoto: true, galleryCount: 2 });

      const response = await harness.send(`${PATH}?slug=boda&status=DRAFT&limit=5`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as { items: Row[]; nextCursor: unknown };
      assert.deepEqual(Object.keys(body).sort(), ["items", "nextCursor"]);
      assert.equal(body.nextCursor, null);
      const listed = body.items.find((item) => item.invitationId === row.invitationId);
      assert.deepEqual(listed, {
        invitationId: row.invitationId,
        slug: "boda-ana-2026",
        status: "DRAFT",
        ownerEmail: OWNER_EMAIL,
        createdAt: createdAt.toISOString(),
        publishedAt: null,
        firstPublishedAt: null,
        archivedAt: null,
        refundRequestedAt: null,
        latestPayment: {
          status: "paid",
          amountMinor: 25_000,
          currency: "MXN",
          paidAt: paidAt.toISOString(),
        },
        media: { mainPhoto: true, galleryCount: 2 },
      });
      assert.deepEqual(Object.keys(listed ?? {}).sort(), [
        "archivedAt",
        "createdAt",
        "firstPublishedAt",
        "invitationId",
        "latestPayment",
        "media",
        "ownerEmail",
        "publishedAt",
        "refundRequestedAt",
        "slug",
        "status",
      ]);
    });

    it("continues after the cursor a page answered", async () => {
      const repository = harness.repository;
      const before = repository.rows.length;
      const seeded = ["cursor-uno", "cursor-dos", "cursor-tres"].map((slug) =>
        repository.add({ slug }),
      );
      assert.equal(repository.rows.length, before + 3);

      const first = await harness.send(`${PATH}?slug=cursor-&limit=2`, { cookie: adminCookie });
      assert.equal(first.status, 200);
      const firstPage = (await first.json()) as { items: Row[]; nextCursor: string | null };
      assert.equal(firstPage.items.length, 2);
      assert.ok(firstPage.nextCursor);

      const second = await harness.send(
        `${PATH}?slug=cursor-&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
        { cookie: adminCookie },
      );
      assert.equal(second.status, 200);
      const secondPage = (await second.json()) as { items: Row[]; nextCursor: string | null };
      assert.equal(secondPage.items.length, 1);
      assert.equal(secondPage.nextCursor, null);
      assert.deepEqual(
        new Set([...firstPage.items, ...secondPage.items].map((item) => item.slug)),
        new Set(seeded.map((row) => row.slug)),
      );
    });
  });

  describe("detail", () => {
    it("answers 200 with the summary fields, the pinned references, and the payments", async () => {
      const repository = harness.repository;
      const row = repository.add({ slug: "detalle-uno", status: "PUBLISHED" });
      const payment = {
        paymentId: randomUUID(),
        status: "paid" as const,
        amountMinor: 25_000,
        currency: "MXN",
        createdAt: new Date("2026-11-24T10:00:00.000Z"),
        paidAt: new Date("2026-11-24T10:01:00.000Z"),
      };
      harness.payments.detail.set(row.invitationId, [payment]);
      harness.media.counts.set(row.invitationId, { mainPhoto: false, galleryCount: 4 });

      const response = await harness.send(`${PATH}/${row.invitationId}`, { cookie: adminCookie });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.deepEqual(Object.keys(body).sort(), [
        "archivedAt",
        "createdAt",
        "firstPublishedAt",
        "invitationId",
        "latestPayment",
        "media",
        "ownerEmail",
        "packageId",
        "payments",
        "publishedAt",
        "refundRequestedAt",
        "slug",
        "status",
        "templateVersionId",
      ]);
      assert.equal(body.packageId, row.packageId);
      assert.equal(body.templateVersionId, row.templateVersionId);
      assert.deepEqual(body.media, { mainPhoto: false, galleryCount: 4 });
      assert.deepEqual(body.payments, [
        {
          paymentId: payment.paymentId,
          status: "paid",
          amountMinor: 25_000,
          currency: "MXN",
          createdAt: payment.createdAt.toISOString(),
          paidAt: payment.paidAt.toISOString(),
        },
      ]);
      // The summary's `latestPayment` is the contract's four fields, without the payment id the list does not show.
      assert.deepEqual(body.latestPayment, {
        status: "paid",
        amountMinor: 25_000,
        currency: "MXN",
        paidAt: payment.paidAt.toISOString(),
      });
    });

    it("answers 404 INVITATION_NOT_FOUND for an unknown invitation", async () => {
      const response = await harness.send(`${PATH}/${UNKNOWN_ID}`, { cookie: adminCookie });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
    });
  });
});
