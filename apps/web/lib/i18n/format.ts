import { intlLocale, type Locale } from "./locale.ts";

/**
 * The `Intl` helpers of a guest page (F14; S2.14, L19.2): every date and every clock is written for the rendered
 * locale, so an English invitation never carries a Spanish «21 de noviembre» and a Spanish one never carries an
 * American date order. Each helper reads the invitation's own time zone, never the server's.
 *
 * A value this runtime cannot format answers `undefined` instead of throwing: a page has already decided what to draw,
 * and an unknown zone or an unreadable instant is a missing line, not a failed render. Formatters are cached per
 * locale and zone, because a page reads the same few ones repeatedly.
 */

const LONG_DATE_OPTIONS: Intl.DateTimeFormatOptions = { dateStyle: "long" };

const CLOCK_OPTIONS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

const longDates = new Map<string, Intl.DateTimeFormat>();
const clocks = new Map<string, Intl.DateTimeFormat>();

function formatterOf(
  cache: Map<string, Intl.DateTimeFormat>,
  locale: Locale,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat | undefined {
  const key = `${locale}|${timeZone}`;
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  try {
    const created = new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone });

    cache.set(key, created);
    return created;
  } catch {
    // A zone this runtime does not know: nothing is cached, so a later valid zone still formats.
    return undefined;
  }
}

function format(
  cache: Map<string, Intl.DateTimeFormat>,
  locale: Locale,
  value: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string | undefined {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return undefined;
  }
  const formatter = formatterOf(cache, locale, timeZone, options);

  if (formatter === undefined) {
    return undefined;
  }

  try {
    return formatter.format(value);
  } catch {
    return undefined;
  }
}

/** The long date of one instant in the invitation's zone, in the rendered locale: «21 de noviembre de 2026». */
export function formatLongDate(locale: Locale, value: Date, timeZone: string): string | undefined {
  return format(longDates, locale, value, timeZone, LONG_DATE_OPTIONS);
}

/** The clock of one instant in the invitation's zone, in the rendered locale: «5:00 p.m.» or «5:00 PM». */
export function formatClockTime(locale: Locale, value: Date, timeZone: string): string | undefined {
  return format(clocks, locale, value, timeZone, CLOCK_OPTIONS);
}
