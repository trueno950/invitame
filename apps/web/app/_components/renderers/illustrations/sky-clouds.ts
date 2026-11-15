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
 * «Cielo y nubes» in paper cut-out (I3d; S1-S4, style 01 of `design/theme-illustrations/01-papel-recortado.html`):
 * layered scalloped clouds and a hand-cut sun with gentle rays — the outdoor baptism of the theme's own artboard,
 * drawn as flat paper sheets (S3).
 *
 * Every cloud is one glued piece of paper: a cluster of round puffs placed with a single stamped group, so the
 * whole cloud carries one offset shadow and the silhouette stays soft. Every color is a theme variable of
 * `sky-clouds`; tints are `opacity` on a theme color.
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
const SKY: ThemePaint = "var(--inv-decoration-one)";
const CREAM: ThemePaint = "var(--inv-decoration-two)";

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
}

/**
 * A reusable shape placed many times — cloud puffs, sun rays, small clouds — in one stamped group with one
 * offset shadow behind it, so a cloud is one glued piece of paper instead of five separate ones.
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
            opacity: 0.14,
          }),
        ]),
  ];
}

/** The sky sheet: the torn paper the whole diorama is built on. */
const SKY_TEAR_BASE = 10;

/** A hand-cut sun: an ellipse-ish disc with a soft dent, not a perfect circle. */
const SUN =
  "M282 24C292 21 308 22 315 28C322 34 326 46 325 54C324 62 316 70 308 72C300 74 286 71 281 65C276 " +
  "59 274 47 276 39C278 32 274 27 282 24Z";

/** A ray of the sun: a short rounded finger that starts just outside the disc. */
const RAY = "M-3.6-46C-3.6-50 3.6-50 3.6-46C3.6-38 1.8-32 0-32C-1.8-32-3.6-38-3.6-46Z";

/** The eight rays around the sun, all turned around its centre so they radiate from it. */
const SUN_RAYS: readonly Stamp[] = [
  { x: 299, y: 48, rotate: 0 },
  { x: 299, y: 48, rotate: 45 },
  { x: 299, y: 48, rotate: 90 },
  { x: 299, y: 48, rotate: 135 },
  { x: 299, y: 48, rotate: 180 },
  { x: 299, y: 48, rotate: 225 },
  { x: 299, y: 48, rotate: 270 },
  { x: 299, y: 48, rotate: 315 },
];

/** One unit puff, scaled by a stamp: the only shape a cloud of this theme is made of. */
const PUFF = "M-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z";

/** The distant clouds, in the pale sky color: two low bands behind everything else. */
const CLOUD_BACK_LEFT: readonly Stamp[] = [
  { x: 26, y: 106, rotate: 0, scale: 24 },
  { x: 56, y: 98, rotate: 0, scale: 28 },
  { x: 88, y: 106, rotate: 0, scale: 21 },
  { x: 42, y: 120, rotate: 0, scale: 18 },
  { x: 76, y: 120, rotate: 0, scale: 16 },
];

const CLOUD_BACK_RIGHT: readonly Stamp[] = [
  { x: 206, y: 92, rotate: 0, scale: 20 },
  { x: 232, y: 84, rotate: 0, scale: 24 },
  { x: 258, y: 92, rotate: 0, scale: 18 },
  { x: 228, y: 102, rotate: 0, scale: 14 },
];

/** The near clouds, white: one broad bank at the left, one at the right, and the low middle. */
const CLOUD_NEAR_LEFT: readonly Stamp[] = [
  { x: 96, y: 148, rotate: 0, scale: 30 },
  { x: 134, y: 138, rotate: 0, scale: 36 },
  { x: 176, y: 146, rotate: 0, scale: 28 },
  { x: 208, y: 154, rotate: 0, scale: 20 },
  { x: 112, y: 168, rotate: 0, scale: 26 },
  { x: 152, y: 172, rotate: 0, scale: 24 },
  { x: 188, y: 174, rotate: 0, scale: 18 },
];

const CLOUD_NEAR_RIGHT: readonly Stamp[] = [
  { x: 296, y: 176, rotate: 0, scale: 28 },
  { x: 334, y: 168, rotate: 0, scale: 34 },
  { x: 370, y: 176, rotate: 0, scale: 26 },
  { x: 332, y: 192, rotate: 0, scale: 24 },
  { x: 300, y: 194, rotate: 0, scale: 20 },
];

