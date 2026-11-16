import { BAPTISM_THEMES, type BaptismThemeKey } from "./baptism-themes.ts";
import { contentReader, isCalendarDate, isClockTime, isHttpUrl } from "./invitation-fields.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";

/**
 * The `baptism-classic-01` layout — «Clásica» (T7c; S13), following the full-page form of
 * `design/celebration-themes/02-bautizo-tematico.html`: an accent band with the child's name and the date,
 * the parents and godparents, a card for the ceremony and another for the reception, the message, and the
 * RSVP. The layout is coded once and the theme supplies the palette, the licensed display font, and the
 * motif, so one renderer serves all six themes.
 *
 * The content the owner approved (S13): the child's name and the date, the parents, the godparents, the
 * ceremony (place, address, time), the reception (place, address, time), the message, and an RSVP contact
 * are required; the photo and the gift registry are optional, and an optional field that is empty renders
 * nothing at all. The formal baptism stays in the elegant line (T8).
 */
export const BAPTISM_CLASSIC_COMPONENT_KEY = "baptism-classic-01";

export interface BaptismClassicConfiguration {
  readonly componentKey: typeof BAPTISM_CLASSIC_COMPONENT_KEY;
  readonly theme: BaptismThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseBaptismClassicConfiguration(value: unknown): BaptismClassicConfiguration {
  const { theme } = parseThemedConfiguration(BAPTISM_CLASSIC_COMPONENT_KEY, BAPTISM_THEMES, value);

  return { componentKey: BAPTISM_CLASSIC_COMPONENT_KEY, theme };
}

export interface BaptismContent {
  readonly celebrantName: string;
  /** A calendar date as `YYYY-MM-DD`. */
  readonly date: string;
  readonly parents: string;
  readonly godparents: string;
  readonly ceremonyPlace: string;
  readonly ceremonyAddress: string;
  /** A time as `HH:MM`. */
  readonly ceremonyTime: string;
  readonly receptionPlace: string;
  readonly receptionAddress: string;
  /** A time as `HH:MM`. */
  readonly receptionTime: string;
  readonly message: string;
  readonly rsvpContact: string;
  readonly giftRegistry?: string;
  /** An http or https URL. */
  readonly mainPhoto?: string;
}

/** The typed content of a stored version, or a `RendererPropsError` naming every defect. */
export function parseBaptismClassicContent(value: unknown): BaptismContent {
  const reader = contentReader(BAPTISM_CLASSIC_COMPONENT_KEY, value);

  const celebrantName = reader.text("celebrantName");
  const date = reader.formatted("date", isCalendarDate, "a calendar date as YYYY-MM-DD");
  const parents = reader.text("parents");
  const godparents = reader.text("godparents");
  const ceremonyPlace = reader.text("ceremonyPlace");
  const ceremonyAddress = reader.text("ceremonyAddress");
  const ceremonyTime = reader.formatted("ceremonyTime", isClockTime, "a time as HH:MM");
  const receptionPlace = reader.text("receptionPlace");
  const receptionAddress = reader.text("receptionAddress");
  const receptionTime = reader.formatted("receptionTime", isClockTime, "a time as HH:MM");
  const message = reader.text("message");
  const rsvpContact = reader.text("rsvpContact");
  const giftRegistry = reader.optionalText("giftRegistry");
  const mainPhoto = reader.optionalFormatted("mainPhoto", isHttpUrl, "an http or https URL");

  return reader.content(() => ({
    celebrantName,
    date,
    parents,
    godparents,
    ceremonyPlace,
    ceremonyAddress,
    ceremonyTime,
    receptionPlace,
    receptionAddress,
    receptionTime,
    message,
    rsvpContact,
    ...(giftRegistry === undefined ? {} : { giftRegistry }),
    ...(mainPhoto === undefined ? {} : { mainPhoto }),
  }));
}
