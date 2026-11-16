import { createElement, type ReactElement } from "react";

import {
  type CutSheet,
  cutSheets,
  grain,
  sheetDefinitions,
  type ThemePaint,
  tornEdge,
} from "./primitives.ts";
import type { IllustrationId, ThemeIllustration } from "./types.ts";

/*
 * «Luz de estrella» in paper cut-out (I3d; S1-S4, style 01 of `design/theme-illustrations/01-papel-recortado.html`):
 * the night of the theme's own artboard — a quiet landscape under an eight-point star, its rays, a sky of small
 * stars, and a trio of candles on the front hill (S3). No cross, no church, no logo: light is the only symbol.
 *
 * The star is generated from its radii instead of hand-listed, so its eight points are even and its inner
 * radius is the same on every side. Every color is a theme variable of `star-light`; tints are `opacity` on a
 * theme color, and the night sky is the theme ink itself.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

const INK: ThemePaint = "var(--inv-ink)";
const SURFACE: ThemePaint = "var(--inv-surface)";
const SOFT: ThemePaint = "var(--inv-soft)";
const ACCENT: ThemePaint = "var(--inv-accent)";
const GOLD: ThemePaint = "var(--inv-decoration-one)";
const STEEL: ThemePaint = "var(--inv-decoration-two)";

/** One placed copy of a reusable shape: where it sits, how it turns, and how big it is. */
interface Stamp {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale?: number;
}

/** How a stamped group is drawn: its key name, whether it casts a shadow, and its cut hairline. */
interface StampOptions {
  readonly group?: string;
  readonly shadow?: boolean;
  readonly edge?: number;
  readonly opacity?: number;
}

/**
 * A reusable shape placed many times — rays, small stars, candle wax — in one stamped group with one offset
 * shadow behind it. A night scene turns the shadow off on the tiny shapes, where it would only muddy the ink.
 */
function stamped(
  id: IllustrationId,
  shape: string,
  places: readonly Stamp[],
  paint: ThemePaint,
  options: StampOptions = {},
): ReactElement[] {
  const group = (key: string, attributes: Record<string, unknown>): ReactElement =>
    h(
      "g",
      { key, ...attributes },
      places.map((place) =>
        h("use", {
          key: `${place.x}-${place.y}-${place.rotate}`,
          href: `#${id(shape)}`,
          transform:
            `translate(${place.x} ${place.y}) rotate(${place.rotate})` +
            (place.scale === undefined ? "" : ` scale(${place.scale})`),
        }),
      ),
    );
  const prefix = `${options.group ?? shape}-${paint}`;

  return [
    ...(options.shadow === false
      ? []
      : [
          group(`${prefix}-shadow`, {
            fill: INK,
            opacity: 0.12,
            transform: "translate(1.2 3.4)",
          }),
        ]),
    group(prefix, {
      fill: paint,
      ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
    }),
    ...(options.edge === undefined
      ? []
      : [
          group(`${prefix}-edge`, {
            fill: "none",
            stroke: INK,
            strokeWidth: options.edge,
            opacity: 0.16,
          }),
        ]),
  ];
}

/** A regular star of `points` points, from its centre, its outer radius, and its inner radius. */
function starPath(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const steps: string[] = [];

  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / points - Math.PI / 2;
    const x = Math.round((cx + radius * Math.cos(angle)) * 10) / 10;
    const y = Math.round((cy + radius * Math.sin(angle)) * 10) / 10;

    steps.push(`${index === 0 ? "M" : "L"}${x} ${y}`);
  }
  return `${steps.join("")}Z`;
}

/** The sky sheet: the torn night paper the whole diorama is built on. */
const SKY_TEAR_BASE = 10;

/** The eight-point star of the theme, and the smaller copy that lights the divider and the footer. */
const STAR = starPath(258, 62, 31, 11.5, 8);
const SMALL_STAR = starPath(0, 0, 18, 6.5, 8);

/**
 * A ray of the star: a soft tapered sliver that continues a point of the star into the night, with a rounded
 * far end so it glows instead of spiking like a compass needle.
 */
const RAY = "M-2.2-30C-2.4-38-1.2-44 0-45C1.2-44 2.4-38 2.2-30Z";

/**
 * The eight rays, one past the tip of each point of the star, in uneven lengths: a halo of light, not a
 * symmetrical compass rose.
 */
