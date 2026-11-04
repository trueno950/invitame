import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Controller, Get, type INestApplication, Module } from "@nestjs/common";
import { AllowAnonymous, AuthModule, Roles } from "@thallesp/nestjs-better-auth";
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
import { AdminOnly, Public } from "./access-control";
import { AccessControlModule } from "./access-control.module";

// Access control (M2 T6a; S1, S2, S9, S18; L12, L17, L20) through the shared createApp boundary, the
// project-owned global guard, and Better Auth on the in-memory database adapter: no network, no database.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3001";
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

  // The integration's own markers are not honored by the project guard: they must never open a route.
  @AllowAnonymous()
  @Get("integration-anonymous")
  readIntegrationAnonymous(): { ok: true } {
    return { ok: true };
  }

  @Roles(["ADMIN"])
  @Get("integration-roles")
  readIntegrationRoles(): { ok: true } {
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
    log: () => {},
  });
  let app: INestApplication;
  let baseUrl: string;
  let clientCounter = 0;
  let emailCounter = 0;

  before(async () => {
    @Module({
      imports: [
        createConfigModule({
          CORS_ORIGIN: TRUSTED_ORIGIN,
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL,
        }),
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
      ],
      controllers: [ProbeController, AdminProbeController],
    })
    class AccessControlTestModule {}

    app = await createApp(AccessControlTestModule, { logger: false });
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

    it("never opens a route marked only with the integration's own decorators", async () => {
      const { cookie } = await signInCustomer();

      for (const path of ["/probe/integration-anonymous", "/probe/integration-roles"]) {
        assert.equal((await get(path)).status, 500, `${path} without a session`);
        assert.equal((await get(path, cookie)).status, 500, `${path} with a customer session`);
      }
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
        const response = await authPost("/update-user", body, cookie);
        const error = (await response.json()) as { code?: string };

        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal(error.code, "FIELD_NOT_ALLOWED");
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
});
