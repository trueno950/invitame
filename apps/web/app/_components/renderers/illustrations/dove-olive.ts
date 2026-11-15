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
 * «Paloma y olivo» in paper cut-out (I3d; S1-S4, style 01 of `design/theme-illustrations/01-papel-recortado.html`):
 * the dove in flight over soft hills, an olive branch rising from the near meadow with its fruit, a warm disc of
 * paper behind, and a small sprig carried in the beak. Serene and respectful: the bird is a generic dove, the
 * branch is our own spline, and nothing here is a logo, a character, or a protected image (S3).
 *
 * Every color is a theme variable of `dove-olive`, so the whole drawing re-colours with its palette; tints are
 * `opacity` on a theme color and nothing else. The white dove is a cut sheet of `surface` on a light sky, so it
 * carries a thin ink hairline on its cut edge — the paper edge the shadow alone cannot show on white.
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
const ONE: ThemePaint = "var(--inv-decoration-one)";
const TWO: ThemePaint = "var(--inv-decoration-two)";

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
 * A reusable shape placed many times — leaves, olive fruit, cloud puffs — in one stamped group with one offset
 * shadow behind it, so a branch is not forty separate shadows and a cloud is one glued piece of paper.
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

/** A translucent hairline along a sheet the theme paints white, so it reads as paper on a light sky. */
function inkEdge(
  id: IllustrationId,
  names: readonly string[],
  width: number,
  opacity: number,
): ReactElement[] {
  return names.map((name) =>
    h("use", {
      key: `${name}-ink-edge`,
      href: `#${id(name)}`,
      fill: "none",
      stroke: INK,
      strokeWidth: width,
      opacity,
    }),
  );
}

/** The sky sheet: the torn paper the whole diorama is built on. */
const SKY_TEAR_BASE = 10;

/** A hand-cut sun disc, not a perfect circle: warm paper behind the olive sky. */
const SUN =
  "M296 22C303.5 20.2 315.5 21.6 321.5 26C327.5 30.4 332.5 39.6 332.5 46C332.5 52.4 326.6 61.6 " +
  "320.5 65C314.4 68.4 302.6 68.6 296.5 65.5C290.4 62.4 284.8 53.4 285 46.5C285.2 39.6 288.5 23.8 296 22Z";

/** One unit puff, scaled by a stamp to make every cloud of the theme: overlapping circles glued as one piece. */
const PUFF = "M-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0Z";

/** The big cloud at the left of the sky: five puffs of different sizes over a flat-ish base. */
const CLOUD_LEFT: readonly Stamp[] = [
  { x: 34, y: 58, rotate: 0, scale: 17 },
  { x: 54, y: 48, rotate: 0, scale: 22 },
  { x: 78, y: 56, rotate: 0, scale: 16 },
  { x: 46, y: 68, rotate: 0, scale: 14 },
  { x: 68, y: 68, rotate: 0, scale: 12 },
];

/** A small cloud higher and further right, so the sky is not one repeated cloud. */
const CLOUD_SMALL: readonly Stamp[] = [
  { x: 152, y: 34, rotate: 0, scale: 10 },
  { x: 168, y: 28, rotate: 0, scale: 13 },
  { x: 184, y: 35, rotate: 0, scale: 9 },
  { x: 168, y: 41, rotate: 0, scale: 8 },
];

/** The far ridge: one long spline from edge to edge, well above the near hills. */
const HILL_FAR =
  "M-8 146C8 138 30 140 48 142C66 144 84 150 102 150C120 150 138 142 156 141C174 140 192 146 210 " +
  "147C228 148 246 142 264 141C282 140 302 145 320 146C338 147 372 142 398 150L398 204L-8 204Z";

/** The two near hills, the left one taller: the meadow the branch grows from. */
const HILL_LEFT =
  "M-8 168C2 164 18 152 32 148C46 144 64 143 78 146C92 149 108 156 118 162C128 168 142 176 132 " +
  "180C122 184 40 182 -8 181Z";

const HILL_RIGHT =
  "M230 180C238 175 254 164 268 160C282 156 300 154 314 156C328 158 342 164 352 168C362 172 386 " +
  "180 376 182C366 184 258 184 236 183C214 182 226 183 230 180Z";

