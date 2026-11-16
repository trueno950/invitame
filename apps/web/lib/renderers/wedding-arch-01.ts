import { ELEGANT_THEMES, type ElegantThemeKey } from "./elegant-themes.ts";
import { contentReader, isCalendarDate, isClockTime, isHttpUrl } from "./invitation-fields.ts";
import { parseThemedConfiguration } from "./theme-tokens.ts";

/**
 * The `wedding-arch-01` layout — «Arco y foto» for a wedding (E3c; S3, S4), following
 * `design/elegant-line/03-arco-y-foto.html`: the couple's two names in the arch lockup, the families and the
 * sponsors when the couple announces them, one card per place of the day, the dress code and gift registry,
 * the message with its hashtag, and the RSVP.
 *
 * The content the owner approved (S4): twelve required fields and six optional ones. A family or a list of
 * sponsors is a bounded text — one name per line — and an optional field that is empty renders nothing at
 * all, so a wedding that announces no family shows no family card.
 */
export const WEDDING_ARCH_COMPONENT_KEY = "wedding-arch-01";

export interface WeddingArchConfiguration {
  readonly componentKey: typeof WEDDING_ARCH_COMPONENT_KEY;
  readonly theme: ElegantThemeKey;
}

/** The configuration of a stored version, or a `RendererPropsError` naming every defect. */
export function parseWeddingArchConfiguration(value: unknown): WeddingArchConfiguration {
  const { theme } = parseThemedConfiguration(WEDDING_ARCH_COMPONENT_KEY, ELEGANT_THEMES, value);

  return { componentKey: WEDDING_ARCH_COMPONENT_KEY, theme };
}

export interface WeddingArchContent {
  readonly coupleNameOne: string;
  readonly coupleNameTwo: string;
  /** A calendar date as `YYYY-MM-DD`. */
  readonly date: string;
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
  /** The parents of one side of the couple, one name per line. */
  readonly firstFamilyParents?: string;
  /** The parents of the other side, one name per line. */
  readonly secondFamilyParents?: string;
  /** The wedding sponsors, one name per line. */
  readonly weddingSponsors?: string;
  readonly giftRegistry?: string;
  /** The one tag the couple wants beside the message, with its leading `#`. */
  readonly hashtag?: string;
  /** An http or https URL. */
  readonly mainPhoto?: string;
}

/** The typed content of a stored version, or a `RendererPropsError` naming every defect. */
export function parseWeddingArchContent(value: unknown): WeddingArchContent {
  const reader = contentReader(WEDDING_ARCH_COMPONENT_KEY, value);

  const coupleNameOne = reader.text("coupleNameOne");
  const coupleNameTwo = reader.text("coupleNameTwo");
  const date = reader.formatted("date", isCalendarDate, "a calendar date as YYYY-MM-DD");
  const ceremonyPlace = reader.text("ceremonyPlace");
  const ceremonyAddress = reader.text("ceremonyAddress");
  const ceremonyTime = reader.formatted("ceremonyTime", isClockTime, "a time as HH:MM");
  const receptionPlace = reader.text("receptionPlace");
  const receptionAddress = reader.text("receptionAddress");
  const receptionTime = reader.formatted("receptionTime", isClockTime, "a time as HH:MM");
  const dressCode = reader.text("dressCode");
  const message = reader.text("message");
  const rsvpContact = reader.text("rsvpContact");
  const firstFamilyParents = reader.optionalText("firstFamilyParents");
  const secondFamilyParents = reader.optionalText("secondFamilyParents");
  const weddingSponsors = reader.optionalText("weddingSponsors");
  const giftRegistry = reader.optionalText("giftRegistry");
  const hashtag = reader.optionalText("hashtag");
  const mainPhoto = reader.optionalFormatted("mainPhoto", isHttpUrl, "an http or https URL");

  return reader.content(() => ({
    coupleNameOne,
    coupleNameTwo,
    date,
    ceremonyPlace,
    ceremonyAddress,
    ceremonyTime,
    receptionPlace,
    receptionAddress,
    receptionTime,
    dressCode,
    message,
    rsvpContact,
    ...(firstFamilyParents === undefined ? {} : { firstFamilyParents }),
    ...(secondFamilyParents === undefined ? {} : { secondFamilyParents }),
    ...(weddingSponsors === undefined ? {} : { weddingSponsors }),
    ...(giftRegistry === undefined ? {} : { giftRegistry }),
    ...(hashtag === undefined ? {} : { hashtag }),
    ...(mainPhoto === undefined ? {} : { mainPhoto }),
  }));
}
