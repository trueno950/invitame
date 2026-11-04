export const AUTH_REQUEST_EVENT = {
  CLIENT_IP_UNRESOLVED: "client_ip_unresolved",
  UNAVAILABLE: "auth_request_unavailable",
} as const;

/** Structured warning without personal data: the request path and, for a failure, the error class. */
export type AuthRequestEvent =
  | { event: typeof AUTH_REQUEST_EVENT.CLIENT_IP_UNRESOLVED; path: string }
  | { event: typeof AUTH_REQUEST_EVENT.UNAVAILABLE; path: string; error: string };

export type AuthRequestLog = (event: AuthRequestEvent) => void;

type AuthHandler = (request: Request) => Promise<Response>;

export interface AuthRequestGuardOptions {
  /**
   * Returns the client IP the rate limiter will use, or null when none can be resolved. Set only
   * where an unresolved client must be rejected (production) instead of sharing one bucket.
   */
  resolveClientIp?: ((request: Request) => string | null) | undefined;
  log: AuthRequestLog;
}

/** The single generic rejection: it reveals nothing about the cause, the account, or the store. */
function serviceUnavailable(): Response {
  return Response.json(
    { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable. Try again later." },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
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
 */
export function guardAuthHandler(
  handler: AuthHandler,
  options: AuthRequestGuardOptions,
): AuthHandler {
  return async (request) => {
    const path = new URL(request.url).pathname;

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
