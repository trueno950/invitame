import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { createApp } from "../app.setup";
import { AccessControlModule } from "../auth/access-control/access-control.module";
import { createAuth } from "../auth/auth.factory";
import { BackgroundTasks } from "../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../config/config.module";
import { PrismaService } from "../database/prisma.service";
import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import { UsersModule } from "./users.module";

// Own profile on real PostgreSQL (M2 T6b; S1, S2, S9, S18). Runs only
// through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL that points at a
// disposable, already migrated local database. It is not part of `pnpm test` or CI.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SESSION_COOKIE = "better-auth.session_token";

function requireLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  assert.ok(url, "test:db requires an explicit DATABASE_URL");
  // Fail closed: this suite writes and deletes rows, so it never runs against a remote database.
  assert.ok(LOCAL_HOSTS.has(new URL(url).hostname), "test:db only runs against a local database");
  return url;
}

describe("own profile on the Prisma schema (real PostgreSQL)", () => {
  const databaseUrl = requireLocalDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    // No probe here requests a sign-in code.
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });
  const runId = randomUUID();
  const emails: string[] = [];
  const clientPrefix = `198.19.${randomBytes(1)[0]}.`;
  let clientCounter = 0;
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    @Global()
    @Module({ providers: [{ provide: PrismaService, useValue: prisma }], exports: [PrismaService] })
    class ExplicitDatabaseModule {}

    @Module({
      imports: [
        createConfigModule({
          CORS_ORIGIN: TRUSTED_ORIGIN,
          DATABASE_URL: databaseUrl,
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL,
        }),
        ExplicitDatabaseModule,
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
        UsersModule,
      ],
    })
    class OwnProfileDatabaseTestModule {}

    app = await createApp(OwnProfileDatabaseTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    try {
      await app?.close();
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.rateLimit.deleteMany({ where: { key: { startsWith: clientPrefix } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function request(
    path: string,
    init: { method?: string; body?: unknown; cookie?: string | undefined } = {},
  ) {
    clientCounter += 1;
    return fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        origin: TRUSTED_ORIGIN,
        "x-forwarded-for": `${clientPrefix}${clientCounter}`,
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  }

  /** A stored customer, created as the code sign-in creates one. */
  async function createCustomer(label: string): Promise<string> {
    const email = `t6b-${label}-${runId}@example.test`;
    emails.push(email);
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser(
      { email, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    return user.id;
  }

  /** A session for an ACTIVE user and the signed cookie a browser would hold for it. */
  async function createSession(userId: string): Promise<{ cookie: string; token: string }> {
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(userId);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    return {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
      token: session.token,
    };
  }

  function setStatus(userId: string, status: "ACTIVE" | "DISABLED") {
    return prisma.user.update({ where: { id: userId }, data: { status } });
  }

  it("runs against the explicit local database", () => {
    assert.ok(LOCAL_HOSTS.has(new URL(databaseUrl).hostname));
  });

  describe("PATCH /me", () => {
    it("stores the trimmed name in User.displayName, returns it, and clears it with null", async () => {
      const userId = await createCustomer("profile");
      const { cookie } = await createSession(userId);

      const updated = await request("/me", {
        method: "PATCH",
        body: { displayName: "  Ana María  " },
        cookie,
      });
      assert.equal(updated.status, 200);
      assert.equal(((await updated.json()) as { displayName: string }).displayName, "Ana María");
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName,
        "Ana María",
      );
      assert.deepEqual(await (await request("/me", { cookie })).json(), {
        id: userId,
        email: emails.at(-1),
        displayName: "Ana María",
        role: "CUSTOMER",
      });

      const cleared = await request("/me", {
        method: "PATCH",
        body: { displayName: null },
        cookie,
      });
      assert.equal(cleared.status, 200);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName,
        null,
      );
    });

    it("stores 120 code points in VarChar(120) and rejects 121 without writing", async () => {
      const userId = await createCustomer("bounds");
      const { cookie } = await createSession(userId);
      const longest = "😀".repeat(120);

      const accepted = await request("/me", {
        method: "PATCH",
        body: { displayName: longest },
        cookie,
      });
      assert.equal(accepted.status, 200);
      const rejected = await request("/me", {
        method: "PATCH",
        body: { displayName: `${longest}😀` },
        cookie,
      });
      assert.equal(rejected.status, 400);

      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName,
        longest,
      );
    });

    it("rejects an unknown field and a client-supplied role without writing", async () => {
      const userId = await createCustomer("unknown-field");
      const { cookie } = await createSession(userId);

      for (const body of [
        { displayName: "Ana", role: "ADMIN" },
        { displayName: "Ana", id: randomUUID() },
      ]) {
        assert.equal((await request("/me", { method: "PATCH", body, cookie })).status, 400);
      }

      const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      assert.equal(stored.displayName, "");
      assert.equal(stored.role, "CUSTOMER");
    });
  });

  describe("a session whose stored user turned DISABLED", () => {
    it("gets 401 on GET /me and PATCH /me, changes nothing, and loses its session row", async () => {
      const userId = await createCustomer("disabled");

      for (const init of [{}, { method: "PATCH", body: { displayName: "Ana" } }]) {
        await setStatus(userId, "ACTIVE");
        const { cookie, token } = await createSession(userId);
        // The race of L28: the session survives, then the stored status changes behind its back.
        await setStatus(userId, "DISABLED");

        const label = init.method ?? "GET";
        assert.equal((await request("/me", { ...init, cookie })).status, 401, label);
        assert.equal(await prisma.session.count({ where: { token } }), 0, label);
      }

      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName,
        "",
      );
    });
  });
});
