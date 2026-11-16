import { ELEGANT_THEMES, type ElegantThemeKey } from "./elegant-themes.ts";
import { contentReader, isCalendarDate, isClockTime, isHttpUrl } from "./invitation-fields.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";

/**
 * The `xv-arch-01` layout — «Arco y foto» for XV años (E3c; S3, S4), following
 * `design/elegant-line/03-arco-y-foto.html`: the photo in an arch with the name over a measured scrim, then
 * the family card (parents, honor sponsors, and the chambelanes when the family has them), one card per
 * place of the day, the dress code and gift registry, the message, and the RSVP.
 *
 * The content the owner approved (S4): thirteen required fields and three optional ones. A list is a
 * bounded text — one name per line — and an optional field that is empty renders nothing at all. The
 * layout is coded once and the theme supplies the palette, the display font, and the ornament, so one
 * renderer serves all eight themes.
 */
export const XV_ARCH_COMPONENT_KEY = "xv-arch-01";

export interface XVArchConfiguration {
  readonly componentKey: typeof XV_ARCH_COMPONENT_KEY;
  readonly theme: ElegantThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseXVArchConfiguration(value: unknown): XVArchConfiguration {
  const { theme } = parseThemedConfiguration(XV_ARCH_COMPONENT_KEY, ELEGANT_THEMES, value);

  return { componentKey: XV_ARCH_COMPONENT_KEY, theme };
}

export interface XVArchContent {
  readonly celebrantName: string;
  /** A calendar date as `YYYY-MM-DD`. */
  readonly date: string;
  /** The parents, one name per line. */
  readonly parents: string;
  /** The honor sponsors, one name per line. */
  readonly honorSponsors: string;
  readonly ceremonyPlace: string;
  readonly ceremonyAddress: string;
  /** A time as `HH:MM`. */
  readonly ceremonyTime: string;
  readonly receptionPlace: string;
  readonly receptionAddress: string;
  /** A time as `HH:MM`. */
  readonly receptionTime: string;
  readonly dressCode: string;
  readonly message: string;
  readonly rsvpContact: string;
  /** The chambelanes, one name per line. */
  readonly chambelanes?: string;
  readonly giftRegistry?: string;
  /** An http or https URL. */
  readonly mainPhoto?: string;
}

/** The typed content of a stored version, or a `RendererPropsError` naming every defect. */
export function parseXVArchContent(value: unknown): XVArchContent {
  const reader = contentReader(XV_ARCH_COMPONENT_KEY, value);

  const celebrantName = reader.text("celebrantName");
  const date = reader.formatted("date", isCalendarDate, "a calendar date as YYYY-MM-DD");
  const parents = reader.text("parents");
  const honorSponsors = reader.text("honorSponsors");
  const ceremonyPlace = reader.text("ceremonyPlace");
  const ceremonyAddress = reader.text("ceremonyAddress");
  const ceremonyTime = reader.formatted("ceremonyTime", isClockTime, "a time as HH:MM");
  const receptionPlace = reader.text("receptionPlace");
  const receptionAddress = reader.text("receptionAddress");
  const receptionTime = reader.formatted("receptionTime", isClockTime, "a time as HH:MM");
  const dressCode = reader.text("dressCode");
  const message = reader.text("message");
  const rsvpContact = reader.text("rsvpContact");
  const chambelanes = reader.optionalText("chambelanes");
  const giftRegistry = reader.optionalText("giftRegistry");
  const mainPhoto = reader.optionalFormatted("mainPhoto", isHttpUrl, "an http or https URL");

  return reader.content(() => ({
    celebrantName,
    date,
    parents,
    honorSponsors,
    ceremonyPlace,
    ceremonyAddress,
    ceremonyTime,
    receptionPlace,
    receptionAddress,
    receptionTime,
    dressCode,
    message,
    rsvpContact,
    ...(chambelanes === undefined ? {} : { chambelanes }),
    ...(giftRegistry === undefined ? {} : { giftRegistry }),
    ...(mainPhoto === undefined ? {} : { mainPhoto }),
  }));
}
