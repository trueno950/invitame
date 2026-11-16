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
 * «Angelitos» in paper cut-out (I3d; S1-S4, style 01 of `design/theme-illustrations/01-papel-recortado.html`):
 * a pair of spread wings rising out of a bank of cloud, a ring of light above them with gentle rays, and
 * sparkles — and no face, because the theme's own artboard draws wings, a ring, and stars, never a figure (S3).
 *
 * Each wing is a fan of cut feathers drawn once in local coordinates and placed twice: the right wing as it is,
 * the left one mirrored around the drawing's centre, so the pair is symmetric without a hand-mirrored path.
 * Every color is a theme variable of `little-angels`; tints are `opacity` on a theme color.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

const INK: ThemePaint = "var(--inv-ink)";
const SURFACE: ThemePaint = "var(--inv-surface)";
const SOFT: ThemePaint = "var(--inv-soft)";
const GOLD: ThemePaint = "var(--inv-decoration-one)";
const SKY: ThemePaint = "var(--inv-decoration-two)";

/** One placed copy of a reusable shape: where it sits, how it turns, and how big it is. */
interface Stamp {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale?: number;
}

/** How a stamped group is drawn: its key name and the cut hairline a white sheet needs. */
interface StampOptions {
  readonly group?: string;
  readonly shadow?: boolean;
  readonly edge?: number;
}

/**
 * A reusable shape placed many times — sparkles, rays, cloud puffs — in one stamped group with one offset
 * shadow behind it, so a cloud is one glued piece of paper with one shadow instead of five.
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
    group(prefix, { fill: paint }),
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

/** The sky sheet: the torn paper the whole diorama is built on. */
const SKY_TEAR_BASE = 10;

/**
 * One wing in local coordinates: the root at the origin, the leading edge sweeping up to a tip at (88, -80),
 * and the trailing edge coming back as four feather lobes with a cusp between each pair.
 */
const WING =
  "M0 0C12-42 46-76 80-86C84-88 88-85 88-80Q90-55 66-60Q68-35 44-40Q46-15 22-20Q24 5 0 0Z";

/** The feather rows cut into each wing: two hairlines fanning from the root to the tip. */
const WING_ROWS: readonly string[] = ["M8-12C28-34 50-58 72-74", "M16-8C34-22 48-38 60-52"];

/** Where the two wings are rooted, mirrored around the drawing's centre line. */
const WING_RIGHT = "translate(212 150)";
const WING_LEFT = "translate(178 150) scale(-1 1)";

/** One unit puff, scaled by a stamp to make every cloud of the theme. */
const PUFF = "M-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z";

/** A sparkle: four soft points, the smallest mark the theme draws. */
const SPARKLE = "M0-7L1.5-1.5 7 0 1.5 1.5 0 7-1.5 1.5-7 0-1.5-1.5Z";

/** A ray of the ring of light: a short rounded finger. */
const RAY = "M-1.6-40C-1.6-44 1.6-44 1.6-40C1.6-34 0.9-30 0-30C-0.9-30-1.6-34-1.6-40Z";

const SPARKLES: readonly Stamp[] = [
  { x: 52, y: 66, rotate: 0, scale: 1.1 },
  { x: 92, y: 30, rotate: 0, scale: 0.72 },
  { x: 138, y: 92, rotate: 0, scale: 0.5 },
  { x: 318, y: 74, rotate: 0, scale: 0.95 },
  { x: 342, y: 32, rotate: 0, scale: 0.62 },
  { x: 262, y: 24, rotate: 0, scale: 0.52 },
  { x: 156, y: 40, rotate: 0, scale: 0.44 },
  { x: 238, y: 108, rotate: 0, scale: 0.6 },
];

/** The rays above the ring, fanned out of its top. */
const HALO_RAYS: readonly Stamp[] = [
  { x: 195, y: 52, rotate: -34, scale: 0.85 },
  { x: 195, y: 52, rotate: -17, scale: 0.95 },
  { x: 195, y: 52, rotate: 0, scale: 1.05 },
  { x: 195, y: 52, rotate: 17, scale: 0.95 },
  { x: 195, y: 52, rotate: 34, scale: 0.85 },
];

