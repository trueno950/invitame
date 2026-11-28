import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// The stored form of an invitation's shared access code (F13; S2.13, L18.1). Only Node's built-in `crypto.scrypt` is
// used — no dependency and no construction of this repository's own — with a random salt per password and a stated
// cost, so a database reader cannot replay a code and a leaked hash of one invitation says nothing about another.
//
// The encoded value is `scrypt$<N>$<r>$<p>$<salt>$<key>`, every number in decimal and both binary parts in base64url
// without padding. Stating the parameters inside the value is what lets the cost be raised later without a migration:
// verification reads the cost the stored hash was written with, and a new code is always written with the current one.
//
// The comparison is `crypto.timingSafeEqual` over the two derived keys, which always have the same length, so the
// comparison never depends on where two values differ and no byte of a stored hash is a timing oracle.

/** The scrypt cost this deployment writes for a new access code. */
export const INVITATION_PASSWORD_SCRYPT = {
  /** CPU/memory cost: 2^14, the interactive-login profile of RFC 7914 §2 (about 16 MB and a few tens of ms). */
  N: 16_384,
  /** Block size. */
  r: 8,
  /** Parallelization. */
  p: 1,
  /** The derived key width in bytes. */
  keyLength: 64,
  /** The upper bound scrypt may allocate; stated so a raised cost never meets Node's lower default silently. */
  maxMemory: 64 * 1024 * 1024,
} as const;

/** The random salt width of one access code: 128 bits, a fresh salt for every password. */
export const INVITATION_PASSWORD_SALT_BYTES = 16;

/** The first field of every encoded hash; a value without it is not a hash this deployment wrote. */
export const INVITATION_PASSWORD_HASH_PREFIX = "scrypt";

/**
 * The bounds a *stored* hash's parameters must satisfy before they are used (they are read from the database, so a row
 * written around the API must not be able to make this process allocate an unbounded amount of memory). A value outside
 * them is treated as no usable hash, and the invitation stays locked instead of opening.
 */
const ACCEPTED_N = { minimum: 2 ** 14, maximum: 2 ** 18 };
const ACCEPTED_R = { minimum: 1, maximum: 16 };
const ACCEPTED_P = { minimum: 1, maximum: 4 };
const ACCEPTED_KEY_LENGTH = { minimum: 32, maximum: 64 };

/** The random source minting reads; injected so a test can observe the salt width. */
export type PasswordRandomBytes = (size: number) => Buffer;

/**
 * One dummy hash an unlock attempt verifies against when there is nothing to verify — an unknown address, a visible
 * invitation that has no code, or a value that is not a string. It is a real encoded hash of a value nobody uses, so the
 * attempt costs the same scrypt work as a real one and the response time never says whether an invitation exists or is
 * protected.
 */
export const INVITATION_PASSWORD_DUMMY_HASH =
  "scrypt$16384$8$1$fhvpO4IJnrIoY-6-HWsSdA$o4DrN6obOV8AotY_CiY8YJj9GTYn3yo4GlykbilFQo1kqaujjoq4TXjcdilS63VzT9tZ6_2bgLZTWgTmEMF9VA";

/** The four parameters one encoded hash states. */
interface ScryptParameters {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLength: number;
}

/** Derives one key with the platform's scrypt, as a promise. */
function deriveKey(password: string, salt: Buffer, parameters: ScryptParameters): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      parameters.keyLength,
      {
        N: parameters.N,
        r: parameters.r,
        p: parameters.p,
        maxmem: INVITATION_PASSWORD_SCRYPT.maxMemory,
      },
      (error, derived) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derived);
      },
    );
  });
}

/** A decimal integer of the encoded value, or null when the field is not one (no sign, no fraction, no padding). */
function readPositiveInteger(value: string): number | null {
  return /^[1-9][0-9]{0,8}$/u.test(value) ? Number(value) : null;
}

