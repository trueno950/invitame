import { createElement, type ReactElement, useId } from "react";

import {
  parseBaptismClassicConfiguration,
  parseBaptismClassicContent,
} from "../../../../lib/renderers/baptism-classic-01.ts";
import { BAPTISM_THEME } from "../../../../lib/renderers/baptism-themes.ts";
import { formatLongDate } from "../../../../lib/renderers/invitation-fields.ts";
import type { InvitationTheme } from "../../../../lib/renderers/theme-tokens.ts";
import { CelebrationMotif } from "../themed/celebration-motif.ts";
import {
  BACKGROUND_LAYER,
  DECORATION_STRIP,
  displayFontStyle,
  INVITATION_ROOT,
  themeStyle,
  titleStyle,
} from "../themed/theme.ts";

/*
 * The `baptism-classic-01` invitation — «Clásica» (T7c; S13), following the full-page form of
 * `design/celebration-themes/02-bautizo-tematico.html`: an accent band with the child's name and the date,
 * the parents and godparents, a place card for the ceremony and another for the reception (each with its
 * own address and time), the message, and the RSVP. The photo and the gift registry appear only when the
 * invitation has them. A server component with no client script: `.ts` + `createElement` because
 * `node --test` strips types but does not compile JSX. Every color comes from the theme through CSS
 * variables on the root, and the display font is used at the single weight it is loaded with.
 */

export interface BaptismClassicRendererProps {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
}

const h = createElement;

const SECTION_TITLE =
  "text-center text-xs font-medium uppercase tracking-[0.16em] text-(color:--inv-accent)";
const ROW_SOFT =
  "flex items-baseline justify-between gap-3 rounded-xl bg-(--inv-soft) px-4 py-3 text-sm text-(color:--inv-ink)";
const ROW_LABEL =
  "shrink-0 text-[0.7rem] font-medium uppercase tracking-[0.12em] whitespace-nowrap text-(color:--inv-accent)";
const ROW_VALUE = "min-w-0 text-right font-medium break-words";
const CARD = "rounded-2xl bg-(--inv-surface) px-5 py-4 text-center shadow-sm";
const TIME_CHIP =
  "mt-3 inline-block rounded-full bg-(--inv-soft) px-3 py-1 text-sm font-medium text-(color:--inv-accent)";
const CARD_TITLE =
  "text-[0.7rem] font-medium uppercase tracking-[0.16em] text-(color:--inv-accent)";

/** One of the two places of the day: «Ceremonia» or «Recepción», with its own address and time. */
function placeCard(
  theme: InvitationTheme,
  key: string,
  idPrefix: string,
  label: string,
  place: string,
  address: string,
  time: string,
): ReactElement {
  return h(
    "section",
    { "data-section": key, "aria-labelledby": `${idPrefix}-${key}` },
    h(
      "div",
      { className: CARD },
      h("h2", { id: `${idPrefix}-${key}`, className: CARD_TITLE }, label),
      h(
        "p",
        {
          className: "mt-2 text-xl leading-tight break-words text-(color:--inv-ink)",
          style: displayFontStyle(theme),
        },
        place,
      ),
      h("p", { className: "mt-1 text-sm text-(color:--inv-ink)" }, address),
      h("p", null, h("time", { dateTime: time, className: TIME_CHIP }, `${time} h`)),
    ),
  );
}

export function BaptismClassicRenderer({
  configuration,
  content,
}: BaptismClassicRendererProps): ReactElement {
  const { theme: themeKey } = parseBaptismClassicConfiguration(configuration);
  const data = parseBaptismClassicContent(content);
  const theme = BAPTISM_THEME[themeKey];
  const idPrefix = useId();

  return h(
    "article",
    {
      "aria-label": `Invitación de bautizo de ${data.celebrantName}`,
      "data-component-key": "baptism-classic-01",
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
        { className: "rounded-2xl bg-(--inv-accent) px-5 py-7 text-(color:--inv-on-accent)" },
        h(
          "p",
          { className: "text-[0.7rem] font-medium uppercase tracking-[0.18em]" },
          "Bautizo de",
        ),
        h(
          "h1",
          { id: `${idPrefix}-hero`, className: "mt-1 break-words", style: titleStyle(theme) },
          data.celebrantName,
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
      h("h2", { id: `${idPrefix}-details`, className: SECTION_TITLE }, "La familia"),
      h(
        "div",
        { className: "mt-3 flex flex-col gap-2" },
        h(
          "div",
          { className: ROW_SOFT },
          h("span", { className: ROW_LABEL }, "Padres"),
          h("span", { className: ROW_VALUE }, data.parents),
        ),
        h(
          "div",
          { className: ROW_SOFT },
          h("span", { className: ROW_LABEL }, "Padrinos"),
          h("span", { className: ROW_VALUE }, data.godparents),
        ),
        data.giftRegistry === undefined
          ? null
          : h(
              "div",
              { className: ROW_SOFT },
              h("span", { className: ROW_LABEL }, "Mesa de regalos"),
              h("span", { className: `${ROW_VALUE} text-(color:--inv-accent)` }, data.giftRegistry),
            ),
      ),
    ),
    placeCard(
      theme,
      "ceremony",
      idPrefix,
      "Ceremonia",
      data.ceremonyPlace,
      data.ceremonyAddress,
      data.ceremonyTime,
    ),
    placeCard(
      theme,
      "reception",
      idPrefix,
      "Recepción",
      data.receptionPlace,
      data.receptionAddress,
      data.receptionTime,
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
              alt: `Foto de ${data.celebrantName}`,
              decoding: "async",
              className: "aspect-[4/3] w-full rounded-xl object-cover",
            }),
            h(
              "figcaption",
              {
                className: "mt-2 text-center text-sm font-medium text-(color:--inv-accent)",
              },
              "Un día para recordar",
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
        { className: `mt-3 ${CARD} text-center text-lg font-medium text-(color:--inv-ink)` },
        data.rsvpContact,
      ),
    ),
  );
}
