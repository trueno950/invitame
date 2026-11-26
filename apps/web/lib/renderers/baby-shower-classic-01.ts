import { BABY_SHOWER_THEMES, type BabyShowerThemeKey } from "./baby-shower-themes.ts";
import { contentReader, isCalendarDate, isClockTime, isHttpUrl } from "./invitation-fields.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";

/**
 * The `baby-shower-classic-01` layout — «Clásica» (T7c; S13), following the full-page form of
 * `design/celebration-themes/01-baby-shower.html`: an accent band with the name and the date, the
 * information rows, and the place cards. The layout is coded once and the theme supplies the palette, the
 * licensed display font, and the motif, so one renderer serves all eight themes.
 *
 * The content the owner approved (S13): hosts, date, time, location, address, message, and an RSVP contact
 * are required; the baby's name, the gender reveal, the gift registry, and the photo are optional, and an
 * optional field that is empty renders nothing at all.
 */
export const BABY_SHOWER_CLASSIC_COMPONENT_KEY = "baby-shower-classic-01";

export interface BabyShowerClassicConfiguration {
  readonly componentKey: typeof BABY_SHOWER_CLASSIC_COMPONENT_KEY;
  readonly theme: BabyShowerThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseBabyShowerClassicConfiguration(
  value: unknown,
): BabyShowerClassicConfiguration {
  const { theme } = parseThemedConfiguration(
    BABY_SHOWER_CLASSIC_COMPONENT_KEY,
    BABY_SHOWER_THEMES,
    value,
  );

  return { componentKey: BABY_SHOWER_CLASSIC_COMPONENT_KEY, theme };
}

export interface BabyShowerContent {
  /** Who invites, and who receives the confirmation. */
  readonly hosts: string;
  /** A calendar date as `YYYY-MM-DD`. */
  readonly date: string;
  /** A time as `HH:MM`. */
  readonly time: string;
  readonly location: string;
  readonly address: string;
  readonly message: string;
  readonly rsvpContact: string;
  /** The baby's name; absent when the shower is a surprise. */
  readonly babyName?: string;
  /** Whether the party reveals the gender; absent when it does not. */
  readonly genderReveal?: boolean;
  readonly giftRegistry?: string;
  /** An http or https URL. */
  readonly mainPhoto?: string;
}

/** The typed content of a stored version, or a `RendererPropsError` naming every defect. */
export function parseBabyShowerClassicContent(
  value: unknown,
  hiddenFields: readonly string[] = [],
): BabyShowerContent {
  const reader = contentReader(BABY_SHOWER_CLASSIC_COMPONENT_KEY, value, hiddenFields);

  const hosts = reader.text("hosts");
  const date = reader.formatted("date", isCalendarDate, "a calendar date as YYYY-MM-DD");
  const time = reader.formatted("time", isClockTime, "a time as HH:MM");
  const location = reader.text("location");
  const address = reader.text("address");
  const message = reader.text("message");
  const rsvpContact = reader.text("rsvpContact");
  const babyName = reader.optionalText("babyName");
  const genderReveal = reader.optionalBoolean("genderReveal");
  const giftRegistry = reader.optionalText("giftRegistry");
  const mainPhoto = reader.optionalFormatted("mainPhoto", isHttpUrl, "an http or https URL");

  return reader.content(() => ({
    hosts,
    date,
    time,
    location,
    address,
    message,
    rsvpContact,
    ...(babyName === undefined ? {} : { babyName }),
    ...(genderReveal === undefined ? {} : { genderReveal }),
    ...(giftRegistry === undefined ? {} : { giftRegistry }),
    ...(mainPhoto === undefined ? {} : { mainPhoto }),
  }));
}
