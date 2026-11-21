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
  AdminAnalyticsRepository,
  InvitationFunnelDay,
  InvitationFunnelPaymentReader,
  PaymentFunnelDay,
  TopInvitationView,
} from "../application/admin-analytics";
import {
  GetAdminFunnelAnalyticsUseCase,
  GetAdminViewsAnalyticsUseCase,
} from "../application/admin-analytics.use-cases";
import { AdminAnalyticsController } from "./admin-analytics.controller";

// The administrator's analytics routes (M9 T11; S2, S3, S7) through the shared `createApp` boundary, the project-owned
// guard, and Better Auth on the in-memory adapter. What this suite owns is the HTTP contract the web page parses: 401
// without a session, 403 for a signed-in customer, 400 for every malformed window — a day that is not a real date, a
// reversed window, a window wider than ninety days, an unknown parameter — and the exact response shape of both reads,
// with every day of the window present and ascending. The ports are fakes, so no database is involved; the SQL is
// proved in the `*.db-spec.ts` suite.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const VIEWS_PATH = "/admin/analytics/views";
const FUNNEL_PATH = "/admin/analytics/funnel";
/** 2026-11-29 02:00 UTC is 2026-11-28 in Ciudad de México: the clock every window is resolved at. */
const NOW = new Date("2026-11-29T02:00:00.000Z");

type Row = Record<string, unknown>;

/** The day after a `YYYY-MM-DD` value, so an expected window is written independently of the API's own helper. */
function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
}

class StubAnalyticsRepository implements AdminAnalyticsRepository {
  views = new Map<string, { public: number; guest: number }>();
  funnel = new Map<string, InvitationFunnelDay>();
  top: TopInvitationView[] = [];
  detail = {
    views: { public: 0, guest: 0 },
    rsvpTotals: { attendingPeople: 0, declined: 0, responses: 0 },
  };
  readonly windows: Array<{ from: string; to: string }> = [];

  async viewsByDay(window: { from: string; to: string }) {
    this.windows.push({ from: window.from, to: window.to });
    return new Map(this.views);
  }

  async topInvitationViews() {
    return this.top;
  }

  async invitationFunnelByDay(window: { from: string; to: string }) {
    this.windows.push({ from: window.from, to: window.to });
    return new Map(this.funnel);
  }

  async invitationAnalytics() {
    return this.detail;
  }
}

class StubPaymentFunnelReader implements InvitationFunnelPaymentReader {
  days = new Map<string, PaymentFunnelDay>();

  async funnelByDay() {
    return new Map(this.days);
  }
}

interface Harness {
  app: INestApplication;
  analytics: StubAnalyticsRepository;
  payments: StubPaymentFunnelReader;
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

