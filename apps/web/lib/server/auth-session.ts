import { ApiClientError, type SessionResult, sessionCookieHeader } from "./api-client.ts";

/**
 * The server-side session read of the administrator pages (M2 T8d; S6, S21, L34). A pending
 * administrator's session may read only itself, enable the authenticator app, confirm it, and sign
 * out (ADR 0004 decision 3), so `GET /me` answers it with `401`; Better Auth's `get-session` answers
 * every signed-in user with the role and `twoFactorEnabled`.
 *
 * The read runs through the web's own `/api/auth` proxy, like `session-refresh.ts`, so the API
 * receives the client IP from the edge header and the shared secret exactly as on a browser request
 * (the API refuses an auth request without them in production). `disableRefresh=true` keeps the
 * stored session unchanged: this render cannot pass a refreshed cookie to the browser, and a refresh
 * here would consume a customer's daily renewal without one (L40). Administrator sessions are never
 * refreshed anyway (L34), so the admin pages stay out of the `proxy.ts` matcher.
 */
export const AUTH_SESSION_PATH = "/api/auth/get-session?disableRefresh=true";

/** The proxy only reads the path and query; the origin of the internal request is irrelevant. */
const INTERNAL_ORIGIN = "http://web.internal";

/** What the administrator pages need from a session; nothing else is kept. */
export interface AuthSessionUser {
  email: string;
  role: "CUSTOMER" | "ADMIN";
  /** True only for the boolean `true`, as the API decides enrollment (`account-access.ts`). */
  twoFactorEnabled: boolean;
}

/** `null` for no session, `undefined` for a body that matches neither contract. */
export function parseAuthSession(payload: unknown): AuthSessionUser | null | undefined {
  if (payload === null) {
    return null;
  }
  if (typeof payload !== "object") {
    return undefined;
  }

  const user = (payload as Record<string, unknown>).user;
  if (typeof user !== "object" || user === null) {
    return undefined;
  }

  const fields = user as Record<string, unknown>;
  if (typeof fields.email !== "string" || (fields.role !== "CUSTOMER" && fields.role !== "ADMIN")) {
    return undefined;
  }

  return {
    email: fields.email,
    role: fields.role,
    twoFactorEnabled: fields.twoFactorEnabled === true,
  };
}

/**
 * Reads the session of the page request whose headers are given. Without a Better Auth cookie it
 * answers signed out without calling the API. A `null` session or a `401` is signed out; any other
 * failure throws an `ApiClientError` that never carries the response body.
 */
export async function readAuthSession(
  requestHeaders: Headers,
  proxy: (request: Request) => Promise<Response>,
): Promise<SessionResult<AuthSessionUser>> {
  if (sessionCookieHeader(requestHeaders.get("cookie")) === undefined) {
    return { signedIn: false };
  }

  let response: Response;
  try {
    response = await proxy(
      new Request(new URL(AUTH_SESSION_PATH, INTERNAL_ORIGIN), {
        method: "GET",
        headers: requestHeaders,
      }),
    );
  } catch {
    throw new ApiClientError("unavailable");
  }

  if (response.status === 401) {
    await response.body?.cancel();
    return { signedIn: false };
  }

  if (response.status !== 200) {
    await response.body?.cancel();
    throw new ApiClientError(response.status >= 500 ? "unavailable" : "rejected", response.status);
  }

  const session = parseAuthSession(await response.json().catch(() => undefined));

  if (session === undefined) {
    throw new ApiClientError("invalid-response", response.status);
  }

  return session === null ? { signedIn: false } : { signedIn: true, value: session };
}
