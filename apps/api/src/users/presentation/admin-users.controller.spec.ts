import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { createApp } from "../../app.setup";
import { ADMIN_ACTION_NOTE_MAX_LENGTH, ADMIN_ACTION_REASON } from "../../admin/domain/admin-action";
import { InvalidAdminActionError } from "../../admin/domain/admin-action.errors";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { createAuth } from "../../auth/auth.factory";
import type { SignInCodeResender } from "../../auth/sign-in-code/sign-in-code-resender";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import type {
  AdminAccountDisabled,
  AdminSignInCodeRequest,
  AdminUserAccountRepository,
  AdminUserActionAudit,
} from "../application/admin-user-account.repository";
import { ADMIN_USER_ACCOUNT_REPOSITORY } from "../application/admin-user-account.repository";
import {
  DisableAdminUserAccountUseCase,
  ReactivateAdminUserAccountUseCase,
  ResendSignInCodeUseCase,
} from "../application/admin-user-account.use-cases";
import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  AdminAccountProtectedError,
  UserCannotSignInByCodeError,
} from "../domain/account-support.errors";
import { AdminUsersController } from "./admin-users.controller";

// The account support routes (M9 T9; S4, S6, L9) through the shared `createApp` boundary, the project-owned guard, and
// Better Auth on the in-memory adapter. What this suite owns is the HTTP contract: 401 without a session, 403 for a
// signed-in customer, 400 for a malformed id or body, 404 `USER_NOT_FOUND`, each 409 code, and the exact 200/202
// shapes the web client parses. The actor is always the session's own id and an address is never in a body. The port
// is a fake, so no database is involved; PostgreSQL is proved in the `*.db-spec.ts` suite.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PATH = "/admin/users";
const ROUTES = ["disable", "reactivate", "sign-in-code"] as const;

type Row = Record<string, unknown>;

/** The account port over a table of answers, so each refusal is the one the route must map. */
class StubAccountRepository implements AdminUserAccountRepository {
  readonly calls: Array<{ method: string; userId: string; audit: AdminUserActionAudit }> = [];
  readonly answers = {
    disable: null as AdminAccountDisabled | Error | null,
    reactivate: null as { status: "ACTIVE" } | Error | null,
    signInCode: null as AdminSignInCodeRequest | Error | null,
  };

  private answer<T>(value: T | Error | null): T | null {
    if (value instanceof Error) {
      throw value;
    }
    return value;
  }

  async disableForAdmin(userId: string, audit: AdminUserActionAudit) {
    this.calls.push({ method: "disable", userId, audit });
    return this.answer(this.answers.disable);
  }

  async reactivateForAdmin(userId: string, audit: AdminUserActionAudit) {
    this.calls.push({ method: "reactivate", userId, audit });
    return this.answer(this.answers.reactivate);
  }

  async requestSignInCodeForAdmin(userId: string, audit: AdminUserActionAudit) {
    this.calls.push({ method: "sign-in-code", userId, audit });
    return this.answer(this.answers.signInCode);
  }
}

class RecordingResender implements SignInCodeResender {
  readonly requested: string[] = [];

  async requestSignInCode(email: string): Promise<void> {
    this.requested.push(email);
  }
}

interface Harness {
  app: INestApplication;
  repository: StubAccountRepository;
  resender: RecordingResender;
  /** The ids of the accounts the suite signed in, in order, so a spec can name the session's actor. */
  signedInUserIds: string[];
  signIn(role: "CUSTOMER" | "ADMIN"): Promise<string>;
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

