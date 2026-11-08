import { randomInt } from "node:crypto";

/** S20 (L30): the initial administrator password has 24 characters. */
export const INITIAL_PASSWORD_LENGTH = 24;

/**
 * S20 (L30): an initial password stops working this many hours after its issue unless an
 * authenticator app is enrolled. The auth module enforces the window
 * (`ADMINISTRATOR_ENROLLMENT_WINDOW_SECONDS`); a test pins that both values agree.
 */
export const INITIAL_PASSWORD_WINDOW_HOURS = 24;

/** The line that `admin:create` and `admin:reset-second-factor` print above the initial password. */
export const INITIAL_PASSWORD_NOTICE = `Initial password, shown only now; it stops working ${INITIAL_PASSWORD_WINDOW_HOURS} hours from now unless an authenticator app is enrolled:`;

/**
 * Letters and digits without look-alikes (`0 O o 1 l I`), so the operator can read the password
 * aloud or type it from a screen. 56 symbols: 24 characters carry about 139 bits.
 */
export const INITIAL_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** What both commands that issue an initial password need, besides their own store and log. */
export interface InitialPasswordDependencies {
  /** Better Auth's own password hasher, so its password sign-in verifies the result. */
  hashPassword: (password: string) => Promise<string>;
  generatePassword?: () => string;
  now?: () => Date;
}

/** A new initial password from Node's CSPRNG; `randomInt` picks each symbol without modulo bias. */
export function generateInitialPassword(): string {
  let password = "";
  for (let index = 0; index < INITIAL_PASSWORD_LENGTH; index += 1) {
    password += INITIAL_PASSWORD_ALPHABET[randomInt(INITIAL_PASSWORD_ALPHABET.length)];
  }
  return password;
}
