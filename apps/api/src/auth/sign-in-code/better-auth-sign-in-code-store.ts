import { createHash } from "node:crypto";

import type { emailOTP } from "better-auth/plugins";

import { EMAIL_CODE_QUOTA, emailCodeQuotaKey } from "../abuse-limits";
import type { SignInCodeRequest, SignInCodeStore } from "./sign-in-code-sender";

type EmailOTPOptions = Parameters<typeof emailOTP>[0];
/** The endpoint context Better Auth passes to `sendVerificationOTP`. */
export type SignInCodeEndpointContext = NonNullable<
  Parameters<EmailOTPOptions["sendVerificationOTP"]>[1]
>;

/**
 * Mirrors Better Auth 1.7.16's email OTP storage (`plugins/email-otp/utils.mjs`): the identifier is
 * `<type>-otp-<email>` and, with `storeOTP: "hashed"`, the value is the unpadded base64url SHA-256
 * of the code followed by `:<attempts>`. The sign-in code tests pin both shapes.
 */
function verificationIdentifier(request: SignInCodeRequest): string {
  return `${request.type}-otp-${request.email.toLowerCase()}`;
}

function storedCodePrefix(code: string): string {
  return `${createHash("sha256").update(code).digest("base64url")}:`;
}

type DatabaseAdapter = SignInCodeEndpointContext["context"]["adapter"];

interface RateLimitRow {
  count: number;
  lastRequest: number | bigint;
}

const RATE_LIMIT_MODEL = "rateLimit";
/** Bounded retries when a concurrent request changes the row between the read and the update. */
const MAX_COUNT_ATTEMPTS = 3;

/**
 * Counts one event in a `RateLimit` row with the semantics of Better Auth 1.7.16's database rate
 * limiter (`api/rate-limiter/index.mjs`, which it does not export): the count restarts once
 * `window` seconds have passed since the last counted event, and every change is a conditional
 * update, so concurrent requests cannot exceed `max`. Returns false when the event is over the cap.
 */
async function countEvent(
  adapter: DatabaseAdapter,
  key: string,
  rule: { window: number; max: number },
): Promise<boolean> {
  const byKey = { field: "key", value: key };

  for (let attempt = 0; attempt < MAX_COUNT_ATTEMPTS; attempt += 1) {
    const now = Date.now();
    const row = await adapter.findOne<RateLimitRow>({ model: RATE_LIMIT_MODEL, where: [byKey] });

    if (!row) {
      try {
        await adapter.create({
          model: RATE_LIMIT_MODEL,
          data: { key, count: 1, lastRequest: now },
        });
        return true;
      } catch {
        continue; // A concurrent request created the row first.
      }
    }

    const lastRequest = Number(row.lastRequest);
    const windowStart = now - rule.window * 1000;
    const restarted = lastRequest <= windowStart;
    const updated = restarted
      ? await adapter.incrementOne({
          model: RATE_LIMIT_MODEL,
          where: [byKey, { field: "lastRequest", operator: "lte", value: lastRequest }],
          increment: {},
          set: { count: 1, lastRequest: now },
        })
      : await adapter.incrementOne({
          model: RATE_LIMIT_MODEL,
          where: [
            byKey,
            { field: "lastRequest", operator: "gt", value: windowStart },
            { field: "count", operator: "lt", value: rule.max },
          ],
          increment: { count: 1 },
          set: { lastRequest: now },
        });

    if (updated) {
      return true;
    }

    if (!restarted && row.count >= rule.max) {
      return false;
    }
  }

  throw new Error("The per-email code count kept changing concurrently.");
}

/** Binds the sender's storage port to Better Auth's adapters for one auth request. */
export function createBetterAuthSignInCodeStore(
  context: SignInCodeEndpointContext,
): SignInCodeStore {
  const { adapter, internalAdapter } = context.context;

  return {
    consumeEmailQuota(email) {
      return countEvent(adapter, emailCodeQuotaKey(email), EMAIL_CODE_QUOTA);
    },

    async findRole(email) {
      const found = await internalAdapter.findUserByEmail(email);
      // `role` is the additional field declared in `createAuth`; this context type does not carry it.
      const role: unknown = (found?.user as { role?: unknown } | undefined)?.role;
      return typeof role === "string" ? role : null;
    },

    async invalidateCode(request) {
      // Match by stored code, not row id: a wrong attempt re-creates the row under a new id, and a
      // later request for the same address adds a newer row that must stay valid.
      await adapter.deleteMany({
        model: "verification",
        where: [
          { field: "identifier", value: verificationIdentifier(request) },
          { field: "value", operator: "starts_with", value: storedCodePrefix(request.code) },
        ],
      });
    },

    async discardCodes(request) {
      await internalAdapter.deleteVerificationByIdentifier(verificationIdentifier(request));
    },
  };
}
