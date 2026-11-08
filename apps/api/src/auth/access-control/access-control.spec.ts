import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import {
  Controller,
  type ExecutionContext,
  Get,
  type INestApplication,
  Module,
  SetMetadata,
  type Type,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  AllowAnonymous,
  AuthModule,
  type AuthService,
  MemberHasPermission,
  OptionalAuth,
  OrgRoles,
  RequireActiveOrg,
  Roles,
  UserHasPermission,
} from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { createApp } from "../../app.setup";
import { createConfigModule } from "../../config/config.module";
import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { createAuth } from "../auth.factory";
import { BackgroundTasks } from "../sign-in-code/background-tasks";
import { SignInCodeSender } from "../sign-in-code/sign-in-code-sender";
import { AccessControlGuard, AdminOnly, findUnsupportedMarker, Public } from "./access-control";
import { AccessControlModule } from "./access-control.module";

// Access control (M2 T6a; S1, S2, S9, S18; L12, L17, L20) through the shared createApp boundary, the
// project-owned global guard, and Better Auth on the in-memory database adapter: no network, no database.

const TRUSTED_ORIGIN = "http://localhost:3000";
// The public web origin, which must be one of the trusted origins (L33).
const AUTH_BASE_URL = TRUSTED_ORIGIN;
const SESSION_COOKIE = "better-auth.session_token";
const CODE_PATTERN = /\b(\d{6})\b/;

// Registered only in this suite: the runtime has no protected or administrative route yet.
@Controller("probe")
class ProbeController {
  @Get("undecorated")
  readUndecorated(): { ok: true } {
    return { ok: true };
  }

  @Public()
  @Get("public")
  readPublic(): { ok: true } {
    return { ok: true };
  }

  @AdminOnly()
  @Get("admin")
  readAdmin(): { ok: true } {
    return { ok: true };
  }
}

@AdminOnly()
@Controller("admin-probe")
class AdminProbeController {
  @Get()
  read(): { ok: true } {
    return { ok: true };
  }
}

// The integration's own markers are not honored by the project guard: an app that registers one must
// not start (L27), and the guard still refuses such a route per request.
@Controller("marker-probe")
class HandlerMarkerProbeController {
  @AllowAnonymous()
  @Get()
  readAnonymous(): { ok: true } {
    return { ok: true };
  }
}

@Roles(["ADMIN"])
@Controller("class-marker-probe")
class ClassMarkerProbeController {
  @Get()
  readWithRoles(): { ok: true } {
    return { ok: true };
  }
}

type MemoryDatabase = Record<string, Record<string, unknown>[]>;

