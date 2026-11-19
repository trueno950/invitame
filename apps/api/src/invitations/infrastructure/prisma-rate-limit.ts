import type { PrismaClient } from "@prisma/client";

/**
 * One counting rule of the shared `RateLimit` table: the fixed window in seconds and the number of events it allows.
 * The RSVP form, the owner's place search, and Better Auth's own limiters all read and prune this one table (L25), so
 * a deployment keeps one abuse-limit store.
 */
export interface RateLimitRule {
  readonly window: number;
  readonly max: number;
}

/**
 * Counts one event of `key` against `rule` on the shared `RateLimit` table. Returns false when the event is over the
 * cap and must be refused; a store failure is an error, never an allow.
 *
 * One statement opens the window or counts the event, so concurrent requests cannot exceed the cap:
 *
 * - a new key inserts a row with count 1 at the current instant, which starts its window;
 * - an existing key whose window has ended restarts the count at 1 and moves the window start;
 * - an existing key still inside its window is incremented only while its count is below the cap, and the window
 *   start never moves, so waiting slightly less than a window cannot extend the cap;
 * - when the conditional update matches nothing, the statement returns no row and the event is over the cap.
 *
 * The row is the shape Better Auth's own database rate limiter reads and prunes: its `lastRequest` is the window
 * start, so the row survives until the window has ended. A caller builds `key` so it holds no plain personal data —
 * the RSVP adapter hashes the client address, and the place-search adapter names the owner id — and gives each
 * limiter its own prefix, because Better Auth's keys are `<ip>|<path>` and a path always starts with `/`.
 */
export async function consumeRateLimit(
  prisma: PrismaClient,
  key: string,
  rule: RateLimitRule,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - rule.window * 1000;

  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (gen_random_uuid(), ${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE
    SET "count" = CASE
          WHEN "RateLimit"."lastRequest" <= ${windowStart} THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "lastRequest" = CASE
          WHEN "RateLimit"."lastRequest" <= ${windowStart} THEN ${now}
          ELSE "RateLimit"."lastRequest"
        END
    WHERE "RateLimit"."lastRequest" <= ${windowStart}
       OR "RateLimit"."count" < ${rule.max}
    RETURNING "count"
  `;

  return rows.length === 1;
}
