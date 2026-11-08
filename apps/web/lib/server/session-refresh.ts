import { ApiClientError, sessionCookieHeader } from "./api-client.ts";

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
/**
 * Bounds what a slow API adds to a page, and is the real bound of `/ingresar` and the `/cuenta` pages
 * (S54): when the API is slow, the page shows its unavailable notice after about 3 seconds instead of
 * making the person wait. The limit stays at 3 seconds by decision.
 */
export const SESSION_REFRESH_TIMEOUT_MS = 3_000;
/**
 * The request header with which `proxy.ts` tells the page's render that the refresh just found the
 * API failing (R4-cuenta-outage-latency-serialized), so the render answers unavailable at once
 * instead of waiting for its own read to time out after the refresh did. `proxy.ts` removes any copy
 * the browser sent on every page it runs for; a forged value could only show its sender the notice.
 */
export const API_UNAVAILABLE_HEADER = "x-invitame-api-unavailable";

export interface SessionRefresh {
  /** Every `Set-Cookie` of the refresh, unchanged. */
  cookies: string[];
  /** The proxy failed or answered 5xx: the API timed out, was unreachable, or failed. */
  apiUnavailable: boolean;
}

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
 * only its allow-list) and returns the `Set-Cookie` values unchanged, with whether the API failed. It
 * never throws: a failed refresh must not block the page, which then shows its unavailable notice.
 */
export async function refreshSessionCookies(
  request: Request,
  proxy: (request: Request) => Promise<Response>,
): Promise<SessionRefresh> {
  try {
    const response = await proxy(
      new Request(new URL(SESSION_PATH, request.url), {
        method: "GET",
        headers: request.headers,
      }),
    );
    const cookies = response.headers.getSetCookie();
    await response.body?.cancel();
    return { cookies, apiUnavailable: response.status >= 500 };
  } catch {
    return { cookies: [], apiUnavailable: true };
  }
}

/** The page request's headers for the render, with the outage notice only when this refresh failed. */
export function pageRequestHeaders(request: Request, apiUnavailable: boolean): Headers {
  const headers = new Headers(request.headers);
  headers.delete(API_UNAVAILABLE_HEADER);

  if (apiUnavailable) {
    headers.set(API_UNAVAILABLE_HEADER, "1");
  }

  return headers;
}

/**
 * Runs the request's API call, a profile read or update, unless `proxy.ts` just found the API failing
 * for this request; then it throws at once, as the `short-circuited` kind, which the page treats as
 * any other failure of the API.
 */
export async function callUnlessApiUnavailable<T>(
  requestHeaders: Headers,
  call: () => Promise<T>,
): Promise<T> {
  if (requestHeaders.get(API_UNAVAILABLE_HEADER) === "1") {
    throw new ApiClientError("short-circuited");
  }

  return call();
}

/** Each cookie stays its own `Set-Cookie` header, byte for byte. */
export function appendSetCookies(headers: Headers, cookies: readonly string[]): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
}