/** The cloud bank the wings rise from: left cluster, right cluster, and the low middle. */
const CLOUD_LEFT: readonly Stamp[] = [
  { x: -14, y: 180, rotate: 0, scale: 34 },
  { x: 24, y: 174, rotate: 0, scale: 30 },
  { x: 58, y: 184, rotate: 0, scale: 24 },
  { x: 16, y: 198, rotate: 0, scale: 26 },
  { x: 74, y: 200, rotate: 0, scale: 22 },
];

const CLOUD_RIGHT: readonly Stamp[] = [
  { x: 402, y: 178, rotate: 0, scale: 34 },
  { x: 366, y: 172, rotate: 0, scale: 30 },
  { x: 332, y: 184, rotate: 0, scale: 22 },
  { x: 380, y: 198, rotate: 0, scale: 26 },
];

const CLOUD_MIDDLE: readonly Stamp[] = [
  { x: 118, y: 202, rotate: 0, scale: 26 },
  { x: 160, y: 200, rotate: 0, scale: 22 },
  { x: 210, y: 204, rotate: 0, scale: 24 },
  { x: 254, y: 200, rotate: 0, scale: 20 },
];

/** The header diorama: sky, ring of light and rays, the two wings, sparkles, and the cloud bank. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, SKY_TEAR_BASE, 2.2, SCENE_HEIGHT + 8);
  const sky: CutSheet = { name: "sky", d: tear.sheet, fill: SOFT, shadow: false };
  const wingRight: CutSheet = {
    name: "wing-right",
    d: WING,
    fill: SURFACE,
    transform: WING_RIGHT,
  };
  const wingLeft: CutSheet = { name: "wing-left", d: WING, fill: SURFACE, transform: WING_LEFT };
  const sheets: readonly CutSheet[] = [sky, wingRight, wingLeft];

  return [
    sheetDefinitions(id, sheets),
    h(
      "defs",
      { key: "stamp-definitions" },
      h("path", { id: id("puff"), d: PUFF }),
      h("path", { id: id("sparkle"), d: SPARKLE }),
      h("path", { id: id("ray"), d: RAY }),
    ),
    // The sky sheet and its lighter tear line.
    ...cutSheets(id, [sky]),
    h("use", {
      key: "torn-line",
      href: `#${id(sky.name)}`,
      fill: "none",
      stroke: SURFACE,
      strokeWidth: 1.1,
      opacity: 0.45,
    }),
    // The sparkles of the sky stay behind the wings.
    ...stamped(id, "sparkle", SPARKLES, GOLD),
    // The ring of light: a soft glow, the paper ring with its shadow, and five rays above it.
    h("ellipse", { key: "halo-glow", cx: 195, cy: 52, rx: 46, ry: 18, fill: GOLD, opacity: 0.16 }),
    h("ellipse", {
      key: "halo",
      cx: 195,
      cy: 52,
      rx: 31,
      ry: 10.5,
      fill: "none",
      stroke: GOLD,
      strokeWidth: 6.4,
    }),
    ...stamped(id, "ray", HALO_RAYS, GOLD, { shadow: false }),
    // The two wings: one cut sheet each, with the thin ink hairline and two feather rows.
    ...cutSheets(id, [wingLeft, wingRight]),
    h(
      "g",
      { key: "wing-edges", fill: "none", stroke: INK, strokeWidth: 1.1, opacity: 0.2 },
      h("use", { key: "wing-left-edge", href: `#${id(wingLeft.name)}` }),
      h("use", { key: "wing-right-edge", href: `#${id(wingRight.name)}` }),
    ),
    h(
      "g",
      {
        key: "wing-rows",
        fill: "none",
        stroke: INK,
        strokeWidth: 1,
        opacity: 0.16,
        strokeLinecap: "round",
      },
      h(
        "g",
        { key: "rows-right", transform: WING_RIGHT },
        WING_ROWS.map((d) => h("path", { key: `row-right-${d}`, d })),
      ),
      h(
        "g",
        { key: "rows-left", transform: WING_LEFT },
        WING_ROWS.map((d) => h("path", { key: `row-left-${d}`, d })),
      ),
    ),
    // The cloud bank closes the diorama in front of the wings' roots.
    ...stamped(id, "puff", CLOUD_LEFT, SURFACE, { group: "cloud-left" }),
    ...stamped(id, "puff", CLOUD_RIGHT, SURFACE, { group: "cloud-right" }),
    ...stamped(id, "puff", CLOUD_MIDDLE, SURFACE, { group: "cloud-middle" }),
    ...stamped(id, "sparkle", [{ x: 195, y: 118, rotate: 0, scale: 0.8 }], SURFACE),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn pale strip with a small ring of light and the sparkles drifting past it. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 32, 3.9, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 6.2, DIVIDER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: SKY, shadow: false };
  const wash: CutSheet = { name: "wash", d: under.sheet, fill: GOLD, shadow: false };

  return [
    sheetDefinitions(id, [strip, wash]),
    h(
      "defs",
      { key: "divider-stamp-definitions" },
      h("path", { id: id("divider-sparkle"), d: SPARKLE }),
      h("path", { id: id("divider-ray"), d: RAY }),
    ),
    ...cutSheets(id, [strip]),
    h("use", { key: "wash-tint", href: `#${id(wash.name)}`, fill: SURFACE, opacity: 0.5 }),
    ...stamped(
      id,
      "divider-ray",
      [
        { x: 195, y: 34, rotate: -30, scale: 0.5 },
        { x: 195, y: 34, rotate: 0, scale: 0.58 },
        { x: 195, y: 34, rotate: 30, scale: 0.5 },
      ],
      GOLD,
      { shadow: false },
    ),
    h("ellipse", {
      key: "divider-halo",
      cx: 195,
      cy: 34,
      rx: 18,
      ry: 6.5,
      fill: "none",
      stroke: GOLD,
      strokeWidth: 3.8,
    }),
    ...stamped(
      id,
      "divider-sparkle",
      [
        { x: 66, y: 30, rotate: 0, scale: 0.8 },
        { x: 110, y: 42, rotate: 0, scale: 0.5 },
        { x: 148, y: 24, rotate: 0, scale: 0.44 },
        { x: 244, y: 26, rotate: 0, scale: 0.5 },
        { x: 282, y: 40, rotate: 0, scale: 0.64 },
        { x: 324, y: 30, rotate: 0, scale: 0.84 },
      ],
      GOLD,
    ),
  ];
}

/** The footer: a gold strip with the cloud bank resting on it and a trail of sparkles rising right. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 12, 8.1, FOOTER_HEIGHT + 8);
  const bank = tornEdge(SCENE_WIDTH, 44, 2.6, FOOTER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: GOLD, shadow: false };
  const cloudBank: CutSheet = { name: "bank", d: bank.sheet, fill: SURFACE, shadow: false };
  const leftCloud: readonly Stamp[] = [
    { x: 10, y: 58, rotate: 0, scale: 22 },
    { x: 40, y: 54, rotate: 0, scale: 18 },
    { x: -8, y: 62, rotate: 0, scale: 18 },
  ];
  const rightCloud: readonly Stamp[] = [
    { x: 380, y: 56, rotate: 0, scale: 22 },
    { x: 350, y: 54, rotate: 0, scale: 18 },
    { x: 398, y: 62, rotate: 0, scale: 18 },
  ];

  return [
    sheetDefinitions(id, [strip, cloudBank]),
    h(
      "defs",
      { key: "footer-stamp-definitions" },
      h("path", { id: id("footer-sparkle"), d: SPARKLE }),
      h("path", { id: id("footer-puff"), d: PUFF }),
    ),
    ...cutSheets(id, [strip]),
    h("use", {
      key: "bank-tint",
      href: `#${id(cloudBank.name)}`,
      fill: SURFACE,
      opacity: 0.5,
    }),
    h("ellipse", {
      key: "footer-halo",
      cx: 195,
      cy: 22,
      rx: 15,
      ry: 5.5,
      fill: "none",
      stroke: SURFACE,
      strokeWidth: 2.8,
      opacity: 0.9,
    }),
    ...stamped(
      id,
      "footer-sparkle",
      [
        { x: 120, y: 34, rotate: 0, scale: 0.44 },
        { x: 152, y: 26, rotate: 0, scale: 0.56 },
        { x: 240, y: 26, rotate: 0, scale: 0.56 },
        { x: 272, y: 34, rotate: 0, scale: 0.44 },
      ],
      SURFACE,
    ),
    ...stamped(id, "footer-puff", [...leftCloud, ...rightCloud], SURFACE, {
      group: "footer-clouds",
    }),
  ];
}

/** «Angelitos» in paper cut-out: the wings and ring of light, the sparkle divider, and the cloud footer. */
export const LITTLE_ANGELS_ILLUSTRATION: ThemeIllustration = {
  theme: "little-angels",
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
