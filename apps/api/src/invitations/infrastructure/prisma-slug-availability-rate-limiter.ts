import type { PrismaClient } from "@prisma/client";

import {
  type SlugAvailabilityRateLimiter,
  SLUG_AVAILABILITY_RATE_LIMIT,
  slugAvailabilityRateLimitKey,
} from "../application/slug-availability-rate-limiter";
import { consumeRateLimit, type RateLimitRule } from "./prisma-rate-limit";

/**
 * The address-check limiter on the shared `RateLimit` table (F11; L15.3). It reuses `consumeRateLimit`, the same single
 * statement the RSVP form, the guestbook, and the place search count with, so the deployment keeps one window rule, one
 * store, and one pruning behavior.
 *
 * The key holds the owner id, which is an internal UUID and names no person, and the address the owner typed is never
 * part of it: the table says how often an owner checked, never which addresses they tried.
 */
export class PrismaSlugAvailabilityRateLimiter implements SlugAvailabilityRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rule: RateLimitRule = SLUG_AVAILABILITY_RATE_LIMIT,
  ) {}

  async consume(ownerId: string): Promise<boolean> {
    return consumeRateLimit(this.prisma, slugAvailabilityRateLimitKey(ownerId), this.rule);
  }
}
