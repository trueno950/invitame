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
 * «Conejito dulce» in paper cut-out (I3c; S1-S4, the technique of
 * `design/theme-illustrations/01-papel-recortado.html`): a sweet garden for the header — a torn sheet of pale
 * paper, a white bunny of our own simple shapes with a mint bow, hearts floating above it, flowers and two
 * carrots along the ground, and a soft hill behind — a torn divider that carries the hearts between two
 * sections, and a footer strip of flowers and carrots.
 *
 * Original work (S3): the bunny is a generic paper animal — a dome body, a round head, two long ears, a muzzle,
 * four limbs, and a bow — and could be any friendly bunny; it is not a character, a mascot, a logo, or a
 * protected name, and the drawing carries no text. Every color is a theme variable of `sweet-bunny`; tints are
 * `opacity` on a theme color, so the mint stays a small, cool note in a pink scene.
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

/** A heart: two lobes and a point, drawn from the center at (`x`, `y`) with a reach of `size`. */
function heart(x: number, y: number, size: number): string {
  return (
    `M${n(x)} ${n(y + size * 0.78)}` +
    `C${n(x - size * 1.16)} ${n(y + size * 0.06)} ${n(x - size * 0.74)} ${n(y - size * 0.86)} ${n(x)} ${n(y - size * 0.3)}` +
    `C${n(x + size * 0.74)} ${n(y - size * 0.86)} ${n(x + size * 1.16)} ${n(y + size * 0.06)} ${n(x)} ${n(y + size * 0.78)}Z`
  );
}

/** A flower: five petals around a center, and the stem it grows from. */
function flower(x: number, y: number, size: number, petals: number): string {
  const pieces: string[] = [];

  for (let petal = 0; petal < petals; petal += 1) {
    const angle = (360 / petals) * petal;
    const rad = (angle * Math.PI) / 180;
    const cx = x + Math.cos(rad) * size * 0.78;
    const cy = y + Math.sin(rad) * size * 0.78;

    pieces.push(disc(cx, cy, size * 0.62, 1));
  }
  return pieces.join("");
}

/** The tapered body of a carrot, from its shoulder at (`x`, `y`) to its tip. */
function carrotBody(x: number, y: number, length: number, dx: number, dy: number): string {
  const tipX = x + dx * length;
  const tipY = y + dy * length;
  const width = length * 0.2;

  return (
    `M${n(x - width)} ${n(y)}` +
    `C${n(x - width)} ${n(y + dy * length * 0.5)} ${n(tipX - width * 0.3)} ${n(tipY - dy * length * 0.2)} ${n(tipX)} ${n(tipY)}` +
    `C${n(tipX + width * 0.3)} ${n(tipY - dy * length * 0.2)} ${n(x + width)} ${n(y + dy * length * 0.5)} ${n(x + width)} ${n(y)}Z`
  );
}

const HILL_FAR = hill(-16, 406, 130, 166, 10);
const HILL_LEFT = hill(-14, 196, 150, 176, 6);
const HILL_RIGHT = hill(196, 404, 152, 176, -8);
const GROUND =
  "M-8 172C6 169 22 170 38 171C54 172 68 168 84 169C100 170 116 172 132 171C148 170 164 168 180 169C196 " +
  "170 212 172 228 171C244 170 260 168 276 169C292 170 308 172 324 171C340 170 356 168 372 169C382 170 " +
  "392 171 398 172L398 202L-8 202Z";

const BUNNY_BODY = "M168 172C158 158 164 136 183 136C202 136 208 158 198 172Z";
const BUNNY_HEAD = disc(183, 116, 25, 0.96);
const BUNNY_EAR_LEFT = "M168 100C160 92 156 74 160 66C164 58 174 62 176 74C178 86 176 96 172 102Z";
const BUNNY_EAR_RIGHT = "M198 100C206 92 210 74 206 66C202 58 192 62 190 74C188 86 190 96 194 102Z";
const BUNNY_EAR_INNER_LEFT =
  "M167 96C162 88 160 76 162 70C165 66 170 70 171 78C172 86 171 92 168 97Z";
const BUNNY_EAR_INNER_RIGHT =
  "M199 96C204 88 206 76 204 70C201 66 196 70 195 78C194 86 195 92 198 97Z";
const BUNNY_MUZZLE = disc(183, 124, 12, 0.76);
const BUNNY_FOOT = disc(166, 170, 11, 0.68) + disc(200, 170, 11, 0.68);
const BUNNY_PAW = disc(163, 156, 7.6, 1.04) + disc(203, 156, 7.6, 1.04);

/** The bow at the bunny's ear: two loops and a knot, cut as one piece. */
const BOW =
  "M203 94C213 85 226 85 226 94C226 103 213 103 203 94Z" +
  "M203 94C193 85 180 85 180 94C180 103 193 103 203 94Z" +
  disc(203, 94, 5);

