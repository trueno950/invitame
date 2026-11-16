import type { PrismaClient } from "@prisma/client";

import {
  RSVP_RATE_LIMIT,
  type RsvpRateLimiter,
  rsvpRateLimitKey,
} from "../application/rsvp-rate-limiter";

/**
 * The RSVP rate limiter on the shared `RateLimit` table (M6 G1; S4). One statement opens the window or counts the
 * event, so concurrent submissions cannot exceed the cap:
 *
 * - a new key inserts a row with count 1 at the current instant, which starts its window;
 * - an existing key whose window has ended restarts the count at 1 and moves the window start;
 * - an existing key still inside its window is incremented only while its count is below the cap, and the window
 *   start never moves, so waiting slightly less than a window cannot extend the cap;
 * - when the conditional update matches nothing, the statement returns no row and the event is over the cap.
 *
 * The window and the cap are `RSVP_RATE_LIMIT` (10 per hour). The key holds a SHA-256 of the client address, never
 * the address itself, and the row is the same shape Better Auth's database rate limiter reads and prunes: its
 * `lastRequest` is the window start, so the row survives until the window has ended, matching how the email-code
 * quota row is kept (L25).
 */
export class PrismaRsvpRateLimiter implements RsvpRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rule: { readonly window: number; readonly max: number } = RSVP_RATE_LIMIT,
  ) {}

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    const key = rsvpRateLimitKey(invitationId, clientAddress);
    const now = Date.now();
    const windowStart = now - this.rule.window * 1000;

    const rows = await this.prisma.$queryRaw<Array<{ count: number }>>`
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
         OR "RateLimit"."count" < ${this.rule.max}
      RETURNING "count"
    `;

    return rows.length === 1;
  }
}
