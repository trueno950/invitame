import { createAuthMiddleware, setShouldSkipSessionRefresh } from "better-auth/api";

import { type AccountAccess, isActive, isPendingAdministrator, USER_ROLE } from "./account-access";
import {
  enrollmentWindowOpen,
  PENDING_ADMINISTRATOR_ENDPOINTS,
  TOTP_ISSUER,
} from "./administrator-enrollment";
import { TWO_FACTOR_PATH } from "./auth-paths";

type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** Changes this hook asks Better Auth to apply to the request before the endpoint runs. */
interface RequestOverrides {
  headers?: Headers;
  body?: Record<string, unknown>;
}

/** The second-factor verification endpoints, where Better Auth would offer to trust the device. */
const SECOND_FACTOR_VERIFY_PATHS: ReadonlySet<string> = new Set([
  TWO_FACTOR_PATH.VERIFY_TOTP,
  TWO_FACTOR_PATH.VERIFY_BACKUP_CODE,
]);

/**
 * Better Auth `hooks.before`, on every Better Auth endpoint and before it runs (S9, S18, S20, S21,
 * L27, L28):
 * 1. A session whose stored user is not ACTIVE is deleted, so the endpoint answers exactly as it does
 *    without a session. Covers the race in which a sign-in commits after `user:disable` has deleted the
 *    user's sessions: the surviving session is refused on its first use.
 * 2. A session of an administrator who has not enrolled an authenticator app is deleted the same way
 *    once the 24-hour window of the initial password has ended (S20).
 * 3. Inside that window, the session of such an administrator is hidden from every endpoint except
 *    `PENDING_ADMINISTRATOR_ENDPOINTS`: the session cookies are removed from this request only, so the
 *    endpoint answers exactly as without a session while the session stays usable for enrollment.
 * 4. Two-factor endpoints are for administrators only: a customer's session is hidden there too.
 * 5. On the second-factor endpoints `trustDevice` is forced to false, so a password sign-in always
 *    asks for the second factor; on enable, the TOTP issuer is always `InvitaMe`.
 * 6. An administrator session is never refreshed (S16, L34): the request skips Better Auth's session
 *    refresh, so its stored expiry stays 12 hours from sign-in and no cookie is reissued.
 *
 * Facts this relies on (Better Auth 1.7.16):
 * - HTTP routes and `auth.api.*` calls both run this hook before the endpoint
 *   (`api/to-auth-endpoints.mjs` into `dispatchAuthEndpoint`, `api/dispatch.mjs`), so the project
 *   guard's `getSession` call is covered too.
 * - A returned `context.headers` replaces those request headers, and a returned `context.body` is
 *   merged over the parsed body with priority, before the endpoint runs (`runBeforeHooks` and
 *   `dispatchAuthEndpoint`, `api/dispatch.mjs`). Every session read parses the `cookie` header again.
 * - `internalAdapter.findSession` reads the session joined with its user from the database adapter on
 *   every call; nothing is cached because there is no secondary storage and the session cookie cache
 *   is pinned off (`db/internal-adapter.mjs`, `findSession`).
 * - Every session-reading endpoint looks the token up again (`api/routes/session.mjs`, `getSession`
 *   and the session middlewares); once the row is gone it finds no session.
 * - `setShouldSkipSessionRefresh` is request state shared by this hook and every `getSession` run in
 *   the same request (`api/state/should-session-refresh.mjs`); `getSession` then neither updates the
 *   row nor sets a cookie.
 */
export const enforceSessionAccess = createAuthMiddleware(async (ctx) => {
  const overrides = secondFactorBodyOverrides(ctx);

  const token = await ctx.getSignedCookie(
    ctx.context.authCookies.sessionToken.name,
    ctx.context.secret,
  );
  const found = token ? await ctx.context.internalAdapter.findSession(token) : null;

  if (token && found) {
    const user = found.user as AccountAccess & { id: string };

    if (
      !isActive(user) ||
      !(await enrollmentWindowOpen(ctx.context.internalAdapter, user.id, user))
    ) {
      // A failure here throws, so the request fails closed instead of using the session.
      await ctx.context.internalAdapter.deleteSession(token);
    } else {
      if (user.role === USER_ROLE.ADMIN) {
        await setShouldSkipSessionRefresh(true);
      }
      if (sessionHiddenOn(ctx.path, user)) {
        overrides.headers = withoutSessionCookies(ctx);
      }
    }
  }

  return overrides.headers || overrides.body ? { context: overrides } : undefined;
});

/** Whether this active user's session must not be visible to the endpoint at `path`. */
function sessionHiddenOn(path: string | undefined, user: AccountAccess): boolean {
  if (isPendingAdministrator(user)) {
    return path === undefined || !PENDING_ADMINISTRATOR_ENDPOINTS.has(path);
  }
  return user.role !== USER_ROLE.ADMIN && path?.startsWith("/two-factor/") === true;
}

function secondFactorBodyOverrides(ctx: HookContext): RequestOverrides {
  if (ctx.path === TWO_FACTOR_PATH.ENABLE) {
    return { body: { issuer: TOTP_ISSUER } };
  }
  if (ctx.path !== undefined && SECOND_FACTOR_VERIFY_PATHS.has(ctx.path)) {
    return { body: { trustDevice: false } };
  }
  return {};
}

/** The request's `cookie` header without Better Auth's session cookies; other cookies are kept. */
function withoutSessionCookies(ctx: HookContext): Headers {
  const cookies = ctx.context.authCookies;
  const sessionCookieNames = new Set([
    cookies.sessionToken.name,
    cookies.sessionData.name,
    cookies.dontRememberToken.name,
  ]);
  const kept = (ctx.headers?.get("cookie") ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => pair !== "" && !sessionCookieNames.has(pair.split("=")[0]?.trim() ?? ""));

  return new Headers({ cookie: kept.join("; ") });
}