/** The meadow in front, in the theme accent: a shallow torn band, not a straight line. */
const MEADOW =
  "M-8 176C6 174 20 170 34 171C48 172 62 178 78 178C94 178 108 171 124 171C140 171 156 178 172 " +
  "178C188 178 202 171 218 171C234 171 250 178 266 178C282 178 296 171 312 171C328 171 344 177 " +
  "358 177C372 177 386 173 398 171L398 204L-8 204Z";

/** The olive branch rising from the near meadow: one thin tapered ribbon, no stroked line. */
const OLIVE_BRANCH =
  "M-10 204C12 192 32 178 50 162C68 146 82 126 92 108L96 110C86 130 72 152 54 170C36 188 14 200 -8 208Z";

/** One leaf: a pointed olive leaf, stamped along the branch on both sides. */
const OLIVE_LEAF = "M0 0C5-7.2 13.4-8 17-3C12.6 3 5 4.2 0 0Z";

/** The leaves, alternating sides of the branch and shrinking toward the tip. */
const OLIVE_LEAVES: readonly Stamp[] = [
  { x: 6, y: 194, rotate: -118, scale: 1.7 },
  { x: 18, y: 184, rotate: 32, scale: 1.8 },
  { x: 32, y: 173, rotate: -112, scale: 1.95 },
  { x: 45, y: 162, rotate: 36, scale: 1.85 },
  { x: 57, y: 149, rotate: -108, scale: 2 },
  { x: 69, y: 135, rotate: 38, scale: 1.8 },
  { x: 79, y: 121, rotate: -104, scale: 1.85 },
  { x: 88, y: 108, rotate: 40, scale: 1.6 },
  { x: 95, y: 97, rotate: -100, scale: 1.5 },
  { x: 64, y: 140, rotate: -126, scale: 1.5 },
];

/** Three olives hanging among the leaves, in the accent so they read against the sage foliage. */
const OLIVE_FRUIT: readonly Stamp[] = [
  { x: 47, y: 152, rotate: 0, scale: 3.6 },
  { x: 74, y: 118, rotate: 0, scale: 3.1 },
  { x: 39, y: 172, rotate: 0, scale: 2.8 },
];

/** The dove's body: from the tail root, over the back, to the crown, belly, and breast. */
const DOVE_BODY =
  "M150 112C146 104 150 92 160 87C170 82 184 79 198 77C212 75 224 72 236 70C246 68 256 68 263 " +
  "72C268 75 270 79 268 83C270 88 266 93 258 96C250 99 239 100 229 103C219 106 209 111 198 " +
  "115C187 119 173 120 163 118C154 116 149 117 150 112Z";

/** The raised near wing: a broad blade from the shoulder to the tip, its outer edge broken by feather tips. */
const DOVE_WING =
  "M188 104C184 86 192 64 206 48C218 34 232 24 244 20C249 18 252 22 249 27C241 43 233 60 226 78C221 " +
  "92 213 102 205 108C197 113 189 110 188 104Z";

/** A feather tip of the wing: a short blade with a soft rounded end, stamped along the wing's outer edge. */
const FEATHER_TIP = "M0 0C3.2-7 4.4-14.6 2.8-21.4C2-25-0.6-25.6-2.2-22.8C-4.4-16-3.6-7.6 0 0Z";

/**
 * The feather tips of the raised wing, layered along its outer edge from the shoulder to the body, in uneven
 * lengths so the wing reads as cut feathers and not as a single leaf blade.
 */
const WING_TIPS: readonly Stamp[] = [
  { x: 240, y: 22, rotate: 58, scale: 0.78 },
  { x: 233, y: 30, rotate: 46, scale: 1.06 },
  { x: 228, y: 38, rotate: 40, scale: 0.92 },
  { x: 222, y: 48, rotate: 34, scale: 1.02 },
  { x: 216, y: 58, rotate: 29, scale: 0.86 },
  { x: 209, y: 70, rotate: 23, scale: 0.76 },
  { x: 201, y: 83, rotate: 17, scale: 0.64 },
];

/** The far wing, smaller and lower, behind the body so the two wings read as one beat. */
const DOVE_WING_FAR =
  "M156 100C152 88 158 70 168 59C176 50 185 44 193 42C197 41 199 45 196 50C189 62 183 75 178 " +
  "88C174 98 168 104 162 106C157 107 157 104 156 100Z";

/** Three tail feathers fanning back and down from the tail root. */
const DOVE_TAILS: readonly { readonly name: string; readonly d: string }[] = [
  { name: "tail-upper", d: "M152 100C140 96 128 95 116 98C126 102 138 106 151 107Z" },
  { name: "tail-middle", d: "M151 107C137 107 125 110 114 116C126 117 139 114 151 111Z" },
  { name: "tail-lower", d: "M151 112C141 116 131 122 124 130C135 128 145 122 151 117Z" },
];

