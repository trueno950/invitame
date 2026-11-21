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
import { ADMIN_ANALYTICS_REPOSITORY } from "../application/admin-analytics";
import type {
  AdminAnalyticsRepository,
  AdminInvitationAnalytics,
  InvitationFunnelDay,
  TopInvitationView,
} from "../application/admin-analytics";
import type {
  AdminInvitationQuery,
  AdminInvitationRepository,
  AdminInvitationRow,
  AdminInvitationUnpublishAudit,
} from "../application/admin-invitation.repository";
import { ADMIN_INVITATION_REPOSITORY } from "../application/admin-invitation.repository";
import {
  GetAdminInvitationUseCase,
  ListAdminInvitationsUseCase,
  UnpublishAdminInvitationUseCase,
} from "../application/admin-invitation.use-cases";
import { unpublish } from "../domain/invitation-lifecycle";
import type {
  InvitationMediaCountReader,
  InvitationMediaCounts,
} from "../application/invitation-media-counts";
import { INVITATION_MEDIA_COUNT_READER } from "../application/invitation-media-counts";
import type { InvitationOwnerEmailReader } from "../application/invitation-owner-email";
import { INVITATION_OWNER_EMAIL_READER } from "../application/invitation-owner-email";
import type { InvitationOwnerStatusReader } from "../application/invitation-owner-status";
import { INVITATION_OWNER_STATUS_READER } from "../application/invitation-owner-status";
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
//
// The support action (M9 T8; S4, S6) is proved the same way: the actor is the session's own id, the body is one closed
// reason plus an optional note, and each refusal — validation, not found, not published, already archived — is its own
// status and code.

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

  /** Every unpublish the route asked for, so a refusal can be proved to have written nothing. */
  readonly unpublishes: Array<{ invitationId: string; audit: AdminInvitationUnpublishAudit }> = [];

  async unpublishForAdmin(invitationId: string, audit: AdminInvitationUnpublishAudit) {
    this.unpublishes.push({ invitationId, audit });

    const row = this.rows.find((stored) => stored.invitationId === invitationId);
    if (row === undefined) {
      return null;
    }
    // The domain transition names the refusal: a draft is INVITATION_NOT_PUBLISHED and an archived row
    // INVITATION_ALREADY_ARCHIVED (S7, A2).
    row.status = unpublish(row.status);
    row.publishedAt = null;
    return row;
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

/** The owner's account state (M9 T9; S4): the sibling read the detail answers as `ownerStatus`. */
class StubOwnerStatusReader implements InvitationOwnerStatusReader {
  readonly statuses = new Map<string, "ACTIVE" | "DISABLED">([[OWNER, "ACTIVE"]]);

  async statusesFor(ownerIds: readonly string[]) {
    const found = new Map<string, "ACTIVE" | "DISABLED">();
    for (const id of ownerIds) {
      const status = this.statuses.get(id);
      if (status !== undefined) {
        found.set(id, status);
      }
    }
    return found;
  }
}

/**
 * The detail's analytics facet (M9 T11; S2, S7): the retained views and the RSVP totals of one invitation. It answers
 * zeros until a case sets them, exactly like an invitation with no activity, and it records the window it was asked
 * for, so the suite can prove the read is the retained one.
 */
class StubAnalyticsRepository implements AdminAnalyticsRepository {
  detail: AdminInvitationAnalytics = {
    views: { public: 0, guest: 0 },
    rsvpTotals: { attendingPeople: 0, declined: 0, responses: 0 },
  };
  readonly detailWindows: Array<{ invitationId: string; from: string; to: string }> = [];

  async viewsByDay() {
    return new Map<string, { public: number; guest: number }>();
  }

  async topInvitationViews(): Promise<TopInvitationView[]> {
    return [];
  }

  async invitationFunnelByDay() {
    return new Map<string, InvitationFunnelDay>();
  }

  async invitationAnalytics(invitationId: string, window: { from: string; to: string }) {
    this.detailWindows.push({ invitationId, from: window.from, to: window.to });

    return this.detail;
  }
}

interface Harness {
  app: INestApplication;
  repository: StubAdminInvitationRepository;
  payments: StubPaymentReader;
  media: StubMediaCountReader;
  ownerStatuses: StubOwnerStatusReader;
  analytics: StubAnalyticsRepository;
  /** The ids of the accounts the suite signed in, in order, so a spec can name the session's actor. */
  signedInUserIds: string[];
  signIn(role: "CUSTOMER" | "ADMIN"): Promise<string>;
  send(path: string, options?: { cookie?: string }): Promise<Response>;
  post(path: string, options?: { cookie?: string; body?: unknown }): Promise<Response>;
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
  const signedInUserIds: string[] = [];
  const payments = new StubPaymentReader();
  const media = new StubMediaCountReader();
  const owners = new StubOwnerReader();
  const ownerStatuses = new StubOwnerStatusReader();
  const analytics = new StubAnalyticsRepository();

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
      { provide: INVITATION_OWNER_STATUS_READER, useValue: ownerStatuses },
      { provide: ADMIN_ANALYTICS_REPOSITORY, useValue: analytics },
      {
        provide: ListAdminInvitationsUseCase,
        useValue: new ListAdminInvitationsUseCase(repository, payments, media, owners),
      },
      {
        provide: GetAdminInvitationUseCase,
        useValue: new GetAdminInvitationUseCase(
          repository,
          payments,
          media,
          owners,
          ownerStatuses,
          analytics,
        ),
      },
      {
        provide: UnpublishAdminInvitationUseCase,
        useValue: new UnpublishAdminInvitationUseCase(
          repository,
          new GetAdminInvitationUseCase(
            repository,
            payments,
            media,
            owners,
            ownerStatuses,
            analytics,
          ),
        ),
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
    ownerStatuses,
    analytics,
    signedInUserIds,
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
      signedInUserIds.push(created.id);
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
    post(path, options = {}) {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
      };
      if (options.body !== undefined) {
        init.body = JSON.stringify(options.body);
      }

      return fetch(`${baseUrl}${path}`, init);
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
        "ownerId",
        "ownerStatus",
        "packageId",
        "payments",
        "publishedAt",
        "refundRequestedAt",
        "rsvpTotals",
        "slug",
        "status",
        "templateVersionId",
        "views",
      ]);
      assert.equal(body.ownerId, OWNER);
      assert.equal(body.ownerStatus, "ACTIVE");
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

    it("always answers views and rsvpTotals as objects of non-negative integers, zeros when there is no activity", async () => {
      // The web page's validators read both fields on every detail, so they are never null, never absent, and never a
      // string: an invitation with nothing counted answers zeros (M9 T11; S2, S7).
      harness.analytics.detail = {
        views: { public: 0, guest: 0 },
        rsvpTotals: { attendingPeople: 0, declined: 0, responses: 0 },
      };
      const empty = harness.repository.add({ slug: "detalle-sin-actividad" });

      const emptyResponse = await harness.send(`${PATH}/${empty.invitationId}`, {
        cookie: adminCookie,
      });
      const emptyBody = (await emptyResponse.json()) as Row;

      assert.equal(emptyResponse.status, 200);
      assert.deepEqual(emptyBody.views, { public: 0, guest: 0 });
      assert.deepEqual(emptyBody.rsvpTotals, { attendingPeople: 0, declined: 0, responses: 0 });
      for (const [field, counts] of [
        ["views", emptyBody.views],
        ["rsvpTotals", emptyBody.rsvpTotals],
      ] as const) {
        for (const [key, value] of Object.entries(counts as Row)) {
          assert.equal(typeof value, "number", `${field}.${key}`);
          assert.equal(Number.isInteger(value), true, `${field}.${key}`);
          assert.equal(Number(value) >= 0, true, `${field}.${key}`);
        }
      }

      // And they carry the counted values of an invitation that has activity.
      harness.analytics.detail = {
        views: { public: 12, guest: 3 },
        rsvpTotals: { attendingPeople: 7, declined: 2, responses: 4 },
      };
      const active = harness.repository.add({ slug: "detalle-con-actividad" });

      const activeResponse = await harness.send(`${PATH}/${active.invitationId}`, {
        cookie: adminCookie,
      });
      const activeBody = (await activeResponse.json()) as Row;

      assert.equal(activeResponse.status, 200);
      assert.deepEqual(activeBody.views, { public: 12, guest: 3 });
      assert.deepEqual(activeBody.rsvpTotals, {
        attendingPeople: 7,
        declined: 2,
        responses: 4,
      });
      // The window is the retained one: ninety days before today in Ciudad de México through today.
      const window = harness.analytics.detailWindows.at(-1);
      assert.equal(window?.invitationId, active.invitationId);
      assert.match(String(window?.from), /^\d{4}-\d{2}-\d{2}$/);
      assert.match(String(window?.to), /^\d{4}-\d{2}-\d{2}$/);
    });

    it("answers 404 INVITATION_NOT_FOUND for an unknown invitation", async () => {
      const response = await harness.send(`${PATH}/${UNKNOWN_ID}`, { cookie: adminCookie });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
    });
  });
});

