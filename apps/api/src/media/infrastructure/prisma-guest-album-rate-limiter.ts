import type { PrismaClient } from "@prisma/client";

import {
  GUEST_ALBUM_RATE_LIMIT,
  type GuestAlbumRateLimiter,
  guestAlbumRateLimitKey,
} from "../application/guest-album-rate-limiter";
import {
  consumeRateLimit,
  type RateLimitRule,
} from "../../invitations/infrastructure/prisma-rate-limit";

/**
 * The album's rate limiter on the shared `RateLimit` table (F8; L11.3). It states the album's two rules — 30 photos per
 * hour per client address per invitation — and `consumeRateLimit` performs the one statement that opens the window or
 * counts the event, so the same store, the same window semantics, and the same pruning serve every limiter of this API.
 *
 * The key holds a SHA-256 of the client address, never the address itself, and the invitation id names no person.
 */
export class PrismaGuestAlbumRateLimiter implements GuestAlbumRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rule: RateLimitRule = GUEST_ALBUM_RATE_LIMIT,
  ) {}

  async consume(invitationId: string, clientAddress: string): Promise<boolean> {
    return consumeRateLimit(
      this.prisma,
      guestAlbumRateLimitKey(invitationId, clientAddress),
      this.rule,
    );
  }
}
