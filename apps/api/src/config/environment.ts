import { isIP } from "node:net";

export const NODE_ENVIRONMENT = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
  TEST: "test",
} as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENT)[keyof typeof NODE_ENVIRONMENT];

export const EMAIL_TRANSPORT = {
  RESEND: "resend",
  MAILPIT: "mailpit",
  MEMORY: "memory",
} as const;

export type EmailTransport = (typeof EMAIL_TRANSPORT)[keyof typeof EMAIL_TRANSPORT];

/** Email adapter selection; each variant carries only the settings its adapter needs. */
export type EmailEnvironment =
  | {
      transport: typeof EMAIL_TRANSPORT.RESEND;
      from: string;
      /** Resend API key; never logged or echoed in error messages. */
      resendApiKey: string;
    }
  | { transport: typeof EMAIL_TRANSPORT.MAILPIT; from: string; mailpitUrl: string }
  | { transport: typeof EMAIL_TRANSPORT.MEMORY; from: string };

/** How the API resolves a client IP for rate limiting, from the request header a trusted proxy sets. */
export interface ClientIpEnvironment {
  /** Lower-case header name, from `AUTH_CLIENT_IP_HEADER`. */
  header: string;
  /** IP addresses or CIDR ranges of proxies whose hops are stripped, from `AUTH_TRUSTED_PROXIES`. */
  trustedProxies: readonly string[];
}

export interface RuntimeEnvironment {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  /**
   * Origins parsed from the comma-separated `CORS_ORIGIN` variable. The same list feeds credentialed
   * CORS and Better Auth's `trustedOrigins`, so the two can never disagree.
   */
  TRUSTED_ORIGINS: readonly string[];
  DATABASE_URL: string;
  /** Better Auth signing secret; never logged or echoed in error messages. */
  BETTER_AUTH_SECRET: string;
  /**
   * Public web origin through which the web proxies `/api/auth` to the API (L33). It is one of
   * `TRUSTED_ORIGINS` and uses https in production, so every auth cookie is `Secure` there.
   */
  AUTH_BASE_URL: string;
  /** Email delivery transport and sender, from `EMAIL_TRANSPORT`, `EMAIL_FROM`, and adapter variables. */
  EMAIL: EmailEnvironment;
  /** Client IP resolution for rate limits; production must name the header explicitly. */
  AUTH_CLIENT_IP: ClientIpEnvironment;
  /**
   * Shared web-to-API secret that proves a request to `/api/auth` came through the web proxy (L36).
   * Required in production, optional elsewhere; never logged or echoed in error messages.
   */
  AUTH_PROXY_SECRET: string | undefined;
  /**
   * The proxy secret before a rotation (S47, L71), accepted next to `AUTH_PROXY_SECRET` until it is
   * removed. Optional everywhere; it needs the current secret and follows its rules.
   */
  AUTH_PROXY_SECRET_PREVIOUS: string | undefined;
}

const DEFAULT_PORT = 3001;
const DEFAULT_EMAIL_TRANSPORT: Record<NodeEnvironment, EmailTransport> = {
  development: EMAIL_TRANSPORT.MAILPIT,
  test: EMAIL_TRANSPORT.MEMORY,
  production: EMAIL_TRANSPORT.RESEND,
};
/** Reserved `.localhost` domain: this sender can never reach a real mailbox. */
const LOCAL_EMAIL_FROM = "InvitaMe Local <no-reply@invitame.localhost>";
const DEFAULT_MAILPIT_URL = "http://localhost:8025";
// A bare address or `Name <address>`; no whitespace, angle brackets, or line breaks in the address.
const EMAIL_ADDRESS_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const NAMED_EMAIL_ADDRESS_PATTERN = /^([^<>\r\n]*)<([^<>]+)>$/;
const DATABASE_PROTOCOLS = ["postgresql:", "postgres:"] as const;
const MINIMUM_AUTH_SECRET_LENGTH = 32;
/** L36: the shared web-to-API secret has 32 characters or more, decided apart from the auth secret. */
const MINIMUM_PROXY_SECRET_LENGTH = 32;
/** Better Auth's default client IP header; trusted only outside production by default. */
const DEFAULT_CLIENT_IP_HEADER = "x-forwarded-for";
// RFC 9110 field-name token characters: one header, never a list.
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;
const IP_PREFIX_LIMITS: Record<number, number> = { 4: 32, 6: 128 };

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function readRequiredString(environment: Record<string, unknown>, name: string): string {
  const value = readOptionalString(environment[name]);

  if (!value) {
    throw new Error(`${name} must be provided.`);
  }

  return value;
}

