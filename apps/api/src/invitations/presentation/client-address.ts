import { UNKNOWN_CLIENT_ADDRESS } from "../application/rsvp-rate-limiter";

// The client address of a public request (M6 G1; S4). It is used for one purpose only: the per-address RSVP rate
// limit. The API is deployed behind the web proxy and never receives a guest's connection directly, so the
// configured client-IP header (the same `AUTH_CLIENT_IP_HEADER` Better Auth's rate limits read) is the source; the
// socket address is the fallback when the header is absent, and one shared bucket is the last resort. The address
// never leaves this value: the limiter hashes it before writing the `RateLimit` key, and nothing logs it.

/** The part of an HTTP request this resolver reads; the framework's request object satisfies it. */
export interface ClientAddressRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}

/**
 * The client address of a request: the first value of the configured header (a proxy appends its own hops after
 * the client's), else the socket address, else the shared `unknown` bucket. A header with only whitespace is no
 * address, so it falls through instead of becoming a bucket of its own.
 */
export function clientAddressOf(request: ClientAddressRequest, header: string): string {
  const raw = request.headers[header];
  const headerValue = Array.isArray(raw) ? raw[0] : raw;
  const first = headerValue?.split(",")[0]?.trim() ?? "";

  if (first !== "") {
    return first;
  }
  const socketAddress = request.socket?.remoteAddress?.trim() ?? "";
  return socketAddress === "" ? UNKNOWN_CLIENT_ADDRESS : socketAddress;
}
