import type { PrismaClient } from "@prisma/client";

import {
  RSVP_RATE_LIMIT,
  type RsvpRateLimiter,
  rsvpRateLimitKey,
} from "../application/rsvp-rate-limiter";
import { consumeRateLimit, type RateLimitRule } from "./prisma-rate-limit";

/**
 * The RSVP rate limiter on the shared `RateLimit` table (M6 G1; S4). It states RSVP's two rules — 10 per hour per
 * client address per invitation — and `consumeRateLimit` performs the one statement that opens the window or counts
 * the event, so the same store, the same window semantics, and the same pruning serve every limiter of this API.
 *
 * The key holds a SHA-256 of the client address, never the address itself, and the invitation id names no person.
 */
export class PrismaRsvpRateLimiter implements RsvpRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rule: RateLimitRule = RSVP_RATE_LIMIT,
  ) {}

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    return consumeRateLimit(this.prisma, rsvpRateLimitKey(invitationId, clientAddress), this.rule);
  }
}
