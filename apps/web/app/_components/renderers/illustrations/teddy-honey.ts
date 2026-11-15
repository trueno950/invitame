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
 * «Osito y miel» in paper cut-out (I3c; S1-S4, the technique of `design/theme-illustrations/01-papel-recortado.html`):
 * a soft honey diorama for the header — a torn sheet of pale paper, a honey-coloured sun, a comb of hexagons
 * hanging from the top corner, two ranges of hills, a generic teddy bear sitting on the ground, a honey pot
 * with a drip, three bees with their dashed flight paths, tufts of grass and a paw trail — a torn divider that
 * carries the comb and the paw trail between two sections, and a footer strip where the honey runs out of the
 * page.
 *
 * Original work (S3): the bear is a generic paper teddy — a round head with two ears, a dome body, four
 * limbs, a muzzle and two dots for eyes — drawn from our own splines. It is never a branded teddy bear, a
 * mascot, or character artwork, and the drawing carries no text and no name. Every color is a theme variable
 * of `teddy-honey`, so the drawing re-colours with its palette; tints are `opacity` on a theme color.
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

/** A hand-cut disc: an ellipse with four slightly different radii, so no circle is perfect. */
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

/** A pointy-topped hexagon: one cell of the comb. */
function hexagon(cx: number, cy: number, radius: number): string {
  const corners: string[] = [];

  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (Math.PI / 3) * corner - Math.PI / 2;
    const x = n(cx + radius * Math.cos(angle));
    const y = n(cy + radius * Math.sin(angle));

    corners.push(`${corner === 0 ? "M" : "L"}${x} ${y}`);
  }
  return `${corners.join("")}Z`;
}

/** A cell of the honeycomb grid: `column` runs right, `row` down, and odd rows shift by half a cell. */
type Cell = readonly [column: number, row: number];

/** Six cells on the comb grid, merged into one cut sheet so a comb is one piece of paper. */
function comb(cx: number, cy: number, radius: number, cells: readonly Cell[]): string {
  const cell = radius * 1.94;

  return cells
    .map(([column, row]) =>
      hexagon(cx + column * cell + (row % 2 === 0 ? 0 : cell / 2), cy + row * cell * 0.87, radius),
    )
    .join("");
}

/** A honey drip: a narrow neck of honey from `y`, swelling into a rounded drop at its tip. */
function drip(x: number, y: number, width: number, length: number): string {
  const half = width / 2;
  const neck = half * 0.52;

  return (
    `M${n(x - half)} ${n(y)}` +
    `C${n(x - half)} ${n(y + length * 0.5)} ${n(x - neck)} ${n(y + length * 0.5)} ${n(x - neck)} ${n(y + length * 0.68)}` +
    `C${n(x - neck)} ${n(y + length * 0.98)} ${n(x + neck)} ${n(y + length * 0.98)} ${n(x + neck)} ${n(y + length * 0.68)}` +
    `C${n(x + neck)} ${n(y + length * 0.5)} ${n(x + half)} ${n(y + length * 0.5)} ${n(x + half)} ${n(y)}Z`
  );
}

/** One bee: two paper wings, a striped body, and its flight line behind it. */
function bee(key: string, x: number, y: number, scale: number, tilt: number): ReactElement {
  return h(
    "g",
    { key, transform: `translate(${x} ${y}) rotate(${tilt}) scale(${scale})` },
    h("ellipse", {
      key: "wing-far",
      cx: -1,
      cy: -6,
      rx: 4.6,
      ry: 6.4,
      fill: "var(--inv-surface)",
      opacity: 0.92,
      transform: "rotate(-24 -1 -6)",
    }),
    h("ellipse", {
      key: "wing-near",
      cx: 4.2,
      cy: -5,
      rx: 4,
      ry: 5.6,
      fill: "var(--inv-surface)",
      transform: "rotate(22 4.2 -5)",
    }),
    h("ellipse", {
      key: "body",
      cx: 0,
      cy: 0,
      rx: 6.4,
      ry: 5.4,
      fill: "var(--inv-decoration-one)",
    }),
    h("path", {
      key: "bands",
      d: "M-1.8 -4.4C-0.4 -1.6 -0.4 1.6 -1.8 4.4M2.8 -4.6C4 2 4 2 2.8 4.6",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.9,
      strokeLinecap: "round",
      opacity: 0.72,
    }),
    h("circle", { key: "head", cx: 6.2, cy: -0.6, r: 4.2, fill: "var(--inv-ink)" }),
  );
}

