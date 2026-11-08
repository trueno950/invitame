import { AUTH_PROXY_SECRET_HEADER } from "./proxy-headers.ts";

/**
 * Server-only settings of the web runtime (M2 T8b; L33, L36). None of them has the `NEXT_PUBLIC_`
 * prefix, so Next.js never inlines them into a browser bundle, and only server modules import this
 * file. They are validated when the Node.js server starts (`instrumentation.ts`) and on first use,
 * never at import, so `next build` needs none of them.
 */
export interface WebServerConfig {
  /** Internal origin of the API, from `API_ORIGIN`. */
  apiOrigin: string;
  /** Shared web-to-API secret, from `AUTH_PROXY_SECRET`; the same value as the API's. */
  proxySecret: string | undefined;
  /** Lower-case header the API reads the client IP from; the API's `AUTH_CLIENT_IP_HEADER`. */
  clientIpHeader: string;
  /** Lower-case header the platform edge overwrites with the client IP, from `AUTH_EDGE_CLIENT_IP_HEADER`. */
  edgeClientIpHeader: string;
}

const DEFAULT_API_ORIGIN = "http://localhost:3001";
/** The API's default client IP header outside production. */
const DEFAULT_CLIENT_IP_HEADER = "x-forwarded-for";
/** Outside production Next.js fills `x-forwarded-for` from the socket when the request has none. */
const DEFAULT_EDGE_CLIENT_IP_HEADER = "x-forwarded-for";
/**
 * Next.js keeps a client-supplied `x-forwarded-for` (it only fills a missing one), and proxies append
 * to `forwarded`, so a browser can choose their value. Production must name a header the platform
 * edge overwrites on every request.
 */
const CLIENT_CONTROLLED_HEADERS = new Set(["x-forwarded-for", "forwarded"]);
/**
 * The API's rule for the same secret (`MINIMUM_PROXY_SECRET_LENGTH` in
 * `apps/api/src/config/environment.ts`). The web never imports API code, so the two values are kept
 * equal by hand; the web checks it too so that a short secret stops the web at startup.
 */
const MINIMUM_PROXY_SECRET_LENGTH = 32;
// RFC 9110 field-name token characters: one header, never a list.
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;

type Environment = Readonly<Record<string, string | undefined>>;

function readOptional(environment: Environment, name: string): string | undefined {
  const value = environment[name]?.trim();
  return value ? value : undefined;
}

function readSetting(
  environment: Environment,
  name: string,
  production: boolean,
  fallback: string,
): string {
  const value = readOptional(environment, name);

  if (value) {
    return value;
  }

  if (production) {
    throw new Error(`${name} must be provided in production.`);
  }

  return fallback;
}

const API_ORIGIN_ERROR =
  "API_ORIGIN must be an http or https origin without a path, query, fragment, or credentials.";

/**
 * Any spelling of a bare http(s) origin, stored in its normalized form, which the proxy compares
 * against (R3-api-origin-rejects-equivalent-origins): `http://API:3001` is `http://api:3001`, and a
 * default port or a lone trailing `/` is dropped. Only then is the serialized URL its origin plus `/`,
 * so a path, a query or fragment (even an empty one), and credentials are refused.
 */
function parseApiOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(API_ORIGIN_ERROR);
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.href !== `${url.origin}/`) {
    throw new Error(API_ORIGIN_ERROR);
  }

  return url.origin;
}

function parseHeaderName(name: string, value: string): string {
  const header = value.toLowerCase();

  if (!HEADER_NAME_PATTERN.test(header)) {
    throw new Error(`${name} must be a single HTTP header name.`);
  }

  if (header === AUTH_PROXY_SECRET_HEADER) {
    throw new Error(`${name} must not be the proxy secret header.`);
  }

  return header;
}

function parseProxySecret(environment: Environment, production: boolean): string | undefined {
  const secret = readOptional(environment, "AUTH_PROXY_SECRET");

  if (!secret) {
    if (production) {
      throw new Error("AUTH_PROXY_SECRET must be provided in production.");
    }

    return undefined;
  }

  if (secret.length < MINIMUM_PROXY_SECRET_LENGTH) {
    throw new Error(
      `AUTH_PROXY_SECRET must be at least ${MINIMUM_PROXY_SECRET_LENGTH} characters long.`,
    );
  }

  return secret;
}

/** Validates the web server settings; error messages name the variable and never echo a value. */
export function parseWebServerConfig(environment: Environment): WebServerConfig {
  const production = environment.NODE_ENV === "production";
  const apiOrigin = parseApiOrigin(
    readSetting(environment, "API_ORIGIN", production, DEFAULT_API_ORIGIN),
  );
  const proxySecret = parseProxySecret(environment, production);
  const clientIpHeader = parseHeaderName(
    "AUTH_CLIENT_IP_HEADER",
    readSetting(environment, "AUTH_CLIENT_IP_HEADER", production, DEFAULT_CLIENT_IP_HEADER),
  );
  const edgeClientIpHeader = parseHeaderName(
    "AUTH_EDGE_CLIENT_IP_HEADER",
    readSetting(
      environment,
      "AUTH_EDGE_CLIENT_IP_HEADER",
      production,
      DEFAULT_EDGE_CLIENT_IP_HEADER,
    ),
  );

  if (production && CLIENT_CONTROLLED_HEADERS.has(edgeClientIpHeader)) {
    throw new Error(
      "AUTH_EDGE_CLIENT_IP_HEADER must name a header the platform edge overwrites in production.",
    );
  }

  return { apiOrigin, proxySecret, clientIpHeader, edgeClientIpHeader };
}

let cached: WebServerConfig | undefined;

/** Reads and validates `process.env` once, on first use; a failure is thrown again on every use. */
export function getWebServerConfig(): WebServerConfig {
  cached ??= parseWebServerConfig(process.env);
  return cached;
}
