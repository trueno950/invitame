import type { WebServerConfig } from "./config.ts";
import { AUTH_PROXY_SECRET_HEADER } from "./proxy-headers.ts";

/**
 * Better Auth's cookie names: `better-auth.*` over local http and `__Host-better-auth.*` over https
 * (ADR 0004 decision 4, as amended). No other browser cookie is sent to the API.
 */
const SESSION_COOKIE_PREFIXES = ["better-auth.", "__Host-better-auth."] as const;
export const API_CLIENT_TIMEOUT_MS = 10_000;

/** The signed-in user's own profile, as `GET /me` and `PATCH /me` return it. */
export interface OwnProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: "CUSTOMER" | "ADMIN";
}

export interface OwnProfileUpdate {
  displayName: string | null;
}

/** A 401 means "not signed in"; it is an expected outcome, not an error. */
export type SessionResult<T> = { signedIn: true; value: T } | { signedIn: false };

/**
 * - `rejected`: the API refused the request (4xx other than 401), for example invalid input (400).
 * - `unavailable`: the API failed (5xx), was unreachable, or did not answer in time.
 * - `invalid-response`: a success whose body does not match the contract.
 */
export type ApiClientErrorKind = "rejected" | "unavailable" | "invalid-response";

/**
 * A typed failure that never carries the API's response body. An `unavailable` failure keeps the
 * network or timeout error as its `cause` (R4-api-client-unavailable-drops-cause-and-logs-nothing);
 * the server log records only that cause's class (`server-log.ts`).
 */
export class ApiClientError extends Error {
  override readonly name = "ApiClientError";
  readonly kind: ApiClientErrorKind;
  readonly status: number | undefined;

  constructor(kind: ApiClientErrorKind, status?: number, options?: ErrorOptions) {
    super(`API request failed: ${kind}${status === undefined ? "" : ` (${status})`}.`, options);
    this.kind = kind;
    this.status = status;
  }
}

/** Keeps only Better Auth's cookies from a `Cookie` header; undefined when none is left. */
export function sessionCookieHeader(cookieHeader: string | null | undefined): string | undefined {
  const cookies = (cookieHeader ?? "")
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => {
      // A pair without `=` has no name (RFC 6265bis), so it is never a session cookie.
      const name = pair.includes("=") ? pair.slice(0, pair.indexOf("=")).trim() : "";
      return SESSION_COOKIE_PREFIXES.some(
        (prefix) => name.startsWith(prefix) && name.length > prefix.length,
      );
    });

  return cookies.length > 0 ? cookies.join("; ") : undefined;
}

function isOwnProfile(value: unknown): value is OwnProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const profile = value as Record<string, unknown>;
  return (
    typeof profile.id === "string" &&
    typeof profile.email === "string" &&
    (typeof profile.displayName === "string" || profile.displayName === null) &&
    (profile.role === "CUSTOMER" || profile.role === "ADMIN")
  );
}

export interface ApiClientOptions {
  config: WebServerConfig;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Calls the API from the web server with the browser's session cookie (M2 T8b; L29, L33). It forwards
 * only Better Auth's cookies and the shared secret, and stores nothing. A session read here refreshes
 * the stored session but sends no `Set-Cookie` to the browser; the browser's cookie is extended only
 * by `GET /api/auth/get-session` through the proxy (L34).
 */
export function createApiClient(options: ApiClientOptions) {
  const { config } = options;

  async function send(
    cookieHeader: string | null | undefined,
    method: "GET" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<SessionResult<OwnProfile>> {
    const cookie = sessionCookieHeader(cookieHeader);

    if (cookie === undefined) {
      return { signedIn: false };
    }

    const headers = new Headers({ accept: "application/json", cookie });

    if (config.proxySecret !== undefined) {
      headers.set(AUTH_PROXY_SECRET_HEADER, config.proxySecret);
    }

    if (body !== undefined) {
      headers.set("content-type", "application/json");
    }

    let response: Response;
    let payload: unknown;

    try {
      response = await (options.fetch ?? fetch)(new URL(path, config.apiOrigin), {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? API_CLIENT_TIMEOUT_MS),
      });

      if (response.status === 401) {
        await response.body?.cancel();
        return { signedIn: false };
      }

      if (response.status < 200 || response.status >= 300) {
        await response.body?.cancel();
        throw new ApiClientError(
          response.status >= 500 ? "unavailable" : "rejected",
          response.status,
        );
      }

      // A body that stalls past the deadline or breaks off is an outage, not a contract mismatch.
      const text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }

      throw new ApiClientError("unavailable", undefined, { cause: error });
    }

    if (!isOwnProfile(payload)) {
      throw new ApiClientError("invalid-response", response.status);
    }

    return { signedIn: true, value: payload };
  }

  return {
    /** `GET /me`: the signed-in user's own profile. */
    getOwnProfile(cookieHeader: string | null | undefined): Promise<SessionResult<OwnProfile>> {
      return send(cookieHeader, "GET", "/me");
    },
    /** `PATCH /me`: called by the web server, since CORS does not allow `PATCH` from a browser (L29). */
    updateOwnProfile(
      cookieHeader: string | null | undefined,
      update: OwnProfileUpdate,
    ): Promise<SessionResult<OwnProfile>> {
      return send(cookieHeader, "PATCH", "/me", { displayName: update.displayName });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
