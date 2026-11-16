import { type CSSProperties, createElement, type ReactElement, useId } from "react";

import type { EventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import {
  type ElegantTheme,
  type ElegantThemeKey,
  ORNAMENTAL_NAME_FONT,
} from "../../../../lib/renderers/elegant-themes.ts";
import { formatLongDate } from "../../../../lib/renderers/invitation-fields.ts";
import { InvitationFeaturesBlock } from "../../invitation-features/invitation-features-block.ts";
import type {
  ArchDetail,
  ArchMessage,
  ArchNameRow,
  ArchPlace,
} from "../elegant-arch/arch-layout.ts";
import { ElegantOrnament } from "../elegant-arch/elegant-ornament.ts";
import { DecorationZone } from "../illustrations/decoration.ts";
import {
  BACKGROUND_LAYER,
  displayFontStyle,
  INVITATION_ROOT,
  themeStyle,
} from "../themed/theme.ts";
import { type CardCorner, CornerSprig, FoilRule, LaurelSpray } from "./ornamental-art.ts";

/*
 * The ornamental layout of the elegant line (E4b; S5), «Ornamental — papelería clásica»: one centered card
 * on textured paper, a double hairline rule inset in the card, an original laurel monogram above the name,
 * foil-like hairlines, the name in script, and the photo reduced to an oval cameo. The three formal
 * occasions share this component because they share one visual direction; each keeps its own folder, parser,
 * and copy, and passes the same typed view model the arch layout takes.
 *
 * Every color, the display font, and the ornament come from the theme through CSS variables, so one layout
 * serves all eight themes. The name is set in the script face `ORNAMENTAL_NAME_FONT` decides per theme, and
 * it sits on the card's surface — there is no photo behind it and no scrim to measure. Decoration lives in
 * its own blocks: the four corner sprigs sit in the card's padding, the laurel sprays beside the monogram's
 * medallion, and the foil hairlines between blocks, so no ornament ever sits behind a letter. There is no
 * client script.
 */

const h = createElement;

/** The smallest text of the card, at the tracked sizes the board uses. */
const KICKER = "text-[0.66rem] font-medium uppercase tracking-[0.3em] text-(color:--inv-accent)";
const SECTION_TITLE =
  "text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-(color:--inv-accent)";
const ROW_LABEL =
  "text-[0.62rem] font-medium uppercase tracking-[0.18em] text-(color:--inv-accent)";
const DIVIDER = "border-t border-(--inv-decoration-two)";
const BLOCK = `mt-7 pt-5 ${DIVIDER}`;

/** The textured paper: two soft washes and a fine fibre, all of them theme colors (S3). */
const PAPER_STYLE: CSSProperties = {
  backgroundImage: [
    "radial-gradient(120% 60% at 12% 0%, color-mix(in srgb, var(--inv-surface) 70%, transparent) 0%, transparent 62%)",
    "radial-gradient(90% 50% at 92% 100%, color-mix(in srgb, var(--inv-soft) 80%, transparent) 0%, transparent 58%)",
    "repeating-linear-gradient(96deg, color-mix(in srgb, var(--inv-decoration-two) 16%, transparent) 0 1px, transparent 1px 4px)",
  ].join(", "),
};

/** The cameo: an oval, not a circle, so a portrait keeps its proportions. */
const CAMEO_STYLE: CSSProperties = {
  aspectRatio: "200 / 260",
  borderRadius: "50% / 46%",
  overflow: "hidden",
};

/** A `figure` inside the card: no browser margin, because the card's rhythm sets the spacing. */
const FIGURE_STYLE: CSSProperties = { marginInline: 0, marginBlock: "0.5rem 0" };

/** The wash that stands in for the photo inside the cameo. */
const WASH_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, var(--inv-surface) 0%, var(--inv-soft) 62%, var(--inv-background) 100%)",
};

/** The card's own shadow: the theme's ink at a low mix, with no literal color. */
const CARD_STYLE: CSSProperties = {
  boxShadow:
    "0 1px 0 color-mix(in srgb, var(--inv-decoration-one) 40%, transparent), 0 22px 40px -30px color-mix(in srgb, var(--inv-ink) 60%, transparent)",
};

/** The four corners of the card, each with its sprig and its own reflection (S5). */
const CORNERS: ReadonlyArray<{ corner: CardCorner; position: string }> = [
  { corner: "tl", position: "top-1 left-1" },
  { corner: "tr", position: "top-1 right-1" },
  { corner: "bl", position: "bottom-1 left-1" },
  { corner: "br", position: "bottom-1 right-1" },
];

