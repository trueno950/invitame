import { createElement, type ReactElement, useId } from "react";
import { babyShowerEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import {
  type InvitationFeatures,
  showsGiftRegistry,
} from "../../../../lib/invitation-features/invitation-features.ts";
import type { Locale } from "../../../../lib/i18n/locale.ts";
import {
  rendererClockTime,
  rendererLongDate,
  rendererTextsFor,
} from "../../../../lib/i18n/renderer-texts.ts";
import {
  parseBabyShowerClassicConfiguration,
  parseBabyShowerClassicContent,
} from "../../../../lib/renderers/baby-shower-classic-01.ts";
import { BABY_SHOWER_THEME } from "../../../../lib/renderers/baby-shower-themes.ts";
import { hiddenFieldSet } from "../../../../lib/renderers/invitation-fields.ts";
import { InvitationFeaturesBlock } from "../../invitation-features/invitation-features-block.ts";
import { DecorationZone } from "../illustrations/decoration.ts";
import { CelebrationMotif } from "../themed/celebration-motif.ts";
import { BACKGROUND_LAYER, INVITATION_ROOT, themeStyle, titleStyle } from "../themed/theme.ts";

/*
 * The `baby-shower-classic-01` invitation — «Clásica» (T7c; S13), following the full-page form of
 * `design/celebration-themes/01-baby-shower.html`: an accent band with the name and the date, the
 * information rows, and the place cards, with the gift registry, the gender reveal, and the photo only when
 * the invitation has them. A server component with no client script: `.ts` + `createElement` because
 * `node --test` strips types but does not compile JSX. Every color comes from the theme through CSS
 * variables on the root, and every title uses the theme's display font at the single weight it is loaded
 * with, never a synthetic bold.
 *
 * Decoration (I3a; S4): the theme opens the page as a paper-cut diorama above the band, cuts a torn strip
 * before the message, and closes it with a footer strip; a theme without an illustration keeps the motif
 * strip this layout drew before, in the same place.
 */

export interface BabyShowerClassicRendererProps {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
  /** The features the API gated for this invitation; absent when it has none, which renders nothing. */
  readonly features?: InvitationFeatures;
  /** The `.ics` download the public page owns; absent leaves the Google Calendar link alone. */
  readonly calendarHref?: string;
  /** The content fields of the sections this customer switched off (S8.3); absent hides nothing. */
  readonly hiddenFields?: readonly string[];
  /** The locale the guest page renders (F14; L19.2); absent reads as Spanish. */
  readonly locale?: Locale;
}

const h = createElement;

const SECTION_TITLE =
  "text-center text-xs font-medium uppercase tracking-[0.16em] text-(color:--inv-accent)";
const ROW =
  "flex items-baseline justify-between gap-3 rounded-xl bg-(--inv-surface) px-4 py-3 text-sm text-(color:--inv-ink)";
const ROW_SOFT =
  "flex items-baseline justify-between gap-3 rounded-xl bg-(--inv-soft) px-4 py-3 text-sm text-(color:--inv-ink)";
const ROW_LABEL =
  "shrink-0 text-[0.7rem] font-medium uppercase tracking-[0.12em] whitespace-nowrap text-(color:--inv-accent)";
const ROW_VALUE = "min-w-0 text-right font-medium break-words";
const CARD = "rounded-2xl bg-(--inv-surface) px-5 py-4 shadow-sm";

/** The place cards and optional rows of a celebration layout, kept to one shape so they compare at a glance. */
function labelRow(
  key: string,
  label: string,
  value: ReactElement | string,
  emphasis = false,
): ReactElement {
  return h(
    "div",
    { key, className: emphasis ? ROW_SOFT : ROW },
    h("span", { className: ROW_LABEL }, label),
    h("span", { className: ROW_VALUE }, value),
  );
}

export function BabyShowerClassicRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
  locale,
}: BabyShowerClassicRendererProps): ReactElement {
  const { theme: themeKey } = parseBabyShowerClassicConfiguration(configuration);
  const data = parseBabyShowerClassicContent(content, hiddenFields);
  const hidden = hiddenFieldSet(hiddenFields);
  const theme = BABY_SHOWER_THEME[themeKey];
  // The gift registry is rendered only when the API gated it on and the content carries a value (F7; S7);
  // with no features at all this is a preview, and the content alone decides, as it did before this batch.
  const giftRegistry = showsGiftRegistry(features, data.giftRegistry)
    ? data.giftRegistry
    : undefined;
  const idPrefix = useId();
  const texts = rendererTextsFor(locale);
  const headline = data.babyName ?? data.hosts;
  const photoAlt = `${texts["invitation.photoAlt"]} ${headline}`;

  // After the details and before the photo: the information rows, then what a guest can act on (S4).
  const featuresBlock =
    features === undefined
      ? null
      : h(InvitationFeaturesBlock, {
          features,
          facts: babyShowerEventFacts(data, hiddenFields),
          ...(calendarHref === undefined ? {} : { calendarHref }),
          ...(locale === undefined ? {} : { locale }),
        });

  return h(
    "article",
    {
      "aria-label": `${
        data.babyName === undefined
          ? texts["babyShower.ariaInvitation"]
          : `${texts["babyShower.ariaInvitation"]} ${texts["babyShower.ariaOf"]} ${data.babyName}`
      }`,
      "data-component-key": "baby-shower-classic-01",
      "data-theme": themeKey,
      className: `${INVITATION_ROOT} gap-6 px-5 py-6`,
      style: themeStyle(theme),
    },
    // The theme background must paint the page, not only a centred column: the guest `<main>` is `isolate`,
    // so a viewport-sized layer at `-z-10` stays behind this invitation's content and above the site paper.
    h("div", {
      "aria-hidden": "true",
      "data-invitation-background": "",
      className: BACKGROUND_LAYER,
    }),
    // The motif is decoration: it sits in its own strip above the band, where no text can fall on it. The
    // theme illustration takes that place as a full-width diorama.
    h(DecorationZone, {
      theme: themeKey,
      part: "scene",
      illustrationClassName: "pointer-events-none block",
      fallback: {
        node: h(CelebrationMotif, { motif: theme.motif, tone: "paper" }),
        className: "pointer-events-none flex h-20 justify-center",
      },
    }),
    h(
      "section",
      {
        "data-section": "hero",
        "aria-labelledby": `${idPrefix}-hero`,
        className: "text-center",
      },
      h(
        "div",
        {
          className: "rounded-2xl bg-(--inv-accent) px-5 py-7 text-(color:--inv-on-accent)",
        },
        h(
          "p",
          { className: "text-[0.7rem] font-medium uppercase tracking-[0.18em]" },
          data.babyName === undefined ? texts["babyShower.kicker"] : texts["babyShower.kickerOf"],
        ),
        h(
          "h1",
          { id: `${idPrefix}-hero`, className: "mt-1 break-words", style: titleStyle(theme) },
          headline,
        ),
        h(
          "p",
          { className: "mt-2 text-sm" },
          h("time", { dateTime: data.date }, rendererLongDate(locale, data.date)),
        ),
      ),
    ),
    h(
      "section",
      { "data-section": "details", "aria-labelledby": `${idPrefix}-details` },
      h("h2", { id: `${idPrefix}-details`, className: SECTION_TITLE }, texts["babyShower.details"]),
      h(
        "div",
        { className: "mt-3 flex flex-col gap-2" },
        h(
          "div",
          { className: ROW },
          h(
            "b",
            { className: "text-(color:--inv-accent)" },
            h("time", { dateTime: data.date }, rendererLongDate(locale, data.date)),
          ),
          h(
            "span",
            { className: "whitespace-nowrap" },
            h("time", { dateTime: data.time }, rendererClockTime(locale, data.time)),
          ),
        ),
        labelRow("location", texts["label.place"], data.location),
        labelRow("address", texts["label.address"], data.address),
        labelRow("hosts", texts["label.hosts"], data.hosts, true),
        data.genderReveal === true
          ? labelRow(
              "gender-reveal",
              texts["label.genderReveal"],
              texts["babyShower.genderRevealValue"],
              true,
            )
          : null,
        giftRegistry === undefined
          ? null
          : h(
              "div",
              { key: "gift-registry", className: ROW_SOFT },
              h("span", { className: ROW_LABEL }, texts["label.giftRegistry"]),
              h("span", { className: `${ROW_VALUE} text-(color:--inv-accent)` }, giftRegistry),
            ),
      ),
    ),
    featuresBlock,
    data.mainPhoto === undefined
      ? null
      : h(
          "section",
          { "data-section": "photo", "aria-labelledby": `${idPrefix}-photo` },
          h("h2", { id: `${idPrefix}-photo`, className: SECTION_TITLE }, texts["babyShower.photo"]),
          h(
            "figure",
            { className: `${CARD} mt-3` },
            h("img", {
              src: data.mainPhoto,
              alt: photoAlt,
              decoding: "async",
              className: "aspect-[4/3] w-full rounded-xl object-cover",
            }),
            h(
              "figcaption",
              {
                className: "mt-2 text-center text-sm font-medium text-(color:--inv-accent)",
              },
              texts["babyShower.expect"],
            ),
          ),
        ),
    h(DecorationZone, {
      theme: themeKey,
      part: "divider",
      illustrationClassName: "pointer-events-none -mx-5 block",
    }),
    hidden.has("message")
      ? null
      : h(
          "section",
          { "data-section": "message", "aria-labelledby": `${idPrefix}-message` },
          h(
            "h2",
            { id: `${idPrefix}-message`, className: SECTION_TITLE },
            texts["invitation.message"],
          ),
          h(
            "p",
            {
              className:
                "mt-3 rounded-3xl bg-(--inv-soft) px-5 py-4 text-center text-lg leading-relaxed text-(color:--inv-ink)",
            },
            data.message,
          ),
        ),
    hidden.has("rsvpContact")
      ? null
      : h(
          "section",
          { "data-section": "rsvp", "aria-labelledby": `${idPrefix}-rsvp` },
          h("h2", { id: `${idPrefix}-rsvp`, className: SECTION_TITLE }, texts["invitation.rsvp"]),
          h(
            "p",
            {
              className: `mt-3 ${CARD} text-center text-lg font-medium text-(color:--inv-ink)`,
            },
            data.rsvpContact,
          ),
        ),
    h(DecorationZone, {
      theme: themeKey,
      part: "footer",
      illustrationClassName: "pointer-events-none -mx-5 -mb-6 block",
    }),
  );
}