const STAR_RAYS: readonly Stamp[] = [
  { x: 258, y: 62, rotate: 0, scale: 1.14 },
  { x: 258, y: 62, rotate: 45, scale: 0.72 },
  { x: 258, y: 62, rotate: 90, scale: 1.02 },
  { x: 258, y: 62, rotate: 135, scale: 0.64 },
  { x: 258, y: 62, rotate: 180, scale: 1.06 },
  { x: 258, y: 62, rotate: 225, scale: 0.76 },
  { x: 258, y: 62, rotate: 270, scale: 0.9 },
  { x: 258, y: 62, rotate: 315, scale: 0.68 },
];

/** A small star of the sky: four points, the quietest mark the theme draws. */
const SPARKLE = "M0-6L1.3-1.3 6 0 1.3 1.3 0 6-1.3 1.3-6 0-1.3-1.3Z";

const SKY_SPARKLES: readonly Stamp[] = [
  { x: 56, y: 40, rotate: 0, scale: 1 },
  { x: 96, y: 22, rotate: 0, scale: 0.7 },
  { x: 132, y: 62, rotate: 0, scale: 0.55 },
  { x: 168, y: 30, rotate: 0, scale: 0.8 },
  { x: 200, y: 82, rotate: 0, scale: 0.5 },
  { x: 318, y: 36, rotate: 0, scale: 0.9 },
  { x: 346, y: 74, rotate: 0, scale: 0.6 },
  { x: 226, y: 24, rotate: 0, scale: 0.45 },
  { x: 78, y: 86, rotate: 0, scale: 0.42 },
  { x: 300, y: 102, rotate: 0, scale: 0.38 },
];

/** The far ridge and the near hill: two teal silhouettes, the moonlit front one in the steel of the palette. */
const RIDGE_FAR =
  "M-8 158C10 146 30 134 52 130C74 126 92 134 112 138C132 142 152 138 172 132C192 126 214 128 234 " +
  "136C254 144 276 150 298 148C320 146 342 138 362 136C382 134 392 140 398 138L398 206L-8 206Z";

const HILL_NEAR =
  "M-8 178C14 172 38 162 62 160C86 158 108 164 132 168C156 172 180 174 204 172C228 170 250 162 274 " +
  "160C298 158 324 164 348 168C372 172 386 174 398 172L398 206L-8 206Z";

/** A fir on the far ridge: three tiers of paper, base at the origin. */
const FIR = "M0 0L-7-11L-3-11L-9-21L-4-21L-11-32L11-32L4-21L9-21L3-11L7-11Z";

/** The six firs along the ridge: two groups, at three sizes, so the tree line is not a row of stamps. */
const FIRS: readonly Stamp[] = [
  { x: 44, y: 156, rotate: 0, scale: 1 },
  { x: 66, y: 160, rotate: 0, scale: 0.8 },
  { x: 84, y: 157, rotate: 0, scale: 1.1 },
  { x: 300, y: 158, rotate: 0, scale: 0.9 },
  { x: 322, y: 155, rotate: 0, scale: 1.05 },
  { x: 342, y: 159, rotate: 0, scale: 0.75 },
];

/** A candle: its wax from the base at the origin up 29 units, and its flame floating above the wick. */
const WAX = "M-5 0C-5-2-3-3 0-3C3-3 5-2 5 0L5-26C5-28 3-29 0-29C-3-29-5-28-5-26Z";
const WICK = "M-0.7-34C-0.7-35.4 0.7-35.4 0.7-34L0.7-29L-0.7-29Z";
const FLAME =
  "M0-41C3.4-37.4 4.2-33.8 2.6-31.6C1.7-30.2-1.7-30.2-2.6-31.6C-4.2-33.8-3.4-37.4 0-41Z";

