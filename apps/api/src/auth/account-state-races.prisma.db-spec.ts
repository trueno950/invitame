import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";
import { type Prisma, PrismaClient } from "@prisma/client";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword } from "better-auth/crypto";
import { ClientAddresses, requireLocalDatabaseUrl } from "../../test/database";
import { decodeBase32Ascii } from "../../test/totp";
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

/** How long a test waits on a held transaction before it fails with an assertion error. */
const GATE_TIMEOUT_MS = 10_000;
/** The reset's blocked update is polled every 20 ms, for at most 5 s. */
const LOCK_POLL_INTERVAL_MS = 20;
const LOCK_POLL_ATTEMPTS = 250;

/** Rejects when `promise` is not settled in time, so a stuck wait fails the test instead of hanging. */
function within<T>(promise: Promise<T>, what: string, milliseconds = GATE_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`timed out after ${milliseconds} ms waiting for ${what}`)),
      milliseconds,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Releases a held transaction and waits for the operations that were blocked on it, so an assertion
 * failure cannot leave its row lock held for the `after` hook. A wait that times out is rethrown
 * with its own message instead of being hidden.
 */
async function releaseAndSettle(
  held: { open: () => void },
  operations: Array<Promise<unknown>>,
  what: string,
): Promise<void> {
  held.open();
  await within(Promise.allSettled(operations), what);
}

/**
 * A gate a wrapped query waits on; `reached` resolves once the query is held. `backendPid` is the
 * PostgreSQL backend of the held transaction, set when that transaction starts.
 */
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
  return { open, reached, hold, backendPid: undefined as number | undefined };
}

class SiblingDeleteOutage extends Error {
  override name = "SiblingDeleteOutage";
}

/**
 * Whether a Prisma `session.deleteMany` filter is the allow path of `settleFirstConfirmation`: every
 * session of a user but one. The adapter writes that as a `token: { not }` clause beside the user's,
 * and Prisma may hold it directly in `where` or inside `where.AND`; these are the two shapes accepted.
 */
function exceptsOneSession(where: Prisma.SessionWhereInput | undefined): boolean {
  const clauses = [where, ...(Array.isArray(where?.AND) ? where.AND : [])];
  return clauses.some(
    (clause) => typeof clause?.token === "object" && clause.token !== null && "not" in clause.token,
  );
}

