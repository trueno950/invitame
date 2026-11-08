import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../test/database";
import { createApp } from "../app.setup";
import { createConfigModule } from "../config/config.module";
import { PrismaService } from "../database/prisma.service";
import { EmailDeliveryService } from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../email/infrastructure/system-email-delivery-runtime";
import { DisableUserUseCase } from "../users/application/disable-user.use-case";
import { ResetSecondFactorUseCase } from "../users/application/reset-second-factor.use-case";
import { PrismaAdministratorAccountRepository } from "../users/infrastructure/prisma-administrator-account.repository";
import { PrismaUserAccessRepository } from "../users/infrastructure/prisma-user-access.repository";
import { UsersModule } from "../users/users.module";
import { AccessControlModule } from "./access-control/access-control.module";
import { createAuth } from "./auth.factory";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// Races between account-state changes and requests, on real PostgreSQL through one Nest app with the
// project guard, `/me`, and Better Auth's mount (M2 T11; S2, S9, S18, S40, S44). The app's Prisma
// client is wrapped so a test can run a step at an exact point of a request; nothing in production
// code changes. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL.

const ORIGIN = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";

/** A gate a wrapped query waits on; `reached` resolves once the query is held. */
function gate() {
  let open = () => {};
  let reachedResolve = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    reachedResolve = resolve;
  });
  const hold = () => {
    reachedResolve();
    return opened;
  };
  return { open, reached, hold };
}

class SiblingDeleteOutage extends Error {
  override name = "SiblingDeleteOutage";
}

function decodeBase32(input: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of input.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes).toString("utf8");
}

