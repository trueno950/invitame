import type { BetterAuthOptions } from "better-auth";

import { usesHttps } from "../config/environment";

/**
 * S16 (L34): a customer session lasts 7 days and is extended to 7 days from now at most once per day
 * of use. Better Auth extends a session on a read once `expiresAt - expiresIn + updateAge <= now`
 * (1.7.16 `api/routes/session.mjs`, `getSession`).
 */
export const CUSTOMER_SESSION_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
export const CUSTOMER_SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/**
 * S16 (L34): an administrator session lasts 12 hours from sign-in and is never extended. Better Auth
 * has one global lifetime, so the session hooks enforce this on the stored `expiresAt`.
 */
export const ADMINISTRATOR_SESSION_LIFETIME_SECONDS = 12 * 60 * 60;

/** Better Auth's default cookie name prefix, kept so every cookie keeps its library name. */
const COOKIE_NAME_PREFIX = "better-auth";
/**
 * S14 (L33): over https every auth cookie is host-only on the web host. Browsers accept a `__Host-`
 * cookie only with `Secure`, `Path=/`, and no `Domain`.
 */
const HOST_ONLY_PREFIX = "__Host-";

/** Whether the public auth origin is served over https, so its cookies must be `Secure`. */
export function usesSecureCookies(baseURL: string): boolean {
  return usesHttps(baseURL);
}

function cookieNamePrefix(baseURL: string): string {
  return usesSecureCookies(baseURL)
    ? `${HOST_ONLY_PREFIX}${COOKIE_NAME_PREFIX}`
    : COOKIE_NAME_PREFIX;
}

type CookieOptions = Pick<
  NonNullable<BetterAuthOptions["advanced"]>,
  "useSecureCookies" | "cookiePrefix" | "crossSubDomainCookies" | "defaultCookieAttributes"
>;

/**
 * Cookie settings for every Better Auth cookie (session, session data, "don't remember", two-factor
 * challenge, trusted device), which all share one name prefix (1.7.16 `cookies/index.mjs`,
 * `createCookieGetter`):
 * - over https: `__Host-better-auth.<name>`, `Secure`, `Path=/`, no `Domain`;
 * - over local http: `better-auth.<name>`, `Path=/`, no `Secure`, no `Domain`.
 *
 * `useSecureCookies` stays false because Better Auth would prepend `__Secure-` to every name when it
 * is true (`__Secure-__Host-...` is neither prefix); `Secure` comes from the default attributes
 * instead. better-call also forces `Secure`, `Path=/`, and no `Domain` on any `__Host-` name
 * (`better-call/dist/cookies.mjs`, `resolveCookie`). Cross-subdomain cookies are pinned off, so no
 * cookie ever carries a `Domain` and no other host receives it.
 */
export function cookieOptions(baseURL: string): CookieOptions {
  const secure = usesSecureCookies(baseURL);

  return {
    useSecureCookies: false,
    cookiePrefix: cookieNamePrefix(baseURL),
    crossSubDomainCookies: { enabled: false },
    defaultCookieAttributes: { secure, httpOnly: true, sameSite: "lax", path: "/" },
  };
}

/** The stored expiry of an administrator session that starts at `createdAt`. */
export function administratorSessionExpiresAt(createdAt: unknown): Date {
  const start =
    createdAt instanceof Date && Number.isFinite(createdAt.getTime()) ? createdAt : new Date();
  return new Date(start.getTime() + ADMINISTRATOR_SESSION_LIFETIME_SECONDS * 1000);
}
