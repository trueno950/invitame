import { createElement, type ReactElement } from "react";

import type { BirthdayMotif } from "../../../../lib/renderers/birthday-themes.ts";
import { MOTIF_PALETTES, type MotifPalette, MotifSvg, type MotifTone } from "../themed/motif.ts";

export type { MotifPalette, MotifTone } from "../themed/motif.ts";

/*
 * The original decorative motif of each theme (T6b; S5, S8), redrawn from
 * `design/kids-themes/01-tablero-temas.html`. These are our own shapes — flakes, claws, threads, dots,
 * ridges, bubbles, crowns, and blocks — never character artwork, a logo, or a protected name, and they carry
 * no meaning: every motif is a decorative SVG hidden from assistive technology (S5). `tone` picks the color
 * pair for the surface it sits on: white decoration on the accent band, ink and accent decoration on the
 * lighter paper.
 */

const h = createElement;

/** A five-pointed star path at `x`, `y`, the board's own four-unit star. */
function star(x: number, y: number): string {
  return `M${x} ${y}l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z`;
}

/** A snowflake: a cross with its two diagonals, drawn with round caps. */
function flake(x: number, y: number): string {
  return `M${x - 8} ${y}h16M${x} ${y - 8}v16M${x - 6} ${y - 6}l12 12M${x + 6} ${y - 6}l-12 12`;
}

/**
 * A paw print: one pad and three toes. `name` prefixes every key, because two paws share one `<g>` and a
 * repeated key among siblings makes React reconcile the wrong node.
 */
function paw(x: number, y: number, name: string): ReactElement[] {
  return [
    h("circle", { key: `${name}-pad`, cx: x, cy: y + 6, r: 7 }),
    h("circle", { key: `${name}-left`, cx: x - 8, cy: y - 4, r: 3 }),
    h("circle", { key: `${name}-top`, cx: x, cy: y - 8, r: 3 }),
    h("circle", { key: `${name}-right`, cx: x + 8, cy: y - 4, r: 3 }),
  ];
}

/** A mountain ridge of three peaks, the board's dinosaur ground. */
function ridge(x: number): string {
  return `M${x} 140l18-26 18 26 18-26 18 26 18-26 18 26z`;
}

function artwork(motif: BirthdayMotif, palette: MotifPalette): ReactElement[] {
  switch (motif) {
    case "flakes":
      return [
        h(
          "g",
          {
            key: "flakes",
            stroke: palette.light,
            strokeWidth: 2,
            strokeLinecap: "round",
            opacity: 0.45,
          },
          [
            h("path", { key: "a", d: flake(24, 24) }),
            h("path", { key: "b", d: flake(250, 30) }),
            h("path", { key: "c", d: flake(40, 110) }),
            h("path", { key: "d", d: flake(262, 104) }),
          ],
        ),
      ];
    case "paws":
      return [
        h("g", { key: "paws", fill: palette.light, opacity: 0.35 }, [
          ...paw(30, 30, "near"),
          ...paw(250, 100, "far"),
        ]),
        h("g", { key: "stars", fill: palette.two }, [
          h("path", { key: "a", d: star(250, 18) }),
          h("path", { key: "b", d: star(36, 96) }),
        ]),
      ];
    case "web":
      return [
        h(
          "g",
          {
            key: "web",
            fill: "none",
            stroke: palette.light,
            strokeWidth: 1.5,
            opacity: 0.35,
          },
          [
            h("path", { key: "rays", d: "M0 0l70 70M0 40l60 30M40 0l30 60" }),
            h("path", { key: "rings", d: "M14 0q6 14-14 14M30 0q10 30-30 30M50 0q14 50-50 50" }),
            h("path", { key: "mirrored", d: "M280 140l-70-70M280 100l-60-30M240 140l-30-60" }),
            h("path", { key: "mirrored-rings", d: "M266 140q-6-14 14-14M250 140q-10-30 30-30" }),
          ],
        ),
      ];
    case "dots":
      return [
        h(
          "g",
          { key: "dots", fill: palette.one, opacity: 0.9 },
          [
            [20, 20],
            [60, 110],
            [240, 24],
            [262, 90],
            [200, 120],
            [90, 14],
          ].map(([x = 0, y = 0], index) => h("circle", { key: index, cx: x, cy: y, r: 7 })),
        ),
      ];
    case "dino":
      return [
        h("g", { key: "ridges", fill: palette.one, opacity: 0.85 }, [
          h("path", { key: "left", d: ridge(0) }),
          h("path", { key: "right", d: ridge(190) }),
        ]),
        h("g", { key: "eggs", fill: palette.light, opacity: 0.35 }, [
          h("ellipse", { key: "a", cx: 34, cy: 30, rx: 7, ry: 10 }),
          h("ellipse", { key: "b", cx: 250, cy: 40, rx: 7, ry: 10 }),
        ]),
      ];
    case "bubbles":
      return [
        h(
          "g",
          {
            key: "bubbles",
            fill: "none",
            stroke: palette.light,
            strokeWidth: 2,
            opacity: 0.5,
          },
          (
            [
              [22, 30, 8],
              [36, 58, 5],
              [250, 24, 10],
              [262, 56, 6],
              [240, 112, 7],
            ] as const
          ).map(([x, y, r], index) => h("circle", { key: index, cx: x, cy: y, r })),
        ),
        h("g", { key: "waves", fill: palette.two, opacity: 0.8 }, [
          h("path", { key: "left", d: "M0 140q20-24 40 0q20-24 40 0z" }),
          h("path", { key: "right", d: "M200 140q20-24 40 0q20-24 40 0z" }),
        ]),
      ];
    case "crown":
      return [
        h("g", { key: "crowns", fill: palette.two }, [
          h("path", { key: "a", d: "M18 34l6-14 8 9 8-9 6 14z" }),
          h("path", { key: "b", d: "M244 120l6-14 8 9 8-9 6 14z" }),
        ]),
        h("g", { key: "stars", fill: palette.light, opacity: 0.5 }, [
          h("path", { key: "a", d: star(250, 22) }),
          h("path", { key: "b", d: star(40, 104) }),
        ]),
      ];
    case "blocks":
      return [
        h(
          "g",
          { key: "blocks", opacity: 0.85 },
          [
            [0, 112, palette.one],
            [24, 112, palette.two],
            [0, 88, palette.two],
            [256, 0, palette.one],
            [232, 0, palette.two],
            [256, 24, palette.two],
          ].map(([x = 0, y = 0, fill = palette.one], index) =>
            h("rect", {
              key: index,
              x,
              y,
              width: 24,
              height: 24,
              fill,
              stroke: "#ffffff",
              strokeOpacity: 0.4,
            }),
          ),
        ),
      ];
  }
}

export interface MotifProps {
  readonly motif: BirthdayMotif;
  /** `accent` for the accent band (on-accent decoration), `paper` for the light surfaces. */
  readonly tone?: MotifTone;
  readonly className?: string;
}

/**
 * The decorative motif of the theme, as one `aria-hidden` SVG drawn by the shared `MotifSvg` frame. It
 * repeats the board's 280 × 140 drawing area and is drawn with `xMidYMid meet`, so its shapes keep their
 * proportions in any box; the layouts place it in a short, fixed-height strip at an edge where no text sits
 * (docs/design/theme.md), never under live text.
 */
export function Motif({ motif, tone = "accent", className }: MotifProps): ReactElement {
  return MotifSvg({ motif, className, children: artwork(motif, MOTIF_PALETTES[tone]) });
}