export interface OrnamentalLayoutProperties {
  /** The allow-listed renderer key this view belongs to, as the markup exposes it. */
  readonly componentKey: string;
  readonly theme: ElegantTheme;
  /** The theme key, so the markup carries `data-theme` and a test can pin it. */
  readonly themeKey: ElegantThemeKey;
  readonly ariaLabel: string;
  readonly kicker: string;
  /** The celebrant's name, or the couple's two names in the order the couple chose. */
  readonly names: readonly string[];
  readonly date: string;
  readonly photoAlt: string;
  readonly ceremony: ArchPlace;
  readonly reception: ArchPlace;
  readonly family: readonly ArchNameRow[];
  readonly details: readonly ArchDetail[];
  readonly message: ArchMessage;
  readonly rsvpContact: string;
  readonly mainPhoto?: string;
  readonly features?: InvitationFeatures;
  readonly facts: EventFacts;
  readonly calendarHref?: string;
}

/** The script face of the name and the signature, at its single licensed weight. */
function scriptStyle(themeKey: ElegantThemeKey): CSSProperties {
  const script = ORNAMENTAL_NAME_FONT[themeKey];

  return {
    fontFamily: `var(${script.fontVariable}), ${script.fontFallback}`,
    fontWeight: 400,
    fontSize: "clamp(2.4rem, 10.5vw, 3.4rem)",
    lineHeight: 1.08,
    letterSpacing: "0.01em",
  };
}

/** The initials of the lockup, as a stationer would engrave them: «V», or «A·D» for a couple. */
function monogramOf(names: readonly string[]): string {
  return names
    .map((name) => (name.trim().charAt(0) || "").toUpperCase())
    .filter((initial) => initial !== "")
    .join("·");
}

/** The lockup's names: one line for a celebration, two lines joined by «y» for a couple. */
function nameLockup(themeKey: ElegantThemeKey, id: string, names: readonly string[]): ReactElement {
  const children: ReactElement[] = [];

  names.forEach((name, index) => {
    if (index > 0) {
      children.push(
        h(
          "span",
          {
            key: `join-${index}`,
            className: "my-1 block text-[0.42em] tracking-[0.24em]",
          },
          "y",
        ),
      );
    }
    children.push(h("span", { key: `name-${index}`, className: "block break-words" }, name));
  });

  return h(
    "h1",
    {
      id,
      "data-name-lockup": "",
      className: "mt-2 text-(color:--inv-ink)",
      style: scriptStyle(themeKey),
    },
    children,
  );
}

/** The laurel monogram: two sprays opening on an opaque medallion that carries the initials. */
function monogram(theme: ElegantTheme, initials: string): ReactElement | null {
  if (initials === "") {
    return null;
  }

  return h(
    "div",
    { "data-monogram": "", className: "mt-4 flex items-center justify-center gap-3" },
    h(
      "span",
      {
        key: "left",
        "aria-hidden": "true",
        "data-decoration": "",
        "data-laurel": "left",
        className: "block h-14 w-6 text-(color:--inv-decoration-one)",
      },
      h(LaurelSpray, { side: "left" }),
    ),
    // The medallion is opaque, so the sprays never reach the letters themselves.
    h(
      "span",
      {
        key: "initials",
        "data-monogram-initial": "",
        className:
          "grid size-16 shrink-0 place-items-center rounded-full border border-(--inv-decoration-one) bg-(--inv-surface) leading-none text-(color:--inv-accent)",
        style: { ...displayFontStyle(theme), fontSize: "1.75rem" },
      },
      initials,
    ),
    h(
      "span",
      {
        key: "right",
        "aria-hidden": "true",
        "data-decoration": "",
        "data-laurel": "right",
        className: "block h-14 w-6 text-(color:--inv-decoration-one)",
      },
      h(LaurelSpray, { side: "right" }),
    ),
  );
}

/** One row of the family block: its Spanish label and its names, one per line, centered. */
function familyRow(theme: ElegantTheme, row: ArchNameRow, first: boolean): ReactElement {
  return h(
    "div",
    { key: `${row.key}-row`, className: first ? "pt-1" : `${DIVIDER} mt-4 pt-4` },
    h("dt", { key: `${row.key}-label`, className: ROW_LABEL }, row.label),
    h(
      "dd",
      { key: `${row.key}-value`, className: "m-0 mt-1 flex flex-col" },
      row.values.map((value, line) =>
        h(
          "span",
          {
            key: `${row.key}-line-${line}`,
            "data-name-line": "",
            className: "block text-lg leading-snug break-words text-(color:--inv-ink)",
            style: displayFontStyle(theme),
          },
          value,
        ),
      ),
    ),
  );
}

