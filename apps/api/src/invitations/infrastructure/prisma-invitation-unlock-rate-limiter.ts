import type { PrismaClient } from "@prisma/client";

import {
  type InvitationUnlockRateLimiter,
  invitationUnlockRateLimitKey,
  invitationUnlockRateLimitRule,
} from "../application/invitation-unlock-rate-limiter";
import { consumeRateLimit, refundRateLimit } from "./prisma-rate-limit";

/**
 * The unlock rate limiter on the shared `RateLimit` table (F13; S2.13, L18.3, L33). It reads the rule a scope names — 10
 * failed attempts per 15 minutes per client address and requested address, 30 across every address, or the hard ceiling of
 * 300 verifications per 15 minutes per client address — and `consumeRateLimit` performs the one statement that opens the
 * window or counts the attempt, so the same store, the same window semantics, and the same pruning serve the whole API.
 * `refund` gives a successful unlock's count back, so only failures stay counted; the use case never refunds the ceiling,
 * which counts the verifications an address bought rather than the failures it made.
 *
 * The key holds a SHA-256 of the client address, never the address itself, and the requested address is a digest of it
 * (known or unknown, so the budget never says whether an invitation exists) or one of the two fixed scopes: no key names an
 * invitation or a person.
 */
export class PrismaInvitationUnlockRateLimiter implements InvitationUnlockRateLimiter {
  constructor(private readonly prisma: PrismaClient) {}

  async consume(scope: string, clientAddress: string): Promise<boolean> {
    return consumeRateLimit(
      this.prisma,
      invitationUnlockRateLimitKey(scope, clientAddress),
      invitationUnlockRateLimitRule(scope),
    );
  }

  async refund(scope: string, clientAddress: string): Promise<void> {
    await refundRateLimit(
      this.prisma,
      invitationUnlockRateLimitKey(scope, clientAddress),
      invitationUnlockRateLimitRule(scope),
    );
  }
}
