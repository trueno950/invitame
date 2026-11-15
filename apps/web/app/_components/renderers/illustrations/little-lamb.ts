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
 * «Corderito» in paper cut-out (I3d; S1-S4, style 01 of `design/theme-illustrations/01-papel-recortado.html`):
 * an original lamb standing on a soft hill with wool curls along its back, the baptismal scallop shell resting in
 * the grass beside it, and tufts of paper grass (S3). The lamb is our own shape — a generic little sheep, not a
 * character from any book or brand.
 *
 * Every color is a theme variable of `little-lamb`; tints are `opacity` on a theme color. The wool is a white
 * sheet plus stamped crescent curls whose thin ink edge is the only thing that separates them from the body.
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
const TAN: ThemePaint = "var(--inv-decoration-two)";

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
 * A reusable shape placed many times — curls, tufts, shell ridges — in one stamped group with one offset shadow
 * behind it, so a woolly back is not nine separate shadows.
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

/** The far hill, in the warm tan of the palette: a long low ridge behind the lamb. */
const HILL_FAR =
  "M-8 168C14 160 38 156 62 158C86 160 108 168 132 168C156 168 178 160 202 160C226 160 248 168 272 " +
  "168C296 168 318 160 342 160C366 160 382 164 398 162L398 206L-8 206Z";

/** The near hill the lamb stands on, in the sage of the palette. */
const HILL_NEAR =
  "M-8 176C10 172 30 164 54 162C78 160 100 164 122 168C144 172 168 178 190 178C212 178 232 172 254 " +
  "170C276 168 300 170 322 174C344 178 376 180 398 178L398 206L-8 206Z";

/** The meadow in front, a second sage sheet so the lamb stands between two layers of hill. */
const MEADOW =
  "M-8 186C10 184 28 180 48 181C68 182 86 188 106 188C126 188 142 181 162 181C182 181 198 188 218 " +
  "188C238 188 254 181 274 181C294 181 310 188 330 188C350 188 366 183 382 182C390 181 394 182 398 " +
  "182L398 206L-8 206Z";

/** The lamb's body: a woolly silhouette whose own outline is already bumpy before the curls go on. */
const LAMB_BODY =
  "M146 148C140 144 138 136 142 130C138 122 142 114 150 111C150 103 158 97 166 99C170 92 180 90 187 " +
  "95C193 89 203 90 208 97C217 94 226 98 229 106C238 105 246 111 246 119C254 124 256 134 250 " +
  "140C254 147 248 154 240 154L154 154C149 154 146 151 146 148Z";

/** The head, turned to the right: one soft shape with a muzzle, no separate neck. */
const LAMB_HEAD =
  "M242 122C236 112 242 102 252 101C260 100 268 105 271 112C280 113 284 119 280 125C276 131 266 " +
  "133 259 131C250 129 245 127 242 122Z";

/** The flopping ear: a separate cut sheet behind the head. */
const LAMB_EAR = "M246 108C240 100 244 90 253 92C260 94 263 102 260 108Z";

/**
 * A wool curl: a crescent tuft, not a closed ring — the outer arc is the wool and the inner arc cuts back
 * toward the tip, so a stamped row of them reads as stacked tufts.
 */
const WOOL_CURL = "M2 0C9-5 16-1 15 6C14 13 8 16 2 12C7 10 11 7 10 4C9 1 6 0 2 0Z";

/** The curls of the back and the tail, in three clusters so the body reads as wool, not a blob. */
const BODY_CURLS: readonly Stamp[] = [
  { x: 156, y: 112, rotate: -18, scale: 1.05 },
  { x: 166, y: 103, rotate: 8, scale: 1.1 },
  { x: 178, y: 98, rotate: -12, scale: 1 },
  { x: 190, y: 95, rotate: 14, scale: 1.08 },
  { x: 202, y: 98, rotate: -8, scale: 1 },
  { x: 212, y: 104, rotate: 10, scale: 1.05 },
  { x: 224, y: 110, rotate: -14, scale: 1.02 },
  { x: 236, y: 116, rotate: 6, scale: 0.95 },
  { x: 142, y: 124, rotate: -162, scale: 0.9 },
  { x: 148, y: 136, rotate: 152, scale: 0.85 },
  { x: 160, y: 128, rotate: -8, scale: 0.82 },
  { x: 176, y: 132, rotate: 14, scale: 0.78 },
  { x: 196, y: 134, rotate: -6, scale: 0.8 },
  { x: 214, y: 130, rotate: 10, scale: 0.76 },
  { x: 232, y: 132, rotate: -12, scale: 0.7 },
  { x: 176, y: 118, rotate: 4, scale: 0.7 },
  { x: 204, y: 120, rotate: -10, scale: 0.68 },
];