const HEARTS: readonly {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly paint: ThemePaint;
}[] = [
  { x: 72, y: 66, size: 13, paint: "var(--inv-decoration-two)" },
  { x: 110, y: 44, size: 9, paint: "var(--inv-decoration-two)" },
  { x: 282, y: 56, size: 12, paint: "var(--inv-decoration-two)" },
  { x: 318, y: 82, size: 8, paint: "var(--inv-decoration-one)" },
  { x: 44, y: 112, size: 8, paint: "var(--inv-decoration-one)" },
  { x: 342, y: 46, size: 9, paint: "var(--inv-decoration-two)" },
];

const FLOWERS = [
  flower(48, 176, 8.4, 5),
  flower(88, 185, 6.4, 5),
  flower(316, 176, 8.4, 5),
  flower(276, 187, 6.4, 5),
].join("");

const FLOWER_CENTERS: readonly { readonly x: number; readonly y: number }[] = [
  { x: 48, y: 176 },
  { x: 88, y: 185 },
  { x: 316, y: 176 },
  { x: 276, y: 187 },
];

const STEMS =
  "M48 186C47 192 48 196 49 200 M88 190C87 194 88 197 89 200 M316 186C317 192 316 196 315 200 M276 193C275 196 276 198 277 200";

const CARROT_LEFT = carrotBody(120, 178, 32, 0.3, 0.95);
const CARROT_RIGHT = carrotBody(262, 184, 28, -0.26, 0.96);
const CARROT_TOPS =
  "M124 178C118 166 119 158 126 155C124 165 125 173 127 178Z" +
  "M120 178C112 169 111 161 115 156C116 165 117 172 121 179Z" +
  "M265 184C261 174 263 166 269 163C267 171 267 178 269 184Z" +
  "M262 184C256 176 256 168 260 164C261 172 261 178 263 185Z";

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 2.1, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "hill-far", d: HILL_FAR, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "hill-left", d: HILL_LEFT, fill: "var(--inv-decoration-two)" },
    { name: "hill-right", d: HILL_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "ground", d: GROUND, fill: "var(--inv-accent)", shadow: false },
    { name: "bunny-body", d: BUNNY_BODY, fill: "var(--inv-surface)" },
    { name: "bunny-head", d: BUNNY_HEAD, fill: "var(--inv-surface)", outline: true },
    { name: "bunny-ear-left", d: BUNNY_EAR_LEFT, fill: "var(--inv-surface)" },
    { name: "bunny-ear-right", d: BUNNY_EAR_RIGHT, fill: "var(--inv-surface)" },
    { name: "bunny-muzzle", d: BUNNY_MUZZLE, fill: "var(--inv-soft)", shadow: false },
    { name: "bunny-foot", d: BUNNY_FOOT, fill: "var(--inv-surface)" },
    { name: "bunny-paw", d: BUNNY_PAW, fill: "var(--inv-surface)" },
    { name: "bow", d: BOW, fill: "var(--inv-decoration-one)" },
    { name: "flowers", d: FLOWERS, fill: "var(--inv-surface)" },
    { name: "carrot-left", d: CARROT_LEFT, fill: "var(--inv-soft)", outline: true },
    { name: "carrot-right", d: CARROT_RIGHT, fill: "var(--inv-soft)", outline: true },
    { name: "carrot-tops", d: CARROT_TOPS, fill: "var(--inv-decoration-one)" },
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
      opacity: 0.45,
    }),
    h(
      "g",
      { key: "hills", opacity: 0.42 },
      ...cutSheets(id, [sheets[1] as CutSheet, sheets[2] as CutSheet, sheets[3] as CutSheet]),
    ),
    h(
      "g",
      { key: "hearts" },
      HEARTS.map((shape, index) =>
        h("path", {
          key: `heart-${index}`,
          d: heart(shape.x, shape.y, shape.size),
          fill: shape.paint,
          opacity: 0.9,
        }),
      ),
    ),
    // A few dots of sugar in the air, so the hearts are not the only confetti.
    h(
      "g",
      { key: "sugar-dots", fill: "var(--inv-decoration-one)", opacity: 0.5 },
      [
        { x: 156, y: 52, r: 3 },
        { x: 230, y: 40, r: 2.4 },
        { x: 358, y: 118, r: 2.6 },
        { x: 26, y: 60, r: 2.6 },
      ].map((dot) => h("circle", { key: `${dot.x}-${dot.y}`, cx: dot.x, cy: dot.y, r: dot.r })),
    ),
    ...cutSheets(id, [sheets[4] as CutSheet]),
    // The bunny, back to front: feet, body, paws, ears, head, muzzle, bow, and its face.
    ...cutSheets(id, [
      sheets[10] as CutSheet,
      sheets[5] as CutSheet,
      sheets[11] as CutSheet,
      sheets[7] as CutSheet,
      sheets[8] as CutSheet,
      sheets[9] as CutSheet,
      sheets[6] as CutSheet,
    ]),
    h(
      "g",
      { key: "bunny-ear-inner" },
      h("path", {
        key: "ear-inner-left",
        d: BUNNY_EAR_INNER_LEFT,
        fill: "var(--inv-soft)",
        opacity: 0.9,
      }),
      h("path", {
        key: "ear-inner-right",
        d: BUNNY_EAR_INNER_RIGHT,
        fill: "var(--inv-soft)",
        opacity: 0.9,
      }),
    ),
    h("circle", { key: "bunny-eye-left", cx: 174, cy: 112, r: 2.6, fill: "var(--inv-ink)" }),
    h("circle", { key: "bunny-eye-right", cx: 192, cy: 112, r: 2.6, fill: "var(--inv-ink)" }),
    h("circle", {
      key: "bunny-eye-glint-left",
      cx: 173.2,
      cy: 111.2,
      r: 0.9,
      fill: "var(--inv-surface)",
    }),
    h("circle", {
      key: "bunny-eye-glint-right",
      cx: 191.2,
      cy: 111.2,
      r: 0.9,
      fill: "var(--inv-surface)",
    }),
    h("path", { key: "bunny-nose", d: "M179 122H187L183 127Z", fill: "var(--inv-ink)" }),
    h("path", {
      key: "bunny-mouth",
      d: "M183 127V131M183 131C180 134 176 133 175 130M183 131C186 134 190 133 191 130",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
    }),
    h(
      "g",
      {
        key: "bunny-whiskers",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1,
        opacity: 0.4,
        strokeLinecap: "round",
      },
      h("path", { key: "whisker-left-upper", d: "M170 121C164 119 159 120 155 123" }),
      h("path", { key: "whisker-left-lower", d: "M170 125C164 126 160 128 157 131" }),
      h("path", { key: "whisker-right-upper", d: "M196 121C202 119 207 120 211 123" }),
      h("path", { key: "whisker-right-lower", d: "M196 125C202 126 206 128 209 131" }),
    ),
    h("ellipse", {
      key: "bunny-cheek-left",
      cx: 168,
      cy: 124,
      rx: 6,
      ry: 3.8,
      fill: "var(--inv-decoration-two)",
      opacity: 0.6,
    }),
    h("ellipse", {
      key: "bunny-cheek-right",
      cx: 198,
      cy: 124,
      rx: 6,
      ry: 3.8,
      fill: "var(--inv-decoration-two)",
      opacity: 0.6,
    }),
    ...cutSheets(id, [sheets[12] as CutSheet]),
    // The garden along the ground: flowers, then the two carrots with their mint tops.
    ...cutSheets(id, [sheets[13] as CutSheet]),
    h(
      "g",
      { key: "flower-centers", fill: "var(--inv-decoration-one)" },
      FLOWER_CENTERS.map((center) =>
        h("circle", { key: `${center.x}-${center.y}`, cx: center.x, cy: center.y, r: 1.9 }),
      ),
    ),
    h("path", {
      key: "stems-stroke",
      d: STEMS,
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      opacity: 0.8,
    }),
    ...cutSheets(id, [sheets[14] as CutSheet, sheets[15] as CutSheet, sheets[16] as CutSheet]),
    h(
      "g",
      {
        key: "carrot-lines",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1,
        opacity: 0.28,
        strokeLinecap: "round",
      },
      h("path", { key: "carrot-line-one", d: "M117 184C121 185 124 186 127 186" }),
      h("path", { key: "carrot-line-two", d: "M118 189C122 190 125 191 128 191" }),
      h("path", { key: "carrot-line-three", d: "M259 190C263 191 266 192 269 192" }),
      h("path", { key: "carrot-line-four", d: "M260 195C263 196 266 196 268 196" }),
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 26, 3.1, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 38, 5.7, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    {
      name: "hearts",
      d: [
        heart(60, 32, 9),
        heart(102, 40, 7),
        heart(144, 32, 10),
        heart(186, 40, 7),
        heart(228, 32, 10),
        heart(270, 40, 7),
        heart(312, 32, 9),
      ].join(""),
      fill: "var(--inv-surface)",
    },
    { name: "flowers", d: flower(352, 38, 6, 5), fill: "var(--inv-decoration-one)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.2,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet, sheets[3] as CutSheet]),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.3, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 44, 2.6, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
    {
      name: "hearts",
      d: [heart(24, 40, 8), heart(200, 34, 7), heart(230, 44, 6)].join(""),
      fill: "var(--inv-surface)",
    },
    {
      name: "flowers",
      d: flower(88, 40, 6, 5) + flower(302, 42, 6, 5),
      fill: "var(--inv-surface)",
    },
    { name: "carrot", d: carrotBody(318, 26, 26, -0.22, 0.97), fill: "var(--inv-accent)" },
    {
      name: "carrot-top",
      d: "M321 26C316 17 317 10 323 7C321 16 321 22 324 26ZM318 26C311 18 310 11 314 6C315 15 316 22 319 27Z",
      fill: "var(--inv-decoration-one)",
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
    ...cutSheets(id, [sheets[2] as CutSheet, sheets[3] as CutSheet, sheets[4] as CutSheet]),
    h("use", {
      key: "carrot-top-fill",
      href: `#${id("carrot-top")}`,
      fill: "var(--inv-decoration-one)",
    }),
  ];
}

/** «Conejito dulce» in paper cut-out: the bunny garden, the heart divider, and the flower footer. */
export const SWEET_BUNNY_ILLUSTRATION: ThemeIllustration = {
  theme: "sweet-bunny",
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
