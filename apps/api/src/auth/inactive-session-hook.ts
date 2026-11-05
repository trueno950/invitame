import { createAuthMiddleware } from "better-auth/api";

import { type AccountAccess, isActive } from "./account-access";

/**
 * Better Auth `hooks.before`: on every Better Auth endpoint, a session whose stored user is not ACTIVE
 * is deleted before the endpoint runs, so the endpoint answers exactly as it does without a session
 * (S9, S18, L27, L28). Covers the race in which a sign-in commits after `user:disable` has deleted the
 * user's sessions: the surviving session is refused on its first use.
 *
 * Facts this relies on (Better Auth 1.7.16):
 * - HTTP routes and `auth.api.*` calls both run this hook before the endpoint
 *   (`api/to-auth-endpoints.mjs` into `dispatchAuthEndpoint`, `api/dispatch.mjs`), so the project
 *   guard's `getSession` call is covered too.
 * - `internalAdapter.findSession` reads the session joined with its user from the database adapter on
 *   every call; nothing is cached because there is no secondary storage and the session cookie cache
 *   is pinned off (`db/internal-adapter.mjs`, `findSession`).
 * - Every session-reading endpoint looks the token up again (`api/routes/session.mjs`, `getSession`
 *   and the session middlewares); once the row is gone it finds no session.
 */
export const refuseInactiveSessions = createAuthMiddleware(async (ctx) => {
  const token = await ctx.getSignedCookie(
    ctx.context.authCookies.sessionToken.name,
    ctx.context.secret,
  );
  if (!token) {
    return;
  }

  const found = await ctx.context.internalAdapter.findSession(token);
  if (found && !isActive(found.user as AccountAccess)) {
    // A failure here throws, so the request fails closed instead of using the session.
    await ctx.context.internalAdapter.deleteSession(token);
  }
});
