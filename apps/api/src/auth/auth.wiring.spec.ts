import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Controller, Get, Global, type INestApplication, Module } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";
import { BackgroundTasks } from "./sign-in-code/background-tasks";

// Runtime wiring of AppModule through the shared createApp boundary (M2 T3): validated configuration,
// project-owned credentialed CORS, Better Auth origin checks, and the public health route. The suite
// passes an explicit environment and a Prisma stub, so it never reads apps/api/.env nor needs a database.

const TRUSTED_ORIGIN = "http://localhost:3000";
const SECOND_TRUSTED_ORIGIN = "https://app.example.test";
const UNTRUSTED_ORIGIN = "https://untrusted.example.test";
const AUTH_BASE_PATH = "/api/auth";
const ALLOWED_METHODS = "GET,HEAD,POST,OPTIONS";

class PrismaStub {
  queries = 0;
  sessionLookups = 0;

  /** Every session query fails, as it would with the database down. */
  readonly session = new Proxy(
    {},
    {
      get: () => async () => {
        this.sessionLookups += 1;
        throw new Error("No database in this suite.");
      },
    },
  );

  /** Better Auth's database rate limiter starts a fresh bucket on every request. */
  readonly rateLimit = {
    findMany: async () => [],
    create: async ({ data }: { data: Record<string, unknown> }) => data,
  };

  async $queryRaw(): Promise<never> {
    this.queries += 1;
    throw new Error("No database in this suite.");
  }
}

const prismaStub = new PrismaStub();

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: prismaStub }],
  exports: [PrismaService],
})
class StubDatabaseModule {}

function testEnvironment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const environment: Record<string, unknown> = {
    NODE_ENV: "test",
    CORS_ORIGIN: `${TRUSTED_ORIGIN}, ${SECOND_TRUSTED_ORIGIN}`,
    // Syntactically valid and never connected: the stub replaces the Prisma client.
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    // The public web origin (L33): one of the trusted origins. The listening port is ephemeral.
    AUTH_BASE_URL: TRUSTED_ORIGIN,
  };

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete environment[name];
    } else {
      environment[name] = value;
    }
  }

  return environment;
}

function createTestApp(environment: Record<string, unknown>): Promise<INestApplication> {
  return createApp(AppModule.forRoot({ environment, database: StubDatabaseModule }), {
    logger: false,
    abortOnError: false,
  });
}

describe("AppModule startup configuration", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    [
      "a missing BETTER_AUTH_SECRET",
      { BETTER_AUTH_SECRET: undefined },
      "BETTER_AUTH_SECRET must be provided.",
    ],
    [
      "a short BETTER_AUTH_SECRET",
      { BETTER_AUTH_SECRET: "x".repeat(31) },
      "BETTER_AUTH_SECRET must be at least 32 characters long.",
    ],
    ["a missing AUTH_BASE_URL", { AUTH_BASE_URL: undefined }, "AUTH_BASE_URL must be provided."],
    [
      "an AUTH_BASE_URL with a path",
      { AUTH_BASE_URL: "http://localhost:3001/api" },
      "AUTH_BASE_URL must not include a path, query, or fragment.",
    ],
    [
      "an AUTH_BASE_URL outside the trusted origins",
      { AUTH_BASE_URL: "http://localhost:3001" },
      "AUTH_BASE_URL must be one of the trusted origins in CORS_ORIGIN.",
    ],
    [
      "production with an http AUTH_BASE_URL",
      {
        NODE_ENV: "production",
        EMAIL_FROM: "InvitaMe <no-reply@example.test>",
        RESEND_API_KEY: `re_${randomBytes(16).toString("hex")}`,
        AUTH_CLIENT_IP_HEADER: "x-real-ip",
      },
      "AUTH_BASE_URL must use HTTPS in production.",
    ],
    [
      "production without a client IP header",
      {
        NODE_ENV: "production",
        EMAIL_FROM: "InvitaMe <no-reply@example.test>",
        RESEND_API_KEY: `re_${randomBytes(16).toString("hex")}`,
      },
      "AUTH_CLIENT_IP_HEADER must be provided in production.",
    ],
  ];

  for (const [label, overrides, message] of cases) {
    it(`refuses to start with ${label}`, async () => {
      await assert.rejects(createTestApp(testEnvironment(overrides)), { message });
    });
  }
});

