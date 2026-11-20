import { isIP } from "node:net";
import { join, resolve } from "node:path";

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

/**
 * The payment modes (M7 S1, S4; Mercado Pago T1). `free` is the Milestone 5 behavior: publication needs no payment.
 * `simulated` is the development and test provider that signs its own webhook events so the whole intake is exercised
 * without a provider account. `mercadopago` is the real provider: Checkout Pro for the money and a signed notification
 * the API re-reads from Mercado Pago before it trusts it. The owner chose it, so it is the only real mode here.
 */
export const PAYMENTS_MODE = {
  FREE: "free",
  SIMULATED: "simulated",
  MERCADOPAGO: "mercadopago",
} as const;

export type PaymentsMode = (typeof PAYMENTS_MODE)[keyof typeof PAYMENTS_MODE];

/**
 * The payments settings of one deployment (M7 S4; Mercado Pago T1). Each variant carries only what its adapter
 * needs: `free` needs nothing, `simulated` needs the secret that signs its events and the web origin its redirect
 * points at, and `mercadopago` needs the server-only access token, the webhook signature secret, the public origin
 * the provider calls back to, and the provider API origin. In `free` mode none of those variables is read, so an
 * unused variable can never break a deployment that does not charge.
 */
export type PaymentsEnvironment =
  | { mode: typeof PAYMENTS_MODE.FREE }
  | {
      mode: typeof PAYMENTS_MODE.SIMULATED;
      /** HMAC key of the simulated adapter; never logged, echoed, or returned. */
      secret: string;
      /** The web origin the simulated provider redirects to; the return page lives under it. */
      returnBaseUrl: string;
    }
  | {
      mode: typeof PAYMENTS_MODE.MERCADOPAGO;
      /** Mercado Pago API credential; server-only, and never logged, echoed, or returned. */
      accessToken: string;
      /** The signature secret of the Mercado Pago panel; never logged, echoed, or returned. */
      webhookSecret: string;
      /** The public API origin Mercado Pago calls back to, from `PAYMENTS_WEBHOOK_BASE_URL`. */
      webhookBaseUrl: string;
      /** The Mercado Pago API origin, from `MERCADOPAGO_API_BASE_URL`. */
      apiBaseUrl: string;
      /** The web origin Checkout Pro returns the browser to, from `PAYMENTS_RETURN_BASE_URL`. */
      returnBaseUrl: string;
    };

/** How the API resolves a client IP for rate limiting, from the request header a trusted proxy sets. */
export interface ClientIpEnvironment {
  /** Lower-case header name, from `AUTH_CLIENT_IP_HEADER`. */
  header: string;
  /** IP addresses or CIDR ranges of proxies whose hops are stripped, from `AUTH_TRUSTED_PROXIES`. */
  trustedProxies: readonly string[];
}

/**
 * Whether the API may call a music provider's public oEmbed endpoint when an owner saves a playlist link (S2).
 * `off` stores the link with no metadata, exactly like a provider that could not answer, and is what the test
 * environment defaults to, so no suite and no CI job reaches the network.
 */
export const MUSIC_METADATA_LOOKUP = {
  ON: "on",
  OFF: "off",
} as const;

export type MusicMetadataLookup =
  (typeof MUSIC_METADATA_LOOKUP)[keyof typeof MUSIC_METADATA_LOOKUP];

/** The music settings of one deployment: only whether the lookup may run (S2). */
export interface MusicEnvironment {
  lookup: MusicMetadataLookup;
}

/**
 * Which geocoder the owner's address fields may ask while they type (S2): `photon` is the OpenStreetMap search
 * service, and `off` is a deployment that offers no suggestion at all. The test environment defaults to `off`, so no
 * suite and no CI job reaches the network.
 */
export const PLACE_SEARCH_PROVIDER = {
  PHOTON: "photon",
  OFF: "off",
} as const;

export type PlaceSearchProvider =
  (typeof PLACE_SEARCH_PROVIDER)[keyof typeof PLACE_SEARCH_PROVIDER];

/**
 * The place-search settings of one deployment (S2, S3): the provider, and the instance to ask. The URL is the seam
 * that lets a self-hosted Photon replace the public instance by configuration, with no code change.
 */
export interface PlaceSearchEnvironment {
  provider: PlaceSearchProvider;
  /** The Photon base URL the adapter appends its query to; https in a real deployment, http for a local instance. */
  photonUrl: string;
}

