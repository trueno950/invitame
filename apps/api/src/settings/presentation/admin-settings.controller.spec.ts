import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
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
import { ADMIN_ACTION, ADMIN_ACTION_REASON } from "../../admin/admin-action-recorder";
import {
  INITIAL_OPERATIONAL_SETTINGS,
  OPERATIONAL_SETTINGS_BOUNDS,
  OPERATIONAL_SETTINGS_FIELDS,
  OPERATIONAL_SETTINGS_RULE,
  type OperationalSettings,
  type OperationalSettingsField,
} from "../domain/operational-settings";
import type { OperationalSettingsSnapshot } from "../application/operational-settings";
import type {
  OperationalSettingsRepository,
  OperationalSettingsUnitOfWork,
} from "../application/operational-settings.repository";
import {
  GetOperationalSettingsUseCase,
  UpdateOperationalSettingsUseCase,
} from "../application/operational-settings.use-cases";
import { AdminSettingsController } from "./admin-settings.controller";

// The configuration panel's routes (M9 T13; S5, S8, L15) through the shared `createApp` boundary, the project-owned
// guard, and Better Auth on the in-memory adapter. What this suite owns is the HTTP contract the web form parses: 401
// without a session, 403 for a signed-in customer, 400 for a body that is missing a field, carries an extra one, or
// does not hold integers, 400 `INVALID_SETTINGS` with the exact `{ field, rule }` issues for a value the domain
// refuses, and the exact shapes of both answers. The repository is a fake, so no database is involved; the SQL is
// proved in `operational-settings.prisma.db-spec.ts`.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const SETTINGS_PATH = "/admin/settings";
const AT = new Date("2026-11-29T10:00:00.000Z");
const STORED_AT = new Date("2026-11-29T09:00:00.000Z");

type Row = Record<string, unknown>;

/**
 * The persistence port as the use cases see it, kept in memory: the single row, and the audit rows a save writes, so
 * the suite can assert that a save which changes nothing writes no audit row at all.
 */
class FakeSettingsRepository implements OperationalSettingsRepository {
  snapshot: OperationalSettingsSnapshot = {
    ...INITIAL_OPERATIONAL_SETTINGS,
    updatedAt: STORED_AT,
  };
  readonly audits: Array<Record<string, unknown>> = [];
  readonly updates: OperationalSettings[] = [];

  async current(): Promise<OperationalSettingsSnapshot> {
    return this.snapshot;
  }

  async transaction<T>(work: (unit: OperationalSettingsUnitOfWork) => Promise<T>): Promise<T> {
    const current = this.snapshot;

    return work({
      current: async () => current,
      update: async (values, at) => {
        this.updates.push(values);
        this.snapshot = { ...values, updatedAt: at };
        return this.snapshot;
      },
      record: async (entry) => {
        this.audits.push({ ...entry });
      },
    });
  }
}

interface Harness {
  app: INestApplication;
  settings: FakeSettingsRepository;
  signIn(role: "CUSTOMER" | "ADMIN"): Promise<string>;
  send(
    path: string,
    options?: { cookie?: string; method?: string; body?: unknown },
  ): Promise<Response>;
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

  const settings = new FakeSettingsRepository();

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
    controllers: [AdminSettingsController],
    providers: [
      {
        provide: GetOperationalSettingsUseCase,
        useValue: new GetOperationalSettingsUseCase(settings),
      },
      {
        provide: UpdateOperationalSettingsUseCase,
        useValue: new UpdateOperationalSettingsUseCase(settings, () => AT),
      },
    ],
  })
  class AdminSettingsTestModule {}

  const app = await createApp(AdminSettingsTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  let counter = 0;

  return {
    app,
    settings,
    async signIn(role): Promise<string> {
      counter += 1;
      const context = await auth.$context;
      const created = await context.internalAdapter.createUser(
        {
          email: `m9-settings-${counter}-${randomBytes(4).toString("hex")}@example.test`,
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
      const headers: Record<string, string> = {};
      if (options.cookie) {
        headers.cookie = options.cookie;
      }
      if (options.body !== undefined) {
        headers["content-type"] = "application/json";
      }

      return fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    },
  };
}

/** One complete valid body, so a case changes exactly what it is about. */
function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...INITIAL_OPERATIONAL_SETTINGS, ...overrides };
}

