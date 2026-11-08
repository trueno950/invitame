/** `User.displayName` is `VarChar(120)`; PostgreSQL counts characters, that is, Unicode code points. */
export const DISPLAY_NAME_MAX_LENGTH = 120;

// Control characters (C0, DEL, C1) and unpaired surrogates, which PostgreSQL cannot store as UTF-8,
// and the bidirectional controls (S48, L71), which make a name display differently from its content:
// U+202A to U+202E, U+2066 to U+2069, U+200E, U+200F, and U+061C. The zero-width joiner (U+200D) stays
// allowed: composed emoji and some scripts need it.
const FORBIDDEN_CHARACTER = /[\p{Cc}\p{Cs}\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/u;

/**
 * Returns the trimmed display name when it is valid, or null when it is not: after trimming it has 1
 * to 120 code points and no control character, bidirectional control, or unpaired surrogate.
 */
export function parseDisplayName(value: string): string | null {
  const trimmed = value.trim();
  const length = [...trimmed].length;

  if (length < 1 || length > DISPLAY_NAME_MAX_LENGTH || FORBIDDEN_CHARACTER.test(trimmed)) {
    return null;
  }
  return trimmed;
}
