import { createHmac, timingSafeEqual } from "node:crypto";

// The simulated provider's webhook signature (M7 S4). This is the one scheme the repository implements itself
// today; a real provider adapter replaces it with the provider's documented scheme behind the same port. The shape
// is the one the industry uses: a unix timestamp and an HMAC-SHA256 hex digest over `<timestamp>.<raw body>`, sent
// in one header. The timestamp bounds replay: an event whose instant is more than five minutes away from the API's
// clock is refused before its body is read. The comparison is constant-time over equal-length digests
// (`crypto.timingSafeEqual`), so a caller cannot learn the expected signature from the response time. No value here
// is ever logged or echoed: a verification answer is a boolean.

/** The header that carries the simulated signature. A real adapter names its provider's own header. */
export const SIMULATED_SIGNATURE_HEADER = "x-invitame-signature";

/** How far from the API's clock a timestamp may be, in either direction, before the event is stale. */
export const SIMULATED_SIGNATURE_TOLERANCE_SECONDS = 300;

/** The digest length of HMAC-SHA256 in hex characters. */
const SHA256_HEX_LENGTH = 64;

/** A parsed signature header: the claimed instant and the claimed digest, both already shape-checked. */
interface ParsedSignature {
  timestamp: number;
  digest: Buffer;
}

/** The exact header text one simulated event carries, so the emit path and the tests sign one way. */
export function signSimulatedWebhook(input: {
  secret: string;
  rawBody: string;
  timestamp: number;
}): string {
  return `t=${input.timestamp},v1=${digestOf(input.secret, input.timestamp, input.rawBody)}`;
}

/**
 * Whether the header proves this exact body came from the holder of the secret, recently enough to act on. A
 * missing, duplicated, unknown, or malformed field answers false instead of throwing, so a bad request is an
 * ordinary refusal.
 */
export function verifySimulatedSignature(input: {
  secret: string;
  rawBody: string;
  header: unknown;
  now: Date;
}): boolean {
  const parsed = parseHeader(input.header);
  if (parsed === null) {
    return false;
  }

  const age = Math.abs(Math.floor(input.now.getTime() / 1000) - parsed.timestamp);
  if (age > SIMULATED_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = Buffer.from(digestOf(input.secret, parsed.timestamp, input.rawBody), "hex");
  // Both buffers are SHA256_HEX_LENGTH / 2 bytes by construction, so timingSafeEqual never throws here.
  return expected.length === parsed.digest.length && timingSafeEqual(expected, parsed.digest);
}

function digestOf(secret: string, timestamp: number, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

/**
 * Reads `t=<unix>,v1=<hex>`. Exactly one `t` and one `v1` are required, in either order, and any other key is
 * refused: a provider that adds a field tomorrow gets its own adapter rather than a lenient parser here.
 */
function parseHeader(header: unknown): ParsedSignature | null {
  if (typeof header !== "string" || header.length === 0) {
    return null;
  }

  let timestamp: number | null = null;
  let digest: Buffer | null = null;

  for (const entry of header.split(",")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      return null;
    }

    const key = entry.slice(0, separator);
    const value = entry.slice(separator + 1);

    if (key === "t" && timestamp === null) {
      if (!/^\d{1,12}$/.test(value)) {
        return null;
      }
      timestamp = Number(value);
      continue;
    }

    if (key === "v1" && digest === null) {
      if (value.length !== SHA256_HEX_LENGTH || !/^[0-9a-f]+$/.test(value)) {
        return null;
      }
      digest = Buffer.from(value, "hex");
      continue;
    }

    return null;
  }

  return timestamp === null || digest === null ? null : { timestamp, digest };
}