describe("the administrator configuration panel routes (M9 T13; S5, S8, L15)", () => {
  let harness: Harness;
  let adminCookie: string;
  let customerCookie: string;

  /** Every case starts from the stored row, so the suite never depends on the order the cases run in. */
  function reset(): void {
    harness.settings.snapshot = { ...INITIAL_OPERATIONAL_SETTINGS, updatedAt: STORED_AT };
    harness.settings.updates.length = 0;
    harness.settings.audits.length = 0;
  }

  /** The ISO instant an answer must carry: `Date#toISOString()`, always UTC and always three milliseconds. */
  const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  /** The shared shape both routes answer, asserted the same way wherever it appears. */
  function assertAnswerShape(payload: Row): void {
    assert.deepEqual(Object.keys(payload).sort(), ["bounds", "settings", "updatedAt"]);

    const settings = payload.settings as Row;
    assert.deepEqual(Object.keys(settings).sort(), [...OPERATIONAL_SETTINGS_FIELDS].sort());
    for (const field of OPERATIONAL_SETTINGS_FIELDS) {
      assert.ok(Number.isInteger(settings[field]), `${field} is an integer`);
    }

    const bounds = payload.bounds as Record<string, Row>;
    assert.deepEqual(Object.keys(bounds).sort(), [...OPERATIONAL_SETTINGS_FIELDS].sort());
    for (const field of OPERATIONAL_SETTINGS_FIELDS) {
      const entry = bounds[field] ?? {};
      assert.deepEqual(Object.keys(entry).sort(), ["max", "min"], field);
      assert.ok(
        Number.isInteger(entry.min) && Number.isInteger(entry.max),
        `${field} bounds are integers`,
      );
      assert.ok(Number(entry.min) <= Number(entry.max), `${field} min <= max`);
    }

    assert.equal(typeof payload.updatedAt, "string");
    assert.match(String(payload.updatedAt), ISO_INSTANT);
  }

  before(async () => {
    harness = await startHarness();
    adminCookie = await harness.signIn("ADMIN");
    customerCookie = await harness.signIn("CUSTOMER");
  });

  after(async () => {
    await harness?.app.close();
  });

  describe("authorization", () => {
    it("answers 401 without a session, reading and writing nothing", async () => {
      reset();
      for (const request of [
        { method: "GET" },
        { method: "PUT", body: body({ galleryPhotoLimit: 8 }) },
      ]) {
        const response = await harness.send(SETTINGS_PATH, request);

        assert.equal(response.status, 401, request.method);
      }
      assert.deepEqual(harness.settings.updates, []);
      assert.deepEqual(harness.settings.audits, []);
    });

    it("answers 403 to a signed-in customer, reading and writing nothing", async () => {
      reset();
      for (const request of [
        { method: "GET", cookie: customerCookie },
        { method: "PUT", cookie: customerCookie, body: body({ galleryPhotoLimit: 8 }) },
      ]) {
        const response = await harness.send(SETTINGS_PATH, request);

        assert.equal(response.status, 403, request.method);
      }
      assert.deepEqual(harness.settings.updates, []);
      assert.deepEqual(harness.settings.audits, []);
    });
  });

  describe("GET /admin/settings", () => {
    it("answers the seven settings, the bounds of each, and the instant of the last save, exactly", async () => {
      reset();
      const response = await harness.send(SETTINGS_PATH, { cookie: adminCookie });
      const payload = (await response.json()) as Row;

      assert.equal(response.status, 200);
      assertAnswerShape(payload);
      assert.deepEqual(payload.settings, INITIAL_OPERATIONAL_SETTINGS);
      assert.deepEqual(payload.bounds, OPERATIONAL_SETTINGS_BOUNDS);
      assert.equal(payload.updatedAt, STORED_AT.toISOString());
    });

    it("answers the same shape again when the stored row moved, so the form re-renders from one contract", async () => {
      reset();
      harness.settings.snapshot = {
        ...INITIAL_OPERATIONAL_SETTINGS,
        galleryPhotoLimit: 20,
        storedAssetLimit: 40,
        updatedAt: AT,
      };

      const response = await harness.send(SETTINGS_PATH, { cookie: adminCookie });
      const payload = (await response.json()) as { settings: Row; updatedAt: string };

      assert.equal(response.status, 200);
      assertAnswerShape(payload as Row);
      assert.equal(payload.settings.galleryPhotoLimit, 20);
      assert.equal(payload.updatedAt, AT.toISOString());
    });
  });

  describe("PUT /admin/settings", () => {
    it("answers 200 with the same shape and writes nothing when nothing changed", async () => {
      reset();
      const response = await harness.send(SETTINGS_PATH, {
        method: "PUT",
        cookie: adminCookie,
        body: body(),
      });
      const payload = (await response.json()) as Row;

      assert.equal(response.status, 200);
      assertAnswerShape(payload);
      assert.deepEqual(payload.settings, INITIAL_OPERATIONAL_SETTINGS);
      assert.equal(payload.updatedAt, STORED_AT.toISOString());
      assert.deepEqual(harness.settings.updates, [], "no row was written");
      assert.deepEqual(harness.settings.audits, [], "no audit row was written");
    });

    it("answers 200 with the new settings and writes one audit row naming every change", async () => {
      reset();
      const response = await harness.send(SETTINGS_PATH, {
        method: "PUT",
        cookie: adminCookie,
        // A flat body of the seven fields and no note: the note is optional and absent here.
        body: body({ galleryPhotoLimit: 8, placeSearchResultLimit: 10 }),
      });
      const payload = (await response.json()) as Row;

      assert.equal(response.status, 200);
      assertAnswerShape(payload);
      assert.equal((payload.settings as Row).galleryPhotoLimit, 8);
      assert.equal((payload.settings as Row).placeSearchResultLimit, 10);
      assert.equal(payload.updatedAt, AT.toISOString());
      assert.equal(harness.settings.audits.length, 1);
      const [audit] = harness.settings.audits;
      assert.deepEqual(Object.keys(audit ?? {}).sort(), [
        "action",
        "adminUserId",
        "invitationId",
        "note",
        "reason",
        "targetUserId",
      ]);
      assert.equal(audit?.action, ADMIN_ACTION.SETTINGS_UPDATED);
      assert.equal(audit?.reason, ADMIN_ACTION_REASON.OTHER);
      assert.equal(audit?.targetUserId, null);
      assert.equal(audit?.invitationId, null);
      assert.equal(audit?.note, "galleryPhotoLimit: 12 → 8; placeSearchResultLimit: 5 → 10");
      assert.match(
        String(audit?.adminUserId),
        /^[0-9a-f-]{36}$/,
        "the actor is the session's own id",
      );
    });

    it("appends the optional administrator note", async () => {
      reset();
      const response = await harness.send(SETTINGS_PATH, {
        method: "PUT",
        cookie: adminCookie,
        body: body({ galleryPhotoLimit: 10, note: "  Temporada baja.  " }),
      });

      assert.equal(response.status, 200);
      assert.equal(
        harness.settings.audits.at(-1)?.note,
        "galleryPhotoLimit: 12 → 10 — Temporada baja.",
      );
    });

    it("answers 400 for a body with a missing field, an extra field, or a value that is not an integer", async () => {
      reset();
      const missing = body();
      delete missing.galleryPhotoLimit;

      const cases: Array<[string, Record<string, unknown>]> = [
        ["missing field", missing],
        ["extra field", { ...body(), ownerId: "nope" }],
        ["a string instead of a number", body({ galleryPhotoLimit: "8" })],
        ["a fraction", body({ galleryPhotoLimit: 8.5 })],
        ["null", body({ galleryPhotoLimit: null })],
        ["a boolean", body({ galleryPhotoLimit: true })],
        ["a note wider than 200 characters", body({ note: "n".repeat(201) })],
        ["a note that is not a string", body({ note: 42 })],
      ];

      const writes = harness.settings.updates.length;
      const audits = harness.settings.audits.length;

      for (const [label, payload] of cases) {
        const response = await harness.send(SETTINGS_PATH, {
          method: "PUT",
          cookie: adminCookie,
          body: payload,
        });

        assert.equal(response.status, 400, label);
      }
      assert.equal(harness.settings.updates.length, writes, "a refused body writes nothing");
      assert.equal(harness.settings.audits.length, audits);
    });

    it("answers 400 INVALID_SETTINGS with the exact issues for a value out of bounds or a broken cross-field rule", async () => {
      reset();
      const cases: Array<[Record<string, unknown>, Array<Row>]> = [
        [
          { rsvpMaxPartyLimit: 11 },
          [{ field: "rsvpMaxPartyLimit", rule: OPERATIONAL_SETTINGS_RULE.MAX }],
        ],
        [
          { rsvpDefaultPartyLimit: 9, rsvpMaxPartyLimit: 5 },
          [
            {
              field: "rsvpDefaultPartyLimit",
              rule: OPERATIONAL_SETTINGS_RULE.RSVP_DEFAULT_AT_MOST_MAX,
            },
          ],
        ],
        [
          { galleryPhotoLimit: 24, storedAssetLimit: 24 },
          [
            {
              field: "storedAssetLimit",
              rule: OPERATIONAL_SETTINGS_RULE.STORED_ASSET_ABOVE_GALLERY,
            },
          ],
        ],
        [
          { analyticsDefaultWindowDays: 6 },
          [{ field: "analyticsDefaultWindowDays", rule: OPERATIONAL_SETTINGS_RULE.MIN }],
        ],
      ];

      const writes = harness.settings.updates.length;
      const audits = harness.settings.audits.length;

      for (const [overrides, issues] of cases) {
        const response = await harness.send(SETTINGS_PATH, {
          method: "PUT",
          cookie: adminCookie,
          body: body(overrides),
        });
        const payload = (await response.json()) as Row;

        assert.equal(response.status, 400, JSON.stringify(overrides));
        assert.deepEqual(Object.keys(payload).sort(), ["code", "issues", "message"]);
        assert.equal(payload.code, "INVALID_SETTINGS");
        assert.deepEqual(payload.issues, issues, JSON.stringify(overrides));
        for (const entry of payload.issues as Row[]) {
          assert.deepEqual(
            Object.keys(entry).sort(),
            ["field", "rule"],
            "an issue is field + rule only",
          );
          assert.ok(
            OPERATIONAL_SETTINGS_FIELDS.includes(entry.field as OperationalSettingsField),
            `the issue names one of the seven fields: ${String(entry.field)}`,
          );
        }
      }
      assert.equal(harness.settings.updates.length, writes, "a refused value writes nothing");
      assert.equal(harness.settings.audits.length, audits);
    });
  });
});
