import { sessionCookieHeader } from "./api-client.ts";

/**
 * Rolling customer sessions through the web (M2 T8c; S7, L34, L37, L38). The browser's session cookie
 * is extended only when `GET /api/auth/get-session` runs through the web's proxy, and Better Auth sends
 * the refreshed cookie only in the same call that moves the stored expiry (1.7.16
 * `api/routes/session.mjs`, `getSession`). The API's guard also refreshes the stored session when a
 * page's server render reads `GET /me`, so a refresh started by the browser after the render would
 * find a fresh session and get no cookie. `proxy.ts` therefore runs this refresh before a signed-in
 * page renders and returns every `Set-Cookie` with the page.
 */

const SESSION_PATH = "/api/auth/get-session";
/** Bounds what a slow API adds to a page; the render then reads the session again anyway. */
export const SESSION_REFRESH_TIMEOUT_MS = 3_000;

/**
 * Every page whose server render reads the session through the API (`GET /me` or `PATCH /me`):
 * `/ingresar`, which sends a signed-in visitor to `/cuenta`, and `/cuenta` with everything under it.
 * Each such read refreshes the stored session without a cookie for the browser, so the refresh here
 * must run before every one of them. `proxy.ts` repeats this as its static `matcher`, which Next.js
 * requires to be a literal.
 */
export function isSessionPagePath(pathname: string): boolean {
  return pathname === "/ingresar" || pathname === "/cuenta" || pathname.startsWith("/cuenta/");
}

/**
 * A page `GET` or a server action's `POST` to one of those pages, with a Better Auth cookie: both
 * render through the API's session read. An anonymous visitor never reaches the API here.
 */
export function shouldRefreshSession(request: Request): boolean {
  return (
    (request.method === "GET" || request.method === "POST") &&
    isSessionPagePath(new URL(request.url).pathname) &&
    sessionCookieHeader(request.headers.get("cookie")) !== undefined
  );
}

/**
 * Runs `GET /api/auth/get-session` through `proxy` with the page request's headers (the proxy keeps
 * only its allow-list) and returns the `Set-Cookie` values unchanged. It never throws: a failed
 * refresh must not block the page, whose own read decides whether the visitor is signed in.
 */
export async function refreshSessionCookies(
  request: Request,
  proxy: (request: Request) => Promise<Response>,
): Promise<string[]> {
  try {
    const response = await proxy(
      new Request(new URL(SESSION_PATH, request.url), {
        method: "GET",
        headers: request.headers,
      }),
    );
    const cookies = response.headers.getSetCookie();
    await response.body?.cancel();
    return cookies;
  } catch {
    return [];
  }
}

/** Each cookie stays its own `Set-Cookie` header, byte for byte. */
export function appendSetCookies(headers: Headers, cookies: readonly string[]): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
}
