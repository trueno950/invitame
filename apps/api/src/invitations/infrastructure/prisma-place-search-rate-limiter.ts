import type { PrismaClient } from "@prisma/client";

import {
  PLACE_SEARCH_RATE_LIMIT,
  type PlaceSearchRateLimiter,
  placeSearchRateLimitKey,
} from "../application/place-search-rate-limiter";
import { consumeRateLimit, type RateLimitRule } from "./prisma-rate-limit";

/**
 * The place-search rate limiter on the shared `RateLimit` table (S2, S3): 60 searches per ten minutes per owner, so
 * one customer cannot exhaust the free public geocoder. It reuses `consumeRateLimit`, the same single statement the
 * RSVP form counts with, so the deployment keeps one window rule, one store, and one pruning behavior.
 *
 * The key holds the owner id, which is an internal UUID and names no person, and the request's address query is
 * never part of it: the table says how often an owner searched, never what they typed.
 */
export class PrismaPlaceSearchRateLimiter implements PlaceSearchRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rule: RateLimitRule = PLACE_SEARCH_RATE_LIMIT,
  ) {}

  async consume(ownerId: string): Promise<boolean> {
    return consumeRateLimit(this.prisma, placeSearchRateLimitKey(ownerId), this.rule);
  }
}