  const repository = new StubAccountRepository();
  const resender = new RecordingResender();
  const signedInUserIds: string[] = [];

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
    controllers: [AdminUsersController],
    providers: [
      { provide: ADMIN_USER_ACCOUNT_REPOSITORY, useValue: repository },
      {
        provide: DisableAdminUserAccountUseCase,
        useValue: new DisableAdminUserAccountUseCase(repository),
      },
      {
        provide: ReactivateAdminUserAccountUseCase,
        useValue: new ReactivateAdminUserAccountUseCase(repository),
      },
      {
        provide: ResendSignInCodeUseCase,
        useValue: new ResendSignInCodeUseCase(repository, resender),
      },
    ],
  })
  class AdminUsersTestModule {}

  const app = await createApp(AdminUsersTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  let counter = 0;

  return {
    app,
    repository,
    resender,
    signedInUserIds,
    async signIn(role): Promise<string> {
      counter += 1;
      const context = await auth.$context;
      const created = await context.internalAdapter.createUser(
        {
          email: `t9-admin-users-${counter}-${randomBytes(4).toString("hex")}@example.test`,
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

describe("admin user support routes (M9 T9; S4, S6)", () => {
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

  function reset() {
    harness.repository.calls.length = 0;
    harness.resender.requested.length = 0;
    harness.repository.answers.disable = null;
    harness.repository.answers.reactivate = null;
    harness.repository.answers.signInCode = null;
  }

  describe("authorization", () => {
    it("answers 401 without a session and reaches no port", async () => {
      reset();
      for (const route of ROUTES) {
        const response = await harness.post(`${PATH}/${UNKNOWN_ID}/${route}`, {
          body: { reason: "ABUSE" },
        });

        assert.equal(response.status, 401, route);
      }
      assert.deepEqual(harness.repository.calls, []);
    });

    it("answers 403 to a signed-in customer", async () => {
      reset();
      for (const route of ROUTES) {
        const response = await harness.post(`${PATH}/${UNKNOWN_ID}/${route}`, {
          cookie: customerCookie,
          body: { reason: "ABUSE" },
        });

        assert.equal(response.status, 403, route);
      }
      assert.deepEqual(harness.repository.calls, []);
    });
  });

  describe("bounded body and id", () => {
    it("answers 400 for an id that is not a UUID, before reaching a port", async () => {
      reset();
      for (const route of ROUTES) {
        const response = await harness.post(`${PATH}/not-a-uuid/${route}`, {
          cookie: adminCookie,
          body: { reason: "ABUSE" },
        });

        assert.equal(response.status, 400, route);
      }
      assert.deepEqual(harness.repository.calls, []);
    });

    it("answers 400 for a missing reason, a reason outside the closed set, and an unknown field", async () => {
      reset();
      const bodies: unknown[] = [
        {},
        { reason: "BECAUSE" },
        { reason: "abuse" },
        { reason: "ABUSE", adminUserId: UNKNOWN_ID },
        { reason: "ABUSE", targetUserId: UNKNOWN_ID },
      ];

      for (const route of ROUTES) {
        for (const body of bodies) {
          const response = await harness.post(`${PATH}/${UNKNOWN_ID}/${route}`, {
            cookie: adminCookie,
            body,
          });

          assert.equal(response.status, 400, `${route} ${JSON.stringify(body)}`);
        }
      }
      assert.deepEqual(harness.repository.calls, []);
    });

    it("answers 400 for a note over 500 characters and for «Otro» without one", async () => {
      reset();
      const bodies: unknown[] = [
        { reason: "OTHER" },
        { reason: "OTHER", note: "   " },
        { reason: "ABUSE", note: "a".repeat(ADMIN_ACTION_NOTE_MAX_LENGTH + 1) },
        { reason: "ABUSE", note: 42 },
      ];

      for (const route of ROUTES) {
        for (const body of bodies) {
          const response = await harness.post(`${PATH}/${UNKNOWN_ID}/${route}`, {
            cookie: adminCookie,
            body,
          });

          assert.equal(response.status, 400, `${route} ${JSON.stringify(body)}`);
        }
      }
      assert.deepEqual(harness.repository.calls, []);
    });
  });

  describe("refusals", () => {
    it("answers 404 USER_NOT_FOUND for an id no user has", async () => {
      reset();
      for (const route of ROUTES) {
        const response = await harness.post(`${PATH}/${UNKNOWN_ID}/${route}`, {
          cookie: adminCookie,
          body: { reason: "ABUSE" },
        });

        assert.equal(response.status, 404, route);
        assert.deepEqual(await response.json(), { code: "USER_NOT_FOUND" });
      }
    });

    it("answers each conflict with its own code", async () => {
      const cases: Array<[string, Error, string]> = [
        ["disable", new AccountAlreadyDisabledError(), "ACCOUNT_ALREADY_DISABLED"],
        ["disable", new AdminAccountProtectedError(), "ADMIN_ACCOUNT_PROTECTED"],
        ["reactivate", new AccountAlreadyActiveError(), "ACCOUNT_ALREADY_ACTIVE"],
        ["reactivate", new AdminAccountProtectedError(), "ADMIN_ACCOUNT_PROTECTED"],
        ["sign-in-code", new UserCannotSignInByCodeError(), "USER_CANNOT_SIGN_IN_BY_CODE"],
      ];

      for (const [route, refusal, code] of cases) {
        reset();
        if (route === "disable") {
          harness.repository.answers.disable = refusal;
        } else if (route === "reactivate") {
          harness.repository.answers.reactivate = refusal;
        } else {
          harness.repository.answers.signInCode = refusal;
        }

        const response = await harness.post(`${PATH}/${UNKNOWN_ID}/${route}`, {
          cookie: adminCookie,
          body: { reason: "ABUSE" },
        });

        assert.equal(response.status, 409, code);
        assert.deepEqual(await response.json(), { code }, code);
      }
      assert.deepEqual(harness.resender.requested, []);
    });

    it("answers 400 INVALID_ADMIN_ACTION when the audit domain refuses the note", async () => {
      reset();
      // A direct caller's refusal is a malformed request, not a 500.
      harness.repository.answers.disable = new InvalidAdminActionError("note is too long");

      const response = await harness.post(`${PATH}/${UNKNOWN_ID}/disable`, {
        cookie: adminCookie,
        body: { reason: "ABUSE" },
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { code: "INVALID_ADMIN_ACTION" });
    });
  });

  describe("the answers", () => {
    it("answers 200 with the disabled status, the revoked session count, and the session's own actor", async () => {
      reset();
      harness.repository.answers.disable = { status: "DISABLED", revokedSessions: 2 };

      const response = await harness.post(`${PATH}/${UNKNOWN_ID}/disable`, {
        cookie: adminCookie,
        body: { reason: "OWNER_REQUEST", note: "  Lo pidió por correo.  " },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "DISABLED", revokedSessions: 2 });
      assert.deepEqual(harness.repository.calls, [
        {
          method: "disable",
          userId: UNKNOWN_ID,
          audit: {
            adminUserId: harness.signedInUserIds[0],
            reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
            // Passed as sent: the recorder trims it before the column.
            note: "  Lo pidió por correo.  ",
          },
        },
      ]);
    });

    it("answers 200 with the active status of a reactivated account", async () => {
      reset();
      harness.repository.answers.reactivate = { status: "ACTIVE" };

      const response = await harness.post(`${PATH}/${UNKNOWN_ID}/reactivate`, {
        cookie: adminCookie,
        body: { reason: "OTHER", note: "Se equivocó de cuenta." },
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { status: "ACTIVE" });
      assert.deepEqual(harness.repository.calls[0]?.audit, {
        adminUserId: harness.signedInUserIds[0],
        reason: ADMIN_ACTION_REASON.OTHER,
        note: "Se equivocó de cuenta.",
      });
    });

    it("answers 202 with the requested outcome of a sign-in code, never that it was delivered", async () => {
      reset();
      harness.repository.answers.signInCode = { email: "duena@example.test" };

      const response = await harness.post(`${PATH}/${UNKNOWN_ID}/sign-in-code`, {
        cookie: adminCookie,
        body: { reason: "OWNER_REQUEST" },
      });

      assert.equal(response.status, 202);
      assert.deepEqual(await response.json(), { outcome: "requested" });
      assert.deepEqual(harness.resender.requested, ["duena@example.test"]);
      assert.deepEqual(harness.repository.calls[0]?.audit, {
        adminUserId: harness.signedInUserIds[0],
        reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
        note: null,
      });
    });
  });
});
