import { createHash } from "node:crypto";

import type { emailOTP } from "better-auth/plugins";

import { EMAIL_CODE_QUOTA, emailCodeQuotaKey } from "../abuse-limits";
import type { AccountAccess } from "../account-access";
import type { SignInCodeRequest, SignInCodeStore } from "./sign-in-code-sender";

type EmailOTPOptions = Parameters<typeof emailOTP>[0];
/** The endpoint context Better Auth passes to `sendVerificationOTP`. */
export type SignInCodeEndpointContext = NonNullable<
  Parameters<EmailOTPOptions["sendVerificationOTP"]>[1]
>;

// The two helpers below mirror Better Auth 1.7.16's email OTP storage (`plugins/email-otp/utils.mjs`).
// The sign-in code tests pin both shapes.

/** The `Verification.identifier` of a code: `<type>-otp-<email>`. */
function verificationIdentifier(request: SignInCodeRequest): string {
  return `${request.type}-otp-${request.email.toLowerCase()}`;
}

/**
 * The start of a stored `Verification.value` with `storeOTP: "hashed"`: the unpadded base64url
 * SHA-256 of the code, followed by `:` and the attempt count.
 */
function storedCodePrefix(code: string): string {
  return `${createHash("sha256").update(code).digest("base64url")}:`;
}

type DatabaseAdapter = SignInCodeEndpointContext["context"]["adapter"];

interface RateLimitRow {
  count: number;
  /** For a count kept here, the start of its window: the time of the window's first counted event. */
  lastRequest: number | bigint;
}

const RATE_LIMIT_MODEL = "rateLimit";
/** Bounded retries when a concurrent request changes the row between the read and the update. */
const MAX_COUNT_ATTEMPTS = 3;

function findRow(adapter: DatabaseAdapter, key: string): Promise<RateLimitRow | null> {
  return adapter.findOne<RateLimitRow>({
    model: RATE_LIMIT_MODEL,
    where: [{ field: "key", value: key }],
  });
}

/**
 * Creates the row that opens a window, and returns false when a concurrent request created it
 * first. Better Auth 1.7.16's Prisma adapter passes Prisma's error through unchanged (a `P2002` on
 * the unique `RateLimit.key`), and its memory adapter never rejects a duplicate key. So, like
 * Better Auth's own database rate limiter, a failed create is a key conflict only when the row now
 * exists; any other error propagates to the caller's stage (L25).
 */
async function createRow(adapter: DatabaseAdapter, key: string, now: number): Promise<boolean> {
  try {
    await adapter.create({ model: RATE_LIMIT_MODEL, data: { key, count: 1, lastRequest: now } });
    return true;
  } catch (error) {
    if (await findRow(adapter, key)) {
      return false;
    }
    throw error;
  }
}

/**
 * Counts one event in a fixed window kept in a `RateLimit` row (L25). The window starts at its first
 * counted event, whose time `lastRequest` holds, and admits at most `max` events until `window`
 * seconds after that start; counting never moves the start. The first event after the window ends
 * opens a new one. Every change is a conditional update, so concurrent requests cannot exceed `max`.
 *
 * Better Auth 1.7.16's database rate limiter (`api/rate-limiter/index.mjs`, which it does not
 * export) deletes rows whose `lastRequest` is older than its longest configured window, which
 * `createAuth` sets to this window; since `lastRequest` is the window start, a row is deleted only
 * after its window has ended. Returns false when the event is over the cap.
 */
async function countEvent(
  adapter: DatabaseAdapter,
  key: string,
  rule: { window: number; max: number },
): Promise<boolean> {
  const byKey = { field: "key", value: key };
  const windowMs = rule.window * 1000;

  for (let attempt = 0; attempt < MAX_COUNT_ATTEMPTS; attempt += 1) {
    const now = Date.now();
    const row = await findRow(adapter, key);

    if (!row) {
      if (await createRow(adapter, key, now)) {
        return true;
      }
      continue; // A concurrent request opened the window; count against its row.
    }

    const windowStart = Number(row.lastRequest);
    const ended = now - windowStart >= windowMs;
    const updated = ended
      ? await adapter.incrementOne({
          model: RATE_LIMIT_MODEL,
          where: [byKey, { field: "lastRequest", operator: "lte", value: windowStart }],
          increment: {},
          set: { count: 1, lastRequest: now },
        })
      : await adapter.incrementOne({
          model: RATE_LIMIT_MODEL,
          where: [
            byKey,
            { field: "lastRequest", operator: "gt", value: now - windowMs },
            { field: "count", operator: "lt", value: rule.max },
          ],
          increment: { count: 1 },
        });

    if (updated) {
      return true;
    }

    if (!ended && row.count >= rule.max) {
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

    async findAccount(email) {
      const found = await internalAdapter.findUserByEmail(email);
      // `role` and `status` are additional fields declared in `createAuth`; this context type does
      // not carry them.
      const user = found?.user as AccountAccess | undefined;
      return user ? { role: user.role, status: user.status } : null;
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