describe("admin invitation unpublish (M9 T8; S4, S6)", () => {
  const PUBLISHED_AT = "2026-11-24T10:00:00.000Z";
  let harness: Harness;
  let adminCookie: string;
  let customerCookie: string;
  let adminUserId: string;

  before(async () => {
    harness = await startHarness();
    adminCookie = await harness.signIn("ADMIN");
    customerCookie = await harness.signIn("CUSTOMER");
    adminUserId = harness.signedInUserIds[0] ?? "";
    assert.notEqual(adminUserId, "");
  });

  after(async () => {
    await harness?.app.close();
  });

  function unpublishPath(invitationId: string): string {
    return `${PATH}/${invitationId}/unpublish`;
  }

  describe("authorization", () => {
    it("answers 401 without a session and reaches no port", async () => {
      const response = await harness.post(unpublishPath(UNKNOWN_ID), {
        body: { reason: "ABUSE" },
      });

      assert.equal(response.status, 401);
      assert.deepEqual(harness.repository.unpublishes, []);
    });

    it("answers 403 to a signed-in customer, before any validation", async () => {
      const response = await harness.post(unpublishPath(UNKNOWN_ID), {
        cookie: customerCookie,
        body: { reason: "not-a-reason" },
      });

      assert.equal(response.status, 403);
      assert.deepEqual(harness.repository.unpublishes, []);
    });
  });

  describe("body", () => {
    it("answers 400 for every body outside the contract, and writes nothing", async () => {
      const bodies: unknown[] = [
        {},
        { note: "sin razón" },
        { reason: "ABUSE", unknown: 1 },
        { reason: "OTHER" },
        { reason: "OTHER", note: "" },
        { reason: "OTHER", note: "   " },
        { reason: "OTHER", note: null },
        { reason: "ABUSE", note: "a".repeat(501) },
        { reason: "abuse" },
        { reason: "PAID" },
      ];

      for (const body of bodies) {
        const response = await harness.post(unpublishPath(UNKNOWN_ID), {
          cookie: adminCookie,
          body,
        });

        assert.equal(response.status, 400, JSON.stringify(body));
      }
      assert.deepEqual(harness.repository.unpublishes, [], "a refused body reaches no port");
    });

    it("answers 400 for an id that is not a UUID, before reaching a port", async () => {
      const response = await harness.post(`${PATH}/not-a-uuid/unpublish`, {
        cookie: adminCookie,
        body: { reason: "ABUSE" },
      });

      assert.equal(response.status, 400);
      assert.deepEqual(harness.repository.unpublishes, []);
    });
  });

  describe("outcome", () => {
    it("answers 200 with the admin detail of the invitation, keeping firstPublishedAt and answering ownerId", async () => {
      const repository = harness.repository;
      const row = repository.add({
        slug: "despublicar-uno",
        status: "PUBLISHED",
        publishedAt: new Date(PUBLISHED_AT),
        firstPublishedAt: new Date(PUBLISHED_AT),
      });

      const response = await harness.post(unpublishPath(row.invitationId), {
        cookie: adminCookie,
        body: { reason: "OWNER_REQUEST", note: "  La dueña lo pidió.  " },
      });

      assert.equal(response.status, 200);
      const body = (await response.json()) as Row;
      assert.equal(body.invitationId, row.invitationId);
      assert.equal(body.status, "DRAFT");
      assert.equal(body.publishedAt, null);
      assert.equal(body.firstPublishedAt, PUBLISHED_AT);
      assert.equal(body.ownerId, row.ownerId);
      assert.equal(body.ownerEmail, OWNER_EMAIL);
      assert.equal(body.ownerStatus, "ACTIVE");
      assert.deepEqual(Object.keys(body).sort(), [
        "archivedAt",
        "createdAt",
        "firstPublishedAt",
        "invitationId",
        "latestPayment",
        "media",
        "ownerEmail",
        "ownerId",
        "ownerStatus",
        "packageId",
        "payments",
        "publishedAt",
        "refundRequestedAt",
        "rsvpTotals",
        "slug",
        "status",
        "templateVersionId",
        "views",
      ]);
      assert.equal(harness.repository.unpublishes.length, 1);
      const asked = harness.repository.unpublishes[0];
      assert.equal(asked?.invitationId, row.invitationId);
      assert.equal(asked?.audit.reason, "OWNER_REQUEST");
      assert.equal(asked?.audit.note, "  La dueña lo pidió.  ");
      // The actor is the session's own id, never a body field: the global pipe refuses a body that names one.
      assert.equal(asked?.audit.adminUserId, adminUserId);
    });

    it("accepts a reason without a note, and one with a note it trims nothing of at this layer", async () => {
      const row = harness.repository.add({ slug: "despublicar-dos", status: "PUBLISHED" });

      const response = await harness.post(unpublishPath(row.invitationId), {
        cookie: adminCookie,
        body: { reason: "ABUSE" },
      });

      assert.equal(response.status, 200);
      assert.equal(harness.repository.unpublishes.at(-1)?.audit.reason, "ABUSE");
      assert.equal(harness.repository.unpublishes.at(-1)?.audit.note, null);
    });

    it("answers 404 INVITATION_NOT_FOUND for an unknown invitation", async () => {
      const response = await harness.post(unpublishPath(UNKNOWN_ID), {
        cookie: adminCookie,
        body: { reason: "ABUSE" },
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_FOUND" });
    });

    it("answers 409 INVITATION_NOT_PUBLISHED for a draft", async () => {
      const row = harness.repository.add({ slug: "despublicar-tres", status: "DRAFT" });
      const before = harness.repository.unpublishes.length;

      const response = await harness.post(unpublishPath(row.invitationId), {
        cookie: adminCookie,
        body: { reason: "PAYMENT_ERROR" },
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_NOT_PUBLISHED" });
      // The refused action wrote nothing: the port was asked and answered its refusal inside the same call.
      assert.equal(harness.repository.unpublishes.length, before + 1);
      assert.equal(row.status, "DRAFT");
    });

    it("answers 409 INVITATION_ALREADY_ARCHIVED for an archived invitation", async () => {
      const row = harness.repository.add({ slug: "despublicar-cuatro", status: "ARCHIVED" });

      const response = await harness.post(unpublishPath(row.invitationId), {
        cookie: adminCookie,
        body: { reason: "ABUSE", note: "Reporte de abuso." },
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_ARCHIVED" });
    });
  });
});