/** The curls on the head, so the face is framed by wool and no feature is needed beyond the eye. */
const HEAD_CURLS: readonly Stamp[] = [
  { x: 250, y: 104, rotate: -6, scale: 0.72 },
  { x: 260, y: 100, rotate: 12, scale: 0.66 },
];

/** One unit puff, so the two clouds of the sky are glued pieces of paper like every other sheet. */
const PUFF = "M-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z";

/** Two soft clouds above the hills, in the warm tan of the palette. */
const CLOUD_LEFT: readonly Stamp[] = [
  { x: 28, y: 54, rotate: 0, scale: 17 },
  { x: 52, y: 46, rotate: 0, scale: 21 },
  { x: 78, y: 54, rotate: 0, scale: 15 },
  { x: 52, y: 62, rotate: 0, scale: 13 },
];

const CLOUD_RIGHT: readonly Stamp[] = [
  { x: 308, y: 40, rotate: 0, scale: 13 },
  { x: 328, y: 33, rotate: 0, scale: 17 },
  { x: 348, y: 42, rotate: 0, scale: 11 },
  { x: 328, y: 48, rotate: 0, scale: 9 },
];

/** The four legs, in the accent: two behind the body, two in front of the nearest hill layer. */
const LEGS_BACK: readonly CutSheet[] = [
  {
    name: "leg-back-far",
    d: "M162 146L163.5 177C163.6 179.2 168.4 179.2 168.5 177L170 146Z",
    fill: ACCENT,
    shadow: false,
  },
  {
    name: "leg-back-near",
    d: "M228 146L229.5 177C229.6 179.2 234.4 179.2 234.5 177L236 146Z",
    fill: ACCENT,
    shadow: false,
  },
];

const LEGS_FRONT: readonly CutSheet[] = [
  {
    name: "leg-front-far",
    d: "M180 148L181.5 181C181.6 183.2 186.4 183.2 186.5 181L188 148Z",
    fill: ACCENT,
  },
  {
    name: "leg-front-near",
    d: "M214 148L215.5 181C215.6 183.2 220.4 183.2 220.5 181L222 148Z",
    fill: ACCENT,
  },
];

/** The scallop shell: a fan of paper with a wavy rim and a hinge, the baptismal mark of the theme. */
const SHELL =
  "M36 190C36 176 42 164 52 156C54 152 58 150 61 152C64 148 70 148 73 152C77 150 81 152 83 156C93 " +
  "164 104 176 104 190Z";

/** The five ridges of the shell, from the hinge out to the rim. */
const SHELL_RIDGES: readonly string[] = [
  "M70 190L92 160",
  "M70 190L82 152",
  "M70 190L70 150",
  "M70 190L58 152",
  "M70 190L48 160",
];

/** The hinge of the shell: the two small ears of paper the fan is glued to. */
const SHELL_HINGE = "M56 189C58 196 82 196 84 189C78 185 62 185 56 189Z";

/** A tuft of grass: three blades of different height, base at the origin. */
const TUFT = "M0 0C-1-7-5-12-10-16C-3-14 2-9 4-3C5-9 9-14 16-17C11-12 8-7 7 0Z";

const SCENE_TUFTS: readonly Stamp[] = [
  { x: 16, y: 188, rotate: -6, scale: 1.1 },
  { x: 44, y: 182, rotate: 4, scale: 0.9 },
  { x: 116, y: 186, rotate: -3, scale: 1.2 },
  { x: 140, y: 176, rotate: 6, scale: 0.85 },
  { x: 250, y: 180, rotate: -5, scale: 1 },
  { x: 306, y: 186, rotate: 3, scale: 1.15 },
  { x: 342, y: 180, rotate: -8, scale: 0.95 },
  { x: 372, y: 188, rotate: 5, scale: 1.05 },
];