/** The storage adapter that serves invitation media (M8 S4). */
export const MEDIA_STORAGE_DRIVER = {
  LOCAL: "local",
  S3: "s3",
} as const;

export type MediaStorageDriver = (typeof MEDIA_STORAGE_DRIVER)[keyof typeof MEDIA_STORAGE_DRIVER];

/**
 * The settings of the S3-compatible storage adapter (M8 S4). `endpoint` makes the same adapter work with
 * Cloudflare R2, AWS S3, or MinIO. The credential is carried here and never logged, echoed, or returned.
 */
export interface MediaS3Environment {
  endpoint: string;
  region: string;
  bucket: string;
  /** Access key id; never logged or echoed in error messages. */
  accessKeyId: string;
  /** Secret access key; never logged or echoed in error messages. */
  secretAccessKey: string;
  /** Whether the endpoint needs path-style addressing (MinIO does; R2 and AWS S3 do not). */
  forcePathStyle: boolean;
}

/**
 * Where invitation media lives and the absolute origin its public URLs are built from (M8 S4). Each variant
 * carries only the settings its adapter needs, so an unused variable is read only when it is in use.
 */
export type MediaEnvironment =
  | {
      driver: typeof MEDIA_STORAGE_DRIVER.LOCAL;
      /** Absolute directory the local adapter writes under; development and test only. */
      directory: string;
      /** The API's public origin, used to build absolute `/media/<id>` URLs. Never the provider's URL. */
      publicBaseUrl: string;
    }
  | {
      driver: typeof MEDIA_STORAGE_DRIVER.S3;
      publicBaseUrl: string;
      s3: MediaS3Environment;
    };

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
  /** Invitation media storage and the public origin its URLs are built from (M8 S4). */
  MEDIA: MediaEnvironment;
  /** Whether a saved playlist link may ask its provider for a title and a cover (S2). */
  MUSIC: MusicEnvironment;
  /** Which geocoder the owner's address fields may ask, and which instance (S2). */
  PLACE_SEARCH: PlaceSearchEnvironment;
  /** Payment mode and, when it charges, the provider settings of that mode (M7 S1, S4). */
  PAYMENTS: PaymentsEnvironment;
}

const DEFAULT_PORT = 3001;
/**
 * The development origin of the API itself: media URLs are absolute and point at this API, never at the storage
 * provider (M8 S4). Production must name its own origin, so a wrong default can never leak into a deployment.
 */
const DEFAULT_MEDIA_PUBLIC_BASE_URL = "http://localhost:3001";
/** A gitignored directory inside `apps/api`, so local uploads never reach the repository. */
const DEFAULT_LOCAL_MEDIA_DIRECTORY = join(__dirname, "..", "..", ".local-media");
/** S3 bucket names: lower-case letters, digits, dots, and hyphens, 3 to 63 characters. */
const S3_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
/** An S3 region name, such as `auto` (R2) or `us-east-1`. */
const S3_REGION_PATTERN = /^[a-z0-9-]+$/;
const BOOLEAN_VALUES: Readonly<Record<string, boolean>> = { true: true, false: false };
/** A lookup is on wherever a real invitation is edited, and off in tests, so CI never reaches the network (S2). */
const DEFAULT_MUSIC_METADATA_LOOKUP: Record<NodeEnvironment, MusicMetadataLookup> = {
  development: MUSIC_METADATA_LOOKUP.ON,
  test: MUSIC_METADATA_LOOKUP.OFF,
  production: MUSIC_METADATA_LOOKUP.ON,
};
/** Place search is on wherever a real invitation is edited, and off in tests, so CI never reaches a geocoder (S2). */
const DEFAULT_PLACE_SEARCH_PROVIDER: Record<NodeEnvironment, PlaceSearchProvider> = {
  development: PLACE_SEARCH_PROVIDER.PHOTON,
  test: PLACE_SEARCH_PROVIDER.OFF,
  production: PLACE_SEARCH_PROVIDER.PHOTON,
};
/** The public Photon instance: keyless, OpenStreetMap-backed, and replaceable through `PLACE_SEARCH_PHOTON_URL`. */
const DEFAULT_PLACE_SEARCH_PHOTON_URL = "https://photon.komoot.io/api/";
const DEFAULT_EMAIL_TRANSPORT: Record<NodeEnvironment, EmailTransport> = {
  development: EMAIL_TRANSPORT.MAILPIT,
  test: EMAIL_TRANSPORT.MEMORY,
  production: EMAIL_TRANSPORT.RESEND,
};
/** Reserved `.localhost` domain: this sender can never reach a real mailbox. */
const LOCAL_EMAIL_FROM = "InvitaMe Local <no-reply@invitame.localhost>";
const DEFAULT_MAILPIT_URL = "http://localhost:8025";
/**
 * The development web origin the simulated provider redirects to: the web app's own port, so a local checkout
 * needs no new variable. Any other origin names the URL explicitly.
 */
