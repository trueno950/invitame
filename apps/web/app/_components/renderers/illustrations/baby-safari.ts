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
 * «Safari bebé» in paper cut-out (I3c; S1-S4, the technique of
 * `design/theme-illustrations/01-papel-recortado.html`): a savanna for the header — a torn sheet of pale paper,
 * a warm sun, two ranges of soft hills, a tall giraffe and a small elephant of our own simple shapes, broad
 * leaves at both edges, tufts of grass along the ground, and a few birds — a torn divider of leaves between two
 * sections, and a footer strip where the grass runs out of the page.
 *
 * Original work (S3): the giraffe and the elephant are generic paper shapes — a body, a neck, a head, two
 * ossicones, a trunk — and could be any friendly pair; they are not a character, a mascot, a logo, or a
 * protected name, and the drawing carries no text. Every color is a theme variable of `baby-safari`; tints are
 * `opacity` on a theme color, so terracotta stays the only warm note in the greens.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** One decimal is enough for a 390-unit drawing, and it keeps the markup cheap to ship inline. */
function n(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A hand-cut disc: an ellipse whose four quadrants differ by a hair, so it reads as cut, not drawn. */
function disc(cx: number, cy: number, radius: number, squash = 1): string {
  const rx = radius;
  const ry = radius * squash;
  const k = 0.5523;

  return (
    `M${n(cx - rx)} ${n(cy)}` +
    `C${n(cx - rx)} ${n(cy - ry * k)} ${n(cx - rx * k * 1.02)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}` +
    `C${n(cx + rx * k)} ${n(cy - ry * 0.99)} ${n(cx + rx)} ${n(cy - ry * k)} ${n(cx + rx)} ${n(cy)}` +
    `C${n(cx + rx * 0.99)} ${n(cy + ry * k)} ${n(cx + rx * k)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}` +
    `C${n(cx - rx * k * 0.99)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + ry * k * 1.01)} ${n(cx - rx)} ${n(cy)}Z`
  );
}

/** A soft hill: a wide arch whose crown sits a little left or right of the middle, closed to the bottom. */
function hill(left: number, right: number, crown: number, bottom: number, lean = 0): string {
  const span = right - left;
  const crest = (left + right) / 2 + lean;

  return (
    `M${n(left)} ${n(bottom)}` +
    `C${n(left + span * 0.14)} ${n(crown + (bottom - crown) * 0.34)} ${n(crest - span * 0.24)} ${n(crown)} ${n(crest)} ${n(crown)}` +
    `C${n(crest + span * 0.26)} ${n(crown)} ${n(right - span * 0.12)} ${n(crown + (bottom - crown) * 0.3)} ${n(right)} ${n(bottom)}` +
    `L${n(right)} ${n(bottom + 40)}L${n(left)} ${n(bottom + 40)}Z`
  );
}

/**
 * A palm leaf: a broad, round-tipped blade of paper whose base sits at (`x`, `y`), so a leaf is placed with a
 * rotation around its own base and a leaf lying on the ground is the same shape tilted. The belly is wide and
 * the tip is gently rounded, so it reads as a palm leaf and not as a pointed grass blade.
 */
function leaf(x: number, y: number, length: number, width: number): string {
  return (
    `M${n(x)} ${n(y)}` +
    `C${n(x - width * 1.08)} ${n(y - length * 0.2)} ${n(x - width * 1.12)} ${n(y - length * 0.6)} ${n(x - width * 0.44)} ${n(y - length * 0.9)}` +
    `C${n(x - width * 0.18)} ${n(y - length * 1.02)} ${n(x + width * 0.18)} ${n(y - length * 1.02)} ${n(x + width * 0.44)} ${n(y - length * 0.9)}` +
    `C${n(x + width * 1.12)} ${n(y - length * 0.6)} ${n(x + width * 1.08)} ${n(y - length * 0.2)} ${n(x)} ${n(y)}Z`
  );
}

/** A blade of grass: a narrow crescent leaning a little, so a tuft is never a row of sticks. */
function blade(x: number, base: number, height: number, lean: number): string {
  return (
    `M${n(x - 2.6)} ${n(base)}` +
    `C${n(x - 3)} ${n(base - height * 0.5)} ${n(x + lean - 1.6)} ${n(base - height * 0.82)} ${n(x + lean)} ${n(base - height)}` +
    `C${n(x + lean * 0.4 + 2.4)} ${n(base - height * 0.66)} ${n(x + 3.2)} ${n(base - height * 0.3)} ${n(x + 2.6)} ${n(base)}Z`
  );
}

/** A tuft of grass: three blades of different heights, cut as one piece. */
function tuft(x: number, base: number, height: number, lean: number): string {
  return (
    blade(x - 4, base, height * 0.72, lean * 0.5) +
    blade(x, base, height, lean) +
    blade(x + 4.4, base, height * 0.58, lean * 1.4)
  );
}

/** One bird: two strokes of ink, the far wing shorter, so it reads as a bird at 8 px. */
function bird(key: string, x: number, y: number, scale: number): ReactElement {
  return h("path", {
    key,
    d: "M-7 0C-4.6 -3.4 -2 -3.4 0 -0.6C2 -3.4 4.6 -3.4 7 0",
    fill: "none",
    stroke: "var(--inv-accent)",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    transform: `translate(${x} ${y}) scale(${scale})`,
    opacity: 0.55,
  });
}

const SUN_HALO = disc(336, 44, 26);
const SUN = disc(336, 44, 18);
const HILL_FAR_LEFT = hill(-14, 196, 132, 156, -20);
const HILL_FAR_RIGHT = hill(150, 404, 138, 158, 14);
const HILL_NEAR_LEFT = hill(-14, 176, 150, 172, 8);
const HILL_NEAR_RIGHT = hill(206, 404, 148, 172, -6);
const GROUND =
  "M-8 168C6 165 22 166 38 167C54 168 68 164 84 165C100 166 116 168 132 167C148 166 164 164 180 165C196 " +
  "166 212 168 228 167C244 166 260 164 276 165C292 166 308 168 324 167C340 166 356 164 372 165C382 166 " +
  "392 167 398 168L398 202L-8 202Z";

/** The giraffe: a body with a shoulder, a long neck, a head with two ossicones, four legs, and its patches. */
const GIRAFFE_BODY =
  "M100 166C90 162 86 148 94 139C102 130 124 128 138 131C150 134 156 143 153 154C150 164 146 168 136 168Z";
const GIRAFFE_NECK = "M132 140C126 120 130 100 141 89L160 96C148 108 144 124 148 142Z";
const GIRAFFE_HEAD = "M150 96C150 86 158 79 169 80C180 81 186 88 185 95C184 102 175 105 165 104Z";
const GIRAFFE_LEGS = [
  "M101 160H109C110 166 110 172 109 178H101C100 172 100 166 101 160Z",
  "M118 162H126C127 168 127 173 126 179H118C117 173 117 167 118 162Z",
  "M134 164H142C143 169 143 174 142 179H134C133 174 133 168 134 164Z",
  "M146 162H153C154 167 154 172 153 177H146C145 172 145 166 146 162Z",
] as const;
const GIRAFFE_PATCHES: readonly string[] = [
  disc(108, 148, 6.4, 0.86),
  disc(124, 156, 5.4, 0.9),
  disc(133, 141, 5, 0.88),
  disc(140, 124, 4.6),
  disc(143, 108, 4.2),
  disc(152, 96, 3.6),
];
const GIRAFFE_OSSICONES: readonly string[] = [
  "M156 82C155 77 155 74 156 71",
  "M168 81C168 76 169 73 170 70",
];

/** The elephant: a round body, a head with one big ear, a trunk, four legs, a tail, and a small tusk. */
const ELEPHANT_BODY = disc(302, 146, 31, 0.84);
const ELEPHANT_HEAD = disc(266, 148, 22, 0.96);
const ELEPHANT_EAR = disc(276, 145, 17, 0.92);
const ELEPHANT_TRUNK =
  "M252 138C240 144 232 156 232 168C232 176 236 181 241 181C246 181 249 176 246 172C243 169 240 172 241 176" +
  "L238 176C234 172 234 164 238 158C242 151 248 146 254 143Z";
const ELEPHANT_LEGS = [
  "M284 160H293C294 167 294 172 293 178H284C283 172 283 167 284 160Z",
  "M298 162H307C308 168 308 173 307 179H298C297 173 297 168 298 162Z",
  "M313 162H322C323 168 323 173 322 179H313C312 173 312 168 313 162Z",
  "M326 158H334C335 165 335 171 334 177H326C325 171 325 165 326 158Z",
] as const;

const LEAVES_LEFT: readonly {
  readonly d: string;
  readonly fill: ThemePaint;
  readonly opacity: number;
}[] = [
  { d: leaf(14, 202, 84, 46), fill: "var(--inv-decoration-two)", opacity: 1 },
  { d: leaf(48, 204, 104, 52), fill: "var(--inv-accent)", opacity: 0.88 },
  { d: leaf(4, 206, 58, 30), fill: "var(--inv-decoration-two)", opacity: 0.6 },
];

const LEAVES_RIGHT: readonly {
  readonly d: string;
  readonly fill: ThemePaint;
  readonly opacity: number;
}[] = [
  { d: leaf(376, 202, 80, 44), fill: "var(--inv-decoration-two)", opacity: 1 },
  { d: leaf(344, 204, 100, 50), fill: "var(--inv-accent)", opacity: 0.84 },
  { d: leaf(388, 206, 54, 28), fill: "var(--inv-decoration-two)", opacity: 0.58 },
];

const GRASS_ROW = [
  tuft(64, 182, 18, 3),
  tuft(94, 190, 14, -2),
  tuft(176, 188, 12, 2),
  tuft(214, 182, 16, -3),
  tuft(246, 190, 12, 2),
  tuft(334, 188, 14, -2),
  tuft(356, 180, 18, 3),
].join("");

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 1.9, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "sun-halo", d: SUN_HALO, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "sun", d: SUN, fill: "var(--inv-decoration-one)" },
    { name: "hill-far-left", d: HILL_FAR_LEFT, fill: "var(--inv-accent)", shadow: false },
    { name: "hill-far-right", d: HILL_FAR_RIGHT, fill: "var(--inv-accent)", shadow: false },
    { name: "hill-near-left", d: HILL_NEAR_LEFT, fill: "var(--inv-decoration-two)" },
    { name: "hill-near-right", d: HILL_NEAR_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "ground", d: GROUND, fill: "var(--inv-accent)", shadow: false },
    { name: "giraffe-body", d: GIRAFFE_BODY, fill: "var(--inv-decoration-one)" },
    { name: "giraffe-neck", d: GIRAFFE_NECK, fill: "var(--inv-decoration-one)" },
    { name: "giraffe-head", d: GIRAFFE_HEAD, fill: "var(--inv-decoration-one)", outline: true },
    { name: "giraffe-leg-one", d: GIRAFFE_LEGS[0], fill: "var(--inv-decoration-one)" },
    { name: "giraffe-leg-two", d: GIRAFFE_LEGS[1], fill: "var(--inv-decoration-one)" },
    { name: "giraffe-leg-three", d: GIRAFFE_LEGS[2], fill: "var(--inv-decoration-one)" },
    { name: "giraffe-leg-four", d: GIRAFFE_LEGS[3], fill: "var(--inv-decoration-one)" },
    { name: "elephant-body", d: ELEPHANT_BODY, fill: "var(--inv-decoration-two)" },
    { name: "elephant-head", d: ELEPHANT_HEAD, fill: "var(--inv-decoration-two)" },
    { name: "elephant-ear", d: ELEPHANT_EAR, fill: "var(--inv-accent)", shadow: false },
    { name: "elephant-trunk", d: ELEPHANT_TRUNK, fill: "var(--inv-decoration-two)" },
    { name: "elephant-leg-one", d: ELEPHANT_LEGS[0], fill: "var(--inv-decoration-two)" },
    { name: "elephant-leg-two", d: ELEPHANT_LEGS[1], fill: "var(--inv-decoration-two)" },
    { name: "elephant-leg-three", d: ELEPHANT_LEGS[2], fill: "var(--inv-decoration-two)" },
    { name: "elephant-leg-four", d: ELEPHANT_LEGS[3], fill: "var(--inv-decoration-two)" },
    { name: "grass", d: GRASS_ROW, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "torn-line",
      href: `#${id("sheet")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    h("use", {
      key: "sun-halo-fill",
      href: `#${id("sun-halo")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.3,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
    // The far range is a tint of the theme accent, so the hills step back without a new color.
    h(
      "g",
      { key: "hills-far", opacity: 0.15 },
      ...cutSheets(id, [sheets[3] as CutSheet, sheets[4] as CutSheet]),
    ),
    h(
      "g",
      { key: "hills-near", opacity: 0.55 },
      ...cutSheets(id, [sheets[5] as CutSheet, sheets[6] as CutSheet]),
    ),
    ...cutSheets(id, [sheets[7] as CutSheet]),
    h("use", {
      key: "ground-line",
      href: `#${id("ground")}`,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 1.4,
      opacity: 0.5,
    }),
    bird("bird-one", 74, 62, 1),
    bird("bird-two", 106, 50, 0.8),
    bird("bird-three", 250, 66, 0.72),
    // The giraffe, back to front: legs, body, neck, head, ossicones, patches, and its face.
    ...cutSheets(id, [
      sheets[11] as CutSheet,
      sheets[12] as CutSheet,
      sheets[13] as CutSheet,
      sheets[14] as CutSheet,
      sheets[8] as CutSheet,
      sheets[9] as CutSheet,
      sheets[10] as CutSheet,
    ]),
    h(
      "g",
      { key: "giraffe-patches", fill: "var(--inv-surface)", opacity: 0.62 },
      GIRAFFE_PATCHES.map((d, index) => h("path", { key: `patch-${index}`, d })),
    ),
    h(
      "g",
      {
        key: "giraffe-ossicones",
        fill: "none",
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 2.6,
        strokeLinecap: "round",
      },
      GIRAFFE_OSSICONES.map((d, index) => h("path", { key: `ossicone-${index}`, d })),
    ),
    h("circle", {
      key: "giraffe-knob-one",
      cx: 156,
      cy: 70,
      r: 2.8,
      fill: "var(--inv-decoration-two)",
    }),
    h("circle", {
      key: "giraffe-knob-two",
      cx: 170,
      cy: 69,
      r: 2.8,
      fill: "var(--inv-decoration-two)",
    }),
    h("circle", { key: "giraffe-eye", cx: 170, cy: 89, r: 1.9, fill: "var(--inv-ink)" }),
    h("circle", { key: "giraffe-nostril", cx: 180, cy: 94, r: 1.3, fill: "var(--inv-ink)" }),
    h("path", {
      key: "giraffe-smile",
      d: "M171 97C174 99 178 99 181 96",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
    }),
    // The elephant: legs, body, head, ear, trunk, tail, and its face.
    ...cutSheets(id, [
      sheets[19] as CutSheet,
      sheets[20] as CutSheet,
      sheets[21] as CutSheet,
      sheets[22] as CutSheet,
      sheets[15] as CutSheet,
      sheets[16] as CutSheet,
    ]),
    h("use", {
      key: "elephant-ear-tint",
      href: `#${id("elephant-ear")}`,
      fill: "var(--inv-accent)",
      opacity: 0.24,
    }),
    h("use", {
      key: "elephant-ear-line",
      href: `#${id("elephant-ear")}`,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.2,
      opacity: 0.38,
    }),
    ...cutSheets(id, [sheets[18] as CutSheet]),
    h("use", {
      key: "elephant-trunk-edge",
      href: `#${id("elephant-trunk")}`,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.3,
      opacity: 0.4,
    }),
    h("path", {
      key: "elephant-trunk-line",
      d: "M236 150C233 158 232 166 234 172",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      opacity: 0.22,
    }),
    h("path", {
      key: "elephant-tail",
      d: "M330 142C337 146 338 153 335 159",
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 2.8,
      strokeLinecap: "round",
    }),
    h("circle", {
      key: "elephant-tuft",
      cx: 335,
      cy: 161,
      r: 2.6,
      fill: "var(--inv-accent)",
      opacity: 0.6,
    }),
    h("circle", { key: "elephant-eye", cx: 258, cy: 138, r: 2, fill: "var(--inv-ink)" }),
    h("path", {
      key: "elephant-tusk",
      d: "M247 154C243 156 242 160 244 163C246 160 248 157 250 155Z",
      fill: "var(--inv-surface)",
      opacity: 0.95,
    }),
    h(
      "g",
      { key: "leaves-left" },
      LEAVES_LEFT.map((piece, index) =>
        h("path", {
          key: `leaf-left-${index}`,
          d: piece.d,
          fill: piece.fill,
          opacity: piece.opacity,
        }),
      ),
    ),
    h(
      "g",
      { key: "leaves-right" },
      LEAVES_RIGHT.map((piece, index) =>
        h("path", {
          key: `leaf-right-${index}`,
          d: piece.d,
          fill: piece.fill,
          opacity: piece.opacity,
        }),
      ),
    ),
    h(
      "g",
      {
        key: "leaf-veins",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.3,
        opacity: 0.36,
        strokeLinecap: "round",
      },
      h("path", { key: "vein-left", d: "M48 204C47 176 46 150 45 104" }),
      h("path", { key: "vein-right", d: "M344 204C345 176 347 150 349 108" }),
    ),
    h("use", {
      key: "grass-fill",
      href: `#${id("grass")}`,
      fill: "var(--inv-accent)",
      opacity: 0.55,
    }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 24, 2.7, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 38, 5.1, DIVIDER_HEIGHT + 8);
  const leaves = [
    leaf(28, 54, 46, 15),
    leaf(58, 56, 40, 13),
    leaf(88, 54, 30, 10),
    leaf(332, 54, 44, 15),
    leaf(360, 56, 34, 11),
  ].join("");
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "leaves", d: leaves, fill: "var(--inv-accent)" },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.22,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
    h("path", {
      key: "tuft-one",
      d: tuft(150, 54, 20, 2),
      fill: "var(--inv-accent)",
      opacity: 0.5,
    }),
    h("path", {
      key: "tuft-two",
      d: tuft(196, 52, 26, -2),
      fill: "var(--inv-accent)",
      opacity: 0.4,
    }),
    h("path", {
      key: "tuft-three",
      d: tuft(256, 54, 18, 2),
      fill: "var(--inv-accent)",
      opacity: 0.32,
    }),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.9, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 42, 2.2, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    {
      name: "leaves",
      d: [
        leaf(18, 60, 46, 15),
        leaf(48, 62, 36, 12),
        leaf(344, 60, 44, 15),
        leaf(370, 62, 34, 11),
      ].join(""),
      fill: "var(--inv-accent)",
    },
    {
      name: "grass",
      d: [tuft(110, 52, 20, 2), tuft(150, 54, 16, -2), tuft(240, 52, 20, 2)].join(""),
      fill: "var(--inv-accent)",
      shadow: false,
    },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-accent)",
      opacity: 0.16,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
    h("use", {
      key: "grass-fill",
      href: `#${id("grass")}`,
      fill: "var(--inv-accent)",
      opacity: 0.42,
    }),
  ];
}

/** «Safari bebé» in paper cut-out: the savanna header, the leaf divider, and the grass footer. */
export const BABY_SAFARI_ILLUSTRATION: ThemeIllustration = {
  theme: "baby-safari",
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