describe("access control through the project-owned global guard", () => {
  const database: MemoryDatabase = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const emailSender = new InMemoryEmailSender();
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks(() => {});
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database),
    signInCodes: new SignInCodeSender(new EmailDeliveryService(emailSender, runtime), tasks),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });
  let app: INestApplication;
  let baseUrl: string;
  let clientCounter = 0;
  let emailCounter = 0;

  function testModule(controllers: Type<unknown>[]): Type<unknown> {
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
      controllers,
    })
    class AccessControlTestModule {}

    return AccessControlTestModule;
  }

  before(async () => {
    app = await createApp(testModule([ProbeController, AdminProbeController]), { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  function authPost(path: string, body: unknown, cookie?: string): Promise<Response> {
    clientCounter += 1;
    return fetch(`${baseUrl}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: TRUSTED_ORIGIN,
        "x-forwarded-for": `10.20.${clientCounter >> 8}.${clientCounter & 255}`,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  function get(path: string, cookie?: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, { headers: cookie ? { cookie } : {} });
  }

  function authGet(path: string, cookie?: string): Promise<Response> {
    clientCounter += 1;
    return fetch(`${baseUrl}/api/auth${path}`, {
      headers: {
        "x-forwarded-for": `10.20.${clientCounter >> 8}.${clientCounter & 255}`,
        ...(cookie ? { cookie } : {}),
      },
    });
  }

  /**
   * Creates a session for a stored ACTIVE user through Better Auth's own adapter and returns the signed
   * cookie the browser would hold. Bypasses the email-code quota, which allows 5 codes per hour.
   */
  async function createSession(userId: string): Promise<{ cookie: string; token: string }> {
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(userId);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
      token: session.token,
    };
  }

  function storedSession(token: string): Record<string, unknown> | undefined {
    return database.session?.find((row) => row.token === token);
  }

  /** Signs a new customer in through the real email-code flow and returns the session cookie. */
  async function signInCustomer(): Promise<{ email: string; cookie: string }> {
    emailCounter += 1;
    const email = `t6a-access-${emailCounter}@example.test`;
    assert.equal(
      (await authPost("/email-otp/send-verification-otp", { email, type: "sign-in" })).status,
      200,
    );
    await tasks.drain();
    const message = emailSender.delivered.find((sent) => sent.to === email);
    const code = CODE_PATTERN.exec(message?.text ?? "")?.[1];
    assert.ok(code, "the customer received a code");

    const response = await authPost("/sign-in/email-otp", { email, otp: code });
    assert.equal(response.status, 200);
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .find((pair) => pair.startsWith(`${SESSION_COOKIE}=`));
    assert.ok(cookie, "the sign-in set a session cookie");
    return { email, cookie };
  }

  function storedUser(email: string): Record<string, unknown> {
    const user = database.user?.find((row) => row.email === email);
    assert.ok(user, "the user is stored");
    return user;
  }

  describe("public routes (L20)", () => {
    it("serves a @Public() route without a session", async () => {
      const response = await get("/probe/public");

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    });

    it("serves a @Public() route with any session cookie, valid or not", async () => {
      const { cookie } = await signInCustomer();

      for (const header of [cookie, `${SESSION_COOKIE}=forged.value`]) {
        assert.equal((await get("/probe/public", header)).status, 200);
      }
    });
  });

  describe("deny by default (L12)", () => {
    it("lets a valid session reach an undecorated route", async () => {
      const { cookie } = await signInCustomer();
      const response = await get("/probe/undecorated", cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true });
    });

    it("rejects an undecorated route with 401 without a session", async () => {
      assert.equal((await get("/probe/undecorated")).status, 401);
    });

    it("rejects an invalid or tampered session cookie with 401", async () => {
      const { cookie } = await signInCustomer();
      const tampered = `${cookie.slice(0, -4)}AAAA`;

      for (const header of [`${SESSION_COOKIE}=not-a-session`, tampered]) {
        assert.equal((await get("/probe/undecorated", header)).status, 401);
      }
    });

    it("rejects a revoked session with 401 on the next request (S18)", async () => {
      const { email, cookie } = await signInCustomer();
      assert.equal((await get("/probe/undecorated", cookie)).status, 200);

      const userId = storedUser(email).id;
      database.session = (database.session ?? []).filter((row) => row.userId !== userId);

      assert.equal((await get("/probe/undecorated", cookie)).status, 401);
    });

    it("refuses a DISABLED user's session with 401, and the session hook deletes it", async () => {
      const { email, cookie } = await signInCustomer();
      const user = storedUser(email);
      user.status = "DISABLED";

      assert.equal((await get("/probe/undecorated", cookie)).status, 401);
      assert.equal(
        database.session?.some((row) => row.userId === user.id),
        false,
      );
    });
  });

  describe("administrator role (S9)", () => {
    const adminPaths = ["/probe/admin", "/admin-probe"];

    it("rejects an anonymous request with 401", async () => {
      for (const path of adminPaths) {
        assert.equal((await get(path)).status, 401, path);
      }
    });

    it("rejects an authenticated customer with 403", async () => {
      const { cookie } = await signInCustomer();

      for (const path of adminPaths) {
        assert.equal((await get(path, cookie)).status, 403, path);
      }
    });

    it("reads the role from the stored user on every request, never from the session cookie", async () => {
      const { email, cookie } = await signInCustomer();
      const user = storedUser(email);

      user.role = "ADMIN";
      // An enrolled administrator: an un-enrolled one holds no authority (T7, S21), and a session
      // that did not pass the second factor is ended (S52), so this one is marked as having passed it.
      user.twoFactorEnabled = true;
      for (const row of database.session?.filter((stored) => stored.userId === user.id) ?? []) {
        row.secondFactorVerified = true;
      }
      for (const path of adminPaths) {
        assert.equal(
          (await get(path, cookie)).status,
          200,
          `${path} once the stored role is ADMIN`,
        );
      }

      user.role = "CUSTOMER";
      // A client-side session data cookie claiming a role is ignored: the cookie cache is off.
      const claim = Buffer.from(JSON.stringify({ user: { role: "ADMIN" } })).toString("base64url");
      for (const path of adminPaths) {
        assert.equal((await get(path, `${cookie}; better-auth.session_data=${claim}`)).status, 403);
      }
    });

    it("pins Better Auth's session cookie cache off", () => {
      assert.equal(auth.options.session?.cookieCache?.enabled, false);
    });
  });

  describe("DISABLED users (S9, S18)", () => {
    it("rejects an existing session with 401 once the stored user is DISABLED", async () => {
      const { email, cookie } = await signInCustomer();
      assert.equal((await get("/probe/undecorated", cookie)).status, 200);

      const user = storedUser(email);
      user.status = "DISABLED";
      assert.equal((await get("/probe/undecorated", cookie)).status, 401);

      user.role = "ADMIN";
      assert.equal(
        (await get("/probe/admin", cookie)).status,
        401,
        "a DISABLED admin has no access",
      );
    });
  });

  describe("client-supplied role and status (S9, S17, L17)", () => {
    it("rejects role and status on the user-updating path and keeps the stored values", async () => {
      const { email, cookie } = await signInCustomer();

      for (const body of [{ role: "ADMIN" }, { status: "DISABLED" }, { status: "ACTIVE" }]) {
        // Over HTTP the route is disabled (404); `input: false` still guards the server-side call.
        assert.equal((await authPost("/update-user", body, cookie)).status, 404);
        await assert.rejects(
          auth.api.updateUser({ headers: new Headers({ cookie }), body: body as never }),
          (error: { body?: { code?: string } }) => error.body?.code === "FIELD_NOT_ALLOWED",
          JSON.stringify(body),
        );
      }

      const user = storedUser(email);
      assert.equal(user.role, "CUSTOMER");
      assert.equal(user.status, "ACTIVE");
    });

    it("ignores role and status on the user-creating code sign-in", async () => {
      emailCounter += 1;
      const email = `t6a-create-${emailCounter}@example.test`;
      await authPost("/email-otp/send-verification-otp", { email, type: "sign-in" });
      await tasks.drain();
      const code = CODE_PATTERN.exec(
        emailSender.delivered.find((sent) => sent.to === email)?.text ?? "",
      )?.[1];

      const response = await authPost("/sign-in/email-otp", {
        email,
        otp: code,
        role: "ADMIN",
        status: "DISABLED",
      });

      assert.equal(response.status, 200);
      const user = storedUser(email);
      assert.equal(user.role, "CUSTOMER");
      assert.equal(user.status, "ACTIVE");
    });

    it("keeps password sign-up closed, whatever role it asks for", async () => {
      const email = "t6a-password-sign-up@example.test";
      const response = await authPost("/sign-up/email", {
        email,
        password: "a-long-enough-password",
        name: "x",
        role: "ADMIN",
      });

      assert.notEqual(response.status, 200);
      assert.equal(
        database.user?.some((row) => row.email === email),
        false,
      );
    });
  });

  describe("Better Auth user-mutating endpoints (L16, L28)", () => {
    const disabledPaths = [
      "/update-user",
      "/change-email",
      "/delete-user",
      "/delete-user/callback",
      "/change-password",
      "/request-password-reset",
      "/reset-password",
      "/email-otp/request-password-reset",
      "/forget-password/email-otp",
      "/email-otp/reset-password",
      "/email-otp/request-email-change",
      "/email-otp/change-email",
      "/email-otp/verify-email",
      "/verify-email",
      "/send-verification-email",
      "/update-session",
      "/link-social",
      "/unlink-account",
    ];

    it("answers 404 on every disabled path, even with a valid session, and changes nothing", async () => {
      const { email, cookie } = await signInCustomer();
      const before = { ...storedUser(email) };
      const body = {
        name: "x".repeat(500),
        image: "https://example.test/a.png",
        newEmail: "other@example.test",
        email,
        newPassword: "a-long-enough-password",
        otp: "000000",
      };

      for (const path of disabledPaths) {
        assert.equal((await authPost(path, body, cookie)).status, 404, `POST ${path}`);
        assert.equal((await authGet(path, cookie)).status, 404, `GET ${path}`);
      }

      assert.deepEqual(storedUser(email), before);
      assert.equal((await authGet("/get-session", cookie)).status, 200, "the session still works");
    });

    it("keeps code sign-in and sign-out working; sign-out deletes the session", async () => {
      const { cookie } = await signInCustomer();
      const token = decodeURIComponent(cookie.split("=")[1] ?? "").split(".")[0] ?? "";
      assert.ok(storedSession(token));

      const response = await authPost("/sign-out", {}, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
      assert.equal(storedSession(token), undefined);
    });
  });

  describe("sessions of non-ACTIVE users on Better Auth's own endpoints (S18, L27, L28)", () => {
    // Every enabled endpoint that reads a session. Each must answer a refused session exactly as it
    // answers a request without one.
    const sessionEndpoints: Array<{ method: "GET" | "POST"; path: string; body?: unknown }> = [
      { method: "GET", path: "/get-session" },
      { method: "GET", path: "/list-sessions" },
      { method: "GET", path: "/list-accounts" },
      { method: "GET", path: "/account-info" },
      { method: "POST", path: "/revoke-session", body: { token: "unknown" } },
      { method: "POST", path: "/revoke-sessions", body: {} },
      { method: "POST", path: "/revoke-other-sessions", body: {} },
      { method: "POST", path: "/verify-password", body: { password: "a-long-enough-password" } },
      { method: "POST", path: "/get-access-token", body: { providerId: "google" } },
      { method: "POST", path: "/refresh-token", body: { providerId: "google" } },
      { method: "POST", path: "/sign-out", body: {} },
    ];

    async function call(endpoint: (typeof sessionEndpoints)[number], cookie?: string) {
      const response =
        endpoint.method === "GET"
          ? await authGet(endpoint.path, cookie)
          : await authPost(endpoint.path, endpoint.body, cookie);
      return { status: response.status, body: await response.text() };
    }

    it("serves get-session and list-sessions to an ACTIVE user", async () => {
      const { email, cookie } = await signInCustomer();

      const session = await authGet("/get-session", cookie);
      assert.equal(session.status, 200);
      assert.equal(((await session.json()) as { user?: { email?: string } }).user?.email, email);
      assert.equal((await authGet("/list-sessions", cookie)).status, 200);
    });

    for (const endpoint of sessionEndpoints) {
      it(`${endpoint.method} ${endpoint.path} treats a DISABLED user's session as no session and deletes it`, async () => {
        const { email } = await signInCustomer();
        const user = storedUser(email);
        const { cookie, token } = await createSession(String(user.id));
        // The race of L28: the session exists, then the stored status changes behind its back.
        user.status = "DISABLED";

        const anonymous = await call(endpoint);
        const refused = await call(endpoint, cookie);

        assert.deepEqual(refused, anonymous);
        assert.equal(storedSession(token), undefined, "the refused session row is deleted");
      });
    }

    it("answers get-session with 200 null for any non-ACTIVE status, read on every request", async () => {
      const { email } = await signInCustomer();
      const user = storedUser(email);

      for (const status of ["DISABLED", "UNKNOWN", undefined]) {
        user.status = "ACTIVE";
        const { cookie, token } = await createSession(String(user.id));
        assert.notEqual(await (await authGet("/get-session", cookie)).text(), "null");

        user.status = status;
        const response = await authGet("/get-session", cookie);

        assert.equal(response.status, 200, String(status));
        assert.equal(await response.text(), "null");
        assert.equal(storedSession(token), undefined);
      }
    });
  });

  describe("route markers at startup (L27)", () => {
    for (const [label, controller, expected] of [
      [
        "a handler",
        HandlerMarkerProbeController,
        /HandlerMarkerProbeController\.readAnonymous.*PUBLIC/,
      ],
      [
        "a controller",
        ClassMarkerProbeController,
        /ClassMarkerProbeController\.readWithRoles.*ROLES/,
      ],
    ] as const) {
      it(`refuses to start when ${label} carries an unsupported integration marker`, async () => {
        const marked = await createApp(testModule([ProbeController, controller]), {
          logger: false,
        });

        try {
          await assert.rejects(marked.init(), expected);
        } finally {
          await marked.close();
        }
      });
    }

    it("still refuses a marked route per request, before any session lookup", async () => {
      let sessionLookups = 0;
      const guard = new AccessControlGuard(new Reflector(), {
        api: {
          getSession: async () => {
            sessionLookups += 1;
            return null;
          },
        },
      } as unknown as AuthService);
      const context = {
        getHandler: () => HandlerMarkerProbeController.prototype.readAnonymous,
        getClass: () => HandlerMarkerProbeController,
        switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
      } as unknown as ExecutionContext;

      await assert.rejects(guard.canActivate(context), /unsupported integration marker PUBLIC/);
      assert.equal(sessionLookups, 0);
    });

    it("recognizes, alone, every metadata key that each access decorator the integration exports writes", () => {
      // The keys each decorator writes today (`dist/index.mjs`); `OrgRoles` also applies
      // `RequireActiveOrg`, so it writes two.
      const decorators = [
        ["AllowAnonymous", AllowAnonymous(), ["PUBLIC"]],
        ["OptionalAuth", OptionalAuth(), ["OPTIONAL"]],
        ["Roles", Roles(["ADMIN"]), ["ROLES"]],
        ["RequireActiveOrg", RequireActiveOrg(), ["REQUIRE_ACTIVE_ORG"]],
        ["OrgRoles", OrgRoles(["owner"]), ["ORG_ROLES", "REQUIRE_ACTIVE_ORG"]],
        [
          "UserHasPermission",
          UserHasPermission({ permission: { invitation: ["read"] } }),
          ["USER_HAS_PERMISSION"],
        ],
        [
          "MemberHasPermission",
          MemberHasPermission({ permissions: { invitation: ["read"] } }),
          ["MEMBER_HAS_PERMISSION"],
        ],
      ] as const;
      const reflector = new Reflector();

      for (const [name, decorator, keys] of decorators) {
        class Marked {
          handle(): void {}
        }
        decorator(Marked);
        assert.deepEqual(Reflect.getOwnMetadataKeys(Marked).sort(), [...keys].sort(), name);

        // Each key on a class that carries no other one, so no sibling key can stand in for it.
        for (const key of keys) {
          class Isolated {
            handle(): void {}
          }
          SetMetadata(key, reflector.get(key, Marked))(Isolated);
          assert.equal(
            findUnsupportedMarker(reflector, Isolated.prototype.handle, Isolated),
            key,
            `${name}: ${key}`,
          );
        }
      }
    });
  });
});
