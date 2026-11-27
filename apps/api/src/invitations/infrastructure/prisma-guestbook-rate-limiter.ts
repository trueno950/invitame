import type { PrismaClient } from "@prisma/client";

import {
  GUESTBOOK_RATE_LIMIT,
  type GuestbookRateLimiter,
  guestbookRateLimitKey,
} from "../application/guestbook-rate-limiter";
import { consumeRateLimit, type RateLimitRule } from "./prisma-rate-limit";

/**
 * The guestbook rate limiter on the shared `RateLimit` table (F7; L10.3). It states the guestbook's two rules — 10
 * signatures per hour per client address per invitation — and `consumeRateLimit` performs the one statement that opens
 * the window or counts the event, so the same store, the same window semantics, and the same pruning serve every
 * limiter of this API.
 *
 * The key holds a SHA-256 of the client address, never the address itself, and the invitation id names no person.
 */
export class PrismaGuestbookRateLimiter implements GuestbookRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rule: RateLimitRule = GUESTBOOK_RATE_LIMIT,
  ) {}

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    return consumeRateLimit(
      this.prisma,
      guestbookRateLimitKey(invitationId, clientAddress),
      this.rule,
    );
  }
}