/** The beak, in the theme accent: a small cut triangle ahead of the head. */
const DOVE_BEAK = "M266 81L277 84L267 90Z";

/** The sprig carried in the beak: its own thin stem and three small leaves. */
const BEAK_SPRIG = "M277 85C284 84 291 86 297 90L296 93C290 89 284 88 278 89Z";

const BEAK_SPRIG_LEAVES: readonly Stamp[] = [
  { x: 283, y: 85, rotate: -40, scale: 0.66 },
  { x: 290, y: 87, rotate: 16, scale: 0.6 },
  { x: 297, y: 89, rotate: -26, scale: 0.5 },
];

/** Three far birds: pairs of accent strokes, small enough to read as distance. */
const FAR_BIRDS: readonly string[] = [
  "M44 98C48 94 52 93 56 95",
  "M66 88C69 85 72 84 75 86",
  "M28 78C31 75 34 74 37 76",
];

/** The scattered olives on the meadow, so the branch's fruit has a story. */
const MEADOW_FRUIT: readonly Stamp[] = [
  { x: 132, y: 190, rotate: 0, scale: 2.4 },
  { x: 300, y: 188, rotate: 0, scale: 2.6 },
  { x: 262, y: 194, rotate: 0, scale: 2 },
];

/** The header diorama: sky, sun, clouds, hills, meadow, branch, and the dove over them. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, SKY_TEAR_BASE, 1.6, SCENE_HEIGHT + 8);
  const sky: CutSheet = { name: "sky", d: tear.sheet, fill: SOFT, shadow: false };
  const sun: CutSheet = { name: "sun", d: SUN, fill: TWO };
  const hillFar: CutSheet = { name: "hill-far", d: HILL_FAR, fill: TWO };
  const hillLeft: CutSheet = { name: "hill-left", d: HILL_LEFT, fill: ONE };
  const hillRight: CutSheet = { name: "hill-right", d: HILL_RIGHT, fill: ONE };
  const meadow: CutSheet = { name: "meadow", d: MEADOW, fill: ACCENT, shadow: false };
  const branch: CutSheet = { name: "olive-branch", d: OLIVE_BRANCH, fill: ACCENT };
  const wingFar: CutSheet = { name: "dove-wing-far", d: DOVE_WING_FAR, fill: SURFACE };
  const body: CutSheet = { name: "dove-body", d: DOVE_BODY, fill: SURFACE };
  const wing: CutSheet = { name: "dove-wing", d: DOVE_WING, fill: SURFACE };
  const tails: readonly CutSheet[] = DOVE_TAILS.map((tail) => ({
    name: tail.name,
    d: tail.d,
    fill: SURFACE,
  }));
  const beak: CutSheet = { name: "dove-beak", d: DOVE_BEAK, fill: ACCENT, shadow: false };
  const sprig: CutSheet = { name: "beak-sprig", d: BEAK_SPRIG, fill: ACCENT, shadow: false };
  const sheets: readonly CutSheet[] = [
    sky,
    sun,
    hillFar,
    hillLeft,
    hillRight,
    meadow,
    branch,
    wingFar,
    ...tails,
    body,
    wing,
    beak,
    sprig,
  ];

  return [
    sheetDefinitions(id, sheets),
    h(
      "defs",
      { key: "stamp-definitions" },
      h("path", { id: id("olive-leaf"), d: OLIVE_LEAF }),
      h("path", { id: id("puff"), d: PUFF }),
      h("path", { id: id("feather-tip"), d: FEATHER_TIP }),
    ),
    // The sky sheet, with the lighter tear line along its torn edge.
    ...cutSheets(id, [sky]),
    h("use", {
      key: "torn-line",
      href: `#${id(sky.name)}`,
      fill: "none",
      stroke: SURFACE,
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    // The sun, with its own lighter halo and a cut hairline.
    h("use", {
      key: "sun-halo",
      href: `#${id(sun.name)}`,
      fill: TWO,
      opacity: 0.4,
      transform: "translate(7 -6)",
    }),
    ...cutSheets(id, [sun]),
    ...inkEdge(id, ["sun"], 1, 0.16),
    h("circle", { key: "sun-glow", cx: 304, cy: 37, r: 8.5, fill: SURFACE, opacity: 0.32 }),
    // The clouds: one glued piece of paper per cloud, so the puffs share one shadow.
    ...stamped(id, "puff", CLOUD_SMALL, SURFACE, { group: "cloud-small" }),
    ...stamped(id, "puff", CLOUD_LEFT, SURFACE, { group: "cloud-left" }),
    // Far birds between the clouds and the ridge.
    h(
      "g",
      { key: "far-birds", fill: "none", stroke: ACCENT, strokeWidth: 1.5, opacity: 0.4 },
      FAR_BIRDS.map((d, index) =>
        h("path", { key: `far-bird-${index}`, d, strokeLinecap: "round" }),
      ),
    ),
    ...cutSheets(id, [hillFar, hillLeft, hillRight]),
    // The branch: the stem, the leaves on both sides of it, then the fruit.
    ...cutSheets(id, [branch]),
    ...stamped(id, "olive-leaf", OLIVE_LEAVES, ACCENT),
    ...stamped(id, "puff", OLIVE_FRUIT, ONE, { group: "olive-fruit" }),
    // The dove: the far wing, the tail feathers, the body, the near wing and its feather tips.
    ...cutSheets(id, [wingFar]),
    ...cutSheets(id, tails),
    ...cutSheets(id, [body, wing]),
    ...stamped(id, "feather-tip", WING_TIPS, SURFACE, { group: "wing-tips", edge: 1 }),
    ...inkEdge(
      id,
      ["dove-wing-far", "tail-upper", "tail-middle", "tail-lower", "dove-body", "dove-wing"],
      1.1,
      0.2,
    ),
    // The face: one eye, a soft cheek, and the beak with its sprig.
    h("circle", { key: "eye", cx: 256, cy: 78.5, r: 2.1, fill: INK }),
    h("circle", { key: "cheek", cx: 247, cy: 87, r: 5.4, fill: TWO, opacity: 0.45 }),
    ...cutSheets(id, [beak, sprig]),
    ...stamped(id, "olive-leaf", BEAK_SPRIG_LEAVES, ACCENT, { group: "beak-sprig-leaves" }),
    // The meadow closes the diorama in front of the bird, with the olives that fell on it.
    ...cutSheets(id, [meadow]),
    ...stamped(id, "puff", MEADOW_FRUIT, TWO, { group: "meadow-fruit" }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn sage strip carrying a level olive branch from one section to the next. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 30, 3.4, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 5.7, DIVIDER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: ONE, shadow: false };
  const wash: CutSheet = { name: "wash", d: under.sheet, fill: ACCENT, shadow: false };
  const branch: CutSheet = {
    name: "divider-branch",
    d: "M-4 36C58 30 118 27 178 29C238 31 300 34 396 30L396 35C300 39 238 36 178 34C118 32 58 35 -4 41Z",
    fill: ACCENT,
  };
  const leaves: readonly Stamp[] = [
    { x: 14, y: 34, rotate: -52, scale: 1.5 },
    { x: 46, y: 38, rotate: 130, scale: 1.45 },
    { x: 78, y: 32, rotate: -48, scale: 1.5 },
    { x: 112, y: 36, rotate: 132, scale: 1.4 },
    { x: 146, y: 30, rotate: -50, scale: 1.45 },
    { x: 180, y: 34, rotate: 128, scale: 1.35 },
    { x: 214, y: 31, rotate: -46, scale: 1.4 },
    { x: 248, y: 33, rotate: 130, scale: 1.3 },
    { x: 282, y: 31, rotate: -48, scale: 1.35 },
    { x: 318, y: 33, rotate: 128, scale: 1.25 },
    { x: 352, y: 31, rotate: -44, scale: 1.2 },
  ];
  const fruit: readonly Stamp[] = [
    { x: 30, y: 36, rotate: 0, scale: 3 },
    { x: 96, y: 33, rotate: 0, scale: 2.8 },
    { x: 164, y: 31, rotate: 0, scale: 3 },
    { x: 232, y: 32, rotate: 0, scale: 2.6 },
    { x: 300, y: 31, rotate: 0, scale: 2.8 },
    { x: 366, y: 31, rotate: 0, scale: 2.4 },
  ];

  return [
    sheetDefinitions(id, [strip, wash, branch]),
    h(
      "defs",
      { key: "divider-stamp-definitions" },
      h("path", { id: id("divider-leaf"), d: OLIVE_LEAF }),
      h("path", { id: id("divider-puff"), d: PUFF }),
    ),
    ...cutSheets(id, [strip]),
    h("use", {
      key: "wash-tint",
      href: `#${id(wash.name)}`,
      fill: ACCENT,
      opacity: 0.2,
    }),
    ...cutSheets(id, [branch]),
    ...stamped(id, "divider-leaf", leaves, ACCENT, { group: "divider-leaves" }),
    ...stamped(id, "divider-puff", fruit, ONE, { group: "divider-fruit" }),
  ];
}

/** The footer: a sand strip with two olive branches curving up from the corners and the birds leaving. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 7.4, FOOTER_HEIGHT + 8);
  const hill = tornEdge(SCENE_WIDTH, 44, 2.1, FOOTER_HEIGHT + 8);
  const strip: CutSheet = { name: "strip", d: top.sheet, fill: TWO, shadow: false };
  const ground: CutSheet = { name: "footer-ground", d: hill.sheet, fill: ACCENT, shadow: false };
  const leftBranch: CutSheet = {
    name: "footer-branch-left",
    d: "M-6 60C14 48 26 34 32 18L36 20C30 38 18 52 -2 64Z",
    fill: ACCENT,
  };
  const rightBranch: CutSheet = {
    name: "footer-branch-right",
    d: "M396 60C376 48 364 34 358 18L354 20C360 38 372 52 392 64Z",
    fill: ACCENT,
  };
  const leftLeaves: readonly Stamp[] = [
    { x: 4, y: 54, rotate: -56, scale: 1.6 },
    { x: 10, y: 46, rotate: 128, scale: 1.5 },
    { x: 18, y: 38, rotate: -62, scale: 1.45 },
    { x: 24, y: 30, rotate: 122, scale: 1.35 },
    { x: 30, y: 22, rotate: -68, scale: 1.2 },
    { x: 40, y: 50, rotate: 30, scale: 1.1 },
  ];
  const rightLeaves: readonly Stamp[] = [
    { x: 386, y: 54, rotate: 236, scale: 1.6 },
    { x: 380, y: 46, rotate: 52, scale: 1.5 },
    { x: 372, y: 38, rotate: 242, scale: 1.45 },
    { x: 366, y: 30, rotate: 58, scale: 1.35 },
    { x: 360, y: 22, rotate: 248, scale: 1.2 },
    { x: 350, y: 50, rotate: 150, scale: 1.1 },
  ];
  const fruit: readonly Stamp[] = [
    { x: 30, y: 26, rotate: 0, scale: 2.4 },
    { x: 360, y: 26, rotate: 0, scale: 2.4 },
    { x: 84, y: 56, rotate: 0, scale: 2 },
    { x: 306, y: 56, rotate: 0, scale: 2 },
  ];

  return [
    sheetDefinitions(id, [strip, ground, leftBranch, rightBranch]),
    h(
      "defs",
      { key: "footer-stamp-definitions" },
      h("path", { id: id("footer-leaf"), d: OLIVE_LEAF }),
      h("path", { id: id("footer-puff"), d: PUFF }),
    ),
    ...cutSheets(id, [strip]),
    h("use", {
      key: "ground-tint",
      href: `#${id(ground.name)}`,
      fill: ACCENT,
      opacity: 0.22,
    }),
    h(
      "g",
      { key: "footer-birds", fill: "none", stroke: ACCENT, strokeWidth: 1.4, opacity: 0.4 },
      h("path", {
        key: "footer-bird-one",
        d: "M170 26C174 22 178 21 182 23",
        strokeLinecap: "round",
      }),
      h("path", {
        key: "footer-bird-two",
        d: "M192 18C195 15 198 14 201 16",
        strokeLinecap: "round",
      }),
      h("path", {
        key: "footer-bird-three",
        d: "M214 28C217 25 220 24 223 26",
        strokeLinecap: "round",
      }),
    ),
    ...cutSheets(id, [leftBranch, rightBranch]),
    ...stamped(id, "footer-leaf", [...leftLeaves, ...rightLeaves], ONE, { group: "footer-leaves" }),
    ...stamped(id, "footer-puff", fruit, ACCENT, { group: "footer-fruit", edge: 0.7 }),
  ];
}

/** «Paloma y olivo» in paper cut-out: the dove over the hills, the branch divider, and the footer strip. */
export const DOVE_OLIVE_ILLUSTRATION: ThemeIllustration = {
  theme: "dove-olive",
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
