import { randomInt } from "node:crypto";

/** S20 (L30): the initial administrator password has 24 characters. */
export const INITIAL_PASSWORD_LENGTH = 24;

/**
 * Letters and digits without look-alikes (`0 O o 1 l I`), so the operator can read the password
 * aloud or type it from a screen. 56 symbols: 24 characters carry about 139 bits.
 */
export const INITIAL_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** A new initial password from Node's CSPRNG; `randomInt` picks each symbol without modulo bias. */
export function generateInitialPassword(): string {
  let password = "";
  for (let index = 0; index < INITIAL_PASSWORD_LENGTH; index += 1) {
    password += INITIAL_PASSWORD_ALPHABET[randomInt(INITIAL_PASSWORD_ALPHABET.length)];
  }
  return password;
}
