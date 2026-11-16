import { type CSSProperties, createElement, type ReactElement, useId } from "react";

import type { EventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import {
  ARCH_SCRIM_INK_PERCENT,
  type ElegantTheme,
} from "../../../../lib/renderers/elegant-themes.ts";
import { formatLongDate } from "../../../../lib/renderers/invitation-fields.ts";
import { InvitationFeaturesBlock } from "../../invitation-features/invitation-features-block.ts";
import { DecorationZone } from "../illustrations/decoration.ts";
import {
  BACKGROUND_LAYER,
  displayFontStyle,
  INVITATION_ROOT,
  themeStyle,
  titleStyle,
} from "../themed/theme.ts";
import { ElegantOrnament } from "./elegant-ornament.ts";

/*
 * The one arch layout of the elegant line (E3c; S3, S4), «Arco y foto»: the photo opens the invitation in
 * an arch, the name sits over a measured scrim, and the rest of the invitation reads as elegant cards. The
 * three occasions share this component because they share one visual direction; each keeps its own folder,
 * parser, and copy, and passes the same typed view model here.
 *
 * Every color, the display font, and the ornament come from the theme through CSS variables, so one layout
 * serves all eight themes. The name is the on-accent white over a scrim of the theme's ink at
 * `ARCH_SCRIM_INK_PERCENT`; without a photo the arch shows a theme-colored wash with the theme's ornament in
 * its upper half, where the name never reaches. Decoration lives in its own zones — never inside the flow of
 * a text section — and no client script is involved.
 */

const h = createElement;

/** The smallest text of the arch, at the tracked sizes the board uses. */
const KICKER = "text-[0.62rem] font-medium uppercase tracking-[0.3em]";
const SECTION_TITLE =
  "text-center text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-(color:--inv-accent)";
const CARD =
  "rounded-[1.25rem] border border-(--inv-decoration-two) bg-(--inv-surface) px-5 py-5 shadow-sm";
const ROW_LABEL = "text-[0.6rem] font-medium uppercase tracking-[0.16em] text-(color:--inv-accent)";
const VALUE = "mt-1 text-lg leading-tight break-words text-(color:--inv-ink)";

/** The scrim: the theme's ink, strongest under the name and fading towards the top of the arch. */
const SCRIM_STYLE: CSSProperties = {
  backgroundImage: [
    `linear-gradient(to top, color-mix(in srgb, var(--inv-ink) ${ARCH_SCRIM_INK_PERCENT}%, transparent) 0%`,
    `color-mix(in srgb, var(--inv-ink) ${ARCH_SCRIM_INK_PERCENT}%, transparent) 24%`,
    "color-mix(in srgb, var(--inv-ink) 56%, transparent) 48%",
    "color-mix(in srgb, var(--inv-ink) 24%, transparent) 68%",
    "transparent 92%)",
  ].join(", "),
};

/** The wash that stands in for the photo: the theme's surfaces, light at the top. */
const WASH_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(180deg, var(--inv-surface) 0%, var(--inv-soft) 58%, var(--inv-background) 100%)",
};

/** One row of the family card: a Spanish label and its names, one per line. */
export interface ArchNameRow {
  readonly key: string;
  readonly label: string;
  readonly values: readonly string[];
}

/** One card of the family block, dressed by the shared layout. */
export type ArchPlaceKey = "ceremony" | "reception";

/** One place of the day: its label, its name and address, and the hour it starts. */
export interface ArchPlace {
  readonly key: ArchPlaceKey;
  /** «Misa», «Ceremonia», or «Recepción». */
  readonly label: string;
  readonly place: string;
  readonly address: string;
  /** A time as `HH:MM`. */
  readonly time: string;
}