/** The cloud sea at the very bottom: the diorama closes in cloud instead of a ground line. */
const CLOUD_SEA: readonly Stamp[] = [
  { x: -8, y: 196, rotate: 0, scale: 30 },
  { x: 30, y: 190, rotate: 0, scale: 26 },
  { x: 66, y: 198, rotate: 0, scale: 28 },
  { x: 108, y: 202, rotate: 0, scale: 24 },
  { x: 244, y: 200, rotate: 0, scale: 26 },
  { x: 284, y: 204, rotate: 0, scale: 22 },
  { x: 372, y: 200, rotate: 0, scale: 28 },
  { x: 402, y: 204, rotate: 0, scale: 24 },
];

/** Three far birds: pairs of accent strokes, small enough to read as distance. */
const FAR_BIRDS: readonly string[] = [
  "M64 62C68 58 72 57 76 59",
  "M86 52C89 49 92 48 95 50",
  "M44 50C47 47 50 46 53 48",
];

/** The header diorama: sky, sun and rays, the distant clouds, the near banks, and the cloud sea. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, SKY_TEAR_BASE, 1.9, SCENE_HEIGHT + 8);
  const sky: CutSheet = { name: "sky", d: tear.sheet, fill: SOFT, shadow: false };
  const sun: CutSheet = { name: "sun", d: SUN, fill: CREAM };
  const sheets: readonly CutSheet[] = [sky, sun];

  return [
    sheetDefinitions(id, sheets),
    h(
      "defs",
      { key: "stamp-definitions" },
      h("path", { id: id("puff"), d: PUFF }),
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
    // The sun: its rays behind, then the warm paper disc with a soft highlight.
    ...stamped(id, "ray", SUN_RAYS, CREAM, { shadow: false }),
    ...cutSheets(id, [sun]),
    h("use", {
      key: "sun-edge",
      href: `#${id(sun.name)}`,
      fill: "none",
      stroke: INK,
      strokeWidth: 1,
      opacity: 0.14,
    }),
    h("circle", { key: "sun-glow", cx: 292, cy: 38, r: 9, fill: SURFACE, opacity: 0.34 }),
    // The distant clouds, then the birds between them.
    ...stamped(id, "puff", CLOUD_BACK_LEFT, SKY, { group: "cloud-back-left" }),
    ...stamped(id, "puff", CLOUD_BACK_RIGHT, SKY, { group: "cloud-back-right" }),
    h(
      "g",
      { key: "far-birds", fill: "none", stroke: ACCENT, strokeWidth: 1.5, opacity: 0.38 },
      FAR_BIRDS.map((d, index) =>
        h("path", { key: `far-bird-${index}`, d, strokeLinecap: "round" }),
      ),
    ),
    // The near clouds: white paper with one shadow per cloud and a thin cut hairline.
    ...stamped(id, "puff", CLOUD_NEAR_LEFT, SURFACE, { group: "cloud-near-left" }),
    ...stamped(id, "puff", CLOUD_NEAR_RIGHT, SURFACE, { group: "cloud-near-right" }),
    // The cloud sea in front, a shade cooler than the near banks so the layers read.
    ...stamped(id, "puff", CLOUD_SEA, SURFACE, { group: "cloud-sea" }),
    h(
      "g",
      { key: "sea-tint", fill: SKY, opacity: 0.14 },
      CLOUD_SEA.map((place) =>
        h("use", {
          key: `${place.x}-sea`,
          href: `#${id("puff")}`,
          transform: `translate(${place.x} ${place.y}) scale(${place.scale})`,
        }),
      ),
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn sky strip with two small clouds drifting past a short fan of rays. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 30, 4.1, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 6.6, DIVIDER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: SKY, shadow: false };
  const wash: CutSheet = { name: "wash", d: under.sheet, fill: ACCENT, shadow: false };
  const cloudLeft: readonly Stamp[] = [
    { x: 54, y: 40, rotate: 0, scale: 14 },
    { x: 74, y: 35, rotate: 0, scale: 17 },
    { x: 94, y: 40, rotate: 0, scale: 11 },
    { x: 74, y: 47, rotate: 0, scale: 10 },
  ];
  const cloudRight: readonly Stamp[] = [
    { x: 292, y: 34, rotate: 0, scale: 12 },
    { x: 310, y: 29, rotate: 0, scale: 15 },
    { x: 328, y: 34, rotate: 0, scale: 10 },
    { x: 310, y: 41, rotate: 0, scale: 8 },
  ];

  return [
    sheetDefinitions(id, [strip, wash]),
    h(
      "defs",
      { key: "divider-stamp-definitions" },
      h("path", { id: id("divider-puff"), d: PUFF }),
      h("path", {
        id: id("divider-ray"),
        d: "M-2.4-24C-2.4-26.6 2.4-26.6 2.4-24C2.4-21.6 1.2-20 0-20C-1.2-20-2.4-21.6-2.4-24Z",
      }),
    ),
    ...cutSheets(id, [strip]),
    h("use", { key: "wash-tint", href: `#${id(wash.name)}`, fill: ACCENT, opacity: 0.16 }),
    ...stamped(
      id,
      "divider-ray",
      [
        { x: 195, y: 38, rotate: -34, scale: 1 },
        { x: 195, y: 38, rotate: 0, scale: 1.1 },
        { x: 195, y: 38, rotate: 34, scale: 1 },
      ],
      CREAM,
      { shadow: false },
    ),
    h("circle", { key: "divider-sun", cx: 195, cy: 40, r: 9.5, fill: CREAM }),
    ...stamped(id, "divider-puff", cloudLeft, SURFACE, { group: "divider-cloud-left" }),
    ...stamped(id, "divider-puff", cloudRight, SURFACE, { group: "divider-cloud-right" }),
  ];
}

/** The footer: a warm cream strip with cloud banks resting on it and the sun low at the left. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 12, 8.4, FOOTER_HEIGHT + 8);
  const bank = tornEdge(SCENE_WIDTH, 46, 2.8, FOOTER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: CREAM, shadow: false };
  const cloudBank: CutSheet = { name: "bank", d: bank.sheet, fill: SURFACE, shadow: false };
  const cloudLeft: readonly Stamp[] = [
    { x: 60, y: 58, rotate: 0, scale: 18 },
    { x: 88, y: 52, rotate: 0, scale: 20 },
    { x: 116, y: 58, rotate: 0, scale: 14 },
    { x: 86, y: 64, rotate: 0, scale: 12 },
  ];
  const cloudRight: readonly Stamp[] = [
    { x: 254, y: 58, rotate: 0, scale: 16 },
    { x: 280, y: 52, rotate: 0, scale: 19 },
    { x: 306, y: 58, rotate: 0, scale: 13 },
    { x: 280, y: 64, rotate: 0, scale: 11 },
  ];

  return [
    sheetDefinitions(id, [strip, cloudBank]),
    h("defs", { key: "footer-stamp-definitions" }, h("path", { id: id("footer-puff"), d: PUFF })),
    ...cutSheets(id, [strip]),
    h("use", { key: "bank-tint", href: `#${id(cloudBank.name)}`, fill: SURFACE, opacity: 0.55 }),
    // A low sun between the two cloud banks, in the surface of the paper.
    h("circle", { key: "footer-sun", cx: 195, cy: 40, r: 11, fill: SURFACE }),
    h(
      "g",
      { key: "footer-rays", fill: SURFACE, opacity: 0.9 },
      [
        { rotate: 0, scale: 0.9 },
        { rotate: 45, scale: 0.7 },
        { rotate: 90, scale: 0.9 },
        { rotate: 135, scale: 0.7 },
        { rotate: 180, scale: 0.9 },
        { rotate: 225, scale: 0.7 },
        { rotate: 270, scale: 0.9 },
        { rotate: 315, scale: 0.7 },
      ].map((ray) =>
        h("rect", {
          key: `footer-ray-${ray.rotate}`,
          x: -1.4,
          y: -22 * ray.scale,
          width: 2.8,
          height: 7,
          rx: 1.4,
          transform: `rotate(${ray.rotate} 195 40)`,
        }),
      ),
    ),
    ...stamped(id, "footer-puff", cloudLeft, SURFACE, { group: "footer-cloud-left" }),
    ...stamped(id, "footer-puff", cloudRight, SURFACE, { group: "footer-cloud-right" }),
  ];
}

/** «Cielo y nubes» in paper cut-out: the layered sky, the ray divider, and the cloud footer. */
export const SKY_CLOUDS_ILLUSTRATION: ThemeIllustration = {
  theme: "sky-clouds",
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