describe("sibling-delete matcher", () => {
  it("accepts a token exclusion held directly or inside AND, and no other delete", () => {
    const except = { token: { not: "kept" } };

    assert.equal(exceptsOneSession({ userId: "u", ...except }), true);
    assert.equal(exceptsOneSession({ AND: [{ userId: "u" }, except] }), true);
    assert.equal(exceptsOneSession({ userId: "u" }), false, "every session of the user");
    assert.equal(exceptsOneSession({ token: "kept" }), false, "an equality clause");
    assert.equal(exceptsOneSession({ AND: { token: { not: "kept" } } }), false, "a bare AND");
    assert.equal(exceptsOneSession(undefined), false);
  });
});

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
          if (armed.failSiblingDelete && exceptsOneSession(args.where)) {
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
    requireProxySecret: false,
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

    /**
     * `user:disable` whose transaction holds at `step` until the gate opens. It records the
     * transaction's backend pid on the gate, so a test can tell which backend waits on it.
     */
    function heldDisable(step: "findUnique" | "updateMany", held: ReturnType<typeof gate>) {
      const holdingTransaction = (
        run: (transaction: PrismaClient) => Promise<unknown>,
        options?: { maxWait?: number; timeout?: number },
      ) =>
        prisma.$transaction(async (transaction) => {
          const [{ pid }] = await transaction.$queryRaw<[{ pid: number }]>`
              SELECT pg_backend_pid() AS pid`;
          held.backendPid = pid;
          const users = new Proxy(transaction.user, {
            get(target, property, receiver) {
              const member: unknown = Reflect.get(target, property, receiver);
              if (property !== step || typeof member !== "function") return member;
              return async (...args: unknown[]) => {
                const result: unknown = await member.apply(target, args);
                await held.hold();
                return result;
              };
            },
          });
          return run(
            new Proxy(transaction, {
              get: (target, property, receiver) =>
                property === "user" ? users : Reflect.get(target, property, receiver),
            }) as PrismaClient,
          );
        }, options);
      // The real client with only `$transaction` replaced, so it keeps every other member.
      const client = new Proxy(prisma, {
        get: (target, property, receiver) =>
          property === "$transaction"
            ? holdingTransaction
            : Reflect.get(target, property, receiver),
      });
      return new DisableUserUseCase(new PrismaUserAccessRepository(client), () => {});
    }

    it("lets the reset complete, then the disable revokes the session its fresh password opened", async () => {
      const admin = await pendingAdministrator("reset-then-disable");
      assert.ok(sessionCookie(await signIn(admin.email, admin.password)));
      const held = gate();

      // The disable has read the user but not changed it; the reset commits meanwhile.
      const disabling = heldDisable("findUnique", held).execute(admin.email);
      let initialPassword: string | undefined;
      let fresh: string | undefined;
      try {
        await within(held.reached, "the disable to hold its transaction");
        const resetResult = await reset().execute(admin.email);
        assert.equal(resetResult.outcome.outcome, "reset");
        initialPassword = resetResult.initialPassword;
        assert.ok(initialPassword);
        fresh = sessionCookie(await signIn(admin.email, initialPassword));
        assert.ok(fresh, "the fresh password opened a session before the disable committed");
      } finally {
        await releaseAndSettle(held, [disabling], "the disable to finish");
      }
      assert.ok(fresh && initialPassword);
      const disabled = await within(disabling, "the disable to finish");

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
      const credentialBefore = await credential();
      const held = gate();

      // The disable has updated the row and holds its lock; the reset's conditional update waits.
      const disabling = heldDisable("updateMany", held).execute(admin.email);
      let resetting: ReturnType<ReturnType<typeof reset>["execute"]> | undefined;
      try {
        await within(held.reached, "the disable to hold its transaction");
        const disablePid = held.backendPid;
        assert.ok(disablePid, "the disable's backend pid was recorded");
        resetting = reset().execute(admin.email);
        // Waiting means a backend of this database is blocked by the disable's transaction.
        for (let waited = 0; ; waited += 1) {
          const [{ waiting }] = await prisma.$queryRaw<[{ waiting: bigint }]>`
            SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND ${disablePid}::int = ANY(pg_blocking_pids(pid))`;
          if (waiting > 0n) break;
          assert.ok(
            waited < LOCK_POLL_ATTEMPTS,
            "the reset's update waits on the disable's row lock",
          );
          await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
        }
      } finally {
        await releaseAndSettle(
          held,
          resetting ? [disabling, resetting] : [disabling],
          "the disable and the reset to finish",
        );
      }
      assert.ok(resetting);
      const [disabled, { outcome, initialPassword }] = await within(
        Promise.all([disabling, resetting]),
        "the disable and the reset to finish",
      );

      assert.deepEqual(disabled, { userId: admin.id, alreadyDisabled: false, revokedSessions: 1 });
      assert.deepEqual(outcome, { outcome: "refused", userId: admin.id, reason: "disabled" });
      assert.equal(initialPassword, undefined);
      assert.deepEqual(
        await credential(),
        credentialBefore,
        "no fresh initial password was stored",
      );
      assert.deepEqual(await stored(admin.id), { status: "DISABLED", sessions: 0 });
      assert.equal(await sessionUserId(live), null);
    });
  });

  // A′ (L62, S52): the allow path of `settleFirstConfirmation` deletes every other session of the
  // administrator after Better Auth has already set `twoFactorEnabled`. If that delete throws, the
  // sessions opened with the password alone survive, but they carry no second-factor marker, and the
  // session hook ends the session of an enrolled administrator that has none.
  describe("a first confirmation whose sibling-session delete fails", () => {
    it("ends both password-only sessions on their next use, with the 401 of a missing session", async () => {
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
      const rawSecret = decodeBase32Ascii(new URL(totpURI).searchParams.get("secret") ?? "");
      const generateTOTP = (
        auth.api as unknown as Record<string, (input: unknown) => Promise<unknown>>
      ).generateTOTP;
      assert.ok(generateTOTP);
      const { code } = (await generateTOTP({ body: { secret: rawSecret } })) as { code: string };

      // A call, so the compiler does not narrow the flag to what was just assigned.
      const outageConsumed = () => armed.failSiblingDelete !== true;
      let confirmed: Response;
      let outage: boolean;
      armed.failSiblingDelete = true;
      try {
        confirmed = await request("/api/auth/two-factor/verify-totp", {
          body: { code },
          cookie: tabA,
        });
        outage = outageConsumed();
      } finally {
        // Armed state must never leak into a later test, whatever happened above.
        armed.failSiblingDelete = false;
      }

      assert.ok(outage, "the sibling delete ran and threw");
      const observed = {
        confirmation: confirmed.status,
        twoFactorEnabled: (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } }))
          .twoFactorEnabled,
        sessionsBefore: (await stored(admin.id)).sessions,
        meTabA: (await request("/me", { cookie: tabA })).status,
        meTabB: (await request("/me", { cookie: tabB })).status,
        getSessionTabB: await sessionUserId(tabB),
        listSessionsTabB: (await request("/api/auth/list-sessions", { cookie: tabB })).status,
        sessionsAfter: (await stored(admin.id)).sessions,
      };
      assert.deepEqual(observed, {
        confirmation: 500,
        twoFactorEnabled: true,
        sessionsBefore: 2,
        meTabA: 401,
        meTabB: 401,
        getSessionTabB: null,
        listSessionsTabB: 401,
        sessionsAfter: 0,
      });
    });
  });

  // R4-profile-write-not-conditioned-on-active-status (L30): `user:disable` commits after the guard
  // has read an ACTIVE user and before `PATCH /me` writes the name.
  describe("PATCH /me racing user:disable", () => {
    it("does not store the name of a user disabled after the guard's session check (S53)", async () => {
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
