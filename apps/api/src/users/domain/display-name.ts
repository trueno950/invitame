/** `User.displayName` is `VarChar(120)`; PostgreSQL counts characters, that is, Unicode code points. */
export const DISPLAY_NAME_MAX_LENGTH = 120;

// Control characters (C0, DEL, C1) and unpaired surrogates, which PostgreSQL cannot store as UTF-8.
const FORBIDDEN_CHARACTER = /[\p{Cc}\p{Cs}]/u;

/**
 * Returns the trimmed display name when it is valid, or null when it is not: after trimming it has 1
 * to 120 code points and no control character or unpaired surrogate.
 */
export function parseDisplayName(value: string): string | null {
  const trimmed = value.trim();
  const length = [...trimmed].length;

  if (length < 1 || length > DISPLAY_NAME_MAX_LENGTH || FORBIDDEN_CHARACTER.test(trimmed)) {
    return null;
  }
  return trimmed;
}
