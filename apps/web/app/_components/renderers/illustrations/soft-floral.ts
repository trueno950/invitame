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
 * «Floral suave» in paper cut-out (I3d; S1-S4, style 01 of `design/theme-illustrations/01-papel-recortado.html`):
 * round-petal blooms, sage leaves, and a small arched doorway of paper — the seasonal bouquet of the theme's own
 * artboard, drawn as flat cut sheets (S3). The arch is a plain architectural arch: no cross, no church, no logo.
 *
 * Every bloom is five stamped round petals turned around one centre, so the flower is built once and placed at
 * four sizes. Every color is a theme variable of `soft-floral`; tints are `opacity` on a theme color.
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
const SAGE: ThemePaint = "var(--inv-decoration-one)";
const BLUSH: ThemePaint = "var(--inv-decoration-two)";

/** One placed copy of a reusable shape: where it sits, how it turns, and how big it is. */
interface Stamp {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale?: number;
}

/** How a stamped group is drawn: its key name, so two groups of the same shape never share a key. */
interface StampOptions {
  readonly group?: string;
}

/**
 * A reusable shape placed many times — petals, leaves, buds — in one stamped group with one offset shadow
 * behind it, so a bouquet is not forty separate shadows.
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
    group(`${prefix}-shadow`, { fill: INK, opacity: 0.11, transform: "translate(1.2 3.4)" }),
    group(prefix, { fill: paint }),
  ];
}

/** The sky sheet: the torn paper the whole diorama is built on. */
const SKY_TEAR_BASE = 10;

/** One round petal, already offset from the bloom's centre so a rotation turns it around that centre. */
const PETAL = "M-6-10a6 6 0 1 0 12 0a6 6 0 1 0-12 0Z";

/** One leaf: a lens with a soft point, stamped along the stems. */
const LEAF = "M0 0C3.4-4.6 10.2-6.4 15-3.6C11.2 1.4 4.4 3.4 0 0Z";

