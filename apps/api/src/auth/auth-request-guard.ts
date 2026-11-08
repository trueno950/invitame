import { createHash, timingSafeEqual } from "node:crypto";

import { errorClass, logSafely } from "./safe-logging";

/**
 * The fixed header that carries the shared web-to-API secret (L36). The web proxy and the web
 * server's API client set it; the API removes it before Better Auth or any hook sees the request.
 */
export const AUTH_PROXY_SECRET_HEADER = "x-invitame-proxy-secret";

export const AUTH_REQUEST_EVENT = {
  CLIENT_IP_UNRESOLVED: "client_ip_unresolved",
  PROXY_REJECTED: "auth_proxy_rejected",
  UNAVAILABLE: "auth_request_unavailable",
  /** A first TOTP confirmation was superseded and refused, reverted or not (S39, S40). */
  ENROLLMENT_SUPERSEDED: "administrator_enrollment_superseded",
  /** The revert of a superseded first confirmation failed; the account stays locked (S40). */
  ENROLLMENT_COMPENSATION_FAILED: "administrator_enrollment_compensation_failed",
  /** An administrator session arrived with an unusable creation time and was stored as expired (S49). */
  ADMINISTRATOR_SESSION_CREATED_AT_INVALID: "administrator_session_created_at_invalid",
  /** The create hook refused to open a session (L71, S50). */
  SESSION_REFUSED: "session_refused",
  /** The access hook deleted a stored session on its first use after it stopped qualifying (L71, S50). */
  SESSION_ENDED: "session_ended",
  /** The update hook refused a change to a stored session (L71, S50). */
  SESSION_UPDATE_REFUSED: "session_update_refused",
  /** Deleting the other sessions of an administrator at a first confirmation failed (L71, S50). */
  SIBLING_SESSIONS_DELETE_FAILED: "administrator_sibling_sessions_delete_failed",
  /** The revert of a superseded first confirmation was attempted; logged after it, with its result. */
  ENROLLMENT_REVERT_RESULT: "administrator_enrollment_revert_result",
} as const;

/** Why the create hook refused a session; a closed set, never a value taken from a request. */
export type SessionRefusalReason =
  | "account_missing"
  | "account_not_active"
  | "email_code_not_allowed"
  | "password_not_allowed"
  | "enrollment_window_closed";

/** Why the access hook deleted a stored session; a closed set. */
export type SessionEndedReason =
  | "account_not_active"
  | "second_factor_missing"
  | "enrollment_window_closed";

/** Why the update hook refused a change to a stored session; a closed set. */
export type SessionUpdateRefusedReason = "second_factor_marker" | "expiry_change_not_allowed";

/** What the guarded revert did: changed the flag, found it already false, or threw. */
export type EnrollmentRevertResult = "reverted" | "unchanged" | "failed";

/** Structured warning without personal data: the request path and, for a failure, the error class. */
export type AuthRequestEvent =
  | { event: typeof AUTH_REQUEST_EVENT.CLIENT_IP_UNRESOLVED; path: string }
  | { event: typeof AUTH_REQUEST_EVENT.PROXY_REJECTED; path: string }
  | { event: typeof AUTH_REQUEST_EVENT.UNAVAILABLE; path: string; error: string }
  | {
      event: typeof AUTH_REQUEST_EVENT.ENROLLMENT_SUPERSEDED;
      path: string;
      compensation: "reverted" | "skipped";
    }
  | {
      event: typeof AUTH_REQUEST_EVENT.ENROLLMENT_COMPENSATION_FAILED;
      path: string;
      error: string;
    }
  | { event: typeof AUTH_REQUEST_EVENT.ADMINISTRATOR_SESSION_CREATED_AT_INVALID }
  | {
      event: typeof AUTH_REQUEST_EVENT.SESSION_REFUSED;
      reason: SessionRefusalReason;
      path?: string;
    }
  | { event: typeof AUTH_REQUEST_EVENT.SESSION_ENDED; reason: SessionEndedReason; path?: string }
  | {
      event: typeof AUTH_REQUEST_EVENT.SESSION_UPDATE_REFUSED;
      reason: SessionUpdateRefusedReason;
      path?: string;
    }
  | { event: typeof AUTH_REQUEST_EVENT.SIBLING_SESSIONS_DELETE_FAILED; path: string; error: string }
  | {
      event: typeof AUTH_REQUEST_EVENT.ENROLLMENT_REVERT_RESULT;
      path: string;
      result: EnrollmentRevertResult;
    };

export type AuthRequestLog = (event: AuthRequestEvent) => void;

type AuthHandler = (request: Request) => Promise<Response>;

/** How the guard checks that a request came through the web proxy (L36). */
export interface AuthProxyOptions {
  /** The shared secret; undefined only when a caller turns the requirement off explicitly (S46). */
  secret: string | undefined;
  /**
   * The secret before a rotation (S47): accepted next to `secret` until the owner removes it, so the
   * API, the web, and the removal can happen one after another without a cut.
   */
  previousSecret?: string | undefined;
  /** Refuse every request that does not carry a valid secret; on unless turned off explicitly (S46). */
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
 * Whether the presented value is any configured secret. Every secret is compared, with no early
 * exit, so the response time does not tell which of the two matched.
 */
function matchesAnySecret(presented: string | null, secrets: readonly (string | undefined)[]) {
  let valid = false;

  for (const secret of secrets) {
    if (secret !== undefined && matchesSecret(presented, secret)) {
      valid = true;
    }
  }

  return valid;
}

/**
 * Returns the request Better Auth may see: never the secret header, and the client IP header only
 * when the secret was valid or, outside production, when no secret is configured at all.
 */
function withTrustedProxyHeadersOnly(
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

  // A previous secret without a current one would leave `secret` undefined, and the client IP header
  // would be trusted with no valid secret. This mirrors the environment rule (S47).
  if (proxy?.previousSecret !== undefined && proxy.secret === undefined) {
    throw new Error("AUTH_PROXY_SECRET_PREVIOUS requires AUTH_PROXY_SECRET.");
  }

  // The secret is required by default in every environment (S46); only an explicit opt-out skips it.
  if (proxy?.required && proxy.secret === undefined) {
    throw new Error(
      "AUTH_PROXY_SECRET is required to serve authentication requests unless the proxy secret requirement is turned off.",
    );
  }

  return async (incoming) => {
    const path = new URL(incoming.url).pathname;
    let request = incoming;

    if (proxy) {
      const secretValid = matchesAnySecret(incoming.headers.get(AUTH_PROXY_SECRET_HEADER), [
        proxy.secret,
        proxy.previousSecret,
      ]);

      if (proxy.required && !secretValid) {
        logSafely(options.log, { event: AUTH_REQUEST_EVENT.PROXY_REJECTED, path });
        return forbidden();
      }

      request = withTrustedProxyHeadersOnly(incoming, proxy, secretValid);
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
        error: errorClass(error),
      });
      return serviceUnavailable();
    }
  };
}
