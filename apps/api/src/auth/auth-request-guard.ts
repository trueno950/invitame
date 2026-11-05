import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The fixed header that carries the shared web-to-API secret (L36). The web proxy and the web
 * server's API client set it; the API removes it before Better Auth or any hook sees the request.
 */
export const AUTH_PROXY_SECRET_HEADER = "x-invitame-proxy-secret";

export const AUTH_REQUEST_EVENT = {
  CLIENT_IP_UNRESOLVED: "client_ip_unresolved",
  PROXY_REJECTED: "auth_proxy_rejected",
  UNAVAILABLE: "auth_request_unavailable",
} as const;

/** Structured warning without personal data: the request path and, for a failure, the error class. */
export type AuthRequestEvent =
  | { event: typeof AUTH_REQUEST_EVENT.CLIENT_IP_UNRESOLVED; path: string }
  | { event: typeof AUTH_REQUEST_EVENT.PROXY_REJECTED; path: string }
  | { event: typeof AUTH_REQUEST_EVENT.UNAVAILABLE; path: string; error: string };

export type AuthRequestLog = (event: AuthRequestEvent) => void;

type AuthHandler = (request: Request) => Promise<Response>;

/** How the guard checks that a request came through the web proxy (L36). */
export interface AuthProxyOptions {
  /** The shared secret; undefined only outside production, where nothing is required. */
  secret: string | undefined;
  /** Production: refuse every request that does not carry the secret. */
  required: boolean;
  /** Lower-case name of the client IP header, trusted only next to a valid secret. */
  clientIpHeader: string;
}

export interface AuthRequestGuardOptions {
  /**
   * Returns the client IP the rate limiter will use, or null when none can be resolved. Set only
   * where an unresolved client must be rejected (production) instead of sharing one bucket.
   */
  resolveClientIp?: ((request: Request) => string | null) | undefined;
  /** The web-to-API proof; without it, requests pass with their headers unchanged. */
  proxy?: AuthProxyOptions | undefined;
  log: AuthRequestLog;
}

/** The single generic rejection: it reveals nothing about the cause, the account, or the store. */
function serviceUnavailable(): Response {
  return Response.json(
    { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable. Try again later." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

/** The single generic refusal for a request that did not come through the web proxy. */
function forbidden(): Response {
  return Response.json(
    { code: "FORBIDDEN", message: "Forbidden." },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Compares SHA-256 digests in constant time, so neither the content nor the length of the
 * expected secret leaks through response timing.
 */
function matchesSecret(presented: string | null, secret: string): boolean {
  if (presented === null) {
    return false;
  }

  const expected = createHash("sha256").update(secret).digest();
  const actual = createHash("sha256").update(presented).digest();
  return timingSafeEqual(expected, actual);
}

/**
 * Returns the request Better Auth may see: never the secret header, and the client IP header only
 * when the secret was valid or, outside production, when no secret is configured at all.
 */
function withoutProxyHeaders(
  request: Request,
  proxy: AuthProxyOptions,
  secretValid: boolean,
): Request {
  const headers = new Headers(request.headers);
  headers.delete(AUTH_PROXY_SECRET_HEADER);

  if (proxy.secret !== undefined && !secretValid) {
    headers.delete(proxy.clientIpHeader);
  }

  return new Request(request, { headers });
}

function logSafely(log: AuthRequestLog, event: AuthRequestEvent): void {
  try {
    log(event);
  } catch {
    // A failing log sink must not change the response.
  }
}

/**
 * Wraps Better Auth's handler so it fails closed (S19, L24). Better Auth consumes the rate-limit
 * token in its router's `onRequest`, outside the endpoint's error handling, so a failing store
 * throws out of the handler before the endpoint runs; that becomes a generic 503 here. Endpoint
 * errors never reach this wrapper: Better Auth turns them into responses itself.
 *
 * Before any of that, it checks the web-to-API proof (L36): in production a request without the
 * shared secret gets a generic 403 and no endpoint, hook, or rate-limit step runs. The secret header
 * is always removed, and the client IP header is removed unless the secret was valid, so a direct
 * caller can never choose its rate-limit bucket.
 */
export function guardAuthHandler(
  handler: AuthHandler,
  options: AuthRequestGuardOptions,
): AuthHandler {
  const proxy = options.proxy;

  if (proxy?.required && proxy.secret === undefined) {
    throw new Error(
      "AUTH_PROXY_SECRET is required to serve authentication requests in production.",
    );
  }

  return async (incoming) => {
    const path = new URL(incoming.url).pathname;
    let request = incoming;

    if (proxy) {
      const secretValid =
        proxy.secret !== undefined &&
        matchesSecret(incoming.headers.get(AUTH_PROXY_SECRET_HEADER), proxy.secret);

      if (proxy.required && !secretValid) {
        logSafely(options.log, { event: AUTH_REQUEST_EVENT.PROXY_REJECTED, path });
        return forbidden();
      }

      request = withoutProxyHeaders(incoming, proxy, secretValid);
    }

    if (options.resolveClientIp && options.resolveClientIp(request) === null) {
      logSafely(options.log, { event: AUTH_REQUEST_EVENT.CLIENT_IP_UNRESOLVED, path });
      return serviceUnavailable();
    }

    try {
      return await handler(request);
    } catch (error) {
      logSafely(options.log, {
        event: AUTH_REQUEST_EVENT.UNAVAILABLE,
        path,
        // The class name is safe to log; a message may carry SQL or an address.
        error: error instanceof Error ? error.name : "unknown",
      });
      return serviceUnavailable();
    }
  };
}