/** One label/value pair of the details card: the dress code and the gift registry. */
export interface ArchDetail {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** The message card, with the signature and the wedding's hashtag when the couple has one. */
export interface ArchMessage {
  readonly text: string;
  readonly signature: string;
  readonly hashtag?: string;
}

export interface ArchLayoutProperties {
  /** The allow-listed renderer key this view belongs to, as the markup exposes it. */
  readonly componentKey: string;
  readonly theme: ElegantTheme;
  /** The theme key, so the markup carries `data-theme` and a test can pin it. */
  readonly themeKey: string;
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

/** The initials of the lockup, as the wax seal shows them: «V», or «A·D» for a couple. */
function monogramOf(names: readonly string[]): string {
  return names
    .map((name) => (name.trim().charAt(0) || "").toUpperCase())
    .filter((initial) => initial !== "")
    .join("·");
}

/** The lockup's names: one line for a celebration, two lines joined by «y» for a couple. */
function nameLockup(theme: ElegantTheme, id: string, names: readonly string[]): ReactElement {
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

  return h("h1", { id, className: "mt-2", style: titleStyle(theme) }, children);
}

/** The little church or glass of a place card: decoration, so it is hidden from assistive technology. */
function PlaceIcon({ place }: { place: ArchPlaceKey }): ReactElement {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      focusable: "false",
      viewBox: "0 0 34 34",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "data-place-icon": place,
      className: "block size-8",
    },
    place === "ceremony"
      ? [
          h("path", { key: "walls", d: "M4 31V14L17 4l13 10v17" }),
          h("path", { key: "door", d: "M10 31V19a7 7 0 0 1 14 0v12" }),
          h("path", { key: "floor", d: "M4 31h26" }),
          h("path", { key: "cross", d: "M17 8v5M15 10.5h4" }),
        ]
      : [
          h("path", { key: "bowl", d: "M10 4h10l-1.4 10a3.6 3.6 0 0 1-7.2 0z" }),
          h("path", { key: "stem", d: "M15 18v11M11 29h8" }),
          h("path", { key: "pitch", d: "M23 8c4 2 6 6 6 10 0 3-2 5-4 5" }),
          h("path", { key: "fizz", d: "M25 14c2 1 3 3 3 5" }),
        ],
  );
}

/** One place card: its drawing, its label, the place, the address, and the hour. */
function placeCard(
  theme: ElegantTheme,
  idPrefix: string,
  place: ArchPlace,
  offset: boolean,
): ReactElement {
  return h(
    "section",
    {
      "data-section": place.key,
      "aria-labelledby": `${idPrefix}-${place.key}`,
      className: offset ? "mt-4 ml-4" : undefined,
    },
    h(
      "div",
      { className: CARD },
      h(
        "span",
        { className: "block text-(color:--inv-decoration-one)" },
        h(PlaceIcon, { place: place.key }),
      ),
      h("h2", { id: `${idPrefix}-${place.key}`, className: `${ROW_LABEL} mt-3` }, place.label),
      h(
        "p",
        {
          className: "mt-1 text-2xl leading-tight break-words text-(color:--inv-ink)",
          style: displayFontStyle(theme),
        },
        place.place,
      ),
      h(
        "address",
        {
          className:
            "mt-1 text-sm leading-relaxed break-words not-italic text-(color:--inv-accent)",
        },
        place.address,
      ),
      h(
        "p",
        {
          className:
            "mt-3 inline-block rounded-full bg-(--inv-soft) px-3 py-1 text-sm font-medium text-(color:--inv-accent)",
        },
        h("time", { dateTime: place.time }, `${place.time} h`),
      ),
    ),
  );
}

