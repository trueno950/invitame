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
 * - `rejected`: any other status that is not a success, 401, or 5xx: a 4xx such as invalid input
 *   (400), or a 3xx, because the client never follows a redirect (`redirect: "manual"`).
 * - `unavailable`: the API failed (5xx), was unreachable, or did not answer in time.
 * - `invalid-response`: a success whose body does not match the contract.
 * - `short-circuited`: the call was never made, because `proxy.ts` had just found the API failing for
 *   this request (`callUnlessApiUnavailable`); the log tells it apart from a call that reached a
 *   failing API (S50, L71).
 */
export type ApiClientErrorKind =
  | "rejected"
  | "unavailable"
  | "invalid-response"
  | "short-circuited";

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

export interface ApiRequest {
  /**
   * The already filtered session cookies (`sessionCookieHeader`). Omitted by a guest call such as the
   * public invitation read (M5 T5; S5, A3): then no `Cookie` header is sent at all, because a guest has
   * no session and the page must never forward a browser cookie it did not choose.
   */
  cookie?: string;
  method: "DELETE" | "GET" | "POST" | "PATCH" | "PUT";
  path: string;
  body?: unknown;
  /**
   * A body that is already a form: the multipart upload of one photo (M8 S2, S4). It replaces `body`, and the
   * runtime sets the `content-type` with its own boundary, so this client never declares it and never turns the
   * part into JSON.
   */
  multipart?: FormData;
  /** The deadline of this one request; the client's own deadline covers the rest (M8 S4: an upload of 10 MB). */
  timeoutMs?: number;
  /**
   * The guest's address, forwarded in the header the API reads it from (M6 G3; S4). Only the public RSVP
   * submission sends one: the API counts that answer against it. It is set last, so no other caller can
   * replace it, and it is never logged or stored here.
   */
  clientAddress?: string;
}

/** The status, the body text only when the caller asked to read it for that status, and the headers. */
export interface ApiResponse {
  status: number;
  text: string | undefined;
  headers: Headers;
}

/** One download: the status, the API's own headers, and the body as a stream the caller can pass through. */
export interface ApiDownload {
  status: number;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
}

/** The upstream answer of one request, before any caller decides whether to read the body. */
async function sendApiRequestRaw(
  options: ApiClientOptions,
  request: ApiRequest,
): Promise<Response> {
  const { config } = options;
  const headers = new Headers({ accept: "application/json" });

  if (request.cookie !== undefined) {
    headers.set("cookie", request.cookie);
  }

  if (config.proxySecret !== undefined) {
    headers.set(AUTH_PROXY_SECRET_HEADER, config.proxySecret);
  }

  // Set last, so a forwarded address is never a value another caller could add by accident.
  if (request.clientAddress !== undefined) {
    headers.set(config.clientIpHeader, request.clientAddress);
  }

  if (request.body !== undefined && request.multipart === undefined) {
    headers.set("content-type", "application/json");
  }

  const body =
    request.multipart ?? (request.body === undefined ? undefined : JSON.stringify(request.body));

  try {
    return await (options.fetch ?? fetch)(new URL(request.path, config.apiOrigin), {
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(request.timeoutMs ?? options.timeoutMs ?? API_CLIENT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiClientError("unavailable", undefined, { cause: error });
  }
}

/**
 * Sends one request to the API with the session cookies the caller chose (none at all when the request
 * names none) and the shared secret, never following a redirect and never caching. The body is read only
 * when `readsBody(status)` is true; otherwise it is cancelled unread, so a failure body never reaches the
 * web server's memory or logs. A network error, a timeout, and a body that stalls or breaks off throw
 * `unavailable` with the failure as the `cause`.
 */
export async function sendApiRequest(
  options: ApiClientOptions,
  request: ApiRequest,
  readsBody: (status: number) => boolean,
): Promise<ApiResponse> {
  const response = await sendApiRequestRaw(options, request);

  if (!readsBody(response.status)) {
    await response.body?.cancel();
    return { status: response.status, text: undefined, headers: response.headers };
  }

  // A body that stalls past the deadline or breaks off is an outage, not a contract mismatch.
  try {
    return {
      status: response.status,
      text: await response.text(),
      headers: response.headers,
    };
  } catch (error) {
    throw new ApiClientError("unavailable", undefined, { cause: error });
  }
}

/**
 * Sends one request whose answer is a file the API builds (M6 G3; the owner's RSVP CSV): the status and the API's
 * own headers, with the body still unread, so a route handler can pass the download through without copying it
 * into memory. A body the caller does not pass on is cancelled by the caller, and a stalled read is the
 * download's own failure.
 */
export async function sendApiDownload(
  options: ApiClientOptions,
  request: ApiRequest,
): Promise<ApiDownload> {
  const response = await sendApiRequestRaw(options, request);

  return { status: response.status, headers: response.headers, body: response.body };
}

const isSuccess = (status: number): boolean => status >= 200 && status < 300;

/**
 * Calls the API from the web server with the browser's session cookie (M2 T8b; L29, L33). It forwards
 * only Better Auth's cookies and the shared secret, and stores nothing. A session read here refreshes
 * the stored session but sends no `Set-Cookie` to the browser; the browser's cookie is extended only
 * by `GET /api/auth/get-session` through the proxy (L34).
 */
export function createApiClient(options: ApiClientOptions) {
  /**
   * Sends one own-profile request (`GET /me` or `PATCH /me`). Both answer the profile, so a success
   * body must be an `OwnProfile`; another endpoint needs its own response check, not this function.
   */
  async function sendOwnProfileRequest(
    cookieHeader: string | null | undefined,
    method: "GET" | "PATCH",
    path: "/me",
    body?: unknown,
  ): Promise<SessionResult<OwnProfile>> {
    const cookie = sessionCookieHeader(cookieHeader);

    if (cookie === undefined) {
      return { signedIn: false };
    }

    const response = await sendApiRequest(
      options,
      { cookie, method, path, ...(body === undefined ? {} : { body }) },
      isSuccess,
    );

    if (response.status === 401) {
      return { signedIn: false };
    }

    if (!isSuccess(response.status)) {
      throw new ApiClientError(
        response.status >= 500 ? "unavailable" : "rejected",
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(response.text ?? "");
    } catch {
      payload = undefined;
    }

    if (!isOwnProfile(payload)) {
      throw new ApiClientError("invalid-response", response.status);
    }

    return { signedIn: true, value: payload };
  }

  return {
    /** `GET /me`: the signed-in user's own profile. */
    getOwnProfile(cookieHeader: string | null | undefined): Promise<SessionResult<OwnProfile>> {
      return sendOwnProfileRequest(cookieHeader, "GET", "/me");
    },
    /** `PATCH /me`: called by the web server, since CORS does not allow `PATCH` from a browser (L29). */
    updateOwnProfile(
      cookieHeader: string | null | undefined,
      update: OwnProfileUpdate,
    ): Promise<SessionResult<OwnProfile>> {
      return sendOwnProfileRequest(cookieHeader, "PATCH", "/me", {
        displayName: update.displayName,
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
