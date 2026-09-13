export const NODE_ENVIRONMENT = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
  TEST: "test",
} as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENT)[keyof typeof NODE_ENVIRONMENT];

export interface RuntimeEnvironment {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
}

const DEFAULT_PORT = 3001;
const DATABASE_PROTOCOLS = ["postgresql:", "postgres:"] as const;

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

function validateCorsOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("CORS_ORIGIN must be a valid HTTP origin.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("CORS_ORIGIN must use HTTP or HTTPS.");
  }

  if (url.origin !== value.replace(/\/$/, "")) {
    throw new Error("CORS_ORIGIN must not include a path, query, or fragment.");
  }

  return url.origin;
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

export function validateEnvironment(environment: Record<string, unknown>): RuntimeEnvironment {
  const nodeEnvironment = readOptionalString(environment.NODE_ENV) ?? NODE_ENVIRONMENT.DEVELOPMENT;

  if (!isNodeEnvironment(nodeEnvironment)) {
    throw new Error("NODE_ENV must be development, production, or test.");
  }

  return {
    NODE_ENV: nodeEnvironment,
    PORT: parsePort(environment.PORT),
    CORS_ORIGIN: validateCorsOrigin(readRequiredString(environment, "CORS_ORIGIN")),
    DATABASE_URL: validateDatabaseUrl(readRequiredString(environment, "DATABASE_URL")),
  };
}
