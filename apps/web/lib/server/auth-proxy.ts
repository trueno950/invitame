import { isIP } from "node:net";

import type { WebServerConfig } from "./config.ts";
import { AUTH_PROXY_SECRET_HEADER } from "./proxy-headers.ts";

/** Only Better Auth's routes cross the proxy. */
const AUTH_PATH_PREFIX = "/api/auth/";
const ALLOWED_METHODS = new Set(["GET", "POST"]);
/** Request headers the browser may send to Better Auth; everything else stays on the web hop. */
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "cookie",
  "origin",
  "user-agent",
] as const;
/** RFC 9110 hop-by-hop headers, plus framing headers that describe the upstream connection. */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  // `fetch` already decoded and re-framed the body, so these would describe bytes we do not send.
  "content-encoding",
  "content-length",
]);
/** Statuses whose response must not carry a body. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);
/**
 * The generic JSON error for every failure the proxy reports instead of the API's own body. It
 * lives here, its only user; `proxy-headers.ts` holds only what the web and the API share.
 */
const SERVICE_UNAVAILABLE_BODY = {
  code: "SERVICE_UNAVAILABLE",
  message: "Service temporarily unavailable. Try again later.",
} as const;

/** Sign-in, code, and second-factor bodies are a few hundred bytes. */
export const AUTH_PROXY_MAX_BODY_BYTES = 16 * 1024;
export const AUTH_PROXY_TIMEOUT_MS = 10_000;
/** The de facto status for "the client closed the request"; a cancellation is not a server error. */
const CLIENT_CLOSED_REQUEST_STATUS = 499;

/** A structured warning without cookies, bodies, query strings, tokens, or the secret. */
export type AuthProxyEvent =
  | {
      event: "auth_proxy_upstream_failed";
      path: string;
      reason: "timeout" | "unreachable";
    }
  | { event: "auth_proxy_upstream_failed"; path: string; reason: "status"; status: number };

export interface AuthProxyOptions {
  config: WebServerConfig;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBodyBytes?: number;
  log?: (event: AuthProxyEvent) => void;
}

function jsonError(status: number, body: object, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function defaultLog(event: AuthProxyEvent): void {
  console.warn(JSON.stringify(event));
}

class BodyTooLargeError extends Error {
  override readonly name = "BodyTooLargeError";
}

/** Reads at most `limit` bytes and fails as soon as the body grows past it. */
async function readBoundedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > limit) {
    throw new BodyTooLargeError();
  }

  if (!request.body) {
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.byteLength;

    if (size > limit) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }

    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

/** The single client IP the platform edge reported, or undefined when it is missing or malformed. */
function edgeClientIp(request: Request, config: WebServerConfig): string | undefined {
  const value = request.headers.get(config.edgeClientIpHeader)?.trim();
  return value && isIP(value) !== 0 ? value : undefined;
}

function upstreamHeaders(request: Request, config: WebServerConfig): Headers {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);

    if (value !== null) {
      headers.set(name, value);
    }
  }

  // Set last, so neither header can come from the browser.
  const clientIp = edgeClientIp(request, config);

  if (clientIp) {
    headers.set(config.clientIpHeader, clientIp);
  }

  if (config.proxySecret !== undefined) {
    headers.set(AUTH_PROXY_SECRET_HEADER, config.proxySecret);
  }

  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const connectionTokens = (upstream.headers.get("connection") ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const headers = new Headers();

  for (const [name, value] of upstream.headers) {
    if (name === "set-cookie" || HOP_BY_HOP_HEADERS.has(name) || connectionTokens.includes(name)) {
      continue;
    }

    headers.set(name, value);
  }

  // Each cookie stays a separate header, byte for byte: a refreshed session, its data cookie, and
  // the cleared "don't remember" cookie arrive together (L34).
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }

  headers.set("cache-control", "no-store");
  return headers;
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError";
}

/**
 * Forwards a browser request for `/api/auth/*` to the API (M2 T8b; S14, L33, L36). The browser only
 * talks to the web origin, so the host-only session cookie never leaves it. The proxy stores no
 * cookie: it passes the browser's `Cookie` header up and every `Set-Cookie` back unchanged. It sends
 * the API the client IP from the edge header and the shared secret, and nothing the browser could
 * use to impersonate either.
 */
export async function proxyAuthRequest(
  request: Request,
  options: AuthProxyOptions,
): Promise<Response> {
  const { config } = options;
  const log = options.log ?? defaultLog;

  if (!ALLOWED_METHODS.has(request.method)) {
    return jsonError(
      405,
      { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." },
      { allow: "GET, POST" },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, config.apiOrigin);

  if (
    !incoming.pathname.startsWith(AUTH_PATH_PREFIX) ||
    !target.pathname.startsWith(AUTH_PATH_PREFIX) ||
    target.origin !== config.apiOrigin
  ) {
    return jsonError(404, { code: "NOT_FOUND", message: "Not found." });
  }

  let body: Uint8Array<ArrayBuffer> | undefined;

  if (request.method === "POST") {
    try {
      body = await readBoundedBody(request, options.maxBodyBytes ?? AUTH_PROXY_MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return jsonError(413, { code: "PAYLOAD_TOO_LARGE", message: "Request body too large." });
      }

      throw error;
    }
  }

  const path = incoming.pathname;
  let upstream: Response;
  let upstreamBody: ArrayBuffer;

  try {
    // One deadline covers the response headers and the body; a browser that goes away ends the call.
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(options.timeoutMs ?? AUTH_PROXY_TIMEOUT_MS),
    ]);
    upstream = await (options.fetch ?? fetch)(target, {
      method: request.method,
      headers: upstreamHeaders(request, config),
      ...(body === undefined ? {} : { body }),
      redirect: "manual",
      cache: "no-store",
      signal,
    });
    upstreamBody = await upstream.arrayBuffer();
  } catch (error) {
    if (request.signal.aborted) {
      // The browser left (R4-proxy-ignores-client-abort): no one reads this, and the API did not fail.
      // 499 is the client-closed-request status, so server error metrics do not count it (S51).
      return jsonError(CLIENT_CLOSED_REQUEST_STATUS, SERVICE_UNAVAILABLE_BODY);
    }

    const timedOut = isTimeout(error);
    log({
      event: "auth_proxy_upstream_failed",
      path,
      reason: timedOut ? "timeout" : "unreachable",
    });
    return jsonError(timedOut ? 504 : 502, SERVICE_UNAVAILABLE_BODY);
  }

  if (upstream.status >= 500) {
    log({ event: "auth_proxy_upstream_failed", path, reason: "status", status: upstream.status });
    return jsonError(upstream.status, SERVICE_UNAVAILABLE_BODY);
  }

  return new Response(NULL_BODY_STATUSES.has(upstream.status) ? null : upstreamBody, {
    status: upstream.status,
    headers: responseHeaders(upstream),
  });
}
