import { createElement, type ReactElement } from "react";

import type { IllustrationId } from "./types.ts";

/*
 * The shared primitives of the paper-cut technique (I3a; S4), mapped from the owner's artboard
 * `design/theme-illustrations/01-papel-recortado.html` to this project's renderer style. What makes a drawing
 * read as hand-cut paper, and what these helpers exist to keep consistent:
 *
 * - every element is its own cut sheet with a short offset shadow, never a symmetric glow;
 * - the top edge of a sheet is torn — an irregular line with notches of different depth, not a zigzag;
 * - tints come from `opacity` on a theme color, never from a color of their own;
 * - one `feTurbulence` grain is multiplied over a scene, so nothing stays flat vector.
 *
 * A theme drawing names its sheets and colors; it never writes a color literal, a filter, or a shadow by hand.
 */

const h = createElement;

/** The eight colors a drawing may paint with: the theme's seven tokens, plus its on-accent partner. */
export const THEME_PAINTS = [
  "var(--inv-background)",
  "var(--inv-surface)",
  "var(--inv-soft)",
  "var(--inv-ink)",
  "var(--inv-accent)",
  "var(--inv-decoration-one)",
  "var(--inv-decoration-two)",
  "var(--inv-on-accent)",
] as const;

export type ThemePaint = (typeof THEME_PAINTS)[number];

/** The offset of a cut sheet's shadow, in user units: 3–4 px at the drawing size of the layouts. */
const SHADOW_OFFSET = "translate(1.1 3.4)";

/** The color of every shadow: the theme ink, three-quarters transparent. */
const SHADOW_PAINT: ThemePaint = "var(--inv-ink)";

/** The hairline that separates two sheets of the same color, as the artboard's white cut highlight. */
const CUT_HIGHLIGHT: ThemePaint = "var(--inv-surface)";

export interface CutSheet {
  /** The sheet's name inside its drawing; the frame prefixes it with the render's unique id. */
  readonly name: string;
  /** The outline of the sheet, on the drawing area's own coordinates. */
  readonly d: string;
  readonly fill: ThemePaint;
  /** Whether the sheet casts the paper shadow. Default `true`; a tiny sheet or a plate sets `false`. */
  readonly shadow?: boolean;
  /** Whether the sheet carries the white cut highlight on its edge. Default `false`. */
  readonly outline?: boolean;
  /** A rotation or scale for a sheet that is drawn once and placed at an angle. */
  readonly transform?: string;
}

/**
 * The `<defs>` a drawing's `<use>` elements point at: one `<path>` per sheet, drawn once and reused for the
 * shadow, the fill, and the highlight, so a sheet is never repeated in the markup.
 */
export function sheetDefinitions(id: IllustrationId, sheets: readonly CutSheet[]): ReactElement {
  return h(
    "defs",
    { key: "sheet-definitions" },
    sheets.map((sheet) => h("path", { key: sheet.name, id: id(sheet.name), d: sheet.d })),
  );
}

/** The shadow, the sheet, and the optional highlight of each cut sheet, in the order they stack. */
export function cutSheets(id: IllustrationId, sheets: readonly CutSheet[]): ReactElement[] {
  return sheets.flatMap((sheet) => {
    const href = `#${id(sheet.name)}`;
    const placed = sheet.transform === undefined ? {} : { transform: sheet.transform };
    const stack: ReactElement[] = [];

    if (sheet.shadow !== false) {
      stack.push(
        h("use", {
          key: `${sheet.name}-shadow`,
          href,
          fill: SHADOW_PAINT,
          opacity: 0.14,
          transform:
            sheet.transform === undefined ? SHADOW_OFFSET : `${sheet.transform} ${SHADOW_OFFSET}`,
        }),
      );
    }
    stack.push(h("use", { key: sheet.name, href, fill: sheet.fill, ...placed }));
    if (sheet.outline === true) {
      stack.push(
        h("use", {
          key: `${sheet.name}-outline`,
          href,
          fill: "none",
          stroke: CUT_HIGHLIGHT,
          strokeWidth: 1,
          opacity: 0.22,
          ...placed,
        }),
      );
    }
    return stack;
  });
}

/** A torn edge: its open line, and the closed sheet that hangs from it. */
export interface TornEdge {
  /** The torn line itself, for a sheet that is only a band. */
  readonly edge: string;
  /** The same line closed down to `bottom`, for a sheet that fills the drawing. */
  readonly sheet: string;
}

/**
 * A hand-torn edge across `width`, around `base`: a slow wobble of a few tenths, a step of different depth
 * every twenty units, and one deeper notch. The result is deterministic (a fixed phase, not a random one), so
 * a page renders the same tear on every request and in every test.
 */
export function tornEdge(width: number, base: number, phase: number, bottom: number): TornEdge {
  const steps = Math.max(8, Math.round(width / 19));
  const points: string[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round((width * step) / steps);
    const wobble =
      1.7 * Math.sin(x / 8.4 + phase) +
      1.2 * Math.sin(x / 3.7 + phase * 2.1) +
      0.8 * Math.sin(x / 2.1 + phase * 3.3);
    // One notch of a different depth: the tear is not a regular wave either.
    const notch = Math.abs(x - Math.round(width * 0.62)) < 12 ? 2.4 : 0;
    const y = Math.round((base + wobble + notch) * 2) / 2;

    points.push(`${step === 0 ? "M" : "L"}${x} ${y}`);
  }
  return { edge: points.join(""), sheet: `${points.join("")}L${width} ${bottom}L0 ${bottom}Z` };
}

/**
 * The paper grain: one `fractalNoise` filter and a multiplied rectangle over the whole drawing. `id` comes
 * from the frame, so two invitations on one page never share it; the drawing names it `grain`.
 */
export function grain(id: IllustrationId, width: number, height: number): ReactElement[] {
  const filterId = id("grain");

  return [
    h(
      "filter",
      { key: "grain-filter", id: filterId, x: 0, y: 0, width: "100%", height: "100%" },
      h("feTurbulence", {
        type: "fractalNoise",
        baseFrequency: 0.85,
        numOctaves: 3,
        stitchTiles: "stitch",
      }),
      h("feColorMatrix", { type: "saturate", values: "0" }),
    ),
    h("rect", {
      key: "grain-overlay",
      width,
      height,
      filter: `url(#${filterId})`,
      opacity: 0.13,
      style: { mixBlendMode: "multiply" },
    }),
  ];
}
