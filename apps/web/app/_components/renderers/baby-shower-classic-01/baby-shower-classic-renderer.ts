import { createElement, type ReactElement, useId } from "react";

import {
  parseBabyShowerClassicConfiguration,
  parseBabyShowerClassicContent,
} from "../../../../lib/renderers/baby-shower-classic-01.ts";
import { BABY_SHOWER_THEME } from "../../../../lib/renderers/baby-shower-themes.ts";
import { formatLongDate } from "../../../../lib/renderers/invitation-fields.ts";
import { CelebrationMotif } from "../themed/celebration-motif.ts";
import {
  BACKGROUND_LAYER,
  DECORATION_STRIP,
  INVITATION_ROOT,
  themeStyle,
  titleStyle,
} from "../themed/theme.ts";

/*
 * The `baby-shower-classic-01` invitation — «Clásica» (T7c; S13), following the full-page form of
 * `design/celebration-themes/01-baby-shower.html`: an accent band with the name and the date, the
 * information rows, and the place cards, with the gift registry, the gender reveal, and the photo only when
 * the invitation has them. A server component with no client script: `.ts` + `createElement` because
 * `node --test` strips types but does not compile JSX. Every color comes from the theme through CSS
 * variables on the root, and every title uses the theme's display font at the single weight it is loaded
 * with, never a synthetic bold.
 */

export interface BabyShowerClassicRendererProps {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
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
}: BabyShowerClassicRendererProps): ReactElement {
  const { theme: themeKey } = parseBabyShowerClassicConfiguration(configuration);
  const data = parseBabyShowerClassicContent(content);
  const theme = BABY_SHOWER_THEME[themeKey];
  const idPrefix = useId();
  const headline = data.babyName ?? data.hosts;
  const photoAlt = `Foto de ${headline}`;

  return h(
    "article",
    {
      "aria-label": `Invitación de baby shower${data.babyName === undefined ? "" : ` de ${data.babyName}`}`,
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
    // The motif is decoration: it sits in its own strip above the band, where no text can fall on it.
    h(
      "div",
      {
        "aria-hidden": "true",
        "data-decoration": "",
        className: DECORATION_STRIP,
      },
      h(CelebrationMotif, { motif: theme.motif, tone: "paper" }),
    ),
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
          data.babyName === undefined ? "Baby shower" : "Baby shower de",
        ),
        h(
          "h1",
          { id: `${idPrefix}-hero`, className: "mt-1 break-words", style: titleStyle(theme) },
          headline,
        ),
        h(
          "p",
          { className: "mt-2 text-sm" },
          h("time", { dateTime: data.date }, formatLongDate(data.date)),
        ),
      ),
    ),
    h(
      "section",
      { "data-section": "details", "aria-labelledby": `${idPrefix}-details` },
      h("h2", { id: `${idPrefix}-details`, className: SECTION_TITLE }, "Los detalles"),
      h(
        "div",
        { className: "mt-3 flex flex-col gap-2" },
        h(
          "div",
          { className: ROW },
          h(
            "b",
            { className: "text-(color:--inv-accent)" },
            h("time", { dateTime: data.date }, formatLongDate(data.date)),
          ),
          h(
            "span",
            { className: "whitespace-nowrap" },
            h("time", { dateTime: data.time }, `${data.time} h`),
          ),
        ),
        labelRow("location", "Lugar", data.location),
        labelRow("address", "Dirección", data.address),
        labelRow("hosts", "Anfitriones", data.hosts, true),
        data.genderReveal === true
          ? labelRow("gender-reveal", "Revelación de género", "¡Habrá revelación!", true)
          : null,
        data.giftRegistry === undefined
          ? null
          : h(
              "div",
              { key: "gift-registry", className: ROW_SOFT },
              h("span", { className: ROW_LABEL }, "Mesa de regalos"),
              h("span", { className: `${ROW_VALUE} text-(color:--inv-accent)` }, data.giftRegistry),
            ),
      ),
    ),
    data.mainPhoto === undefined
      ? null
      : h(
          "section",
          { "data-section": "photo", "aria-labelledby": `${idPrefix}-photo` },
          h("h2", { id: `${idPrefix}-photo`, className: SECTION_TITLE }, "La foto"),
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
              "¡Te esperamos!",
            ),
          ),
        ),
    h(
      "section",
      { "data-section": "message", "aria-labelledby": `${idPrefix}-message` },
      h("h2", { id: `${idPrefix}-message`, className: SECTION_TITLE }, "Mensaje"),
      h(
        "p",
        {
          className:
            "mt-3 rounded-3xl bg-(--inv-soft) px-5 py-4 text-center text-lg leading-relaxed text-(color:--inv-ink)",
        },
        data.message,
      ),
    ),
    h(
      "section",
      { "data-section": "rsvp", "aria-labelledby": `${idPrefix}-rsvp` },
      h("h2", { id: `${idPrefix}-rsvp`, className: SECTION_TITLE }, "Confirma tu asistencia"),
      h(
        "p",
        {
          className: `mt-3 ${CARD} text-center text-lg font-medium text-(color:--inv-ink)`,
        },
        data.rsvpContact,
      ),
    ),
  );
}
