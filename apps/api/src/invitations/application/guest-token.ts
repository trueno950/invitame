import { createHash, randomBytes } from "node:crypto";

import { GUEST_TOKEN_LENGTH } from "../domain/invitation-guest";

// The personal guest token (M6 G2; S1, S4). Two operations, both here in the application layer because they need
// the platform's crypto module while the domain stays free of a runtime dependency (AGENTS.md, module-template.md):
//
// - minting: 16 bytes — 128 bits — from `crypto.randomBytes`, encoded as 22 base64url characters. The value is the
//   secret a guest's link carries; it is returned once, when the creator creates or rotates the guest, and never
//   stored.
// - hashing: the SHA-256 hex digest, which is what `Guest.tokenHash` holds behind its unique index. A database
//   reader therefore cannot replay a token, and the lookup is an index probe on the digest — never a string
//   comparison of secrets in application code — so there is no timing oracle to defend against.

/** How many random bytes one guest token carries: 128 bits, which is the width S4 asks for. */
export const GUEST_TOKEN_BYTES = 16;

/** The random source minting reads; injected so a test can observe the exact bytes and the exact width. */
export type RandomBytes = (size: number) => Buffer;

/**
 * Mints one personal guest token: 128 bits from the platform's cryptographic random source, base64url-encoded
 * without padding. The caller stores only `guestTokenHash` of it and answers the plain value once.
 */
export function mintGuestToken(random: RandomBytes = randomBytes): string {
  const token = random(GUEST_TOKEN_BYTES).toString("base64url");
  if (token.length !== GUEST_TOKEN_LENGTH) {
    // A random source that returned another width would make the format check lie about the entropy.
    throw new Error("the random source answered a token of an unexpected width");
  }
  return token;
}

/**
 * The stored form of a guest token: the lower-case SHA-256 hex digest. The same token always hashes to the same
 * 64 characters, which is what the unique index `Guest_tokenHash_key` reads.
 */
export function guestTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