/** A binary field of the encoded value, or null when the text is not base64url. */
function readBinary(value: string): Buffer | null {
  return /^[A-Za-z0-9_-]+$/u.test(value) ? Buffer.from(value, "base64url") : null;
}

/**
 * The parameters and parts of a stored hash, or null when the value is not one this deployment can verify: a different
 * scheme, a missing field, a number outside the accepted bounds, or a binary part of the wrong width. A null answer is
 * "no usable hash", which locks the invitation (fail closed) instead of opening it.
 */
function parseStoredHash(
  stored: string,
): { parameters: ScryptParameters; salt: Buffer; key: Buffer } | null {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== INVITATION_PASSWORD_HASH_PREFIX) {
    return null;
  }
  const [N, r, p] = [
    readPositiveInteger(parts[1] ?? ""),
    readPositiveInteger(parts[2] ?? ""),
    readPositiveInteger(parts[3] ?? ""),
  ];
  const salt = readBinary(parts[4] ?? "");
  const key = readBinary(parts[5] ?? "");

  if (N === null || r === null || p === null || salt === null || key === null) {
    return null;
  }
  if (
    N < ACCEPTED_N.minimum ||
    N > ACCEPTED_N.maximum ||
    (N & (N - 1)) !== 0 ||
    r < ACCEPTED_R.minimum ||
    r > ACCEPTED_R.maximum ||
    p < ACCEPTED_P.minimum ||
    p > ACCEPTED_P.maximum ||
    key.length < ACCEPTED_KEY_LENGTH.minimum ||
    key.length > ACCEPTED_KEY_LENGTH.maximum ||
    salt.length < INVITATION_PASSWORD_SALT_BYTES
  ) {
    return null;
  }

  return { parameters: { N, r, p, keyLength: key.length }, salt, key };
}

/**
 * Hashes one already validated access code (L18.1): the encoded scrypt value with a fresh random salt and the current
 * cost. The plain value is used here and nowhere else — it is not stored, returned, or logged by this function or its
 * caller — and the same code hashed twice answers two different values.
 */
export async function hashInvitationPassword(
  password: string,
  random: PasswordRandomBytes = randomBytes,
): Promise<string> {
  const salt = random(INVITATION_PASSWORD_SALT_BYTES);
  const key = await deriveKey(password, salt, INVITATION_PASSWORD_SCRYPT);

  return [
    INVITATION_PASSWORD_HASH_PREFIX,
    INVITATION_PASSWORD_SCRYPT.N,
    INVITATION_PASSWORD_SCRYPT.r,
    INVITATION_PASSWORD_SCRYPT.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * Whether one presented access code opens the invitation whose stored hash this is (L18.1, L18.4). It answers false for
 * every case that must not open it: an invitation with no code, a stored value this deployment cannot read, and any
 * value that does not derive the stored key. The comparison is constant-time over the derived keys, and a code that is
 * not a string is verified as the empty string so the work — and the timing — does not depend on the input.
 */
export async function verifyInvitationPassword(
  storedHash: string | null,
  presented: unknown,
): Promise<boolean> {
  if (storedHash === null) {
    return false;
  }
  const parsed = parseStoredHash(storedHash);

  if (parsed === null) {
    return false;
  }
  const password = typeof presented === "string" ? presented.trim() : "";
  const derived = await deriveKey(password, parsed.salt, parsed.parameters);

  return derived.length === parsed.key.length && timingSafeEqual(derived, parsed.key);
}

/**
 * Spends the same work as `verifyInvitationPassword` without a usable hash, so an attempt that has nothing to verify
 * answers in the same time as one that had (L18.3). The presented value is still consumed, so the two paths cannot be
 * told apart by their cost.
 */
export async function spendInvitationPasswordVerification(presented: unknown): Promise<false> {
  await verifyInvitationPassword(INVITATION_PASSWORD_DUMMY_HASH, presented);

  return false;
}
