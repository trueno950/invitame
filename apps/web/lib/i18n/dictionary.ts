import { DEFAULT_LOCALE, type Locale } from "./locale.ts";

/**
 * The one typed dictionary of every fixed guest-facing text (F14; S2.14, L19.2). Spanish is the source of truth: every
 * key is declared once in `SPANISH_TEXTS`, the values are the product copy the guest reads today, and `ENGLISH_TEXTS`
 * is typed by those very keys — so adding a key without its English value fails `tsc` instead of rendering a blank
 * line. Nothing is machine translated: each English value is written, reviewed, and stored here.
 *
 * Slice (b) of F14 declares the keys the language switch itself renders; the translation slice that follows adds the
 * rest of the guest surface to the same declaration, which is why the accessor is the only way a text reaches markup.
 */

/** Every fixed text of the language switch, in neutral Spanish (L19.1, L19.3). */
export const SPANISH_TEXTS = {
  /** The accessible name of the ES / EN group (L19.3). */
  "language.group": "Idioma",
  "language.optionEs": "ES",
  "language.optionEn": "EN",
} as const;

/** One key of the dictionary: declared by the Spanish source, never by a caller. */
export type TextKey = keyof typeof SPANISH_TEXTS;

/** The same keys with their English text; a missing or unknown key does not compile. */
export const ENGLISH_TEXTS: Readonly<Record<TextKey, string>> = {
  "language.group": "Language",
  "language.optionEs": "ES",
  "language.optionEn": "EN",
};

/** Both dictionaries, keyed by the locale they render. */
export const DICTIONARIES: Readonly<Record<Locale, Readonly<Record<TextKey, string>>>> = {
  es: SPANISH_TEXTS,
  en: ENGLISH_TEXTS,
};

/** Every key the dictionary declares, in the order the Spanish source declares them. */
export function textKeys(): readonly TextKey[] {
  return Object.keys(SPANISH_TEXTS) as TextKey[];
}

/**
 * The whole dictionary of one locale, for a renderer that reads several texts of the same page. It is never a
 * fallback: a locale answers its own texts, and the page already decided which locale it renders (L19.3).
 */
export function dictionaryFor(locale: Locale): Readonly<Record<TextKey, string>> {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

/** The one text of a locale (L19.2); this accessor, or `dictionaryFor`, is how a fixed text reaches markup. */
export function t(locale: Locale, key: TextKey): string {
  return dictionaryFor(locale)[key];
}