describe("AppModule runtime wiring", () => {
  let app: INestApplication;
  let baseUrl: string;
  let corsLayersAddedDuringInit = 0;

  before(async () => {
    app = await createTestApp(testEnvironment());

    // createApp already registered the project-owned CORS layer. On Express a second layer added
    // during init is shadowed rather than visible in headers, so count registrations directly.
    const httpAdapter = app.getHttpAdapter();
    const enableCors = httpAdapter.enableCors.bind(httpAdapter);
    httpAdapter.enableCors = (...args: Parameters<typeof enableCors>) => {
      corsLayersAddedDuringInit += 1;
      return enableCors(...args);
    };

    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app?.close();
  });

  function preflight(path: string, origin: string): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
  }

  function signOut(origin: string): Promise<Response> {
    return fetch(`${baseUrl}${AUTH_BASE_PATH}/sign-out`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        // Better Auth checks the Origin of state-changing requests that carry cookies. This cookie
        // is not a session, so a trusted request signs out nothing and never reaches the database.
        cookie: "unrelated=1",
      },
      body: "{}",
    });
  }

  it("serves the Better Auth health endpoint through AppModule", async () => {
    const response = await fetch(`${baseUrl}${AUTH_BASE_PATH}/ok`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });

  it("keeps GET /health public: no session yields 503 from the database check, never 401", async () => {
    const queriesBefore = prismaStub.queries;
    const response = await fetch(`${baseUrl}/health`);
    const body = (await response.json()) as { status: string; database: string };

    assert.equal(response.status, 503);
    assert.equal(body.status, "unhealthy");
    assert.equal(body.database, "unavailable");
    assert.equal(prismaStub.queries, queriesBefore + 1);
  });

  for (const origin of [TRUSTED_ORIGIN, SECOND_TRUSTED_ORIGIN]) {
    it(`answers a preflight from trusted origin ${origin} with one credentialed CORS header set`, async () => {
      for (const path of [`${AUTH_BASE_PATH}/sign-out`, "/health"]) {
        const response = await preflight(path, origin);

        assert.equal(response.status, 204);
        // Exact values: a second CORS layer would duplicate them ("a, a") or widen the methods.
        assert.equal(response.headers.get("access-control-allow-origin"), origin);
        assert.equal(response.headers.get("access-control-allow-credentials"), "true");
        assert.equal(response.headers.get("access-control-allow-methods"), ALLOWED_METHODS);
        assert.equal(response.headers.get("access-control-allow-headers"), "Accept,Content-Type");
      }
    });
  }

  it("registers no CORS layer besides the project-owned one", () => {
    assert.equal(corsLayersAddedDuringInit, 0);
  });

  it("gives an untrusted origin no Access-Control-Allow-Origin", async () => {
    for (const path of [`${AUTH_BASE_PATH}/sign-out`, "/health"]) {
      const response = await preflight(path, UNTRUSTED_ORIGIN);

      assert.equal(response.headers.get("access-control-allow-origin"), null);
    }

    const simple = await fetch(`${baseUrl}${AUTH_BASE_PATH}/ok`, {
      headers: { origin: UNTRUSTED_ORIGIN },
    });
    assert.equal(simple.status, 200);
    assert.equal(simple.headers.get("access-control-allow-origin"), null);
  });

  it("returns one credentialed CORS header set on a simple request from a trusted origin", async () => {
    const response = await fetch(`${baseUrl}${AUTH_BASE_PATH}/ok`, {
      headers: { origin: TRUSTED_ORIGIN },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), TRUSTED_ORIGIN);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  });

  it("rejects POST /api/auth/sign-out from an untrusted Origin with 403 INVALID_ORIGIN", async () => {
    const response = await signOut(UNTRUSTED_ORIGIN);
    const body = (await response.json()) as { code?: string };

    assert.equal(response.status, 403);
    assert.equal(body.code, "INVALID_ORIGIN");
  });

  it("accepts the same POST /api/auth/sign-out from every trusted Origin", async () => {
    for (const origin of [TRUSTED_ORIGIN, SECOND_TRUSTED_ORIGIN]) {
      const response = await signOut(origin);

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { success: true });
    }
  });
});

