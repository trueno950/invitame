import { type CSSProperties, createElement, type ReactElement } from "react";

/**
 * The original fine-line artwork of «Ornamental — papelería clásica» (E4b; S5), redrawn from
 * `design/elegant-line/02-ornamental.html`: a laurel spray for the monogram, a corner sprig for the
 * stationery card, and a foil-like hairline with a faceted diamond.
 *
 * These are our own single-stroke drawings — never the Artboard's markup, a logo, or a protected name. A
 * color only ever reaches a shape through the theme variables `--inv-decoration-one` and
 * `--inv-decoration-two`, so one drawing serves all eight themes, and every piece here is decoration: an
 * `aria-hidden` shape that carries no text and is drawn with `xMidYMid meet`.
 */

const h = createElement;

/** The foil: the two decoration colors of the theme as a flat gradient, never a metallic image. */
export const FOIL_STYLE: CSSProperties = {
  backgroundImage:
    "linear-gradient(100deg, var(--inv-decoration-one) 0%, var(--inv-decoration-two) 34%, var(--inv-decoration-one) 60%, var(--inv-decoration-two) 84%, var(--inv-decoration-one) 100%)",
};

/** The stem of the laurel spray, and the leaves it carries, as our own coordinates. */
const LAUREL_STEM = "M30 94C16 80 8 58 12 26C13.6 15 16.8 7 21 1";
const LAUREL_LEAVES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [10, 74, 8.4, 3, -24],
  [7, 62, 8.6, 3.1, -8],
  [7, 50, 8.4, 3, 8],
  [9.4, 39, 8, 2.9, 24],
  [13.4, 29, 7.4, 2.7, 40],
  [18, 20, 6.8, 2.5, 56],
  [22.6, 12, 6, 2.2, 70],
  [18, 68, 6.4, 2.3, 62],
  [17, 52, 6.6, 2.4, 78],
  [19, 37, 6.2, 2.2, 94],
];
const LAUREL_BERRIES: ReadonlyArray<readonly [number, number, number]> = [
  [12, 86, 2.4],
  [20, 44, 1.6],
  [21, 30, 1.4],
];

export interface LaurelSprayProperties {
  /** Which side of the monogram the spray opens towards; the right one is the mirrored drawing. */
  readonly side: "left" | "right";
}

/** One laurel spray: the monogram's arms, drawn once and mirrored for the other side. */
export function LaurelSpray({ side }: LaurelSprayProperties): ReactElement {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      focusable: "false",
      "data-laurel": side,
      viewBox: "0 0 34 96",
      preserveAspectRatio: "xMidYMid meet",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: side === "right" ? { transform: "scaleX(-1)" } : undefined,
      className: "block h-full w-full",
    },
    [
      h("path", { key: "stem", d: LAUREL_STEM }),
      ...LAUREL_LEAVES.map(([cx, cy, rx, ry, rotate], index) =>
        h("ellipse", {
          key: `leaf-${index}`,
          cx,
          cy,
          rx,
          ry,
          transform: `rotate(${rotate} ${cx} ${cy})`,
        }),
      ),
      ...LAUREL_BERRIES.map(([cx, cy, r], index) =>
        h("circle", { key: `berry-${index}`, cx, cy, r }),
      ),
    ],
  );
}

export type CardCorner = "tl" | "tr" | "bl" | "br";

/** The mirror of each corner, so one sprig is drawn once and reflected into the four corners. */
const CORNER_TRANSFORM: Readonly<Record<CardCorner, string | undefined>> = {
  tl: undefined,
  tr: "scaleX(-1)",
  bl: "scaleY(-1)",
  br: "scale(-1, -1)",
};

export interface CornerSprigProperties {
  readonly corner: CardCorner;
}

/**
 * One corner sprig of the stationery card: a stem with thin leaves and two berries, reflected into each
 * corner. The card's own padding keeps the four sprigs above and below the text column.
 */
export function CornerSprig({ corner }: CornerSprigProperties): ReactElement {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      focusable: "false",
      "data-corner-sprig": corner,
      viewBox: "0 0 72 72",
      preserveAspectRatio: "xMidYMid meet",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style:
        CORNER_TRANSFORM[corner] === undefined
          ? undefined
          : { transform: CORNER_TRANSFORM[corner] },
      className: "block h-full w-full",
    },
    [
      h("path", { key: "stem", d: "M4 12C20 13 38 28 58 50" }),
      ...[
        [14.3, 10.1, 5.2, 1.9, -30],
        [17, 19.6, 5, 1.8, 70],
        [26, 16.4, 4.8, 1.7, -15],
        [27.7, 26.2, 4.5, 1.6, 82],
        [37.6, 26, 4.3, 1.5, -6],
        [39.6, 36.2, 4.1, 1.5, 89],
        [50.2, 38.4, 3.9, 1.4, 0],
        [52.6, 49, 3.7, 1.3, 94],
      ].map(([cx, cy, rx, ry, rotate], index) =>
        h("ellipse", {
          key: `leaf-${index}`,
          cx,
          cy,
          rx,
          ry,
          transform: `rotate(${rotate} ${cx} ${cy})`,
        }),
      ),
      h("circle", { key: "berry-one", cx: 58, cy: 50, r: 1.9 }),
      h("circle", { key: "berry-two", cx: 6, cy: 7, r: 1.2 }),
      h("path", { key: "tip", d: "M6 7c5-2 8-1 10 2" }),
    ],
  );
}

/** The foil-like hairline between blocks: two gradient rules and a faceted diamond in the middle. */
export function FoilRule(): ReactElement {
  return h(
    "div",
    {
      "aria-hidden": "true",
      "data-decoration": "",
      "data-foil-rule": "",
      className: "flex w-full items-center justify-center gap-3",
    },
    h("span", {
      key: "left",
      className: "h-px w-[38%] max-w-24",
      style: FOIL_STYLE,
    }),
    h(
      "svg",
      {
        key: "diamond",
        "aria-hidden": "true",
        focusable: "false",
        "data-foil-diamond": "",
        viewBox: "0 0 14 14",
        fill: "none",
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 1,
        strokeLinejoin: "round",
        className: "size-2.5 shrink-0",
      },
      h("path", { d: "M7 1l6 6-6 6-6-6z" }),
    ),
    h("span", {
      key: "right",
      className: "h-px w-[38%] max-w-24",
      style: FOIL_STYLE,
    }),
  );
}