const DEFAULT_PAYMENTS_RETURN_BASE_URL = "http://localhost:3000";
/**
 * The public Mercado Pago API; `MERCADOPAGO_API_BASE_URL` is the seam a spec or a sandbox proxy uses instead, with
 * no code change.
 */
const DEFAULT_MERCADOPAGO_API_BASE_URL = "https://api.mercadopago.com";
/** The same floor as the other secrets in this file: shorter is refused, never echoed. */
const MINIMUM_PAYMENTS_SECRET_LENGTH = 32;
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
 * Whether Better Auth sees a variable it reads by itself as set. It reads the raw value, so only
 * `undefined` and the empty string are absent; unlike `readOptionalString`, this does not trim, so a
 * whitespace-only value counts as set and the validator never disagrees with the library.
 */
function isSetForLibrary(value: unknown): boolean {
  return value !== undefined && value !== "";
}

/**
 * Better Auth silently appends this variable to its trusted origins. Reject it so the CORS list stays
 * the single source of trusted origins.
 */
function rejectUnsupportedAuthOrigins(environment: Record<string, unknown>): void {
  if (isSetForLibrary(environment.BETTER_AUTH_TRUSTED_ORIGINS)) {
    throw new Error(
      "BETTER_AUTH_TRUSTED_ORIGINS is not supported; list trusted origins in CORS_ORIGIN.",
    );
  }
}

/**
 * Better Auth 1.7.16 (`context/create-context.mjs`) reads `BETTER_AUTH_SECRETS` on its own and lets it
 * replace the secret the API passes, which would skip the length and distinctness rules of
 * `BETTER_AUTH_SECRET` (S55, L79). Refuse any value; the message never echoes it.
 */
function rejectUnsupportedAuthSecrets(environment: Record<string, unknown>): void {
  if (isSetForLibrary(environment.BETTER_AUTH_SECRETS)) {
    throw new Error("BETTER_AUTH_SECRETS is not supported; set BETTER_AUTH_SECRET.");
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

function isPaymentsMode(value: string): value is PaymentsMode {
  return Object.values(PAYMENTS_MODE).some((mode) => mode === value);
}

/**
 * Payments (M7 S1, S4; Mercado Pago T1). Production must name its mode explicitly — there is no silent default
 * there, because that default would decide whether money is charged — and `simulated` is refused there: its adapter
 * can mint a valid signature from a configuration value, so a deployment that used it could grant publication to an
 * event the API itself produced. `mercadopago` is allowed in production, because it is the real provider, and it
 * fails closed without its own credentials. Development and test default to `free`, which is today's behavior and
 * needs neither the migration nor a secret, so the running development server stays healthy with no new variable.
 * Every message names a variable and never echoes its value, because some of them are secrets.
 */
function parsePaymentsEnvironment(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): PaymentsEnvironment {
  const configured = readOptionalString(environment.PAYMENTS_MODE);

  if (configured === undefined) {
    if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION) {
      throw new Error("PAYMENTS_MODE must be provided in production.");
    }

    return { mode: PAYMENTS_MODE.FREE };
  }

  if (!isPaymentsMode(configured)) {
    throw new Error("PAYMENTS_MODE must be free, simulated, or mercadopago.");
  }

  if (configured === PAYMENTS_MODE.FREE) {
    return { mode: PAYMENTS_MODE.FREE };
  }

  if (configured === PAYMENTS_MODE.MERCADOPAGO) {
    return parseMercadoPagoEnvironment(environment, nodeEnvironment);
  }

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION) {
    throw new Error("PAYMENTS_MODE must not be simulated in production.");
  }

  const secret = readOptionalString(environment.PAYMENTS_SIMULATED_SECRET);
  if (!secret) {
    throw new Error("PAYMENTS_SIMULATED_SECRET must be provided when PAYMENTS_MODE is simulated.");
  }
  if (secret.length < MINIMUM_PAYMENTS_SECRET_LENGTH) {
    throw new Error(
      `PAYMENTS_SIMULATED_SECRET must be at least ${MINIMUM_PAYMENTS_SECRET_LENGTH} characters long.`,
    );
  }

  return {
    mode: PAYMENTS_MODE.SIMULATED,
    secret,
    returnBaseUrl: validateHttpOrigin(
      "PAYMENTS_RETURN_BASE_URL",
      readOptionalString(environment.PAYMENTS_RETURN_BASE_URL) ?? DEFAULT_PAYMENTS_RETURN_BASE_URL,
    ),
  };
}