function isNodeEnvironment(value: string): value is NodeEnvironment {
  return Object.values(NODE_ENVIRONMENT).some((environmentName) => environmentName === value);
}

function parsePort(value: unknown): number {
  const normalizedValue = readOptionalString(value);

  if (!normalizedValue) {
    return DEFAULT_PORT;
  }

  const port = Number(normalizedValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function validateHttpOrigin(name: string, value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP origin.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }

  if (url.origin !== value.replace(/\/$/, "")) {
    throw new Error(`${name} must not include a path, query, or fragment.`);
  }

  return url.origin;
}

function parseTrustedOrigins(value: string): string[] {
  const entries = value.split(",").map((entry) => entry.trim());

  if (entries.some((entry) => entry.length === 0)) {
    throw new Error("CORS_ORIGIN must not contain empty entries.");
  }

  return entries.map((entry) => {
    // Better Auth treats "*" as a pattern while CORS matches exactly; reject it so both agree.
    if (entry.includes("*")) {
      throw new Error("CORS_ORIGIN must not contain wildcards.");
    }

    return validateHttpOrigin("CORS_ORIGIN", entry);
  });
}

function validateAuthSecret(value: string): string {
  if (value.length < MINIMUM_AUTH_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least ${MINIMUM_AUTH_SECRET_LENGTH} characters long.`,
    );
  }

  return value;
}

/**
 * The web sends this secret on every request to the API, and the API trusts the client IP the web
 * reports only next to it (L36). Production requires it; development and test may omit it, so a
 * local API still serves direct requests.
 */
function parseProxySecret(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): string | undefined {
  const value = readOptionalString(environment.AUTH_PROXY_SECRET);

  if (!value) {
    if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION) {
      throw new Error("AUTH_PROXY_SECRET must be provided in production.");
    }

    return undefined;
  }

  return validateProxySecretLength("AUTH_PROXY_SECRET", value);
}

/** The previous proxy secret of a rotation (S47): optional, and as long as the current one. */
function parsePreviousProxySecret(environment: Record<string, unknown>): string | undefined {
  const value = readOptionalString(environment.AUTH_PROXY_SECRET_PREVIOUS);

  return value ? validateProxySecretLength("AUTH_PROXY_SECRET_PREVIOUS", value) : undefined;
}

function validateProxySecretLength(name: string, value: string): string {
  if (value.length < MINIMUM_PROXY_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MINIMUM_PROXY_SECRET_LENGTH} characters long.`);
  }

  return value;
}

/** A leaked proxy secret must not also sign sessions, and the reverse. */
function validateDistinctSecrets(
  proxySecret: string | undefined,
  previousProxySecret: string | undefined,
  authSecret: string,
): void {
  if (proxySecret === authSecret) {
    throw new Error("AUTH_PROXY_SECRET must differ from BETTER_AUTH_SECRET.");
  }

  if (previousProxySecret === undefined) {
    return;
  }

  if (previousProxySecret === authSecret) {
    throw new Error("AUTH_PROXY_SECRET_PREVIOUS must differ from BETTER_AUTH_SECRET.");
  }

  if (proxySecret === undefined) {
    throw new Error("AUTH_PROXY_SECRET_PREVIOUS requires AUTH_PROXY_SECRET.");
  }

  if (previousProxySecret === proxySecret) {
    throw new Error("AUTH_PROXY_SECRET_PREVIOUS must differ from AUTH_PROXY_SECRET.");
  }
}