describe("account-state races (real PostgreSQL)", () => {
  const databaseUrl = requireLocalDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const secret = randomBytes(32).toString("base64url");
  const runId = randomUUID();
  const emails: string[] = [];
  const clientAddresses = new ClientAddresses();
  /** Armed by a test; each runs at most once. */
  const armed: {
    failSiblingDelete?: boolean;
    beforeProfileWrite?: (() => Promise<void>) | undefined;
  } = {};

  const appClient = prisma.$extends({
    query: {
      session: {
        async deleteMany({ args, query }) {
          // The allow path of `settleFirstConfirmation`: every session of the user but one.
          if (armed.failSiblingDelete && JSON.stringify(args.where).includes('"token":{"not"')) {
            armed.failSiblingDelete = false;
            throw new SiblingDeleteOutage("simulated outage");
          }
          return query(args);
        },
      },
      user: {
        async update({ args, query }) {
          const step = armed.beforeProfileWrite;
          if (step && (args.data as { displayName?: unknown }).displayName) {
            armed.beforeProfileWrite = undefined;
            await step();
          }
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  const auth = createAuth({
    secret,
    baseURL: ORIGIN,
    trustedOrigins: [ORIGIN],
    database: prismaAdapter(appClient, { provider: "postgresql" }),
    // No probe here requests a sign-in code.
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    log: () => {},
  });
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    @Global()
    @Module({
      providers: [{ provide: PrismaService, useValue: appClient }],
      exports: [PrismaService],
    })
    class WrappedDatabaseModule {}

    @Module({
      imports: [
        createConfigModule({
          CORS_ORIGIN: ORIGIN,
          DATABASE_URL: databaseUrl,
          BETTER_AUTH_SECRET: secret,
          AUTH_BASE_URL: ORIGIN,
        }),
        WrappedDatabaseModule,
        AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
        AccessControlModule,
        UsersModule,
      ],
    })
    class AccountStateRacesTestModule {}

    app = await createApp(AccountStateRacesTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    try {
      await app?.close();
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
      await prisma.rateLimit.deleteMany({ where: clientAddresses.rateLimitRows() });
    } finally {
      await prisma.$disconnect();
    }
  });

  function request(
    path: string,
    init: { method?: string; body?: unknown; cookie?: string | undefined } = {},
  ) {
    return fetch(`${baseUrl}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": clientAddresses.next(),
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  }

  function sessionCookie(response: Response): string | undefined {
    return response.headers
      .getSetCookie()
      .map((header) => header.split(";")[0] ?? "")
      .find(
        (pair) => pair.startsWith(`${SESSION_COOKIE}=`) && pair.length > SESSION_COOKIE.length + 1,
      );
  }

  async function sessionUserId(cookie: string | undefined): Promise<string | null> {
    const body = (await (await request("/api/auth/get-session", { cookie })).json()) as {
      user?: { id: string };
    } | null;
    return body?.user?.id ?? null;
  }

  async function signIn(email: string, password: string) {
    return request("/api/auth/sign-in/email", { body: { email, password } });
  }

  /** An ACTIVE, not yet enrolled administrator, issued as `admin:create` issues one. */
  async function pendingAdministrator(label: string) {
    const email = `t11-${label}-${runId}@example.test`;
    emails.push(email);
    const password = randomBytes(18).toString("base64url");
    const issued = await new PrismaAdministratorAccountRepository(prisma).issueInitialPassword({
      email,
      passwordHash: await hashPassword(password),
      issuedAt: new Date(),
    });
    assert.equal(issued.outcome, "created");
    return { email, password, id: issued.userId };
  }

  const stored = async (userId: string) => ({
    status: (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).status,
    sessions: await prisma.session.count({ where: { userId } }),
  });

  // R3-reset-disable-race-unproved (L63): `admin:reset-second-factor` and `user:disable` on the same
  // administrator. Whatever commits first, a DISABLED administrator ends with no live session, and
  // its fresh initial password (if any) opens none.
  describe("admin:reset-second-factor racing user:disable", () => {
    const reset = () =>
      new ResetSecondFactorUseCase({
        accounts: new PrismaAdministratorAccountRepository(prisma),
        hashPassword,
        log: () => {},
      });

    /** `user:disable` on a client that holds the transaction at `step` until the gate opens. */
    function heldDisable(step: "findUnique" | "updateMany", held: ReturnType<typeof gate>) {
      const client = prisma.$extends({
        query: {
          user: {
            async [step]({
              args,
              query,
            }: {
              args: unknown;
              query: (a: unknown) => Promise<unknown>;
            }) {
              const result = await query(args);
              await held.hold();
              return result;
            },
          },
        },
      }) as unknown as PrismaClient;
      return new DisableUserUseCase(new PrismaUserAccessRepository(client), () => {});
    }

    it("lets the reset complete, then the disable revokes the session its fresh password opened", async () => {
      const admin = await pendingAdministrator("reset-then-disable");
      assert.ok(sessionCookie(await signIn(admin.email, admin.password)));
      const held = gate();

      // The disable has read the user but not changed it; the reset commits meanwhile.
      const disabling = heldDisable("findUnique", held).execute(admin.email);
      await held.reached;
      const { outcome, initialPassword } = await reset().execute(admin.email);
      assert.equal(outcome.outcome, "reset");
      assert.ok(initialPassword);
      const fresh = sessionCookie(await signIn(admin.email, initialPassword));
      assert.ok(fresh, "the fresh password opened a session before the disable committed");
      held.open();
      const disabled = await disabling;

      assert.deepEqual(disabled, { userId: admin.id, alreadyDisabled: false, revokedSessions: 1 });
      assert.deepEqual(await stored(admin.id), { status: "DISABLED", sessions: 0 });
      assert.equal(await sessionUserId(fresh), null);
      assert.equal((await signIn(admin.email, initialPassword)).status, 401);
      assert.equal((await stored(admin.id)).sessions, 0);
    });

    it("refuses the reset as disabled when the disable holds the row first, changing nothing", async () => {
      const admin = await pendingAdministrator("disable-then-reset");
      const live = sessionCookie(await signIn(admin.email, admin.password));
      assert.ok(live);
      const credential = () =>
        prisma.account.findFirstOrThrow({ where: { userId: admin.id, providerId: "credential" } });
      const before = await credential();
      const held = gate();

      // The disable has updated the row and holds its lock; the reset's conditional update waits.
      const disabling = heldDisable("updateMany", held).execute(admin.email);
      await held.reached;
      const resetting = reset().execute(admin.email);
      for (let waited = 0; ; waited += 1) {
        const [{ waiting }] = await prisma.$queryRaw<[{ waiting: bigint }]>`
          SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE 'UPDATE "public"."User"%'`;
        if (waiting > 0n) break;
        assert.ok(waited < 100, "the reset's update waits on the disable's row lock");
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      held.open();
      const [disabled, { outcome, initialPassword }] = await Promise.all([disabling, resetting]);

      assert.deepEqual(disabled, { userId: admin.id, alreadyDisabled: false, revokedSessions: 1 });
      assert.deepEqual(outcome, { outcome: "refused", userId: admin.id, reason: "disabled" });
      assert.equal(initialPassword, undefined);
      assert.deepEqual(await credential(), before, "no fresh initial password was stored");
      assert.deepEqual(await stored(admin.id), { status: "DISABLED", sessions: 0 });
      assert.equal(await sessionUserId(live), null);
    });
  });

  // A′ (L62): the allow path of `settleFirstConfirmation` deletes every other session of the
  // administrator after Better Auth has already set `twoFactorEnabled`. The session hook hides a
  // pending administrator's session by that flag alone, so if the delete throws, a sibling session
  // opened with the password alone would no longer be hidden.
  describe("a first confirmation whose sibling-session delete fails", () => {
    const GAP_A_PRIME =
      "GAP A\u2032 present (L62, owner decision before a fix): verify-totp answers 500, twoFactorEnabled " +
      "stays true, both password-only sessions survive, /me answers 200 to each, and the sibling " +
      "reads its user on get-session and list-sessions (200)";

    it("GAP A\u2032: leaves no password-only session with authority on /me or Better Auth", {
      skip: GAP_A_PRIME,
    }, async () => {
      const admin = await pendingAdministrator("sibling-delete");
      const tabA = sessionCookie(await signIn(admin.email, admin.password));
      const tabB = sessionCookie(await signIn(admin.email, admin.password));
      assert.ok(tabA && tabB);
      assert.equal((await request("/me", { cookie: tabB })).status, 401, "pending: no authority");
      const enable = await request("/api/auth/two-factor/enable", {
        body: { password: admin.password },
        cookie: tabA,
      });
      const { totpURI } = (await enable.json()) as { totpURI: string };
      const rawSecret = decodeBase32(new URL(totpURI).searchParams.get("secret") ?? "");
      const generateTOTP = (
        auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>
      ).generateTOTP;
      assert.ok(generateTOTP);
      const { code } = (await generateTOTP({ body: { secret: rawSecret } })) as { code: string };

      armed.failSiblingDelete = true;
      const confirmed = await request("/api/auth/two-factor/verify-totp", {
        body: { code },
        cookie: tabA,
      });

      assert.equal(armed.failSiblingDelete, false, "the sibling delete ran and threw");
      const observed = {
        confirmation: confirmed.status,
        meTabA: (await request("/me", { cookie: tabA })).status,
        meTabB: (await request("/me", { cookie: tabB })).status,
        getSessionTabB: await sessionUserId(tabB),
        listSessionsTabB: (await request("/api/auth/list-sessions", { cookie: tabB })).status,
      };
      assert.deepEqual(observed, {
        confirmation: 500,
        meTabA: 401,
        meTabB: 401,
        getSessionTabB: null,
        listSessionsTabB: 401,
      });
    });
  });

  // R4-profile-write-not-conditioned-on-active-status (L30): `user:disable` commits after the guard
  // has read an ACTIVE user and before `PATCH /me` writes the name.
  describe("PATCH /me racing user:disable", () => {
    const GAP_PROFILE_WRITE =
      "GAP present (L30 R4-profile-write-not-conditioned-on-active-status, owner decision before a " +
      "fix): PATCH /me answers 200 and stores the name; the user is DISABLED, has no session, and " +
      "the next request gets 401";

    it("GAP R4: does not store the name of a user disabled after the guard's session check", {
      skip: GAP_PROFILE_WRITE,
    }, async () => {
      const email = `t11-profile-race-${runId}@example.test`;
      emails.push(email);
      const context = await auth.$context;
      const user = await context.internalAdapter.createUser(
        { email, name: "", emailVerified: true },
        { method: "email-otp" },
      );
      const { token } = await context.internalAdapter.createSession(user.id);
      const signature = createHmac("sha256", secret).update(token).digest("base64");
      const cookie = `${SESSION_COOKIE}=${encodeURIComponent(`${token}.${signature}`)}`;
      const disable = new DisableUserUseCase(new PrismaUserAccessRepository(prisma), () => {});
      let disabledInBetween = false;
      armed.beforeProfileWrite = async () => {
        disabledInBetween = (await disable.execute(email))?.alreadyDisabled === false;
      };

      const response = await request("/me", {
        method: "PATCH",
        body: { displayName: "Ana" },
        cookie,
      });

      assert.equal(
        disabledInBetween,
        true,
        "the disable committed between the guard and the write",
      );
      const observed = {
        status: response.status,
        displayName: (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).displayName,
        stored: await stored(user.id),
        nextRequest: (await request("/me", { cookie })).status,
      };
      assert.deepEqual(observed, {
        status: 401,
        displayName: "",
        stored: { status: "DISABLED", sessions: 0 },
        nextRequest: 401,
      });
    });
  });
});
