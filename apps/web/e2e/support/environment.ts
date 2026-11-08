/**
 * Settings of the browser end-to-end harness (M2 T9b; S38). The harness starts the real API and the
 * real web on dedicated ports against a disposable PostgreSQL and Mailpit that the runner names
 * explicitly, so a developer's running servers, database, and mail catcher are never used.
 *
 * Nothing here is read by production code: the harness passes every setting to the two servers as
 * environment variables, and the API's existing `mailpit` email provider delivers the codes.
 */

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Dedicated defaults, away from the development servers on 3000 and 3001. */
const DEFAULT_WEB_PORT = 3410;
const DEFAULT_API_PORT = 3411;
const DEFAULT_GATE_PORT = 3412;

/**
 * The header the test browser sends in place of a platform edge: the web in production mode only
 * reads the client IP from a header the edge overwrites (`lib/server/config.ts`).
 */
export const EDGE_CLIENT_IP_HEADER = "x-e2e-edge-client-ip";
/** The header the web forwards the client IP in, next to the proxy secret, and the API reads. */
export const CLIENT_IP_HEADER = "x-e2e-client-ip";

function readPort(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const port = Number(raw);

  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${name} must be an integer port between 1024 and 65535.`);
  }

  return port;
}

/**
 * An explicit URL of a local service. Fails closed: the suite writes users, sessions, and email,
 * so it never falls back to a default address or runs against a remote host.
 */
export function requireLocalUrl(name: "E2E_DATABASE_URL" | "E2E_MAILPIT_URL"): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`The browser tests require an explicit ${name} of a disposable local service.`);
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${name} must point to a local host.`);
  }

  return value;
}

export const WEB_PORT = readPort("E2E_WEB_PORT", DEFAULT_WEB_PORT);
export const API_PORT = readPort("E2E_API_PORT", DEFAULT_API_PORT);
/** The harness-only API gate between the web and the API (`api-gate.ts`). */
export const GATE_PORT = readPort("E2E_GATE_PORT", DEFAULT_GATE_PORT);

if (new Set([WEB_PORT, API_PORT, GATE_PORT]).size !== 3) {
  throw new Error("E2E_WEB_PORT, E2E_API_PORT, and E2E_GATE_PORT must differ.");
}

/**
 * The only origin the browser talks to; Better Auth's base URL and the API's trusted origin. It
 * names the IPv4 address the web binds to, not `localhost`, which may resolve to `::1` first
 * (R3-web-bound-ipv4-browser-uses-localhost).
 */
export const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
/** The API's internal origin, reached only through the gate. */
export const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
/** The web server's `API_ORIGIN`: the gate, which forwards every request to the API. */
export const GATE_ORIGIN = `http://127.0.0.1:${GATE_PORT}`;
