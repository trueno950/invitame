import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { memoryAdapter } from "better-auth/adapters/memory";

import {
  type EmailDeliveryRuntime,
  EmailDeliveryService,
} from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { CLIENT_IP_RATE_LIMIT, EMAIL_CODE_QUOTA, emailCodeQuotaKey } from "../abuse-limits";
import { createAuth } from "../auth.factory";
import { BackgroundTasks } from "./background-tasks";
import { SignInCodeSender } from "./sign-in-code-sender";

// The in-process sign-in-code request (M9 T9 finding, pinned by M9 T10; S4, S6). The administrator's resend enters
// Better Auth at `toAuthEndpoints` through `auth.api.sendVerificationOTP`, never at the HTTP router's `onRequest`, so
// the per-IP limit of the endpoint does not apply to it while the per-email quota — counted by the sender in the
// request's own store — does. That is the documented behavior of the version this project pins, not an accident worth
// relying on silently: this suite fails loudly if an upgrade starts rate limiting (or stops delivering) the in-process
// call, so the decision is revisited instead of discovered in production.
//
// Everything runs on Better Auth's in-memory adapter with a fresh auth instance per case: no network and no database.
// The harness mirrors the ones in `../users/presentation/admin-users.controller.spec.ts` and `sign-in-code.spec.ts`.

const AUTH_BASE_URL = "http://localhost:3001";
const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_PATH = "/api/auth";
const CLIENT_IP_HEADER = "x-forwarded-for";
const CUSTOMER_EMAIL = "m9fu-in-process-customer@example.test";
/** Another address, so exhausting the client's IP bucket does not spend the customer's code quota. */
const OTHER_EMAIL = "m9fu-in-process-other@example.test";

type MemoryDatabase = Record<string, Record<string, unknown>[]>;

/**
 * The one plugin endpoint this suite calls, declared here because the email-OTP plugin's inferred endpoint type
 * references a transitive zod path that declaration output cannot name — the same reason `createAuth` returns the
 * generic `Auth` and `SignInCodeResender` declares its own shape.
 */
interface SignInCodeEndpointApi {
  sendVerificationOTP(input: { body: { email: string; type: "sign-in" } }): Promise<unknown>;
}

function createHarness() {
  const database: MemoryDatabase = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const sender = new InMemoryEmailSender();
  const runtime: EmailDeliveryRuntime = {
    now: () => Date.now(),
    sleep: async () => {},
    warn: () => {},
    error: () => {},
  };
  const tasks = new BackgroundTasks(() => {});
  const auth = createAuth({
    secret: randomBytes(32).toString("base64url"),
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database),
    signInCodes: new SignInCodeSender(new EmailDeliveryService(sender, runtime), tasks),
    clientIp: { header: CLIENT_IP_HEADER, trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });

  return {
    auth,
    sender,
    tasks,
    database,
    /** One HTTP request to the code endpoint, from a client the caller names. */
    requestCode(email: string, clientIp: string): Promise<Response> {
      return auth.handler(
        new Request(`${AUTH_BASE_URL}${AUTH_PATH}/email-otp/send-verification-otp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: TRUSTED_ORIGIN,
            [CLIENT_IP_HEADER]: clientIp,
          },
          body: JSON.stringify({ email, type: "sign-in" }),
        }),
      );
    },
    /** The endpoint's own server-side method: what an administrator's resend calls (S4, S6). */
    async resendInProcess(email: string): Promise<unknown> {
      const api = auth.api as unknown as SignInCodeEndpointApi;
      return api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    },
    /** One ACTIVE customer, stored the way Better Auth's own sign-up would store it. */
    async createActiveCustomer(): Promise<void> {
      const context = await auth.$context;
      await context.internalAdapter.createUser(
        {
          email: CUSTOMER_EMAIL,
          name: "",
          emailVerified: true,
          role: "CUSTOMER",
          status: "ACTIVE",
        },
        { method: "email-otp" },
      );
    },
    codeQuotaCount(email: string): number | undefined {
      const row = (database.rateLimit ?? []).find(
        (entry) => entry.key === emailCodeQuotaKey(email),
      );
      return row === undefined ? undefined : Number(row.count);
    },
  };
}

describe("in-process sign-in-code request (M9 T9 finding, T10 probe)", () => {
  it("answers 429 to the exhausted client while three in-process requests all deliver and count", async () => {
    const harness = createHarness();
    await harness.createActiveCustomer();
    const clientIp = "10.80.0.1";

    // The client's own per-IP bucket for the endpoint, spent from another address so the customer's per-email quota
    // stays untouched by this part of the probe.
    for (let request = 1; request <= CLIENT_IP_RATE_LIMIT.max; request += 1) {
      const allowed = await harness.requestCode(OTHER_EMAIL, clientIp);
      assert.equal(allowed.status, 200, `request ${request} of the client's own limit`);
    }
    const limited = await harness.requestCode(CUSTOMER_EMAIL, clientIp);
    assert.equal(limited.status, 429, "the client's per-IP bucket is exhausted");

    // The administrator's path: the same endpoint, entered in process, three times from the same (limited) client.
    const answers: unknown[] = [];
    for (let call = 1; call <= 3; call += 1) {
      answers.push(await harness.resendInProcess(CUSTOMER_EMAIL));
    }
    await harness.tasks.drain();

    assert.equal(answers.length, 3, "every in-process request resolved");
    assert.equal(
      harness.sender.delivered.filter((message) => message.to === CUSTOMER_EMAIL).length,
      3,
      "each in-process request was delivered by the sender's own background task",
    );
    assert.equal(
      harness.codeQuotaCount(CUSTOMER_EMAIL),
      3,
      "the per-email quota is still counted for an in-process request",
    );
    assert.ok(
      EMAIL_CODE_QUOTA.max > 3,
      "the probe stays under the per-email quota so a delivered code is what the cap allows",
    );
  });
});