/**
 * The Mercado Pago settings (T1, S1, S2, S4). Production allows this mode, because it is the real provider, and it
 * fails closed until both credentials and the public webhook origin are configured: the access token is what the
 * provider charges and refunds with, the webhook secret is what proves a notification came from the provider, and
 * the origin is what the notification is sent back to. Every origin it reads must be https in production, because
 * the notification carries the payment facts, the access token travels to the API origin, and the browser is returned
 * to the web. Every message names a variable and never echoes its value, because two of them are secrets.
 */
function parseMercadoPagoEnvironment(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): PaymentsEnvironment {
  const accessToken = readOptionalString(environment.MERCADOPAGO_ACCESS_TOKEN);
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN must be provided when PAYMENTS_MODE is mercadopago.");
  }

  const webhookSecret = readOptionalString(environment.MERCADOPAGO_WEBHOOK_SECRET);
  if (!webhookSecret) {
    throw new Error(
      "MERCADOPAGO_WEBHOOK_SECRET must be provided when PAYMENTS_MODE is mercadopago.",
    );
  }

  const configuredWebhookBaseUrl = readOptionalString(environment.PAYMENTS_WEBHOOK_BASE_URL);
  if (!configuredWebhookBaseUrl) {
    throw new Error(
      "PAYMENTS_WEBHOOK_BASE_URL must be provided when PAYMENTS_MODE is mercadopago.",
    );
  }

  const webhookBaseUrl = validateHttpOrigin("PAYMENTS_WEBHOOK_BASE_URL", configuredWebhookBaseUrl);
  const apiBaseUrl = validateHttpOrigin(
    "MERCADOPAGO_API_BASE_URL",
    readOptionalString(environment.MERCADOPAGO_API_BASE_URL) ?? DEFAULT_MERCADOPAGO_API_BASE_URL,
  );

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION && !usesHttps(webhookBaseUrl)) {
    throw new Error("PAYMENTS_WEBHOOK_BASE_URL must use HTTPS in production.");
  }

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION && !usesHttps(apiBaseUrl)) {
    throw new Error("MERCADOPAGO_API_BASE_URL must use HTTPS in production.");
  }

  const returnBaseUrl = validateHttpOrigin(
    "PAYMENTS_RETURN_BASE_URL",
    readOptionalString(environment.PAYMENTS_RETURN_BASE_URL) ?? DEFAULT_PAYMENTS_RETURN_BASE_URL,
  );

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION && !usesHttps(returnBaseUrl)) {
    throw new Error("PAYMENTS_RETURN_BASE_URL must use HTTPS in production.");
  }

  return {
    mode: PAYMENTS_MODE.MERCADOPAGO,
    accessToken,
    webhookSecret,
    webhookBaseUrl,
    apiBaseUrl,
    returnBaseUrl,
  };
}

/**
 * No payments secret may also sign sessions or proxy requests (M7 S4, L36). The Mercado Pago variant adds one rule
 * of its own: its two secrets must differ, so a leaked access token is not also the webhook signature secret.
 */
function validateDistinctPaymentsSecret(
  payments: PaymentsEnvironment,
  environment: {
    BETTER_AUTH_SECRET: string;
    AUTH_PROXY_SECRET: string | undefined;
    AUTH_PROXY_SECRET_PREVIOUS: string | undefined;
  },
): void {
  const secrets: ReadonlyArray<readonly [string, string]> =
    payments.mode === PAYMENTS_MODE.SIMULATED
      ? [["PAYMENTS_SIMULATED_SECRET", payments.secret]]
      : payments.mode === PAYMENTS_MODE.MERCADOPAGO
        ? [
            ["MERCADOPAGO_ACCESS_TOKEN", payments.accessToken],
            ["MERCADOPAGO_WEBHOOK_SECRET", payments.webhookSecret],
          ]
        : [];

  if (payments.mode === PAYMENTS_MODE.MERCADOPAGO) {
    if (payments.webhookSecret === payments.accessToken) {
      throw new Error("MERCADOPAGO_WEBHOOK_SECRET must differ from MERCADOPAGO_ACCESS_TOKEN.");
    }
  }

  for (const [name, value] of secrets) {
    const collision = (
      [
        ["BETTER_AUTH_SECRET", environment.BETTER_AUTH_SECRET],
        ["AUTH_PROXY_SECRET", environment.AUTH_PROXY_SECRET],
        ["AUTH_PROXY_SECRET_PREVIOUS", environment.AUTH_PROXY_SECRET_PREVIOUS],
      ] as const
    ).find(([, candidate]) => candidate === value);

    if (collision) {
      throw new Error(`${name} must differ from ${collision[0]}.`);
    }
  }
}

