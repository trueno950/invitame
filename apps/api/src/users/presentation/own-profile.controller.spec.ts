import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { MemoryOwnProfileRepository } from "../../../test/memory-own-profile.repository";
import { createApp } from "../../app.setup";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import { OWN_PROFILE_REPOSITORY, type OwnProfile } from "../application/own-profile.repository";
import { OWN_PROFILE_USE_CASES } from "../users.module";
import { OwnProfileController } from "./own-profile.controller";

// Own profile (M2 T6b; S1, S2, S9): `GET /me` and `PATCH /me` through the shared createApp boundary,
// the project-owned guard, and Better Auth on the in-memory adapter. The repository reads the same
// in-memory user rows, so the suite needs no network and no database; the Prisma adapter is proved
// in `own-profile.prisma.db-spec.ts`.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";

type Row = Record<string, unknown>;

describe("own profile: GET /me and PATCH /me", () => {
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
  let userCounter = 0;

  before(async () => {
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
      controllers: [OwnProfileController],
      providers: [
        ...OWN_PROFILE_USE_CASES,
        {
          provide: OWN_PROFILE_REPOSITORY,
          useValue: new MemoryOwnProfileRepository(() => database.user ?? []),
        },
      ],
    })
    class OwnProfileTestModule {}

    app = await createApp(OwnProfileTestModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  /** A stored customer and a signed session cookie for them, as an email-code sign-in leaves them. */
  async function signedInCustomer(): Promise<{ user: Row; cookie: string }> {
    userCounter += 1;
    const context = await auth.$context;
    const created = await context.internalAdapter.createUser(
      { email: `t6b-profile-${userCounter}@example.test`, name: "", emailVerified: true },
      { method: "email-otp" },
    );
    const session = await context.internalAdapter.createSession(created.id);
    const signature = createHmac("sha256", secret).update(session.token).digest("base64");
    const user = database.user?.find((row) => row.id === created.id);
    assert.ok(user);
    return {
      user,
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`,
    };
  }

  function getMe(cookie?: string, query = ""): Promise<Response> {
    return fetch(`${baseUrl}/me${query}`, { headers: cookie ? { cookie } : {} });
  }

  function patchMe(body: unknown, cookie?: string): Promise<Response> {
    return fetch(`${baseUrl}/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  describe("GET /me", () => {
    it("returns exactly id, email, displayName, and role of the stored user", async () => {
      const { user, cookie } = await signedInCustomer();
      const response = await getMe(cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        id: user.id,
        email: user.email,
        displayName: null,
        role: "CUSTOMER",
      });
    });

    it("reads the stored user on every request", async () => {
      const { user, cookie } = await signedInCustomer();
      user.displayName = "Stored Name";
      user.role = "ADMIN";
      // An enrolled administrator: an un-enrolled one holds no authority, `/me` included (T7, S21),
      // and a session that did not pass the second factor is ended (S52): mark it as having passed.
      user.twoFactorEnabled = true;
      for (const row of database.session?.filter((stored) => stored.userId === user.id) ?? []) {
        row.secondFactorVerified = true;
      }

      const body = (await (await getMe(cookie)).json()) as OwnProfile;

      assert.equal(body.displayName, "Stored Name");
      assert.equal(body.role, "ADMIN");
    });

    it("never reads a user id from the query", async () => {
      const own = await signedInCustomer();
      const other = await signedInCustomer();

      const body = (await (await getMe(own.cookie, `?id=${other.user.id}`)).json()) as OwnProfile;

      assert.equal(body.id, own.user.id);
    });
  });

  describe("PATCH /me", () => {
    it("trims and stores displayName and returns the updated profile", async () => {
      const { user, cookie } = await signedInCustomer();
      const response = await patchMe({ displayName: "  Ana María  " }, cookie);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        id: user.id,
        email: user.email,
        displayName: "Ana María",
        role: "CUSTOMER",
      });
      assert.equal(user.displayName, "Ana María");
    });

    it("clears the name with null", async () => {
      const { user, cookie } = await signedInCustomer();
      await patchMe({ displayName: "Ana" }, cookie);

      const response = await patchMe({ displayName: null }, cookie);

      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as OwnProfile).displayName, null);
      assert.equal(user.displayName, null);
    });

    it("accepts 1 and 120 characters, counted as Unicode code points like VarChar(120)", async () => {
      const { user, cookie } = await signedInCustomer();

      for (const name of ["A", "a".repeat(120), "😀".repeat(120), `${"é".repeat(119)}ñ`]) {
        const response = await patchMe({ displayName: ` ${name} ` }, cookie);
        assert.equal(response.status, 200, `${[...name].length} code points`);
        assert.equal(user.displayName, name);
      }
    });

    // S48 (L71): the bidirectional controls that make a name display differently from its content.
    const BIDIRECTIONAL_CONTROLS = [
      ...Array.from({ length: 5 }, (_, index) => 0x202a + index),
      ...Array.from({ length: 4 }, (_, index) => 0x2066 + index),
      0x200e,
      0x200f,
      0x061c,
    ];

    it("accepts the zero-width joiner of composed emoji and some scripts (S48)", async () => {
      const { user, cookie } = await signedInCustomer();

      for (const name of ["👨\u200d👩\u200d👧", "क\u200dष"]) {
        const response = await patchMe({ displayName: name }, cookie);
        assert.equal(response.status, 200);
        assert.equal(user.displayName, name);
      }
    });

    const invalid: Array<[string, unknown]> = [
      ...BIDIRECTIONAL_CONTROLS.map((codePoint): [string, unknown] => [
        `the bidirectional control U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`,
        `Ana${String.fromCodePoint(codePoint)}María`,
      ]),
      ["an empty string", ""],
      ["only whitespace", " \t\n "],
      ["121 characters", "a".repeat(121)],
      ["121 emoji", "😀".repeat(121)],
      ["a newline inside", "Ana\nMaría"],
      ["a tab inside", "Ana\tMaría"],
      ["a NUL character", "Ana\u0000"],
      ["a C1 control character", "Ana\u0085María"],
      ["DEL", "Ana\u007f"],
      ["an unpaired surrogate", "Ana\ud800"],
      ["a number", 42],
      ["an object", { first: "Ana" }],
      ["an array", ["Ana"]],
      ["a boolean", true],
    ];

    // T11 (L66): the DTO's 400 body is pinned whole, not only its status.
    const INVALID_DISPLAY_NAME = {
      message: [
        "displayName must be null or 1 to 120 characters after trimming, without control characters",
      ],
      error: "Bad Request",
      statusCode: 400,
    };

    for (const [label, displayName] of invalid) {
      it(`rejects ${label} with the DTO's 400 body and keeps the stored name`, async () => {
        const { user, cookie } = await signedInCustomer();
        await patchMe({ displayName: "Before" }, cookie);

        const response = await patchMe({ displayName }, cookie);

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), INVALID_DISPLAY_NAME);
        assert.equal(user.displayName, "Before");
      });
    }

    for (const [label, body] of [
      ["a missing displayName", {}],
      ["an unknown field", { displayName: "Ana", nickname: "A" }],
      ["a client-supplied id", { displayName: "Ana", id: "00000000-0000-4000-8000-000000000000" }],
      ["a client-supplied email", { displayName: "Ana", email: "other@example.test" }],
      ["a client-supplied role", { displayName: "Ana", role: "ADMIN" }],
      ["a client-supplied status", { displayName: "Ana", status: "DISABLED" }],
      ["a client-supplied image", { displayName: "Ana", image: "https://example.test/a.png" }],
      ["a JSON array body", "[]"],
      ["a JSON string body", '"Ana"'],
    ] as const) {
      it(`rejects ${label} with 400 and changes nothing`, async () => {
        const { user, cookie } = await signedInCustomer();
        const before = { ...user };

        const response = await patchMe(body, cookie);

        assert.equal(response.status, 400);
        assert.deepEqual(user, before);
      });
    }
  });

  describe("sessions", () => {
    it("rejects anonymous, invalid, and tampered sessions with 401 on both routes", async () => {
      const { cookie } = await signedInCustomer();
      const headers = [undefined, `${SESSION_COOKIE}=not-a-session`, `${cookie.slice(0, -4)}AAAA`];

      for (const header of headers) {
        assert.equal((await getMe(header)).status, 401);
        assert.equal((await patchMe({ displayName: "Ana" }, header)).status, 401);
      }
    });

    it("denies before validating: an anonymous invalid body gets 401, not 400", async () => {
      assert.equal((await patchMe({ displayName: 42, role: "ADMIN" })).status, 401);
    });

    it("rejects the session of a DISABLED user with 401 and changes nothing", async () => {
      const { user, cookie } = await signedInCustomer();
      user.status = "DISABLED";

      assert.equal((await getMe(cookie)).status, 401);
      assert.equal((await patchMe({ displayName: "Ana" }, cookie)).status, 401);
      assert.equal(user.displayName, "");
    });
  });
});