/**
 * Better Auth silently appends this variable to its trusted origins. Reject it so the CORS list stays
 * the single source of trusted origins.
 */
function rejectUnsupportedAuthOrigins(environment: Record<string, unknown>): void {
  if (readOptionalString(environment.BETTER_AUTH_TRUSTED_ORIGINS)) {
    throw new Error(
      "BETTER_AUTH_TRUSTED_ORIGINS is not supported; list trusted origins in CORS_ORIGIN.",
    );
  }
}

/**
 * Better Auth adds the origin of its base URL to its trusted origins on its own (1.7.16
 * `context/helpers.mjs`, `getTrustedOrigins`). Requiring it in the CORS list makes that trust explicit
 * (L20), so Better Auth never trusts an origin that CORS does not. In production it must use https:
 * the session cookie is `Secure` and carries the `__Host-` prefix only over https (S14, L33).
 */
function validateAuthBaseUrl(
  authBaseUrl: string,
  trustedOrigins: readonly string[],
  nodeEnvironment: NodeEnvironment,
): string {
  if (!trustedOrigins.includes(authBaseUrl)) {
    throw new Error("AUTH_BASE_URL must be one of the trusted origins in CORS_ORIGIN.");
  }

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION && !usesHttps(authBaseUrl)) {
    throw new Error("AUTH_BASE_URL must use HTTPS in production.");
  }

  return authBaseUrl;
}

/**
 * Whether a URL uses https. The one rule behind the production check on `AUTH_BASE_URL` and the
 * auth cookie settings (`auth/session-settings.ts`): auth cookies are `Secure` only over https.
 */
export function usesHttps(url: string): boolean {
  return new URL(url).protocol === "https:";
}

function validateDatabaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  const hasSupportedProtocol = DATABASE_PROTOCOLS.some((protocol) => protocol === url.protocol);

  if (!hasSupportedProtocol) {
    throw new Error("DATABASE_URL must use the postgresql or postgres protocol.");
  }

  return value;
}

function isEmailTransport(value: string): value is EmailTransport {
  return Object.values(EMAIL_TRANSPORT).some((transport) => transport === value);
}

function validateEmailFrom(value: string): string {
  const namedAddress = NAMED_EMAIL_ADDRESS_PATTERN.exec(value);
  const address = namedAddress ? namedAddress[2]?.trim() : value;

  if (/[\r\n]/.test(value) || !address || !EMAIL_ADDRESS_PATTERN.test(address)) {
    throw new Error('EMAIL_FROM must be an email address or "Name <address>".');
  }

  return value;
}

/**
 * Production always sends through Resend: any other transport fails closed, and Resend needs both an
 * explicit sender and its API key. Development and test work with no email variables at all.
 */
function parseEmailEnvironment(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): EmailEnvironment {
  const transport =
    readOptionalString(environment.EMAIL_TRANSPORT) ?? DEFAULT_EMAIL_TRANSPORT[nodeEnvironment];

  if (!isEmailTransport(transport)) {
    throw new Error("EMAIL_TRANSPORT must be resend, mailpit, or memory.");
  }

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION && transport !== EMAIL_TRANSPORT.RESEND) {
    throw new Error("EMAIL_TRANSPORT must be resend in production.");
  }

  const from = validateEmailFrom(
    nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION
      ? readRequiredString(environment, "EMAIL_FROM")
      : (readOptionalString(environment.EMAIL_FROM) ?? LOCAL_EMAIL_FROM),
  );
  const mailpitUrl = validateHttpOrigin(
    "MAILPIT_URL",
    readOptionalString(environment.MAILPIT_URL) ?? DEFAULT_MAILPIT_URL,
  );

  switch (transport) {
    case EMAIL_TRANSPORT.RESEND: {
      const resendApiKey = readOptionalString(environment.RESEND_API_KEY);

      if (!resendApiKey) {
        throw new Error("RESEND_API_KEY must be provided when EMAIL_TRANSPORT is resend.");
      }

      return { transport, from, resendApiKey };
    }
    case EMAIL_TRANSPORT.MAILPIT:
      return { transport, from, mailpitUrl };
    case EMAIL_TRANSPORT.MEMORY:
      return { transport, from };
  }
}

