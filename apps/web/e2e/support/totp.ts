import { createHmac } from "node:crypto";

/**
 * TOTP codes for the browser tests (RFC 6238 over RFC 4226), computed from the setup key the test
 * reads on `/admin/activar` (S38, S41) the way an authenticator app does. The settings mirror the
 * API's `TWO_FACTOR_OPTIONS.totpOptions` (`apps/api/src/auth/administrator-enrollment.ts`): 6 digits
 * every 30 seconds, with Better Auth's HMAC-SHA-1. The API accepts the previous, current, and next
 * time step.
 */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding; spaces, as on the page, are ignored. */
export function decodeBase32(key: string): Buffer {
  let bits = "";
  for (const character of key.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase()) {
    const value = BASE32_ALPHABET.indexOf(character);
    if (value === -1) {
      throw new Error("The setup key is not base32.");
    }
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP: dynamic truncation of HMAC-SHA-1 over the 8-byte big-endian counter. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(message).digest();
  const offset = (mac.at(-1) ?? 0) & 0x0f;
  const value = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, "0");
}

function timeStep(atMs: number): number {
  return Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code an authenticator app shows for `setupKey` at `atMs`. */
export function totpCode(setupKey: string, atMs = Date.now()): string {
  return hotp(decodeBase32(setupKey), timeStep(atMs));
}

/** A 6-digit code that the API refuses now and in the next time step. */
export function wrongTotpCode(setupKey: string, atMs = Date.now()): string {
  const secret = decodeBase32(setupKey);
  const step = timeStep(atMs);
  const accepted = new Set([-1, 0, 1, 2].map((offset) => hotp(secret, step + offset)));
  for (let candidate = 0; ; candidate += 1) {
    const code = String(candidate).padStart(TOTP_DIGITS, "0");
    if (!accepted.has(code)) {
      return code;
    }
  }
}