function isMediaStorageDriver(value: string): value is MediaStorageDriver {
  return Object.values(MEDIA_STORAGE_DRIVER).some((driver) => driver === value);
}

/**
 * Invitation media storage (M8 S4). The local driver is development and test only and is refused in production,
 * because an ephemeral filesystem would lose the photos; production therefore defaults to the S3-compatible
 * adapter and fails closed until its bucket is configured. Development and test need no new variable at all.
 * Every message names a variable and never echoes its value, because two of them are credentials.
 */
function parseMediaEnvironment(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): MediaEnvironment {
  const publicBaseUrl = validateHttpOrigin(
    "MEDIA_PUBLIC_BASE_URL",
    readOptionalString(environment.MEDIA_PUBLIC_BASE_URL) ?? DEFAULT_MEDIA_PUBLIC_BASE_URL,
  );

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION && !usesHttps(publicBaseUrl)) {
    throw new Error("MEDIA_PUBLIC_BASE_URL must use HTTPS in production.");
  }

  const driver =
    readOptionalString(environment.MEDIA_STORAGE_DRIVER) ??
    (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION
      ? MEDIA_STORAGE_DRIVER.S3
      : MEDIA_STORAGE_DRIVER.LOCAL);

  if (!isMediaStorageDriver(driver)) {
    throw new Error("MEDIA_STORAGE_DRIVER must be local or s3.");
  }

  if (driver === MEDIA_STORAGE_DRIVER.LOCAL) {
    if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION) {
      throw new Error("MEDIA_STORAGE_DRIVER must be s3 in production.");
    }

    return {
      driver,
      directory: resolve(
        readOptionalString(environment.MEDIA_LOCAL_DIRECTORY) ?? DEFAULT_LOCAL_MEDIA_DIRECTORY,
      ),
      publicBaseUrl,
    };
  }

  const endpoint = validateHttpOrigin(
    "MEDIA_S3_ENDPOINT",
    readRequiredString(environment, "MEDIA_S3_ENDPOINT"),
  );

  if (nodeEnvironment === NODE_ENVIRONMENT.PRODUCTION && !usesHttps(endpoint)) {
    throw new Error("MEDIA_S3_ENDPOINT must use HTTPS in production.");
  }

  const region = readRequiredString(environment, "MEDIA_S3_REGION");
  if (!S3_REGION_PATTERN.test(region)) {
    throw new Error("MEDIA_S3_REGION must be a region name such as us-east-1 or auto.");
  }

  const bucket = readRequiredString(environment, "MEDIA_S3_BUCKET");
  if (!S3_BUCKET_PATTERN.test(bucket)) {
    throw new Error("MEDIA_S3_BUCKET must be a valid bucket name.");
  }

  const accessKeyId = readRequiredString(environment, "MEDIA_S3_ACCESS_KEY_ID");
  const secretAccessKey = readRequiredString(environment, "MEDIA_S3_SECRET_ACCESS_KEY");
  const forcePathStyleValue = readOptionalString(environment.MEDIA_S3_FORCE_PATH_STYLE) ?? "false";
  const forcePathStyle = BOOLEAN_VALUES[forcePathStyleValue];

  if (forcePathStyle === undefined) {
    throw new Error("MEDIA_S3_FORCE_PATH_STYLE must be true or false.");
  }

  return {
    driver,
    publicBaseUrl,
    s3: { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle },
  };
}

/**
 * The media settings alone, for a command that needs storage but no web or auth configuration (`media:cleanup`).
 * `NODE_ENV` is still required, because it decides whether the local driver is allowed at all.
 */
