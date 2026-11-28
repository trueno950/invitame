/**
 * The locale of a rendered page (F14; S2.14, L19.2): the two languages the typed dictionary declares, and the tag
 * `Intl` formats with.
 *
 * A locale is presentation only — it is not the value an invitation stores. The stored choice (`es`, `es-en`, or `en`)
 * lives in `./invitation-language.ts`, and `./guest-locale.ts` turns it into the locale one request renders.
 */

/** The languages a page may render, in the order the guest switch shows them (L19.3). */
export const LOCALES = ["es", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** The product's own language, and what a guest reads when nothing else is remembered (L19.2). */
export const DEFAULT_LOCALE: Locale = "es";

/** Whether a value is one exact locale; `ES`, `es-MX`, and an absent value are not. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The BCP 47 tag each locale is formatted with. The region is spelled out so `Intl` never falls back to a locale the
 * runtime happens to default to: the product writes Mexican Spanish and United States English (L19.2).
 */
export const LOCALE_TAGS: Readonly<Record<Locale, string>> = { es: "es-MX", en: "en-US" };

/** The tag `Intl` formats one locale with. */
export function intlLocale(locale: Locale): string {
  return LOCALE_TAGS[locale];
}