/** A tuft of grass: three blades of different heights, cut as one piece. */
function tuft(x: number, base: number, height: number, lean: number): string {
  return (
    `M${n(x - 3.6)} ${n(base)}C${n(x - 4.4)} ${n(base - height * 0.5)} ${n(x - 2.4)} ${n(base - height * 0.8)} ${n(x - lean)} ${n(base - height)}` +
    `C${n(x - 0.6)} ${n(base - height * 0.62)} ${n(x + 0.6)} ${n(base - height * 0.4)} ${n(x + 1.4)} ${n(base)}Z` +
    `M${n(x + 0.6)} ${n(base)}C${n(x + 1.6)} ${n(base - height * 0.42)} ${n(x + 4)} ${n(base - height * 0.66)} ${n(x + 5.4)} ${n(base - height * 0.82)}` +
    `C${n(x + 4.4)} ${n(base - height * 0.4)} ${n(x + 3.6)} ${n(base - height * 0.14)} ${n(x + 3.6)} ${n(base)}Z`
  );
}

/** One paw print: the pad and the four toes, defined once and placed along the trail. */
interface Paw {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

function pawDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "paw-definition" },
    h(
      "g",
      { id: id("paw") },
      h("ellipse", { key: "pad", cx: 0, cy: 1.6, rx: 4.6, ry: 3.8 }),
      h("ellipse", { key: "toe-one", cx: -4.4, cy: -2.4, rx: 1.7, ry: 2.2 }),
      h("ellipse", { key: "toe-two", cx: -1.5, cy: -4.2, rx: 1.7, ry: 2.4 }),
      h("ellipse", { key: "toe-three", cx: 1.6, cy: -4.2, rx: 1.7, ry: 2.4 }),
      h("ellipse", { key: "toe-four", cx: 4.4, cy: -2.2, rx: 1.6, ry: 2.1 }),
    ),
  );
}

function paws(
  key: string,
  id: IllustrationId,
  trail: readonly Paw[],
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    trail.map((paw) =>
      h("use", {
        key: `${paw.x}-${paw.y}`,
        href: `#${id("paw")}`,
        transform: `translate(${paw.x} ${paw.y}) rotate(${paw.rotate}) scale(${paw.scale})`,
      }),
    ),
  );
}

const SCENE_TRAIL: readonly Paw[] = [
  { x: 46, y: 186, rotate: -10, scale: 1 },
  { x: 78, y: 179, rotate: 6, scale: 1.05 },
  { x: 110, y: 185, rotate: -6, scale: 1 },
];

const DIVIDER_TRAIL: readonly Paw[] = [
  { x: 196, y: 44, rotate: -8, scale: 1 },
  { x: 228, y: 47, rotate: 7, scale: 1 },
  { x: 260, y: 44, rotate: -5, scale: 1 },
];

const FOOTER_TRAIL: readonly Paw[] = [
  { x: 96, y: 44, rotate: -8, scale: 1.05 },
  { x: 128, y: 48, rotate: 7, scale: 1 },
  { x: 160, y: 44, rotate: -6, scale: 1.1 },
];

