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
  /** Public origin of the API that serves the Better Auth routes. */
  AUTH_BASE_URL: string;
  /** Email delivery transport and sender, from `EMAIL_TRANSPORT`, `EMAIL_FROM`, and adapter variables. */
  EMAIL: EmailEnvironment;
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

export function validateEnvironment(environment: Record<string, unknown>): RuntimeEnvironment {
  const nodeEnvironment = readOptionalString(environment.NODE_ENV) ?? NODE_ENVIRONMENT.DEVELOPMENT;

  if (!isNodeEnvironment(nodeEnvironment)) {
    throw new Error("NODE_ENV must be development, production, or test.");
  }

  rejectUnsupportedAuthOrigins(environment);

  return {
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
  };
}