export function validateMediaEnvironment(environment: Record<string, unknown>): MediaEnvironment {
  const nodeEnvironment = readOptionalString(environment.NODE_ENV);

  if (nodeEnvironment === undefined || !isNodeEnvironment(nodeEnvironment)) {
    throw new Error("NODE_ENV must be development, production, or test.");
  }

  return parseMediaEnvironment(environment, nodeEnvironment);
}

function isMusicMetadataLookup(value: string): value is MusicMetadataLookup {
  return Object.values(MUSIC_METADATA_LOOKUP).some((lookup) => lookup === value);
}

/**
 * The music settings (S2): `MUSIC_METADATA_LOOKUP` is `on` or `off` and defaults to `on` in development and
 * production and to `off` in tests. A value outside the two is refused at startup, and the message never echoes it.
 */
function parseMusicEnvironment(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): MusicEnvironment {
  const configured =
    readOptionalString(environment.MUSIC_METADATA_LOOKUP) ??
    DEFAULT_MUSIC_METADATA_LOOKUP[nodeEnvironment];

  if (!isMusicMetadataLookup(configured)) {
    throw new Error("MUSIC_METADATA_LOOKUP must be on or off.");
  }

  return { lookup: configured };
}

function isPlaceSearchProvider(value: string): value is PlaceSearchProvider {
  return Object.values(PLACE_SEARCH_PROVIDER).some((provider) => provider === value);
}

function invalidPhotonUrl(): Error {
  return new Error(
    "PLACE_SEARCH_PHOTON_URL must be an http or https URL without credentials, query, or fragment.",
  );
}

/**
 * A URL the adapter may append its query to: http or https, with no credentials, query, or fragment of its own. A
 * path is allowed, because Photon serves `/api/`; the message never echoes the value.
 */
function validatePhotonUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw invalidPhotonUrl();
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw invalidPhotonUrl();
  }

  return value;
}

/**
 * The place-search settings (S2): `PLACE_SEARCH_PROVIDER` is `photon` or `off` and defaults to `photon` in development
 * and production and to `off` in tests, so no suite reaches a geocoder. A value outside the two is refused at startup,
 * and neither message echoes the value.
 */
function parsePlaceSearchEnvironment(
  environment: Record<string, unknown>,
  nodeEnvironment: NodeEnvironment,
): PlaceSearchEnvironment {
  const configured =
    readOptionalString(environment.PLACE_SEARCH_PROVIDER) ??
    DEFAULT_PLACE_SEARCH_PROVIDER[nodeEnvironment];

  if (!isPlaceSearchProvider(configured)) {
    throw new Error("PLACE_SEARCH_PROVIDER must be photon or off.");
  }

  const photonUrl = validatePhotonUrl(
    readOptionalString(environment.PLACE_SEARCH_PHOTON_URL) ?? DEFAULT_PLACE_SEARCH_PHOTON_URL,
  );

  return { provider: configured, photonUrl };
}

export function validateEnvironment(environment: Record<string, unknown>): RuntimeEnvironment {
  // No default (S56, L79): with `NODE_ENV` unset, every production rule would be off. A missing value
  // fails the startup, like an invalid one, and neither message echoes the value.
  const nodeEnvironment = readOptionalString(environment.NODE_ENV);

  if (nodeEnvironment === undefined) {
    throw new Error("NODE_ENV must be provided as development, production, or test.");
  }

  if (!isNodeEnvironment(nodeEnvironment)) {
    throw new Error("NODE_ENV must be development, production, or test.");
  }

  rejectUnsupportedAuthOrigins(environment);
  rejectUnsupportedAuthSecrets(environment);

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
    MEDIA: parseMediaEnvironment(environment, nodeEnvironment),
    MUSIC: parseMusicEnvironment(environment, nodeEnvironment),
    PLACE_SEARCH: parsePlaceSearchEnvironment(environment, nodeEnvironment),
    PAYMENTS: parsePaymentsEnvironment(environment, nodeEnvironment),
  };

  // Cross-field rules run last, so every single-variable error keeps its precedence.
  validateAuthBaseUrl(validated.AUTH_BASE_URL, validated.TRUSTED_ORIGINS, nodeEnvironment);
  validateDistinctSecrets(
    validated.AUTH_PROXY_SECRET,
    validated.AUTH_PROXY_SECRET_PREVIOUS,
    validated.BETTER_AUTH_SECRET,
  );
  validateDistinctPaymentsSecret(validated.PAYMENTS, validated);

  return validated;
}