/** A bloom: its centre, its size, and the angle its first petal takes. */
interface Bloom {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

/** Every bloom of the scene, from the small buds on the arch to the two large ones at the corners. */
const BLOOMS: readonly Bloom[] = [
  { x: 195, y: 44, rotate: 12, scale: 0.72 },
  { x: 168, y: 54, rotate: 40, scale: 0.58 },
  { x: 224, y: 58, rotate: -22, scale: 0.52 },
  { x: 54, y: 158, rotate: 0, scale: 1.7 },
  { x: 96, y: 140, rotate: 30, scale: 1.15 },
  { x: 26, y: 148, rotate: 12, scale: 0.72 },
  { x: 336, y: 160, rotate: 18, scale: 1.65 },
  { x: 294, y: 140, rotate: -14, scale: 1.1 },
  { x: 364, y: 144, rotate: 32, scale: 0.66 },
];

/**
 * One whole bloom in `<defs>`: five petals turned 72° around the same centre, drawn once and placed at each
 * bloom's size and angle with a single `<use>`, so five petals cost one reference instead of five.
 */
function flowerDefinition(id: IllustrationId, shape: string): ReactElement {
  return h(
    "defs",
    { key: `${shape}-definition` },
    h(
      "g",
      { id: id(shape) },
      [0, 72, 144, 216, 288].map((turn) =>
        h("use", { key: `petal-${turn}`, href: `#${id("petal")}`, transform: `rotate(${turn})` }),
      ),
    ),
  );
}

/** The leaves: along the two corner bouquets, on the arch shoulder, and loose at the meadow line. */
const LEAVES: readonly Stamp[] = [
  { x: 22, y: 184, rotate: -30, scale: 1.5 },
  { x: 38, y: 176, rotate: 156, scale: 1.45 },
  { x: 48, y: 166, rotate: -26, scale: 1.35 },
  { x: 86, y: 186, rotate: 164, scale: 1.3 },
  { x: 104, y: 176, rotate: -20, scale: 1.2 },
  { x: 112, y: 158, rotate: 150, scale: 1.1 },
  { x: 368, y: 184, rotate: 210, scale: 1.45 },
  { x: 352, y: 176, rotate: 24, scale: 1.4 },
  { x: 342, y: 166, rotate: 206, scale: 1.3 },
  { x: 304, y: 186, rotate: 16, scale: 1.25 },
  { x: 286, y: 174, rotate: 200, scale: 1.15 },
  { x: 278, y: 158, rotate: 30, scale: 1.05 },
  { x: 158, y: 66, rotate: 214, scale: 0.8 },
  { x: 234, y: 70, rotate: 26, scale: 0.76 },
];

/** The stems of the two corner bouquets: thin tapered ribbons rising from the floor. */
const STEMS: readonly CutSheet[] = [
  {
    name: "stem-left-main",
    d: "M37 204C42 184 47 172 51 162L56 163C52 174 48 186 44 204Z",
    fill: SAGE,
  },
  {
    name: "stem-left-inner",
    d: "M91 204C93 184 94 162 95 146L100 147C98 164 97 186 97 204Z",
    fill: SAGE,
  },
  {
    name: "stem-right-main",
    d: "M351 204C346 184 341 172 337 162L332 163C336 174 340 186 344 204Z",
    fill: SAGE,
  },
  {
    name: "stem-right-inner",
    d: "M299 204C297 184 296 162 295 146L290 147C292 164 293 186 293 204Z",
    fill: SAGE,
  },
];

/** The arched doorway: one plain arch, cut as paper, with a paler inside sheet behind it. */
const ARCH = "M150 204V102C150 76 170 56 195 56C220 56 240 76 240 102V204Z";
const ARCH_INSIDE = "M162 204V104C162 84 177 68 195 68C213 68 228 84 228 104V204Z";
const ARCH_HAIRLINE = "M170 204V106C170 92 181 80 195 80C209 80 220 92 220 106V204";

/** The garden floor: one shallow torn band at the foot of the arch. */
const GROUND =
  "M-8 182C8 180 22 175 38 176C54 177 68 183 84 183C100 183 114 176 130 176C146 176 160 183 176 " +
  "183C192 183 206 176 222 176C238 176 252 183 268 183C284 183 298 176 314 176C330 176 346 182 " +
  "362 182C378 182 386 178 398 176L398 206L-8 206Z";

/** Small buds and fallen petals scattered over the meadow, so the floor is not one flat sheet. */
const PETAL_DOTS: readonly Stamp[] = [
  { x: 128, y: 190, rotate: 20, scale: 0.22 },
  { x: 150, y: 194, rotate: -30, scale: 0.18 },
  { x: 240, y: 192, rotate: 46, scale: 0.2 },
  { x: 264, y: 188, rotate: -12, scale: 0.24 },
  { x: 200, y: 194, rotate: 8, scale: 0.16 },
];

/** The header diorama: sky, arch, the two corner bouquets, the garland on the arch, and the floor. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, SKY_TEAR_BASE, 2.6, SCENE_HEIGHT + 8);
  const sky: CutSheet = { name: "sky", d: tear.sheet, fill: SOFT, shadow: false };
  const arch: CutSheet = { name: "arch", d: ARCH, fill: SURFACE };
  const archInside: CutSheet = { name: "arch-inside", d: ARCH_INSIDE, fill: SOFT, shadow: false };
  const ground: CutSheet = { name: "ground", d: GROUND, fill: BLUSH, shadow: false };
  const sheets: readonly CutSheet[] = [sky, arch, archInside, ground, ...STEMS];

  return [
    sheetDefinitions(id, sheets),
    h(
      "defs",
      { key: "stamp-definitions" },
      h("path", { id: id("petal"), d: PETAL }),
      h("path", { id: id("leaf"), d: LEAF }),
    ),
    flowerDefinition(id, "flower"),
    // The sky sheet and its lighter tear line.
    ...cutSheets(id, [sky]),
    h("use", {
      key: "torn-line",
      href: `#${id(sky.name)}`,
      fill: "none",
      stroke: SURFACE,
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    // The arch, then its paler inside, so the doorway reads as two layers of paper.
    ...cutSheets(id, [arch]),
    h("use", { key: "arch-inside-fill", href: `#${id(archInside.name)}`, fill: SOFT }),
    h("use", {
      key: "arch-hairline",
      href: `#${id(arch.name)}`,
      fill: "none",
      stroke: ACCENT,
      strokeWidth: 1.1,
      opacity: 0.24,
    }),
    // The leaves go behind the blooms so the petals sit on top of them.
    ...stamped(id, "leaf", LEAVES, SAGE),
    ...stamped(id, "flower", BLOOMS, BLUSH, { group: "blooms" }),
    h(
      "g",
      { key: "bloom-centres", fill: ACCENT },
      BLOOMS.map((bloom) =>
        h("circle", {
          key: `${bloom.x}-${bloom.y}`,
          cx: bloom.x,
          cy: bloom.y,
          r: 3.1 * bloom.scale,
          opacity: 0.9,
        }),
      ),
    ),
    // A second hairline inside the opening, so the arch reads as a niche and not a flat sheet.
    h("path", {
      key: "arch-inner-hairline",
      d: ARCH_HAIRLINE,
      fill: "none",
      stroke: ACCENT,
      strokeWidth: 1,
      opacity: 0.18,
    }),
    // The stems of the two bouquets stand in the floor, in front of the arch.
    ...cutSheets(id, STEMS),
    ...cutSheets(id, [ground]),
    h("use", {
      key: "ground-tint",
      href: `#${id(ground.name)}`,
      fill: SAGE,
      opacity: 0.55,
    }),
    ...stamped(id, "petal", PETAL_DOTS, BLUSH, { group: "fallen-petals" }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn blush strip with a small garland of blooms and leaves running across it. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 30, 3.7, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 6.4, DIVIDER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: BLUSH, shadow: false };
  const wash: CutSheet = { name: "wash", d: under.sheet, fill: ACCENT, shadow: false };
  const stem: CutSheet = {
    name: "divider-stem",
    d: "M-4 54C56 48 116 40 176 34C236 28 302 26 396 32L396 37C302 31 238 33 178 39C118 45 58 53 -2 59Z",
    fill: SAGE,
  };
  const blooms: readonly Bloom[] = [
    { x: 52, y: 38, rotate: 0, scale: 0.56 },
    { x: 126, y: 32, rotate: 24, scale: 0.44 },
    { x: 186, y: 28, rotate: 8, scale: 0.62 },
    { x: 252, y: 25, rotate: -18, scale: 0.42 },
    { x: 316, y: 24, rotate: 30, scale: 0.54 },
  ];
  const leaves: readonly Stamp[] = [
    { x: 20, y: 48, rotate: -30, scale: 0.7 },
    { x: 82, y: 42, rotate: 168, scale: 0.62 },
    { x: 152, y: 36, rotate: -22, scale: 0.66 },
    { x: 218, y: 32, rotate: 172, scale: 0.58 },
    { x: 288, y: 28, rotate: -20, scale: 0.6 },
    { x: 350, y: 26, rotate: 174, scale: 0.54 },
  ];

  return [
    sheetDefinitions(id, [strip, wash, stem]),
    h(
      "defs",
      { key: "divider-stamp-definitions" },
      h("path", { id: id("divider-petal"), d: PETAL }),
      h("path", { id: id("divider-leaf"), d: LEAF }),
      h(
        "g",
        { id: id("divider-flower") },
        [0, 72, 144, 216, 288].map((turn) =>
          h("use", {
            key: `divider-petal-${turn}`,
            href: `#${id("divider-petal")}`,
            transform: `rotate(${turn})`,
          }),
        ),
      ),
    ),
    ...cutSheets(id, [strip]),
    h("use", { key: "wash-tint", href: `#${id(wash.name)}`, fill: ACCENT, opacity: 0.16 }),
    ...cutSheets(id, [stem]),
    ...stamped(id, "divider-leaf", leaves, SAGE),
    ...stamped(id, "divider-flower", blooms, SURFACE, { group: "divider-blooms" }),
    h(
      "g",
      { key: "divider-bloom-centres", fill: ACCENT },
      blooms.map((bloom) =>
        h("circle", {
          key: `${bloom.x}-${bloom.y}`,
          cx: bloom.x,
          cy: bloom.y,
          r: 2 * bloom.scale,
          opacity: 0.9,
        }),
      ),
    ),
  ];
}

/** The footer: a sage strip with two white blooms resting on it and leaves reaching in from the corners. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 12, 8.7, FOOTER_HEIGHT + 8);
  const meadow = tornEdge(SCENE_WIDTH, 46, 2.4, FOOTER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: SAGE, shadow: false };
  const floor: CutSheet = { name: "floor", d: meadow.sheet, fill: BLUSH, shadow: false };
  const blooms: readonly Bloom[] = [
    { x: 96, y: 38, rotate: 0, scale: 0.62 },
    { x: 288, y: 36, rotate: 26, scale: 0.56 },
    { x: 195, y: 24, rotate: 12, scale: 0.34 },
  ];
  const leaves: readonly Stamp[] = [
    { x: 6, y: 46, rotate: -34, scale: 0.8 },
    { x: 40, y: 40, rotate: 172, scale: 0.7 },
    { x: 148, y: 34, rotate: -28, scale: 0.6 },
    { x: 240, y: 32, rotate: 176, scale: 0.62 },
    { x: 344, y: 42, rotate: 154, scale: 0.74 },
    { x: 376, y: 46, rotate: -26, scale: 0.82 },
  ];

  return [
    sheetDefinitions(id, [strip, floor]),
    h(
      "defs",
      { key: "footer-stamp-definitions" },
      h("path", { id: id("footer-petal"), d: PETAL }),
      h("path", { id: id("footer-leaf"), d: LEAF }),
      h(
        "g",
        { id: id("footer-flower") },
        [0, 72, 144, 216, 288].map((turn) =>
          h("use", {
            key: `footer-petal-${turn}`,
            href: `#${id("footer-petal")}`,
            transform: `rotate(${turn})`,
          }),
        ),
      ),
    ),
    ...cutSheets(id, [strip]),
    ...cutSheets(id, [floor]),
    h("use", { key: "floor-tint", href: `#${id(floor.name)}`, fill: BLUSH, opacity: 0.55 }),
    ...stamped(id, "footer-leaf", leaves, SURFACE),
    ...stamped(id, "footer-flower", blooms, BLUSH, { group: "footer-blooms" }),
    h(
      "g",
      { key: "footer-bloom-centres", fill: ACCENT },
      blooms.map((bloom) =>
        h("circle", {
          key: `${bloom.x}-${bloom.y}`,
          cx: bloom.x,
          cy: bloom.y,
          r: 2.2 * bloom.scale,
          opacity: 0.9,
        }),
      ),
    ),
  ];
}

/** «Floral suave» in paper cut-out: the floral arch, the garland divider, and the bloom footer. */
export const SOFT_FLORAL_ILLUSTRATION: ThemeIllustration = {
  theme: "soft-floral",
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