/** One place of the day: its label, the place, the address, and the hour. */
function placeBlock(
  theme: ElegantTheme,
  idPrefix: string,
  place: ArchPlace,
  className: string,
): ReactElement {
  return h(
    "section",
    {
      "data-section": place.key,
      "aria-labelledby": `${idPrefix}-${place.key}`,
      className,
    },
    h("h2", { id: `${idPrefix}-${place.key}`, className: ROW_LABEL }, place.label),
    h(
      "p",
      {
        className: "mt-2 text-2xl leading-tight break-words text-(color:--inv-ink)",
        style: displayFontStyle(theme),
      },
      place.place,
    ),
    h(
      "address",
      {
        className: "mt-1 text-sm leading-relaxed break-words not-italic text-(color:--inv-accent)",
      },
      place.address,
    ),
    h(
      "p",
      {
        className: "mt-2 text-base text-(color:--inv-accent)",
        style: displayFontStyle(theme),
      },
      h("time", { dateTime: place.time }, `${place.time} h`),
    ),
  );
}

export function OrnamentalLayout({
  componentKey,
  theme,
  themeKey,
  ariaLabel,
  kicker,
  names,
  date,
  photoAlt,
  ceremony,
  reception,
  family,
  details,
  message,
  rsvpContact,
  mainPhoto,
  features,
  facts,
  calendarHref,
}: OrnamentalLayoutProperties): ReactElement {
  const idPrefix = useId();
  const initials = monogramOf(names);

  // After the place blocks and the details, before the message: the ceremony, the reception, and how to
  // reach them, then what a guest can act on (S4).
  const featuresBlock =
    features === undefined
      ? null
      : h(InvitationFeaturesBlock, {
          features,
          facts,
          ...(calendarHref === undefined ? {} : { calendarHref }),
        });

  return h(
    "article",
    {
      "aria-label": ariaLabel,
      "data-component-key": componentKey,
      "data-theme": themeKey,
      className: `${INVITATION_ROOT} gap-4 px-4 py-6`,
      style: themeStyle(theme),
    },
    // The textured paper paints the page, not only the centered column: the guest `<main>` is `isolate`, so
    // a viewport-sized layer at `-z-10` stays behind this invitation and above the site paper.
    h("div", {
      "aria-hidden": "true",
      "data-invitation-background": "",
      className: BACKGROUND_LAYER,
      style: PAPER_STYLE,
    }),
    h(
      "div",
      {
        "data-ornamental-card": "",
        className:
          "relative mx-auto w-full bg-(--inv-surface) px-7 pt-20 pb-20 text-center text-(color:--inv-ink)",
        style: CARD_STYLE,
      },
      // The double rule of the stationery card. Both are inset past the card's padding, so they frame the
      // text column and never cross it.
      h("span", {
        key: "rule-outer",
        "aria-hidden": "true",
        "data-card-rule": "outer",
        className:
          "pointer-events-none absolute inset-[0.44rem] border border-(--inv-decoration-one)",
      }),
      h("span", {
        key: "rule-inner",
        "aria-hidden": "true",
        "data-card-rule": "inner",
        className:
          "pointer-events-none absolute inset-[0.7rem] border border-(--inv-decoration-two)",
      }),
      // Four corner sprigs, drawn in the card's own padding above and below the text column.
      ...CORNERS.map(({ corner, position }) =>
        h(
          "span",
          {
            key: `corner-${corner}`,
            "aria-hidden": "true",
            "data-decoration": "",
            "data-corner": corner,
            className: `pointer-events-none absolute size-14 text-(color:--inv-decoration-one) ${position}`,
          },
          h(CornerSprig, { corner }),
        ),
      ),
      h(
        "div",
        { key: "content", className: "relative" },
        h(
          "header",
          { "data-section": "hero", "aria-labelledby": `${idPrefix}-name` },
          h("p", { className: KICKER }, kicker),
          monogram(theme, initials),
          nameLockup(themeKey, `${idPrefix}-name`, names),
          // The date lockup: the day in the theme's display face, tracked, as stationery sets it under the
          // name. A display face loaded at one weight is never emboldened, and the pair is the theme's ink on
          // its surface, so every theme keeps AA contrast (measured 5.31:1 or better).
          h(
            "p",
            {
              className: "mt-4 text-[1.1rem] tracking-[0.14em] text-(color:--inv-ink)",
              style: displayFontStyle(theme),
            },
            h("time", { dateTime: date }, formatLongDate(date)),
          ),
        ),
        h("div", { key: "rule", className: "mt-6" }, h(FoilRule)),
        h(
          "figure",
          {
            "data-section": "cameo",
            "aria-label": "Retrato",
            className: "mt-2",
            // The browser default of a `figure` would add a block-end margin and 40 px inline margins; the
            // card's own rhythm sets both instead.
            style: FIGURE_STYLE,
          },
          h(
            "div",
            {
              "data-cameo-frame": "",
              className:
                "relative mx-auto w-[62%] max-w-[13.5rem] border border-(--inv-decoration-one) bg-(--inv-soft)",
              style: CAMEO_STYLE,
            },
            mainPhoto === undefined
              ? h("div", {
                  key: "wash",
                  "aria-hidden": "true",
                  "data-cameo-wash": "",
                  className: "absolute inset-0",
                  style: WASH_STYLE,
                })
              : h("img", {
                  key: "photo",
                  "data-cameo-photo": "",
                  src: mainPhoto,
                  alt: photoAlt,
                  decoding: "async",
                  className: "absolute inset-0 size-full object-cover",
                }),
            mainPhoto === undefined
              ? h(
                  "div",
                  {
                    key: "ornament",
                    "aria-hidden": "true",
                    "data-decoration": "",
                    className:
                      "pointer-events-none absolute inset-x-[22%] top-[18%] h-[46%] text-(color:--inv-decoration-one)",
                  },
                  h(ElegantOrnament, { ornament: theme.ornament }),
                )
              : null,
            h("span", {
              key: "frame",
              "aria-hidden": "true",
              className:
                "pointer-events-none absolute inset-[6px] rounded-[inherit] border border-(color:--inv-decoration-two)",
            }),
          ),
        ),
        family.length === 0
          ? null
          : h(
              "section",
              {
                "data-section": "family",
                "aria-labelledby": `${idPrefix}-family`,
                className: BLOCK,
              },
              h("h2", { id: `${idPrefix}-family`, className: SECTION_TITLE }, "La familia"),
              h(
                "dl",
                { className: "mt-4 flex flex-col" },
                family.map((row, index) => familyRow(theme, row, index === 0)),
              ),
            ),
        placeBlock(theme, idPrefix, ceremony, BLOCK),
        placeBlock(theme, idPrefix, reception, BLOCK),
        details.length === 0
          ? null
          : h(
              "section",
              {
                "data-section": "details",
                "aria-labelledby": `${idPrefix}-details`,
                className: BLOCK,
              },
              h("h2", { id: `${idPrefix}-details`, className: SECTION_TITLE }, "Detalles"),
              h(
                "dl",
                { className: "mt-4 flex flex-col gap-4" },
                details.map((detail, index) =>
                  h(
                    "div",
                    {
                      key: detail.key,
                      className: index === 0 ? undefined : DIVIDER,
                    },
                    h("dt", { className: ROW_LABEL }, detail.label),
                    h(
                      "dd",
                      {
                        className:
                          "m-0 mt-1 text-lg leading-snug break-words text-(color:--inv-ink)",
                        style: displayFontStyle(theme),
                      },
                      detail.value,
                    ),
                  ),
                ),
              ),
            ),
        featuresBlock,
        h(
          "section",
          {
            "data-section": "message",
            "aria-labelledby": `${idPrefix}-message`,
            className: BLOCK,
          },
          h("h2", { id: `${idPrefix}-message`, className: SECTION_TITLE }, "Mensaje"),
          h(
            "p",
            {
              className: "mt-3 italic leading-relaxed text-(color:--inv-ink)",
              style: { ...displayFontStyle(theme), fontSize: "1.05rem" },
            },
            message.text,
          ),
          message.hashtag === undefined
            ? null
            : h(
                "p",
                { className: "mt-3 text-sm font-medium text-(color:--inv-accent)" },
                message.hashtag,
              ),
          h(
            "p",
            {
              className: "mt-3 text-(color:--inv-accent)",
              style: { ...scriptStyle(themeKey), fontSize: "1.9rem", lineHeight: 1 },
            },
            message.signature,
          ),
        ),
        h(
          "section",
          {
            "data-section": "rsvp",
            "aria-labelledby": `${idPrefix}-rsvp`,
            className: BLOCK,
          },
          h("h2", { id: `${idPrefix}-rsvp`, className: ROW_LABEL }, "Confirma tu asistencia"),
          h(
            "p",
            { className: "mt-2 text-lg font-medium break-words text-(color:--inv-ink)" },
            rsvpContact,
          ),
        ),
        // The closing rule of the card: a foil hairline and the theme's own ornament, where no text sits.
        h("div", { key: "closing", className: "mt-7" }, h(FoilRule)),
        h(DecorationZone, {
          theme: themeKey,
          part: "footer",
          illustrationClassName: "pointer-events-none block",
          fallback: {
            node: h(ElegantOrnament, { ornament: theme.ornament }),
            className:
              "pointer-events-none mt-3 flex h-20 justify-center text-(color:--inv-decoration-one)",
          },
        }),
      ),
    ),
  );
}