const SUN_HALO = disc(74, 46, 30);
const SUN = disc(74, 46, 22);
const HILL_FAR_LEFT = hill(-10, 190, 130, 158, -18);
const HILL_FAR_RIGHT = hill(150, 400, 140, 158, 16);
const HILL_NEAR_LEFT = hill(-12, 168, 152, 170, 6);
const HILL_NEAR_RIGHT = hill(214, 402, 150, 170, -8);
const GROUND_MID =
  "M-8 178C6 175 22 176 38 177C54 178 68 174 84 175C100 176 116 178 132 177C148 176 164 174 180 175C196 " +
  "176 212 178 228 177C244 176 260 174 276 175C292 176 308 178 324 177C340 176 356 174 372 175C382 176 " +
  "392 177 398 178L398 202L-8 202Z";
const GROUND_FRONT =
  "M-8 190C8 187 24 188 40 189C56 190 72 186 88 187C104 188 120 190 136 189C152 188 168 186 184 187C200 " +
  "188 216 190 232 189C248 188 264 186 280 187C296 188 312 190 328 189C344 188 360 186 376 187C386 188 " +
  "394 189 398 190L398 202L-8 202Z";

/** The bear: head, two ears, a dome body, two arms, two feet, merged into one silhouette. */
const BEAR_BODY =
  "M168 128C150 128 138 141 136 156C134 166 138 172 148 172L188 172C198 172 202 166 200 156C198 141 186 128 168 128Z";
const BEAR_HEAD = disc(168, 108, 24);
const BEAR_EAR_LEFT = disc(151, 88, 9.6);
const BEAR_EAR_RIGHT = disc(185, 88, 9.6);
const BEAR_MUZZLE = disc(168, 115, 12.4, 0.78);
const BEAR_ARM_LEFT =
  "M139 142C132 145 128 153 130 160C131 165 136 166 140 164C144 161 145 152 143 145Z";
const BEAR_ARM_RIGHT =
  "M197 142C204 145 208 153 206 160C205 165 200 166 196 164C192 161 191 152 193 145Z";
const BEAR_FOOT_LEFT = disc(148, 170, 11, 0.72);
const BEAR_FOOT_RIGHT = disc(188, 170, 11, 0.72);

/** The honey pot: a squat jar, a rim, a label band of honey, and a drip over the rim. */
const POT =
  "M282 160C278 154 278 148 284 146L322 146C328 148 328 154 324 160C328 166 326 174 316 176L290 176C280 174 " +
  "278 166 282 160Z";
const POT_RIM = "M281 140C288 136 318 136 325 140C320 146 287 146 281 140Z";
const POT_HONEY = "M286 152C293 149 313 149 320 152C318 158 288 158 286 152Z";
const POT_DRIP = drip(303, 152, 7, 9);

