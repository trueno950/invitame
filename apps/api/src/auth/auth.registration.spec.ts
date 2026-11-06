import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, describe, it, mock } from "node:test";

import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

import { type RuntimeEnvironment, validateEnvironment } from "../config/environment";
import type { PrismaService } from "../database/prisma.service";
import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../email/infrastructure/in-memory-email-sender";
import { createAuthModuleOptions } from "./auth.registration";
import { AUTH_PROXY_SECRET_HEADER, AUTH_REQUEST_EVENT } from "./auth-request-guard";
import { BackgroundTasks } from "./sign-in-code/background-tasks";
import { SignInCodeSender } from "./sign-in-code/sign-in-code-sender";

// The runtime registration of Better Auth (M2 T9a; L36, L37 R3-registration-require-proxy-secret-
// unproved): `createAuthModuleOptions` must turn the proxy secret requirement on from validated
// production configuration, not only when a test passes `requireProxySecret` to `createAuth` itself.
// No database: the Prisma client is an inert stand-in that records whether any query ran.

const PRODUCTION_ORIGIN = "https://app.example.test";
const CLIENT_IP_HEADER = "x-real-ip";
const PROXY_SECRET = randomBytes(32).toString("base64url");
const REFUSED = { status: 403, body: { code: "FORBIDDEN", message: "Forbidden." } };

function productionEnvironment(): RuntimeEnvironment {
  return validateEnvironment({
    NODE_ENV: "production",
    PORT: "3001",
    CORS_ORIGIN: PRODUCTION_ORIGIN,
    DATABASE_URL: "postgresql://invitame:invitame@localhost:5432/invitame",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    AUTH_BASE_URL: PRODUCTION_ORIGIN,
    EMAIL_TRANSPORT: "resend",
    EMAIL_FROM: "InvitaMe <no-reply@example.test>",
    RESEND_API_KEY: `re_${randomBytes(16).toString("hex")}`,
    AUTH_CLIENT_IP_HEADER: CLIENT_IP_HEADER,
    AUTH_PROXY_SECRET: PROXY_SECRET,
  });
}

function testEnvironment(): RuntimeEnvironment {
  return validateEnvironment({
    NODE_ENV: "test",
    PORT: "3001",
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://invitame:invitame@localhost:5432/invitame",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    AUTH_BASE_URL: "http://localhost:3000",
    AUTH_CLIENT_IP_HEADER: CLIENT_IP_HEADER,
  });
}

/** A Prisma stand-in on which every model query finds nothing and records that it ran. */
function inertPrisma() {
  const queries: string[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, operation) => async (args?: { data?: Record<string, unknown> }) => {
          queries.push(`${name}.${String(operation)}`);
          if (operation === "create" || operation === "update") {
            return { ...args?.data };
          }
          return operation === "findMany" ? [] : null;
        },
      },
    );
  const prisma = new Proxy(
    {},
    {
      // No `$transaction`: the adapter then runs each query on its own, without a transaction.
      get: (_target, property) =>
        typeof property === "string" && !property.startsWith("$") && property !== "then"
          ? model(property)
          : undefined,
    },
  ) as unknown as PrismaService;
  return { prisma, queries };
}

function registeredAuth(environment: RuntimeEnvironment) {
  const config = {
    get: (key: keyof RuntimeEnvironment) => environment[key],
  } as unknown as ConfigService<RuntimeEnvironment, true>;
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const signInCodes = new SignInCodeSender(
    new EmailDeliveryService(new InMemoryEmailSender(), runtime),
    new BackgroundTasks(() => {}),
  );
  const { prisma, queries } = inertPrisma();
  const { auth } = createAuthModuleOptions(config, prisma, signInCodes);
  return { auth, queries, origin: environment.AUTH_BASE_URL };
}

function get(origin: string, headers: Record<string, string>): Request {
  return new Request(`${origin}/api/auth/ok`, { headers: { origin, ...headers } });
}

describe("Better Auth registration from validated configuration (L36, L37)", () => {
  afterEach(() => mock.restoreAll());

  it("refuses a production request without the proxy secret or with a wrong one before any query", async () => {
    const warnings = mock.method(Logger.prototype, "warn", () => {});
    const { auth, queries, origin } = registeredAuth(productionEnvironment());

    for (const headers of [
      { [CLIENT_IP_HEADER]: "198.51.100.7" },
      {
        [CLIENT_IP_HEADER]: "198.51.100.7",
        [AUTH_PROXY_SECRET_HEADER]: randomBytes(32).toString("base64url"),
      },
    ]) {
      const response = await auth.handler(get(origin, headers));
      assert.deepEqual({ status: response.status, body: await response.json() }, REFUSED);
    }

    assert.deepEqual(queries, [], "no endpoint, rate limit, or session read ran");
    assert.deepEqual(
      warnings.mock.calls.map((call) => call.arguments[0]),
      [
        { event: AUTH_REQUEST_EVENT.PROXY_REJECTED, path: "/api/auth/ok" },
        { event: AUTH_REQUEST_EVENT.PROXY_REJECTED, path: "/api/auth/ok" },
      ],
    );
  });

  it("serves a production request that carries the proxy secret", async () => {
    const { auth, origin } = registeredAuth(productionEnvironment());

    const response = await auth.handler(
      get(origin, { [CLIENT_IP_HEADER]: "198.51.100.7", [AUTH_PROXY_SECRET_HEADER]: PROXY_SECRET }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });

  it("keeps serving requests without a proxy secret outside production", async () => {
    const { auth, origin } = registeredAuth(testEnvironment());

    const response = await auth.handler(get(origin, { [CLIENT_IP_HEADER]: "198.51.100.7" }));

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});