function isIpOrCidr(entry: string): boolean {
  const [address = "", prefix, ...rest] = entry.split("/");
  const maximum = IP_PREFIX_LIMITS[isIP(address)];

  if (maximum === undefined || rest.length > 0) {
    return false;
  }

  return prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= maximum);
}

/**
 * Production names the header its proxy sets, so rate limits never fall back to one shared bucket
 * (L24). Development and test default to Better Auth's `x-forwarded-for` with no trusted proxies.
 */
function parseClientIpEnvironment(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): ClientIpEnvironment {
  const configuredHeader = readOptionalString(environment.AUTH_CLIENT_IP_HEADER);

  if (!configuredHeader && nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION) {
    throw new Error("AUTH_CLIENT_IP_HEADER must be provided in production.");
  }

  const header = (configuredHeader ?? DEFAULT_CLIENT_IP_HEADER).toLowerCase();

  if (!HEADER_NAME_PATTERN.test(header)) {
    throw new Error("AUTH_CLIENT_IP_HEADER must be a single HTTP header name.");
  }

  const proxies = readOptionalString(environment.AUTH_TRUSTED_PROXIES);
  const trustedProxies = proxies ? proxies.split(",").map((entry) => entry.trim()) : [];

  if (!trustedProxies.every(isIpOrCidr)) {
    throw new Error("AUTH_TRUSTED_PROXIES must list IP addresses or CIDR ranges.");
  }

  return { header, trustedProxies };
}

export function validateEnvironment(environment: Record<string, unknown>): RuntimeEnvironment {
  const nodeEnvironment = readOptionalString(environment.NODE_ENV) ?? NODE_ENVIRONMENT.DEVELOPMENT;

  if (!isNodeEnvironment(nodeEnvironment)) {
    throw new Error("NODE_ENV must be development, production, or test.");
  }

  rejectUnsupportedAuthOrigins(environment);

  const validated = {
    NODE_ENV: nodeEnvironment,
    PORT: parsePort(environment.PORT),
    TRUSTED_ORIGINS: parseTrustedOrigins(readRequiredString(environment, "CORS_ORIGIN")),
    DATABASE_URL: validateDatabaseUrl(readRequiredString(environment, "DATABASE_URL")),
    BETTER_AUTH_SECRET: validateAuthSecret(readRequiredString(environment, "BETTER_AUTH_SECRET")),
    AUTH_BASE_URL: validateHttpOrigin(
      "AUTH_BASE_URL",
      readRequiredString(environment, "AUTH_BASE_URL"),
    ),
    EMAIL: parseEmailEnvironment(environment, nodeEnvironment),
    AUTH_CLIENT_IP: parseClientIpEnvironment(environment, nodeEnvironment),
    AUTH_PROXY_SECRET: parseProxySecret(environment, nodeEnvironment),
    AUTH_PROXY_SECRET_PREVIOUS: parsePreviousProxySecret(environment),
  };

  // Cross-field rules run last, so every single-variable error keeps its precedence.
  validateAuthBaseUrl(validated.AUTH_BASE_URL, validated.TRUSTED_ORIGINS, nodeEnvironment);
  validateDistinctSecrets(
    validated.AUTH_PROXY_SECRET,
    validated.AUTH_PROXY_SECRET_PREVIOUS,
    validated.BETTER_AUTH_SECRET,
  );

  return validated;
}