export function ArchLayout({
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
}: ArchLayoutProperties): ReactElement {
  const idPrefix = useId();
  const monogram = monogramOf(names);

  // After the two place cards and the details and before the message: the ceremony, the reception, and how
  // to reach them, then what a guest can act on (S4).
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
      className: `${INVITATION_ROOT} gap-5 px-5 py-6`,
      style: themeStyle(theme),
    },
    // The theme background paints the page, not only the centred column: the guest `<main>` is `isolate`, so
    // a viewport-sized layer at `-z-10` stays behind this invitation and above the site paper.
    h("div", {
      "aria-hidden": "true",
      "data-invitation-background": "",
      className: BACKGROUND_LAYER,
    }),
    // The arch takes the whole width of the sheet, so it hangs outside the root's padding. Without a photo
    // the wash carries the theme's ornament in its upper half; the name only ever reaches the scrim below.
    h(
      "section",
      {
        "data-section": "hero",
        "aria-labelledby": `${idPrefix}-hero`,
        className: "-mx-5 -mt-6",
      },
      h(
        "figure",
        {
          className:
            "relative m-0 h-[32rem] overflow-hidden rounded-t-[10rem] rounded-b-2xl bg-(--inv-soft)",
        },
        mainPhoto === undefined
          ? h("div", {
              key: "wash",
              "aria-hidden": "true",
              "data-hero-wash": "",
              className: "absolute inset-0",
              style: WASH_STYLE,
            })
          : h("img", {
              key: "photo",
              "data-hero-photo": "",
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
                className:
                  "pointer-events-none absolute inset-x-12 top-10 h-44 text-(color:--inv-decoration-one)",
              },
              h(ElegantOrnament, { ornament: theme.ornament }),
            )
          : null,
        h("span", {
          key: "scrim",
          "aria-hidden": "true",
          "data-arch-scrim": "",
          className: "absolute inset-0",
          style: SCRIM_STYLE,
        }),
        h("span", {
          key: "inset",
          "aria-hidden": "true",
          className:
            "pointer-events-none absolute inset-3 rounded-t-[8.75rem] rounded-b-xl border border-(--inv-decoration-two)",
        }),
        h(
          "div",
          {
            key: "lockup",
            "data-lockup": "",
            className: "absolute inset-x-7 bottom-8 text-center text-(color:--inv-on-accent)",
          },
          h("p", { className: KICKER }, kicker),
          nameLockup(theme, `${idPrefix}-hero`, names),
          h(
            "p",
            { className: `${KICKER} mt-4` },
            h("time", { dateTime: date }, formatLongDate(date)),
          ),
        ),
      ),
    ),
    // The wax seal overlaps the arch, as a stamp would; it is decoration for a screen reader.
    monogram === ""
      ? null
      : h(
          "div",
          {
            "data-seal": "",
            "aria-hidden": "true",
            className:
              "relative z-10 mx-auto -mt-9 grid size-[4.5rem] place-items-center rounded-full bg-(--inv-surface) text-3xl leading-none text-(color:--inv-accent) shadow-md",
            style: displayFontStyle(theme),
          },
          h("span", {
            key: "ring",
            className:
              "pointer-events-none absolute inset-[5px] rounded-full border border-(--inv-decoration-two)",
          }),
          h("span", { key: "monogram", className: "pb-1" }, monogram),
        ),
    family.length === 0
      ? null
      : h(
          "section",
          { "data-section": "family", "aria-labelledby": `${idPrefix}-family` },
          h("h2", { id: `${idPrefix}-family`, className: SECTION_TITLE }, "La familia"),
          h(
            "div",
            {
              className:
                "mt-3 rounded-[1.25rem] border border-(--inv-decoration-two) bg-(--inv-surface) shadow-sm",
            },
            h(
              "dl",
              { className: "flex flex-col" },
              family.flatMap((row, index) => [
                h(
                  "div",
                  {
                    key: `${row.key}-row`,
                    className: `grid grid-cols-[5.5rem_1fr] gap-3 px-5 py-4 ${index === 0 ? "" : "border-t border-(--inv-decoration-two)"}`,
                  },
                  h("dt", { key: `${row.key}-label`, className: ROW_LABEL }, row.label),
                  h(
                    "dd",
                    { key: `${row.key}-value`, className: "m-0 text-(color:--inv-ink)" },
                    row.values.map((value, line) =>
                      h(
                        "span",
                        {
                          key: `${row.key}-line-${line}`,
                          "data-name-line": "",
                          className: "block text-lg leading-snug",
                        },
                        value,
                      ),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ),
    placeCard(theme, idPrefix, ceremony, false),
    placeCard(theme, idPrefix, reception, true),
    details.length === 0
      ? null
      : h(
          "section",
          { "data-section": "details", "aria-labelledby": `${idPrefix}-details` },
          h("h2", { id: `${idPrefix}-details`, className: SECTION_TITLE }, "Detalles"),
          h(
            "div",
            {
              className: `${CARD} mt-3 ${details.length > 1 ? "grid grid-cols-2 gap-4" : ""}`,
            },
            details.map((detail, index) =>
              h(
                "div",
                {
                  key: detail.key,
                  className:
                    index === 0 ? undefined : "border-l border-(--inv-decoration-two) pl-4",
                },
                h("p", { className: ROW_LABEL }, detail.label),
                h("p", { className: VALUE, style: displayFontStyle(theme) }, detail.value),
              ),
            ),
          ),
        ),
    featuresBlock,
    h(
      "section",
      { "data-section": "message", "aria-labelledby": `${idPrefix}-message` },
      h("h2", { id: `${idPrefix}-message`, className: SECTION_TITLE }, "Mensaje"),
      h(
        "div",
        { className: "mt-3 rounded-[1.5rem] bg-(--inv-soft) px-5 py-6 text-center" },
        h(
          "p",
          {
            className: "text-lg leading-relaxed text-(color:--inv-ink)",
            style: displayFontStyle(theme),
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
            className: "mt-4 text-2xl text-(color:--inv-accent)",
            style: displayFontStyle(theme),
          },
          message.signature,
        ),
      ),
    ),
    h(
      "section",
      { "data-section": "rsvp", "aria-labelledby": `${idPrefix}-rsvp` },
      h(
        "div",
        { className: `${CARD} text-center` },
        h("h2", { id: `${idPrefix}-rsvp`, className: ROW_LABEL }, "Confirma tu asistencia"),
        h(
          "p",
          { className: "mt-2 text-lg font-medium break-words text-(color:--inv-ink)" },
          rsvpContact,
        ),
      ),
    ),
    // The closing rule of the theme: its own ornament in a strip below the last card, where no text sits.
    h(DecorationZone, {
      theme: themeKey,
      part: "footer",
      illustrationClassName: "pointer-events-none -mx-5 -mb-6 block",
      fallback: {
        node: h(ElegantOrnament, { ornament: theme.ornament }),
        className:
          "pointer-events-none -mx-5 -mb-6 flex h-20 justify-center text-(color:--inv-decoration-one)",
      },
    }),
  );
}