/** The header diorama: sky, two hills, the lamb, the meadow, the shell, and the grass. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, SKY_TEAR_BASE, 2.4, SCENE_HEIGHT + 8);
  const sky: CutSheet = { name: "sky", d: tear.sheet, fill: SOFT, shadow: false };
  const hillFar: CutSheet = { name: "hill-far", d: HILL_FAR, fill: TAN };
  const hillNear: CutSheet = { name: "hill-near", d: HILL_NEAR, fill: SAGE };
  const meadow: CutSheet = { name: "meadow", d: MEADOW, fill: SAGE, shadow: false };
  const body: CutSheet = { name: "lamb-body", d: LAMB_BODY, fill: SURFACE };
  const ear: CutSheet = { name: "lamb-ear", d: LAMB_EAR, fill: TAN };
  const head: CutSheet = { name: "lamb-head", d: LAMB_HEAD, fill: SURFACE };
  const shell: CutSheet = { name: "shell", d: SHELL, fill: SURFACE };
  const sheets: readonly CutSheet[] = [
    sky,
    hillFar,
    hillNear,
    meadow,
    body,
    ear,
    head,
    shell,
    ...LEGS_BACK,
    ...LEGS_FRONT,
  ];

  return [
    sheetDefinitions(id, sheets),
    h(
      "defs",
      { key: "stamp-definitions" },
      h("path", { id: id("wool-curl"), d: WOOL_CURL }),
      h("path", { id: id("tuft"), d: TUFT }),
      h("path", { id: id("puff"), d: PUFF }),
    ),
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
    // Two soft clouds before the hills, so the sky is not one empty sheet.
    ...stamped(id, "puff", CLOUD_LEFT, TAN, { group: "cloud-left" }),
    ...stamped(id, "puff", CLOUD_RIGHT, TAN, { group: "cloud-right" }),
    ...cutSheets(id, [hillFar, hillNear]),
    // The far legs go behind the body, the near ones in front of it.
    ...cutSheets(id, LEGS_BACK),
    // The lamb: ear, head, body, then the curls that give the wool its edge.
    ...cutSheets(id, [ear]),
    ...cutSheets(id, [body]),
    ...stamped(id, "wool-curl", BODY_CURLS, SURFACE, { group: "body-wool", edge: 1 }),
    ...cutSheets(id, [head]),
    ...stamped(id, "wool-curl", HEAD_CURLS, SURFACE, { group: "head-wool", edge: 0.9 }),
    // The face: one eye and a soft nose line, nothing more (a generic lamb, never a character).
    h("circle", { key: "eye", cx: 264, cy: 116, r: 2, fill: INK }),
    h("path", {
      key: "nose",
      d: "M277 121c2 1.6 1.4 3.6-0.6 4.2",
      fill: "none",
      stroke: ACCENT,
      strokeWidth: 1.5,
      strokeLinecap: "round",
      opacity: 0.7,
    }),
    h("circle", { key: "cheek", cx: 258, cy: 124, r: 4.2, fill: TAN, opacity: 0.4 }),
    ...cutSheets(id, [meadow]),
    ...cutSheets(id, LEGS_FRONT),
    // The shell rests in the grass at the left, with its ridges cut as hairlines.
    ...cutSheets(id, [shell]),
    h(
      "g",
      {
        key: "shell-ridges",
        fill: "none",
        stroke: ACCENT,
        strokeWidth: 1.2,
        opacity: 0.4,
        strokeLinecap: "round",
      },
      SHELL_RIDGES.map((d) => h("path", { key: d, d })),
    ),
    h("path", { key: "shell-hinge", d: SHELL_HINGE, fill: TAN, opacity: 0.9 }),
    ...stamped(id, "tuft", SCENE_TUFTS, ACCENT, { group: "scene-grass", edge: 0.8 }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn sage strip with grass tufts and three wool curls drifting across it. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 32, 4.4, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 6.9, DIVIDER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: SAGE, shadow: false };
  const wash: CutSheet = { name: "wash", d: under.sheet, fill: ACCENT, shadow: false };
  const tufts: readonly Stamp[] = [
    { x: 24, y: 44, rotate: -4, scale: 0.9 },
    { x: 66, y: 40, rotate: 5, scale: 0.75 },
    { x: 112, y: 46, rotate: -6, scale: 0.85 },
    { x: 264, y: 44, rotate: 4, scale: 0.8 },
    { x: 312, y: 40, rotate: -5, scale: 0.9 },
    { x: 356, y: 46, rotate: 3, scale: 0.7 },
  ];
  const curls: readonly Stamp[] = [
    { x: 160, y: 38, rotate: 8, scale: 0.62 },
    { x: 182, y: 42, rotate: -12, scale: 0.7 },
    { x: 206, y: 38, rotate: 14, scale: 0.58 },
  ];
  const shell: CutSheet = {
    name: "divider-shell",
    d: "M240 52C240 42 246 34 254 30C256 28 259 28 261 30C263 28 266 28 268 30C276 34 282 42 282 52Z",
    fill: SURFACE,
  };

  return [
    sheetDefinitions(id, [strip, wash, shell]),
    h(
      "defs",
      { key: "divider-stamp-definitions" },
      h("path", { id: id("divider-curl"), d: WOOL_CURL }),
      h("path", { id: id("divider-tuft"), d: TUFT }),
    ),
    ...cutSheets(id, [strip]),
    h("use", { key: "wash-tint", href: `#${id(wash.name)}`, fill: ACCENT, opacity: 0.18 }),
    ...stamped(id, "divider-tuft", tufts, ACCENT, { group: "divider-grass", edge: 0.8 }),
    ...stamped(id, "divider-curl", curls, SURFACE, { group: "divider-wool", edge: 0.9 }),
    ...cutSheets(id, [shell]),
    h(
      "g",
      {
        key: "divider-shell-ridges",
        fill: "none",
        stroke: ACCENT,
        strokeWidth: 1,
        opacity: 0.35,
        strokeLinecap: "round",
      },
      h("path", { key: "divider-ridge-one", d: "M261 52L271 35" }),
      h("path", { key: "divider-ridge-two", d: "M261 52L261 32" }),
      h("path", { key: "divider-ridge-three", d: "M261 52L251 35" }),
    ),
  ];
}

/** The footer: a tan strip with the sage meadow in front, one curl, and a small shell at the right. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 12, 8.9, FOOTER_HEIGHT + 8);
  const meadow = tornEdge(SCENE_WIDTH, 44, 2.7, FOOTER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: TAN, shadow: false };
  const floor: CutSheet = { name: "floor", d: meadow.sheet, fill: SAGE, shadow: false };
  const shell: CutSheet = {
    name: "footer-shell",
    d: "M280 52C280 38 290 26 303 26C316 26 326 38 326 52Z",
    fill: SURFACE,
  };
  const tufts: readonly Stamp[] = [
    { x: 14, y: 52, rotate: -5, scale: 0.95 },
    { x: 48, y: 48, rotate: 4, scale: 0.8 },
    { x: 94, y: 52, rotate: -3, scale: 1.05 },
    { x: 140, y: 50, rotate: 6, scale: 0.85 },
    { x: 200, y: 52, rotate: -4, scale: 0.95 },
    { x: 244, y: 48, rotate: 5, scale: 0.8 },
    { x: 352, y: 50, rotate: -5, scale: 1 },
    { x: 378, y: 52, rotate: 3, scale: 0.85 },
  ];
  const curls: readonly Stamp[] = [
    { x: 170, y: 34, rotate: 10, scale: 0.6 },
    { x: 190, y: 40, rotate: -8, scale: 0.52 },
  ];

  return [
    sheetDefinitions(id, [strip, floor, shell]),
    h(
      "defs",
      { key: "footer-stamp-definitions" },
      h("path", { id: id("footer-curl"), d: WOOL_CURL }),
      h("path", { id: id("footer-tuft"), d: TUFT }),
    ),
    ...cutSheets(id, [strip]),
    ...cutSheets(id, [floor]),
    h("use", { key: "floor-tint", href: `#${id(floor.name)}`, fill: SAGE, opacity: 0.6 }),
    ...stamped(id, "footer-curl", curls, SURFACE, { group: "footer-wool", edge: 0.9 }),
    ...cutSheets(id, [shell]),
    h(
      "g",
      {
        key: "footer-shell-ridges",
        fill: "none",
        stroke: ACCENT,
        strokeWidth: 1.1,
        opacity: 0.4,
        strokeLinecap: "round",
      },
      h("path", { key: "footer-ridge-one", d: "M303 52L314 34" }),
      h("path", { key: "footer-ridge-two", d: "M303 52L303 30" }),
      h("path", { key: "footer-ridge-three", d: "M303 52L292 34" }),
    ),
    ...stamped(id, "footer-tuft", tufts, ACCENT, { group: "footer-grass", edge: 0.8 }),
  ];
}

/** «Corderito» in paper cut-out: the lamb on its hill, the grass divider, and the shell footer. */
export const LITTLE_LAMB_ILLUSTRATION: ThemeIllustration = {
  theme: "little-lamb",
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