/** The comb pieces: the one hanging at the top corner, and the small cell behind the hills. */
const COMB_HANG = comb(306, 34, 10, [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [1, 2],
]);
const COMB_ACCENT = comb(306, 34, 9.4, [[2, 0]]);

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 1.4, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "sun-halo", d: SUN_HALO, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "sun", d: SUN, fill: "var(--inv-decoration-one)" },
    { name: "comb-hang", d: COMB_HANG, fill: "var(--inv-decoration-one)" },
    { name: "comb-accent", d: COMB_ACCENT, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "hill-far-left", d: HILL_FAR_LEFT, fill: "var(--inv-decoration-two)" },
    { name: "hill-far-right", d: HILL_FAR_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "hill-near-left", d: HILL_NEAR_LEFT, fill: "var(--inv-decoration-two)" },
    { name: "hill-near-right", d: HILL_NEAR_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "ground-mid", d: GROUND_MID, fill: "var(--inv-decoration-two)" },
    { name: "ground-front", d: GROUND_FRONT, fill: "var(--inv-accent)", shadow: false },
    { name: "bear-body", d: BEAR_BODY, fill: "var(--inv-decoration-one)" },
    { name: "bear-ear-left", d: BEAR_EAR_LEFT, fill: "var(--inv-decoration-one)" },
    { name: "bear-ear-right", d: BEAR_EAR_RIGHT, fill: "var(--inv-decoration-one)" },
    { name: "bear-head", d: BEAR_HEAD, fill: "var(--inv-decoration-one)", outline: true },
    { name: "bear-muzzle", d: BEAR_MUZZLE, fill: "var(--inv-surface)", shadow: false },
    { name: "bear-arm-left", d: BEAR_ARM_LEFT, fill: "var(--inv-decoration-two)" },
    { name: "bear-arm-right", d: BEAR_ARM_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "bear-foot-left", d: BEAR_FOOT_LEFT, fill: "var(--inv-decoration-two)" },
    { name: "bear-foot-right", d: BEAR_FOOT_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "pot", d: POT, fill: "var(--inv-decoration-two)" },
    { name: "pot-rim", d: POT_RIM, fill: "var(--inv-accent)", shadow: false },
    { name: "pot-honey", d: POT_HONEY, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "pot-drip", d: POT_DRIP, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "tufts", d: TUFT_ROW, fill: "var(--inv-surface)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    pawDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "torn-line",
      href: `#${id("sheet")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    // The sun: a paler halo behind, so the disc reads as two sheets of paper.
    h("use", {
      key: "sun-halo-fill",
      href: `#${id("sun-halo")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.34,
    }),
    h("path", {
      key: "comb-thread",
      d: "M318 12V24",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      opacity: 0.4,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet, sheets[3] as CutSheet]),
    // The comb, a hairline of white over its cells so each hexagon reads as its own cut cell.
    h("use", {
      key: "comb-accent-fill",
      href: `#${id("comb-accent")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.35,
    }),
    // The hills: the far range tinted back, the near range full strength, so the scene has depth.
    h(
      "g",
      { key: "hills-far", opacity: 0.42 },
      ...cutSheets(id, [sheets[5] as CutSheet, sheets[6] as CutSheet]),
    ),
    h(
      "g",
      { key: "hills-near", opacity: 0.72 },
      ...cutSheets(id, [sheets[7] as CutSheet, sheets[8] as CutSheet]),
    ),
    ...cutSheets(id, [sheets[9] as CutSheet, sheets[10] as CutSheet]),
    // The bear, back to front: feet, body, arms, ears, head, muzzle, and its face.
    ...cutSheets(id, [
      sheets[18] as CutSheet,
      sheets[19] as CutSheet,
      sheets[11] as CutSheet,
      sheets[16] as CutSheet,
      sheets[17] as CutSheet,
      sheets[12] as CutSheet,
      sheets[13] as CutSheet,
      sheets[14] as CutSheet,
      sheets[15] as CutSheet,
    ]),
    h("ellipse", {
      key: "ear-inner-left",
      cx: 151,
      cy: 88.4,
      rx: 4.6,
      ry: 4.4,
      fill: "var(--inv-soft)",
      opacity: 0.75,
    }),
    h("ellipse", {
      key: "ear-inner-right",
      cx: 185,
      cy: 88.4,
      rx: 4.6,
      ry: 4.4,
      fill: "var(--inv-soft)",
      opacity: 0.75,
    }),
    h("ellipse", {
      key: "cheek-left",
      cx: 155,
      cy: 113,
      rx: 4.4,
      ry: 3,
      fill: "var(--inv-decoration-two)",
      opacity: 0.4,
    }),
    h("ellipse", {
      key: "cheek-right",
      cx: 181,
      cy: 113,
      rx: 4.4,
      ry: 3,
      fill: "var(--inv-decoration-two)",
      opacity: 0.4,
    }),
    h("circle", { key: "eye-left", cx: 160, cy: 104, r: 2.5, fill: "var(--inv-ink)" }),
    h("circle", { key: "eye-right", cx: 176, cy: 104, r: 2.5, fill: "var(--inv-ink)" }),
    h("ellipse", { key: "nose", cx: 168, cy: 112, rx: 3.4, ry: 2.6, fill: "var(--inv-ink)" }),
    h("path", {
      key: "smile",
      d: "M163.4 116.6C165.4 119.2 170.6 119.2 172.6 116.6",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.5,
      strokeLinecap: "round",
    }),
    h("ellipse", {
      key: "belly",
      cx: 168,
      cy: 154,
      rx: 15,
      ry: 12,
      fill: "var(--inv-soft)",
      opacity: 0.42,
    }),
    // The pot of honey, then the comb cell it catches.
    ...cutSheets(id, [sheets[20] as CutSheet]),
    h("use", { key: "rim", href: `#${id("pot-rim")}`, fill: "var(--inv-accent)" }),
    h("use", { key: "honey", href: `#${id("pot-honey")}`, fill: "var(--inv-decoration-one)" }),
    h("use", { key: "drip", href: `#${id("pot-drip")}`, fill: "var(--inv-decoration-one)" }),
    h("path", {
      key: "pot-shine",
      d: "M290 158C290 164 292 169 296 172",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.6,
      opacity: 0.4,
      strokeLinecap: "round",
    }),
    // The tufts of grass along the ground, then the trail of paws walking out of the page.
    h("use", {
      key: "tufts-fill",
      href: `#${id("tufts")}`,
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    paws("paws", id, SCENE_TRAIL, "var(--inv-surface)", 0.8),
    // The bees, each with the dashed line it just flew.
    h("path", {
      key: "bee-path-one",
      d: "M120 74C150 60 190 66 214 54",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.1,
      strokeDasharray: "3 4",
      opacity: 0.3,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "bee-path-two",
      d: "M252 62C272 74 288 88 300 92",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.1,
      strokeDasharray: "3 4",
      opacity: 0.3,
      strokeLinecap: "round",
    }),
    bee("bee-one", 236, 56, 1, -12),
    bee("bee-two", 300, 96, 0.82, 18),
    bee("bee-three", 108, 78, 0.72, -24),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

const TUFT_ROW = [
  tuft(34, 184, 16, 2),
  tuft(96, 190, 13, -1),
  tuft(140, 178, 11, 1),
  tuft(232, 186, 14, 2),
  tuft(262, 192, 11, -1),
  tuft(352, 182, 15, 1),
].join("");

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 28, 3.1, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 40, 5.2, DIVIDER_HEIGHT + 8);
  const strip = comb(56, 30, 9, [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "comb", d: strip, fill: "var(--inv-decoration-one)" },
  ];

  return [
    sheetDefinitions(id, sheets),
    pawDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
    }),
    h("use", {
      key: "strip-edge",
      href: `#${id("strip")}`,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 1.3,
      opacity: 0.5,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
    h("path", {
      key: "drip-one",
      d: drip(90, 38, 6, 10),
      fill: "var(--inv-decoration-one)",
      opacity: 0.85,
    }),
    h("path", {
      key: "drip-two",
      d: drip(104, 36, 4.4, 7),
      fill: "var(--inv-decoration-one)",
      opacity: 0.7,
    }),
    paws("paws", id, DIVIDER_TRAIL, "var(--inv-accent)", 0.42),
    bee("bee", 330, 34, 0.9, -14),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 7.6, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 44, 2.3, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    {
      name: "comb",
      d: comb(330, 40, 8, [
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
      fill: "var(--inv-decoration-one)",
    },
  ];
  const honey = [
    drip(26, 8, 9, 20),
    drip(48, 8, 6, 13),
    drip(292, 8, 8, 17),
    drip(312, 8, 5, 10),
  ].join("");

  return [
    sheetDefinitions(id, sheets),
    pawDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.42,
    }),
    h("use", {
      key: "strip-edge",
      href: `#${id("strip")}`,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 1.3,
      opacity: 0.45,
    }),
    h("path", { key: "honey", d: honey, fill: "var(--inv-decoration-one)", opacity: 0.9 }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
    paws("paws", id, FOOTER_TRAIL, "var(--inv-surface)", 0.75),
  ];
}

/** «Osito y miel» in paper cut-out: the honey diorama, the comb divider, and the paw-print footer. */
export const TEDDY_HONEY_ILLUSTRATION: ThemeIllustration = {
  theme: "teddy-honey",
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