/** A session cookie signed like Better Auth's, so a guard that reads it would query the database. */
function signedSessionCookie(secret: string): string {
  const token = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
}

describe("AppModule access control (M2 T6a; L12, L20)", () => {
  const secret = randomBytes(32).toString("base64url");
  let app: INestApplication;
  let baseUrl: string;

  // Registered next to AppModule only in this suite; the global guard applies to it like any route.
  @Controller("wiring-probe")
  class UndecoratedProbeController {
    @Get()
    read(): { ok: true } {
      return { ok: true };
    }
  }

  before(async () => {
    @Module({
      imports: [
        AppModule.forRoot({
          environment: testEnvironment({ BETTER_AUTH_SECRET: secret }),
          database: StubDatabaseModule,
        }),
      ],
      controllers: [UndecoratedProbeController],
    })
    class ProbedAppModule {}

    app = await createApp(ProbedAppModule, { logger: false, abortOnError: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  it("answers GET /health with its own 503 when a session cookie is present and the database is down", async () => {
    const lookupsBefore = prismaStub.sessionLookups;
    const response = await fetch(`${baseUrl}/health`, {
      headers: { cookie: signedSessionCookie(secret) },
    });
    const body = (await response.json()) as { status: string; database: string };

    assert.equal(response.status, 503);
    assert.equal(body.status, "unhealthy");
    assert.equal(body.database, "unavailable");
    assert.equal(
      prismaStub.sessionLookups,
      lookupsBefore,
      "a public route never reads the session",
    );
  });

  it("denies a new undecorated route with 401 without a session", async () => {
    const response = await fetch(`${baseUrl}/wiring-probe`);

    assert.equal(response.status, 401);
  });
});

describe("AppModule route marker check at startup (M2 T6b; L27)", () => {
  it("starts the normal app", async () => {
    const app = await createTestApp(testEnvironment());

    try {
      await app.init();
    } finally {
      await app.close();
    }
  });

  it("refuses to start once a registered route carries @AllowAnonymous()", async () => {
    @Controller("marked-probe")
    class MarkedProbeController {
      @AllowAnonymous()
      @Get()
      read(): { ok: true } {
        return { ok: true };
      }
    }

    @Module({
      imports: [
        AppModule.forRoot({ environment: testEnvironment(), database: StubDatabaseModule }),
      ],
      controllers: [MarkedProbeController],
    })
    class MarkedAppModule {}

    const app = await createApp(MarkedAppModule, { logger: false, abortOnError: false });

    try {
      await assert.rejects(app.init(), {
        message:
          "MarkedProbeController.read uses the unsupported integration marker PUBLIC; use @Public() or @AdminOnly().",
      });
    } finally {
      await app.close();
    }
  });
});

describe("AppModule shutdown", () => {
  it("drains pending sign-in code tasks before the database disconnects", async () => {
    const order: string[] = [];

    class RecordingPrisma extends PrismaStub {
      async onModuleDestroy(): Promise<void> {
        order.push("database_disconnected");
      }
    }

    @Global()
    @Module({
      providers: [{ provide: PrismaService, useValue: new RecordingPrisma() }],
      exports: [PrismaService],
    })
    class RecordingDatabaseModule {}

    const app = await createApp(
      AppModule.forRoot({ environment: testEnvironment(), database: RecordingDatabaseModule }),
      { logger: false, abortOnError: false },
    );
    await app.init();

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tasks = app.get(BackgroundTasks, { strict: false });
    tasks.run("held_delivery", async () => {
      await held;
      order.push("task_finished");
    });

    let lateAccepted: boolean | undefined;
    const closing = app.close();
    setTimeout(() => {
      // The HTTP server is still open while the drain runs, so a request can still get here.
      lateAccepted = tasks.run("late_delivery", async () => {
        order.push("late_task_ran");
      });
      release();
    }, 20);
    await closing;

    assert.equal(lateAccepted, false, "work scheduled after the drain started is refused");
    assert.deepEqual(order, ["task_finished", "database_disconnected"]);
  });
});
