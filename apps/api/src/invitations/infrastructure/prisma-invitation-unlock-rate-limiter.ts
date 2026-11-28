import type { PrismaClient } from "@prisma/client";

import {
  INVITATION_UNLOCK_RATE_LIMIT,
  type InvitationUnlockRateLimiter,
  invitationUnlockRateLimitKey,
} from "../application/invitation-unlock-rate-limiter";
import { consumeRateLimit, type RateLimitRule } from "./prisma-rate-limit";

/**
 * The unlock rate limiter on the shared `RateLimit` table (F13; S2.13, L18.3). It states the feature's two rules — 10
 * attempts per 15 minutes per client address per invitation — and `consumeRateLimit` performs the one statement that
 * opens the window or counts the attempt, so the same store, the same window semantics, and the same pruning serve the
 * whole API.
 *
 * The key holds a SHA-256 of the client address, never the address itself, and the scope is the invitation id or, for an
 * address no invitation holds, a digest of that address: the budget never says whether an invitation exists.
 */
export class PrismaInvitationUnlockRateLimiter implements InvitationUnlockRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly rule: RateLimitRule = INVITATION_UNLOCK_RATE_LIMIT,
  ) {}

  async consume(scope: string, clientAddress: string): Promise<boolean> {
    return consumeRateLimit(
      this.prisma,
      invitationUnlockRateLimitKey(scope, clientAddress),
      this.rule,
    );
  }
}