/** One candle on the ground: where it stands and how tall it is. */
interface Candle {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

const SCENE_CANDLES: readonly Candle[] = [
  { x: 98, y: 188, scale: 1 },
  { x: 126, y: 192, scale: 0.78 },
  { x: 154, y: 186, scale: 0.9 },
  { x: 286, y: 190, scale: 0.94 },
  { x: 314, y: 186, scale: 0.7 },
];

/** The header diorama: night sky, the star and its rays, small stars, two ridges, and the candles. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, SKY_TEAR_BASE, 2.1, SCENE_HEIGHT + 8);
  const sky: CutSheet = { name: "sky", d: tear.sheet, fill: INK, shadow: false };
  const star: CutSheet = { name: "star", d: STAR, fill: GOLD, shadow: false };
  const ridgeFar: CutSheet = { name: "ridge-far", d: RIDGE_FAR, fill: ACCENT };
  const hillNear: CutSheet = { name: "hill-near", d: HILL_NEAR, fill: STEEL };
  const sheets: readonly CutSheet[] = [sky, star, ridgeFar, hillNear];

  return [
    sheetDefinitions(id, sheets),
    h(
      "defs",
      { key: "stamp-definitions" },
      h("path", { id: id("ray"), d: RAY }),
      h("path", { id: id("sparkle"), d: SPARKLE }),
      h("path", { id: id("wax"), d: WAX }),
      h("path", { id: id("wick"), d: WICK }),
      h("path", { id: id("flame"), d: FLAME }),
      h("path", { id: id("fir"), d: FIR }),
    ),
    // The night sheet, with a lighter torn edge so the paper's cut still reads on the dark.
    ...cutSheets(id, [sky]),
    h("use", {
      key: "torn-line",
      href: `#${id(sky.name)}`,
      fill: "none",
      stroke: ACCENT,
      strokeWidth: 1.2,
      opacity: 0.55,
    }),
    // The small stars go behind the big one.
    ...stamped(id, "sparkle", SKY_SPARKLES, SURFACE, { group: "sky-small-stars", shadow: false }),
    // The star: a soft halo copy behind it, its rays, then the gold sheet itself.
    h("use", {
      key: "star-halo",
      href: `#${id(star.name)}`,
      fill: GOLD,
      opacity: 0.2,
      transform: "translate(258 62) scale(1.42) translate(-258 -62)",
    }),
    ...stamped(id, "ray", STAR_RAYS, GOLD, {
      group: "star-rays",
      shadow: false,
      opacity: 0.5,
    }),
    ...cutSheets(id, [star]),
    h("use", {
      key: "star-inner",
      href: `#${id(star.name)}`,
      fill: SURFACE,
      opacity: 0.45,
      transform: "translate(258 62) scale(0.24) translate(-258 -62)",
    }),
    ...stamped(
      id,
      "sparkle",
      [
        { x: 240, y: 44, rotate: 0, scale: 0.34 },
        { x: 276, y: 38, rotate: 0, scale: 0.28 },
      ],
      SURFACE,
      { group: "star-glints", shadow: false },
    ),
    ...cutSheets(id, [ridgeFar]),
    // A tree line on the far ridge, darker than the ridge and lighter than the sky.
    ...stamped(id, "fir", FIRS, INK, { group: "firs", shadow: false, opacity: 0.5 }),
    ...cutSheets(id, [hillNear]),
    // The candles: a warm glow, the cut wax, and the flame in the gold of the star.
    h(
      "g",
      { key: "candle-glow", fill: GOLD, opacity: 0.12 },
      SCENE_CANDLES.map((candle) =>
        h("circle", {
          key: `${candle.x}-glow`,
          cx: candle.x,
          cy: candle.y - 32 * candle.scale,
          r: 9 * candle.scale,
        }),
      ),
    ),
    ...stamped(
      id,
      "wax",
      SCENE_CANDLES.map((candle) => ({
        x: candle.x,
        y: candle.y,
        rotate: 0,
        scale: candle.scale,
      })),
      SURFACE,
      { group: "candle-wax", shadow: false, edge: 0.9 },
    ),
    ...stamped(
      id,
      "wick",
      SCENE_CANDLES.map((candle) => ({
        x: candle.x,
        y: candle.y,
        rotate: 0,
        scale: candle.scale,
      })),
      INK,
      { group: "candle-wick", shadow: false },
    ),
    ...stamped(
      id,
      "flame",
      SCENE_CANDLES.map((candle) => ({
        x: candle.x,
        y: candle.y,
        rotate: 0,
        scale: candle.scale,
      })),
      GOLD,
      { group: "candle-flame", shadow: false },
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a light strip with a small eight-point star, its rays, and a few small stars. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 30, 4.6, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 7.1, DIVIDER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: SOFT, shadow: false };
  const wash: CutSheet = { name: "wash", d: under.sheet, fill: GOLD, shadow: false };
  const star: CutSheet = {
    name: "divider-star",
    d: SMALL_STAR,
    fill: GOLD,
    transform: "translate(195 34)",
  };

  return [
    sheetDefinitions(id, [strip, wash, star]),
    h(
      "defs",
      { key: "divider-stamp-definitions" },
      h("path", { id: id("divider-sparkle"), d: SPARKLE }),
    ),
    ...cutSheets(id, [strip]),
    h("use", { key: "wash-tint", href: `#${id(wash.name)}`, fill: GOLD, opacity: 0.2 }),
    ...stamped(
      id,
      "divider-sparkle",
      [
        { x: 72, y: 28, rotate: 0, scale: 0.7 },
        { x: 112, y: 40, rotate: 0, scale: 0.45 },
        { x: 148, y: 22, rotate: 0, scale: 0.4 },
        { x: 244, y: 24, rotate: 0, scale: 0.42 },
        { x: 282, y: 38, rotate: 0, scale: 0.5 },
        { x: 322, y: 26, rotate: 0, scale: 0.72 },
      ],
      ACCENT,
      { group: "divider-small-stars", shadow: false },
    ),
  ];
}

/** The footer: a dark strip with a low hill, three candles, and the small stars above them. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 12, 9.2, FOOTER_HEIGHT + 8);
  const hill = tornEdge(SCENE_WIDTH, 42, 2.9, FOOTER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: ACCENT, shadow: false };
  const ground: CutSheet = { name: "ground", d: hill.sheet, fill: INK, shadow: false };
  const candles: readonly Candle[] = [
    { x: 120, y: 52, scale: 0.7 },
    { x: 195, y: 48, scale: 0.86 },
    { x: 270, y: 52, scale: 0.66 },
  ];

  return [
    sheetDefinitions(id, [strip, ground]),
    h(
      "defs",
      { key: "footer-stamp-definitions" },
      h("path", { id: id("footer-sparkle"), d: SPARKLE }),
      h("path", { id: id("footer-wax"), d: WAX }),
      h("path", { id: id("footer-wick"), d: WICK }),
      h("path", { id: id("footer-flame"), d: FLAME }),
    ),
    ...cutSheets(id, [strip]),
    // The ground goes down before the candles stand on it.
    h("use", { key: "ground-fill", href: `#${id(ground.name)}`, fill: INK }),
    h(
      "g",
      { key: "footer-glow", fill: GOLD, opacity: 0.12 },
      candles.map((candle) =>
        h("circle", {
          key: `${candle.x}-glow`,
          cx: candle.x,
          cy: candle.y - 32 * candle.scale,
          r: 8 * candle.scale,
        }),
      ),
    ),
    ...stamped(
      id,
      "footer-sparkle",
      [
        { x: 56, y: 26, rotate: 0, scale: 0.5 },
        { x: 88, y: 16, rotate: 0, scale: 0.34 },
        { x: 302, y: 20, rotate: 0, scale: 0.46 },
        { x: 336, y: 30, rotate: 0, scale: 0.6 },
      ],
      GOLD,
      { group: "footer-small-stars", shadow: false },
    ),
    ...stamped(
      id,
      "footer-wax",
      candles.map((candle) => ({
        x: candle.x,
        y: candle.y,
        rotate: 0,
        scale: candle.scale,
      })),
      SURFACE,
      { group: "footer-wax-stamps", shadow: false, edge: 0.8 },
    ),
    ...stamped(
      id,
      "footer-wick",
      candles.map((candle) => ({
        x: candle.x,
        y: candle.y,
        rotate: 0,
        scale: candle.scale,
      })),
      INK,
      { group: "footer-wicks", shadow: false },
    ),
    ...stamped(
      id,
      "footer-flame",
      candles.map((candle) => ({
        x: candle.x,
        y: candle.y,
        rotate: 0,
        scale: candle.scale,
      })),
      GOLD,
      { group: "footer-flames", shadow: false },
    ),
  ];
}

/** «Luz de estrella» in paper cut-out: the starry night, the star divider, and the candle footer. */
export const STAR_LIGHT_ILLUSTRATION: ThemeIllustration = {
  theme: "star-light",
  scene: {
    viewBox: `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`,
    preserveAspectRatio: "xMidYMid slice",
    draw: scene,
  },
  divider: {
    viewBox: `0 0 ${SCENE_WIDTH} ${DIVIDER_HEIGHT}`,
    preserveAspectRatio: "xMidYMid meet",
    draw: divider,
  },
  footer: {
    viewBox: `0 0 ${SCENE_WIDTH} ${FOOTER_HEIGHT}`,
    preserveAspectRatio: "xMidYMid meet",
    draw: footer,
  },
};