  const analytics = new StubAnalyticsRepository();
  const payments = new StubPaymentFunnelReader();

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
    controllers: [AdminAnalyticsController],
    providers: [
      {
        provide: GetAdminViewsAnalyticsUseCase,
        useValue: new GetAdminViewsAnalyticsUseCase(analytics, () => NOW),
      },
      {
        provide: GetAdminFunnelAnalyticsUseCase,
        useValue: new GetAdminFunnelAnalyticsUseCase(analytics, payments, () => NOW),
      },
    ],
  })
  class AdminAnalyticsTestModule {}

  const app = await createApp(AdminAnalyticsTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  let counter = 0;

  return {
    app,
    analytics,
    payments,
    async signIn(role): Promise<string> {
      counter += 1;
      const context = await auth.$context;
      const created = await context.internalAdapter.createUser(
        {
          email: `m9-analytics-${counter}-${randomBytes(4).toString("hex")}@example.test`,
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

describe("admin analytics routes (M9 T11; S2, S3, S7)", () => {
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
    it("answers 401 without a session and reads no port", async () => {
      const reads = harness.analytics.windows.length;
      for (const path of [VIEWS_PATH, FUNNEL_PATH]) {
        assert.equal((await harness.send(path)).status, 401, path);
      }
      assert.equal(harness.analytics.windows.length, reads);
    });

    it("answers 403 to a signed-in customer", async () => {
      const reads = harness.analytics.windows.length;
      for (const path of [VIEWS_PATH, FUNNEL_PATH]) {
        assert.equal((await harness.send(path, { cookie: customerCookie })).status, 403, path);
      }
      assert.equal(harness.analytics.windows.length, reads);
    });
  });

  describe("the bounded window", () => {
    it("answers 400 for an impossible day, a wrong format, a reversed window, an over-wide window, and an unknown parameter", async () => {
      const queries = [
        "from=2026-02-30",
        "to=2026-04-31",
        "from=2026-13-01",
        "from=28/11/2026",
        "from=2026-11-28T00:00:00Z",
        "from=2026-1-01",
        "from=",
        "from=2026-11-29&to=2026-11-28",
        "from=2026-08-30&to=2026-11-28",
        "from=2025-01-01",
        "unknown=1",
      ];

      const reads = harness.analytics.windows.length;
      for (const path of [VIEWS_PATH, FUNNEL_PATH]) {
        for (const query of queries) {
          const response = await harness.send(`${path}?${query}`, { cookie: adminCookie });

          assert.equal(response.status, 400, `${path}?${query}`);
        }
      }
      assert.equal(harness.analytics.windows.length, reads, "a refused window reads nothing");
    });

    it("accepts the widest window, the single day, and one filled bound", async () => {
      for (const query of [
        "from=2026-08-31&to=2026-11-28",
        "from=2026-11-28&to=2026-11-28",
        "from=2026-11-01",
        "to=2026-09-30",
      ]) {
        const response = await harness.send(`${VIEWS_PATH}?${query}`, { cookie: adminCookie });

        assert.equal(response.status, 200, query);
      }
    });
  });

  describe("GET /admin/analytics/views", () => {
    it("answers the daily totals of the default window and the top invitations, exactly", async () => {
      harness.analytics.views = new Map([["2026-11-27", { public: 3, guest: 1 }]]);
      harness.analytics.top = [
        {
          invitationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          slug: "boda-ana",
          public: 9,
          guest: 4,
        },
      ];

      const response = await harness.send(VIEWS_PATH, { cookie: adminCookie });
      const body = (await response.json()) as {
        days: Array<Row>;
        topInvitations: Array<Row>;
      };

      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(body).sort(), ["days", "topInvitations"]);
      assert.equal(body.days.length, 30);
      assert.deepEqual(body.days.at(0), { day: "2026-10-30", public: 0, guest: 0 });
      assert.deepEqual(body.days.at(-2), { day: "2026-11-27", public: 3, guest: 1 });
      assert.deepEqual(body.days.at(-1), { day: "2026-11-28", public: 0, guest: 0 });
      assert.deepEqual(body.topInvitations, harness.analytics.top);
      for (const day of body.days) {
        assert.deepEqual(Object.keys(day).sort(), ["day", "guest", "public"]);
      }
      assert.deepEqual(Object.keys(body.topInvitations[0] ?? {}).sort(), [
        "guest",
        "invitationId",
        "public",
        "slug",
      ]);
    });

    it("answers every day of an explicit window in ascending order", async () => {
      harness.analytics.views = new Map();
      const reads = harness.analytics.windows.length;

      const response = await harness.send(`${VIEWS_PATH}?from=2026-11-26&to=2026-11-28`, {
        cookie: adminCookie,
      });
      const body = (await response.json()) as { days: Array<{ day: string }> };

      assert.equal(response.status, 200);
      assert.deepEqual(
        body.days.map((day) => day.day),
        ["2026-11-26", "2026-11-27", "2026-11-28"],
      );
      // The daily totals were read once for this request, over the window the query named.
      assert.deepEqual(harness.analytics.windows.slice(reads), [
        { from: "2026-11-26", to: "2026-11-28" },
      ]);
    });
  });

  describe("the window coverage both reads promise", () => {
    /** The numeric fields each endpoint answers per day, besides `day`, so a zero is never null or a string. */
    const STEP_FIELDS: Record<string, string[]> = {
      [VIEWS_PATH]: ["guest", "public"],
      [FUNNEL_PATH]: ["checkoutsStarted", "draftsCreated", "firstPublications", "paymentsApproved"],
    };

    it("answers every day of the window exactly once, ascending, as YYYY-MM-DD, and no day outside it", async () => {
      const cases: Array<[string, string, string]> = [
        [VIEWS_PATH, "2026-11-20", "2026-11-28"],
        [VIEWS_PATH, "2026-08-31", "2026-11-28"],
        [FUNNEL_PATH, "2026-11-20", "2026-11-28"],
        // A request that names only `from` ends today in Ciudad de México.
        [FUNNEL_PATH, "2026-10-30", "2026-11-28"],
      ];

      for (const [path, from, to] of cases) {
        const response = await harness.send(`${path}?from=${from}&to=${to}`, {
          cookie: adminCookie,
        });
        const body = (await response.json()) as {
          days: Array<{ day: string } & Row>;
        };
        const days = body.days.map((entry) => entry.day);

        assert.equal(response.status, 200, `${path} ${from}..${to}`);
        // Ascending, each day once, nothing before `from` and nothing after `to`.
        assert.deepEqual(days, [...days].sort(), "ascending");
        assert.equal(new Set(days).size, days.length, "each day exactly once");
        assert.equal(days[0], from, "the window starts at from");
        assert.equal(days.at(-1), to, "the window ends at to");
        // A leading zero month or day is written, and every other day of the window is present.
        const expected: string[] = [];
        for (let day = from; day <= to; day = nextDay(day)) {
          expected.push(day);
        }
        assert.deepEqual(days, expected, "every day of the window, with none outside it");
        for (const day of days) {
          assert.match(day, /^\d{4}-\d{2}-\d{2}$/, day);
        }
        for (const entry of body.days) {
          for (const field of STEP_FIELDS[path] ?? []) {
            const value = entry[field];
            assert.equal(typeof value, "number", `${field} of ${entry.day}`);
            assert.equal(Number.isInteger(value), true, `${field} of ${entry.day}`);
            assert.equal(Number(value) >= 0, true, `${field} of ${entry.day}`);
          }
        }
      }
    });

    it("answers at most twenty top invitations, each with a UUID id, and an empty list otherwise", async () => {
      harness.analytics.top = [];
      const empty = await harness.send(`${VIEWS_PATH}?from=2026-11-01&to=2026-11-28`, {
        cookie: adminCookie,
      });
      assert.deepEqual(((await empty.json()) as { topInvitations: unknown[] }).topInvitations, []);

      harness.analytics.top = Array.from({ length: 20 }, (_unused, index) => ({
        invitationId: randomUUID(),
        slug: `invitacion-${String(index).padStart(2, "0")}`,
        public: 20 - index,
        guest: index,
      }));

      const response = await harness.send(`${VIEWS_PATH}?from=2026-11-01&to=2026-11-28`, {
        cookie: adminCookie,
      });
      const body = (await response.json()) as { topInvitations: Array<Row> };

      assert.equal(response.status, 200);
      assert.equal(body.topInvitations.length, 20);
      assert.equal(body.topInvitations.length <= 20, true);
      assert.deepEqual(
        body.topInvitations.map((invitation) => invitation.slug),
        harness.analytics.top.map((invitation) => invitation.slug),
        "the port's order is answered unchanged",
      );
      for (const invitation of body.topInvitations) {
        assert.match(
          String(invitation.invitationId),
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        assert.equal(typeof invitation.public, "number");
        assert.equal(typeof invitation.guest, "number");
      }
    });
  });

  describe("GET /admin/analytics/funnel", () => {
    it("answers the four steps of every day of the window, exactly", async () => {
      harness.analytics.funnel = new Map([
        ["2026-11-27", { draftsCreated: 4, firstPublications: 2 }],
      ]);
      harness.payments.days = new Map([
        ["2026-11-27", { checkoutsStarted: 3, paymentsApproved: 1 }],
      ]);

      const response = await harness.send(`${FUNNEL_PATH}?from=2026-11-26&to=2026-11-28`, {
        cookie: adminCookie,
      });
      const body = (await response.json()) as { days: Array<Row> };

      assert.equal(response.status, 200);
      assert.deepEqual(Object.keys(body), ["days"]);
      assert.deepEqual(body.days, [
        {
          day: "2026-11-26",
          draftsCreated: 0,
          checkoutsStarted: 0,
          paymentsApproved: 0,
          firstPublications: 0,
        },
        {
          day: "2026-11-27",
          draftsCreated: 4,
          checkoutsStarted: 3,
          paymentsApproved: 1,
          firstPublications: 2,
        },
        {
          day: "2026-11-28",
          draftsCreated: 0,
          checkoutsStarted: 0,
          paymentsApproved: 0,
          firstPublications: 0,
        },
      ]);
      for (const day of body.days) {
        assert.deepEqual(Object.keys(day).sort(), [
          "checkoutsStarted",
          "day",
          "draftsCreated",
          "firstPublications",
          "paymentsApproved",
        ]);
      }
    });
  });
});
