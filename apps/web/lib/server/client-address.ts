import { isIP } from "node:net";

import type { WebServerConfig } from "./config.ts";

/**
 * The guest's address as the web server forwards it to the API (M6 G3; S4). The API counts an open RSVP against
 * the invitation and the client address it reads from its configured client-IP header, so a server action has to
 * forward the browser's address: it comes from the incoming request's headers, never from the form, and only a
 * value that is one real address is forwarded. Anything else is dropped, and the API then falls back on the
 * address it sees for its own hop, which is the web server: every such guest shares one bucket instead of a
 * forged one.
 *
 * The rule is the one `auth-proxy.ts` applies to Better Auth's own rate limits, so the deployment configures one
 * pair of headers and both callers read the platform edge the same way. The address is used for nothing else:
 * no log, no page, and no stored value ever carries it.
 */
export interface ClientAddressConfig {
  /** Lower-case header the API reads the address from (`AUTH_CLIENT_IP_HEADER`). */
  readonly clientIpHeader: string;
  /** Lower-case header the platform edge overwrites with the client's own address. */
  readonly edgeClientIpHeader: string;
}

/** The single address the edge reported, or undefined when it is missing or malformed. */
function edgeAddress(
  headers: { get(name: string): string | null },
  config: ClientAddressConfig,
): string | undefined {
  const value = headers.get(config.edgeClientIpHeader)?.trim();

  return value !== undefined && value !== "" && isIP(value) !== 0 ? value : undefined;
}

/** The first hop of the API's own client-IP header, or undefined when that hop is not one address. */
function forwardedAddress(
  headers: { get(name: string): string | null },
  config: ClientAddressConfig,
): string | undefined {
  const first = headers.get(config.clientIpHeader)?.split(",")[0]?.trim();

  return first !== undefined && first !== "" && isIP(first) !== 0 ? first : undefined;
}

/**
 * The address to forward with the request, or undefined when the request carried none this server can trust.
 * `config` is the web server's own settings, so a caller can pass one pair of headers to every check.
 */
export function clientAddressFor(
  headers: { get(name: string): string | null },
  config: ClientAddressConfig | Pick<WebServerConfig, "clientIpHeader" | "edgeClientIpHeader">,
): string | undefined {
  return edgeAddress(headers, config) ?? forwardedAddress(headers, config);
}
