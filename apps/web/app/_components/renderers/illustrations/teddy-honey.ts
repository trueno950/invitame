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
 * «Osito y miel» in paper cut-out, second pass (I4a; S3, S5). The owner asked for the bear to be improved, so
 * the honey diorama now has three planes and a hero with real anatomy: a hazy warm sky with a soft-rayed sun,
 * two ranges of honey hills, a branch over the top corner with a hanging beehive and a small comb cluster, a
 * picnic blanket with a check pattern, a teddy bear with better proportions — inner ears, a muzzle, a belly
 * patch, paw pads on hands and feet, dashed stitch seams, and a small bow — a honey pot with a dripping rim and
 * a wooden dipper, paper flowers, grass in two warm tones, a paw-print trail, and three bees with wing
 * highlights and dotted flight paths. Tall leaves frame both edges in the foreground.
 *
 * Original work (S3): the bear is a generic paper teddy drawn from our own splines, never a branded bear, a
 * mascot, or character artwork, and the drawing carries no text and no name. Every color is a theme variable of
 * `teddy-honey`, tints are `opacity` on a theme color, and the check pattern is an SVG `<pattern>` whose id comes
 * from the frame, so two invitations on one page never share one.
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

/** A pointy-topped hexagon: one cell of the comb. */
function hexagon(cx: number, cy: number, radius: number): string {
  const corners: string[] = [];

  for (let corner = 0; corner < 6; corner += 1) {
    const angle = (Math.PI / 3) * corner - Math.PI / 2;

    corners.push(
      `${corner === 0 ? "M" : "L"}${n(cx + radius * Math.cos(angle))} ${n(cy + radius * Math.sin(angle))}`,
    );
  }
  return `${corners.join("")}Z`;
}

/** A cell of the comb grid: `column` runs right, `row` down, and odd rows shift by half a cell. */
type Cell = readonly [column: number, row: number];

/** Comb cells merged into one cut sheet, so a cluster is one piece of paper. */
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

/** A blade of grass: a narrow crescent leaning a little, so a tuft is never a row of sticks. */
function blade(x: number, base: number, height: number, lean: number): string {
  return (
    `M${n(x - 2.8)} ${n(base)}` +
    `C${n(x - 3.2)} ${n(base - height * 0.5)} ${n(x + lean - 1.8)} ${n(base - height * 0.82)} ${n(x + lean)} ${n(base - height)}` +
    `C${n(x + lean * 0.4 + 2.6)} ${n(base - height * 0.66)} ${n(x + 3.4)} ${n(base - height * 0.3)} ${n(x + 2.8)} ${n(base)}Z`
  );
}

/** A tuft of grass: three blades of different heights, cut as one piece. */
function tuft(x: number, base: number, height: number, lean: number): string {
  return (
    blade(x - 4.4, base, height * 0.74, lean * 0.5) +
    blade(x, base, height, lean) +
    blade(x + 4.8, base, height * 0.6, lean * 1.4)
  );
}

/** A broad leaf at the origin, pointing up, so it is placed with a turn around its own base. */
function leaf(length: number, width: number): string {
  return (
    `M0 0` +
    `C${n(-width)} ${n(-length * 0.18)} ${n(-width * 1.06)} ${n(-length * 0.6)} ${n(-width * 0.5)} ${n(-length * 0.92)}` +
    `C${n(-width * 0.26)} ${n(-length * 1.03)} ${n(width * 0.26)} ${n(-length * 1.03)} ${n(width * 0.5)} ${n(-length * 0.92)}` +
    `C${n(width * 1.06)} ${n(-length * 0.6)} ${n(width)} ${n(-length * 0.18)} 0 0Z`
  );
}

/** The midrib of a leaf, drawn over its cut sheet at the same placement. */
function leafVein(length: number, width: number): string {
  return (
    `M0 0L0 ${n(-length * 0.86)}` +
    `M0 ${n(-length * 0.34)}Q${n(-width * 0.34)} ${n(-length * 0.44)} ${n(-width * 0.6)} ${n(-length * 0.5)}` +
    `M0 ${n(-length * 0.5)}Q${n(width * 0.32)} ${n(-length * 0.6)} ${n(width * 0.56)} ${n(-length * 0.66)}`
  );
}

/** A paper daisy: six narrow petals, a honey centre, a stem, and two leaves. */
function daisy(key: string, x: number, y: number, scale: number, petal: ThemePaint): ReactElement {
  const petals: ReactElement[] = [];

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;

    petals.push(
      h("ellipse", {
        key: `petal-${index}`,
        cx: n(x + Math.cos(angle) * 3.2 * scale),
        cy: n(y + Math.sin(angle) * 3.2 * scale),
        rx: n(2.5 * scale),
        ry: n(1.35 * scale),
        fill: petal,
        transform: `rotate(${n((360 / 6) * index)} ${n(x)} ${n(y)})`,
      }),
    );
  }
  return h(
    "g",
    { key },
    h("path", {
      key: "stem",
      d: `M${n(x)} ${n(y + 2)}C${n(x - 1.6)} ${n(y + 7)} ${n(x + 1.2)} ${n(y + 11)} ${n(x - 0.8)} ${n(y + 16)}`,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: n(1.7 * scale),
      strokeLinecap: "round",
    }),
    h("path", {
      key: "leaves",
      d:
        `M${n(x - 0.4)} ${n(y + 9)}C${n(x - 5)} ${n(y + 8)} ${n(x - 5.8)} ${n(y + 11.2)} ${n(x - 2.4)} ${n(y + 12.2)}Z` +
        `M${n(x + 0.4)} ${n(y + 12)}C${n(x + 4.4)} ${n(y + 11)} ${n(x + 5.6)} ${n(y + 13.6)} ${n(x + 2.2)} ${n(y + 14.6)}Z`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.9,
    }),
    ...petals,
    h("circle", {
      key: "centre",
      cx: n(x),
      cy: n(y),
      r: n(1.5 * scale),
      fill: "var(--inv-decoration-one)",
    }),
  );
}

/** One bee: two paper wings with a highlight, a striped body, a head, and its flight line behind it. */
function bee(key: string, x: number, y: number, scale: number, tilt: number): ReactElement {
  return h(
    "g",
    { key, transform: `translate(${x} ${y}) rotate(${tilt}) scale(${scale})` },
    h("ellipse", {
      key: "wing-far",
      cx: -1,
      cy: -6.2,
      rx: 4.4,
      ry: 6.2,
      fill: "var(--inv-surface)",
      opacity: 0.9,
      transform: "rotate(-24 -1 -6.2)",
    }),
    h("ellipse", {
      key: "wing-near",
      cx: 4.4,
      cy: -5,
      rx: 3.8,
      ry: 5.4,
      fill: "var(--inv-surface)",
      transform: "rotate(22 4.4 -5)",
    }),
    h("path", {
      key: "wing-highlight",
      d: "M-2.6 -9.6C-1.6 -11 -0.4 -11.4 0.4 -11.2M2.6 -8.6C3.4 -9.8 4.4 -10.2 5.2 -10",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1,
      strokeLinecap: "round",
      opacity: 0.6,
    }),
    h("ellipse", {
      key: "body",
      cx: 0,
      cy: 0,
      rx: 6.2,
      ry: 5.2,
      fill: "var(--inv-decoration-one)",
    }),
    h("path", {
      key: "bands",
      d: "M-1.8 -4.2C-0.4 -1.5 -0.4 1.5 -1.8 4.2M2.8 -4.4C4 2 4 2 2.8 4.4",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      opacity: 0.7,
    }),
    h("circle", { key: "head", cx: 6, cy: -0.6, r: 4, fill: "var(--inv-ink)" }),
  );
}

/** One paw print: the pad and four toes, defined once and placed along the trail. */
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
      h("ellipse", { key: "pad", cx: 0, cy: 1.6, rx: 4.4, ry: 3.6 }),
      h("ellipse", { key: "toe-one", cx: -4.2, cy: -2.3, rx: 1.6, ry: 2.1 }),
      h("ellipse", { key: "toe-two", cx: -1.4, cy: -4, rx: 1.6, ry: 2.3 }),
      h("ellipse", { key: "toe-three", cx: 1.5, cy: -4, rx: 1.6, ry: 2.3 }),
      h("ellipse", { key: "toe-four", cx: 4.2, cy: -2.1, rx: 1.5, ry: 2 }),
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

/** The check pattern of the picnic blanket: white cloth, two honey squares, a caramel hairline. */
function checkPattern(id: IllustrationId): ReactElement {
  return h(
    "pattern",
    {
      key: "check-pattern",
      id: id("checks"),
      width: 16,
      height: 16,
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(-3)",
    },
    h("rect", { key: "cloth", width: 16, height: 16, fill: "var(--inv-soft)" }),
    h("rect", {
      key: "check-one",
      width: 8,
      height: 8,
      fill: "var(--inv-decoration-one)",
      opacity: 0.42,
    }),
    h("rect", {
      key: "check-two",
      x: 8,
      y: 8,
      width: 8,
      height: 8,
      fill: "var(--inv-decoration-one)",
      opacity: 0.42,
    }),
    h("rect", {
      key: "check-line",
      width: 16,
      height: 0.7,
      fill: "var(--inv-decoration-two)",
      opacity: 0.4,
    }),
  );
}

/** A pattern overlay: the referenced sheet, painted with the check pattern. */
function checked(key: string, id: IllustrationId, sheet: CutSheet, pattern: string): ReactElement {
  return h("use", {
    key,
    href: `#${id(sheet.name)}`,
    style: { fill: `url(#${id(pattern)})` },
  });
}

/** A sheet spec, so a set of sheets can be declared as one typed record and referenced by name. */
type SheetSpec = {
  readonly d: string;
  readonly fill: ThemePaint;
  readonly shadow?: boolean;
  readonly outline?: boolean;
  readonly transform?: string;
};

/** One named sheet, built explicitly so optional props are only present when they are set. */
function toSheet(name: string, spec: SheetSpec): CutSheet {
  return {
    name,
    d: spec.d,
    fill: spec.fill,
    ...(spec.shadow === undefined ? {} : { shadow: spec.shadow }),
    ...(spec.outline === undefined ? {} : { outline: spec.outline }),
    ...(spec.transform === undefined ? {} : { transform: spec.transform }),
  };
}

/** A record of named sheets, with the `<defs>` list and a by-name accessor cutSheets can take. */
function sheetSet<T extends Record<string, SheetSpec>>(specs: T) {
  const all: CutSheet[] = Object.entries(specs).map(([name, spec]) =>
    toSheet(name, spec as SheetSpec),
  );
  const named = (name: keyof T & string): CutSheet => toSheet(name, specs[name] as SheetSpec);

  return { all, named };
}

/** Soft sun rays: rounded lines around the disc, one theme tint. */
function sunRays(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  count: number,
  opacity: number,
): ReactElement {
  const rays: ReactElement[] = [];

  for (let index = 0; index < count; index += 1) {
    rays.push(
      h("line", {
        key: `ray-${index}`,
        x1: n(cx),
        y1: n(cy - inner),
        x2: n(cx),
        y2: n(cy - outer),
        transform: `rotate(${n((360 / count) * index)} ${n(cx)} ${n(cy)})`,
      }),
    );
  }
  return h(
    "g",
    {
      key: "sun-rays",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 2.6,
      strokeLinecap: "round",
      opacity,
    },
    rays,
  );
}

/* ── The scene: sky, hills, hive, blanket, bear, pot, flowers, bees, framing leaves ───────────────────── */

const SUN_HALO = disc(70, 42, 28);
const SUN = disc(70, 42, 19);
const HILL_FAR_LEFT = hill(-16, 188, 126, 154, -16);
const HILL_FAR_RIGHT = hill(148, 414, 132, 156, 14);
const HILL_MID_LEFT = hill(-16, 166, 142, 168, 8);
const HILL_MID_RIGHT = hill(186, 414, 146, 170, -8);

const HAZE = disc(196, 132, 190, 0.14);

const GROUND_MID = tornEdge(SCENE_WIDTH, 156, 1.8, SCENE_HEIGHT + 8).sheet;
const GROUND_NEAR = tornEdge(SCENE_WIDTH, 172, 4.4, SCENE_HEIGHT + 8).sheet;

/** The branch over the top-right corner, with two leaves, from which the hive hangs. */
const BRANCH =
  "M292 -4C312 6 334 12 356 14C370 16 384 18 396 22L396 27C381 23 366 21 352 19C332 16 310 9 290 1Z" +
  "M318 8C312 3 308 -2 306 -8L312 -9C314 -4 318 0 323 4Z";
const BRANCH_LEAF_ONE = leaf(26, 11);
const BRANCH_LEAF_TWO = leaf(20, 9);

/** The hanging hive: a stack of paper rings, a landing ledge, and an entrance. */
const HIVE_BODY =
  "M333 72C333 62 339 56 346 56C353 56 359 62 359 72C359 81 357 89 354 95C352 101 349 105 346 105" +
  "C343 105 340 101 338 95C335 89 333 81 333 72Z";
const HIVE_LEDGE = disc(346, 97, 11, 0.24);
const HIVE_ENTRANCE = disc(346, 99, 3.4, 0.9);
const HIVE_COMB = comb(313, 26, 7.4, [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
]);

/** The picnic blanket under the bear: a low cloth with a folded top edge and a fringe. */
const BLANKET = "M18 178C48 173 86 171 120 171C146 171 172 173 194 177L206 204L10 204Z";
const BLANKET_FOLD =
  "M18 178C48 173 86 171 120 171C146 171 172 173 194 177L192 182C170 178 146 176 120 176C86 176 48 178 22 183Z";
const BLANKET_FRINGE = [
  "M24 202V208",
  "M44 202V208",
  "M64 202V208",
  "M84 202V208",
  "M104 202V208",
  "M124 202V208",
  "M144 202V208",
  "M164 202V208",
  "M184 202V208",
].join("");

/** The teddy bear: head, ears, body, arms, feet, muzzle, belly, stitch lines, and bow. */
const BEAR_BODY =
  "M126 128C120 140 121 156 130 168C138 177 162 177 170 168C179 156 180 140 174 128C167 119 133 119 126 128Z";
const BEAR_HEAD = disc(150, 96, 24);
const BEAR_EAR_LEFT = disc(129, 73, 10.4);
const BEAR_EAR_RIGHT = disc(171, 73, 10.4);
const BEAR_MUZZLE = disc(150, 105, 13.4, 0.74);
const BEAR_ARM_LEFT =
  "M128 131C120 136 114 146 115 156C115 162 121 165 126 161C130 157 131 146 133 138Z";
const BEAR_ARM_RIGHT =
  "M172 131C180 136 186 146 185 156C185 162 179 165 174 161C170 157 169 146 167 138Z";
const BEAR_FOOT_LEFT = disc(129, 181, 13.4, 0.72);
const BEAR_FOOT_RIGHT = disc(171, 181, 13.4, 0.72);
const BEAR_BELLY = disc(150, 152, 15.4, 0.92);
const BEAR_BOW_LEFT = "M150 124C142 117 133 120 133 126C133 132 142 135 150 128Z";
const BEAR_BOW_RIGHT = "M150 124C158 117 167 120 167 126C167 132 158 135 150 128Z";

/** The honey pot: a squat jar, a rim, honey over the rim, a label band, and a wooden dipper. */
const POT_BODY =
  "M263 147C254 156 253 172 262 181C272 188 302 188 312 181C320 172 319 156 311 147Z";
const POT_RIM = "M262 147C268 143 309 143 315 147C309 151 268 151 262 147Z";
const POT_HONEY = "M266 146C273 143 305 143 312 146C305 149 273 149 266 146Z";
const POT_LABEL = "M269 161C278 158 300 158 309 161L308 171C300 168 278 168 270 171Z";
const POT_DRIP_ONE = drip(270, 148, 7, 16);
const POT_DRIP_TWO = drip(306, 148, 5.5, 10);
const DIPPER_HANDLE = "M292 158L315 135L319 139L296 162Z";

/** The grass of the middle floor and the tall foreground grass. */
const TUFTS_MID = [
  tuft(46, 170, 13, 2),
  tuft(104, 174, 10, -2),
  tuft(224, 172, 12, 2),
  tuft(258, 174, 9, -2),
  tuft(348, 172, 12, 2),
].join("");
const TUFTS_FRONT = [
  tuft(16, 206, 30, 4),
  tuft(64, 206, 24, -3),
  tuft(112, 206, 18, 3),
  tuft(236, 206, 22, -4),
  tuft(306, 204, 26, 3),
  tuft(374, 206, 32, -4),
].join("");

const SCENE_TRAIL: readonly Paw[] = [
  { x: 36, y: 188, rotate: -10, scale: 0.9 },
  { x: 62, y: 181, rotate: 6, scale: 0.95 },
];

const DIVIDER_TRAIL: readonly Paw[] = [
  { x: 196, y: 44, rotate: -8, scale: 0.9 },
  { x: 222, y: 47, rotate: 7, scale: 0.9 },
];

function scene(id: IllustrationId): ReactElement[] {
  const skyTear = tornEdge(SCENE_WIDTH, 9, 1.4, SCENE_HEIGHT + 8);
  const specs = {
    sky: { d: skyTear.sheet, fill: "var(--inv-soft)", shadow: false },
    halo: { d: SUN_HALO, fill: "var(--inv-decoration-one)", shadow: false },
    sun: { d: SUN, fill: "var(--inv-decoration-one)" },
    farL: { d: HILL_FAR_LEFT, fill: "var(--inv-decoration-two)", shadow: false },
    farR: { d: HILL_FAR_RIGHT, fill: "var(--inv-decoration-two)", shadow: false },
    midL: { d: HILL_MID_LEFT, fill: "var(--inv-decoration-two)" },
    midR: { d: HILL_MID_RIGHT, fill: "var(--inv-decoration-two)" },
    gmid: { d: GROUND_MID, fill: "var(--inv-decoration-two)", shadow: false },
    gnear: { d: GROUND_NEAR, fill: "var(--inv-accent)", shadow: false },
    branch: { d: BRANCH, fill: "var(--inv-decoration-two)" },
    leafA: {
      d: BRANCH_LEAF_ONE,
      fill: "var(--inv-decoration-two)",
      transform: "translate(322 10) rotate(58)",
      shadow: false,
    },
    leafB: {
      d: BRANCH_LEAF_TWO,
      fill: "var(--inv-decoration-one)",
      transform: "translate(306 5) rotate(112)",
      shadow: false,
    },
    hive: { d: HIVE_BODY, fill: "var(--inv-decoration-one)", outline: true },
    ledge: { d: HIVE_LEDGE, fill: "var(--inv-decoration-two)", shadow: false },
    hole: { d: HIVE_ENTRANCE, fill: "var(--inv-ink)", shadow: false },
    comb: { d: HIVE_COMB, fill: "var(--inv-decoration-one)" },
    blanket: { d: BLANKET, fill: "var(--inv-surface)" },
    bfold: { d: BLANKET_FOLD, fill: "var(--inv-soft)", shadow: false },
    body: { d: BEAR_BODY, fill: "var(--inv-decoration-one)" },
    head: { d: BEAR_HEAD, fill: "var(--inv-decoration-one)", outline: true },
    earL: { d: BEAR_EAR_LEFT, fill: "var(--inv-decoration-one)" },
    earR: { d: BEAR_EAR_RIGHT, fill: "var(--inv-decoration-one)" },
    muzzle: { d: BEAR_MUZZLE, fill: "var(--inv-surface)", shadow: false },
    armL: { d: BEAR_ARM_LEFT, fill: "var(--inv-decoration-two)" },
    armR: { d: BEAR_ARM_RIGHT, fill: "var(--inv-decoration-two)" },
    footL: { d: BEAR_FOOT_LEFT, fill: "var(--inv-decoration-two)" },
    footR: { d: BEAR_FOOT_RIGHT, fill: "var(--inv-decoration-two)" },
    belly: { d: BEAR_BELLY, fill: "var(--inv-soft)", shadow: false },
    potB: { d: POT_BODY, fill: "var(--inv-decoration-two)" },
    rim: { d: POT_RIM, fill: "var(--inv-accent)", shadow: false },
    honey: { d: POT_HONEY, fill: "var(--inv-decoration-one)", shadow: false },
    label: { d: POT_LABEL, fill: "var(--inv-surface)", shadow: false },
    dropA: { d: POT_DRIP_ONE, fill: "var(--inv-decoration-one)", shadow: false },
    dropB: { d: POT_DRIP_TWO, fill: "var(--inv-decoration-one)", shadow: false },
    stick: { d: DIPPER_HANDLE, fill: "var(--inv-accent)" },
    grassM: { d: TUFTS_MID, fill: "var(--inv-accent)", shadow: false },
    gfront: { d: TUFTS_FRONT, fill: "var(--inv-decoration-two)", shadow: false },
    leafL1: {
      d: leaf(72, 31),
      fill: "var(--inv-decoration-two)",
      transform: "translate(2 208) rotate(10)",
      shadow: false,
    },
    leafL2: {
      d: leaf(56, 26),
      fill: "var(--inv-accent)",
      transform: "translate(-14 210) rotate(-14)",
      shadow: false,
    },
    leafR1: {
      d: leaf(68, 30),
      fill: "var(--inv-decoration-two)",
      transform: "translate(388 208) rotate(-10)",
      shadow: false,
    },
    leafR2: {
      d: leaf(56, 26),
      fill: "var(--inv-accent)",
      transform: "translate(404 210) rotate(14)",
      shadow: false,
    },
  } satisfies Record<string, SheetSpec>;
  const { all, named } = sheetSet(specs);
  const cut = (...names: (keyof typeof specs)[]): ReactElement[] =>
    cutSheets(
      id,
      names.map((name) => named(name)),
    );
  const leafVeinsAt = (
    key: string,
    length: number,
    width: number,
    transform: string,
  ): ReactElement =>
    h("path", {
      key,
      d: leafVein(length, width),
      transform,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      opacity: 0.28,
    });

  return [
    sheetDefinitions(id, all),
    h("defs", { key: "pattern-definitions" }, checkPattern(id)),
    ...cut("sky"),
    h("use", {
      key: "torn-line",
      href: `#${id("sky")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    // Far plane: warm haze, pollen dots, the sun, two ranges of honey hills.
    h("path", { key: "haze", d: HAZE, fill: "var(--inv-decoration-one)", opacity: 0.14 }),
    h("path", {
      key: "pollen",
      d: [disc(118, 44, 1.5), disc(168, 52, 1.4), disc(246, 28, 1.5), disc(206, 70, 1.1)].join(""),
      fill: "var(--inv-decoration-one)",
      opacity: 0.3,
    }),
    sunRays(70, 42, 24, 34, 8, 0.32),
    h("use", {
      key: "sun-halo-fill",
      href: `#${id("halo")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.26,
    }),
    ...cut("sun"),
    h("use", {
      key: "sun-core",
      href: `#${id("sun")}`,
      fill: "var(--inv-surface)",
      opacity: 0.22,
    }),
    h("g", { key: "hills-far", opacity: 0.3 }, ...cut("farL", "farR")),
    h("g", { key: "hills-mid", opacity: 0.55 }, ...cut("midL", "midR")),
    // The branch and the hanging hive, on the middle plane over the hills.
    ...cut("branch", "leafA", "leafB"),
    h("path", {
      key: "hive-thread",
      d: "M346 17V56",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      opacity: 0.42,
    }),
    h("path", {
      key: "comb-thread",
      d: "M313 10V19",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      strokeLinecap: "round",
      opacity: 0.35,
    }),
    ...cut("comb"),
    ...cut("hive", "ledge", "hole"),
    h(
      "g",
      {
        key: "hive-bands",
        fill: "none",
        stroke: "var(--inv-decoration-two)",
        strokeWidth: 2.2,
        strokeLinecap: "round",
        opacity: 0.6,
      },
      h("path", { key: "hive-band-one", d: "M334 72C340 75 352 75 358 72" }),
      h("path", { key: "hive-band-two", d: "M335 82C341 85 351 85 357 82" }),
    ),
    h("path", {
      key: "hive-highlight",
      d: "M338 65C339 61 341 59 344 58",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      opacity: 0.4,
    }),
    // The floor, the picnic blanket with its check pattern, and the grass of the middle ground.
    ...cut("gmid", "gnear"),
    ...cut("blanket"),
    checked("blanket-checks", id, named("blanket"), "checks"),
    ...cut("bfold"),
    h("path", {
      key: "blanket-fringe",
      d: BLANKET_FRINGE,
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.2,
      opacity: 0.6,
    }),
    h("use", {
      key: "tufts-mid-tint",
      href: `#${id("grassM")}`,
      fill: "var(--inv-accent)",
      opacity: 1,
    }),
    paws("scene-paws", id, SCENE_TRAIL, "var(--inv-surface)", 0.42),
    // The teddy, back to front: body, arms, feet in front, ears, head, muzzle, belly, seams, and bow.
    ...cut("body", "armL", "armR"),
    h("path", {
      key: "bear-arm-pads",
      d: disc(121, 157, 4.8, 0.9) + disc(179, 157, 4.8, 0.9),
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    ...cut("footL", "footR"),
    h("path", {
      key: "bear-foot-pads",
      d: disc(129, 182, 8, 0.6) + disc(171, 182, 8, 0.6),
      fill: "var(--inv-surface)",
      opacity: 0.78,
    }),
    h("path", {
      key: "bear-foot-toes",
      d:
        disc(125, 176.4, 1.8) +
        disc(129, 175, 1.8) +
        disc(133, 176.4, 1.8) +
        disc(167, 176.4, 1.8) +
        disc(171, 175, 1.8) +
        disc(175, 176.4, 1.8),
      fill: "var(--inv-ink)",
      opacity: 0.3,
    }),
    ...cut("earL", "earR", "head", "muzzle"),
    h("path", {
      key: "bear-ear-inner",
      d: disc(129, 74, 5.4, 0.94) + disc(171, 74, 5.4, 0.94),
      fill: "var(--inv-soft)",
      opacity: 0.8,
    }),
    ...cut("belly"),
    h("path", {
      key: "bear-belly-stitch",
      d: BEAR_BELLY,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 0.9,
      strokeDasharray: "2 3",
      opacity: 0.36,
    }),
    h(
      "g",
      {
        key: "bear-seams",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 0.9,
        strokeDasharray: "2 3",
        strokeLinecap: "round",
        opacity: 0.34,
      },
      h("path", { key: "seam-left", d: "M134 136C130 146 130 158 135 168" }),
      h("path", { key: "seam-right", d: "M166 136C170 146 170 158 165 168" }),
      h("path", { key: "seam-muzzle", d: "M143 113C147 117 154 117 158 113" }),
    ),
    h("path", {
      key: "bear-cheeks",
      d: disc(135, 101, 5, 0.7) + disc(165, 101, 5, 0.7),
      fill: "var(--inv-decoration-one)",
      opacity: 0.4,
    }),
    h("circle", { key: "bear-eye-left", cx: 141, cy: 91, r: 2.6, fill: "var(--inv-ink)" }),
    h("circle", { key: "bear-eye-right", cx: 159, cy: 91, r: 2.6, fill: "var(--inv-ink)" }),
    h("circle", {
      key: "bear-glint-left",
      cx: 141.8,
      cy: 90.2,
      r: 0.8,
      fill: "var(--inv-surface)",
      opacity: 0.9,
    }),
    h("circle", {
      key: "bear-glint-right",
      cx: 159.8,
      cy: 90.2,
      r: 0.8,
      fill: "var(--inv-surface)",
      opacity: 0.9,
    }),
    h("path", {
      key: "bear-nose",
      d: "M145.6 98.4C147.8 96.8 152.2 96.8 154.4 98.4C155.8 99.4 155.2 101.6 153 102.2C151 102.7 149 102.7 147 102.2C144.8 101.6 144.2 99.4 145.6 98.4Z",
      fill: "var(--inv-ink)",
    }),
    h("path", {
      key: "bear-mouth",
      d: "M150 102.4V105.6M150 105.6C146.6 109 143 107.6 142 104.6M150 105.6C153.4 109 157 107.6 158 104.6",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "bear-head-highlight",
      d: "M137 78C142 74 149 73 154 75",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 2.6,
      strokeLinecap: "round",
      opacity: 0.4,
    }),
    h("path", {
      key: "bear-bow-loops",
      d: BEAR_BOW_LEFT + BEAR_BOW_RIGHT,
      fill: "var(--inv-decoration-two)",
    }),
    h("path", {
      key: "bear-bow-knot",
      d: disc(150, 127, 3.6),
      fill: "var(--inv-accent)",
    }),
    h("path", {
      key: "bear-bow-highlight",
      d: "M140 122C142 119 146 119 148 121",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      opacity: 0.45,
    }),
    // The pot of honey and the wooden dipper leaning out of it.
    ...cut("potB", "label"),
    h("path", {
      key: "pot-label-drop",
      d: disc(291, 164, 2.6, 1.2),
      fill: "var(--inv-decoration-one)",
      opacity: 0.9,
    }),
    h("path", {
      key: "pot-shine",
      d: "M274 157C273 166 276 174 282 178",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 2,
      strokeLinecap: "round",
      opacity: 0.35,
    }),
    ...cut("stick"),
    h(
      "g",
      { key: "dipper-head", transform: "translate(319 134) rotate(-42)" },
      h("rect", {
        key: "dipper-knob",
        x: -9,
        y: -3.6,
        width: 18,
        height: 7.2,
        rx: 3.6,
        fill: "var(--inv-decoration-one)",
      }),
      h("path", {
        key: "dipper-grooves",
        d: "M-5 -3.4V3.4M0 -3.6V3.6M5 -3.4V3.4",
        fill: "none",
        stroke: "var(--inv-decoration-two)",
        strokeWidth: 1.8,
        strokeLinecap: "round",
      }),
    ),
    h("path", {
      key: "dipper-drip",
      d: drip(326, 138, 4, 7),
      fill: "var(--inv-decoration-one)",
      opacity: 0.9,
    }),
    ...cut("rim", "honey", "dropA", "dropB"),
    h("path", {
      key: "pot-rim-line",
      d: "M266 147C274 151 306 151 312 147",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.35,
    }),
    // Three paper daisies, two of them framing the pot.
    daisy("daisy-one", 40, 172, 1, "var(--inv-surface)"),
    daisy("daisy-two", 228, 174, 0.85, "var(--inv-surface)"),
    daisy("daisy-three", 348, 172, 1.05, "var(--inv-decoration-one)"),
    // The fliers: a dotted path each, then the bee itself.
    h("path", {
      key: "bee-path-one",
      d: "M246 84C270 70 292 66 306 74",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      strokeDasharray: "2.6 4",
      strokeLinecap: "round",
      opacity: 0.3,
    }),
    h("path", {
      key: "bee-path-two",
      d: "M196 118C214 128 230 132 244 128",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      strokeDasharray: "2.6 4",
      strokeLinecap: "round",
      opacity: 0.3,
    }),
    bee("bee-one", 310, 78, 0.95, -14),
    bee("bee-two", 248, 126, 0.82, 20),
    bee("bee-three", 80, 54, 0.72, -28),
    // The front layer: tall grass, then the leaves that frame both edges.
    h("use", {
      key: "tufts-front-tint",
      href: `#${id("gfront")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.95,
    }),
    ...cut("leafL2", "leafL1", "leafR2", "leafR1"),
    leafVeinsAt("leaf-left-veins", 72, 31, specs.leafL1.transform ?? ""),
    leafVeinsAt("leaf-right-veins", 68, 30, specs.leafR1.transform ?? ""),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const skyTear = tornEdge(SCENE_WIDTH, 12, 3.1, DIVIDER_HEIGHT + 8);
  const groundTear = tornEdge(SCENE_WIDTH, 36, 4.8, DIVIDER_HEIGHT + 8);
  const specs = {
    sky: { d: skyTear.sheet, fill: "var(--inv-soft)", shadow: false },
    ground: { d: groundTear.sheet, fill: "var(--inv-accent)", shadow: false },
    halo: { d: disc(58, 16, 11), fill: "var(--inv-decoration-one)", shadow: false },
    sun: { d: disc(58, 16, 7), fill: "var(--inv-decoration-one)" },
    comb: {
      d: comb(300, 22, 7.6, [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]),
      fill: "var(--inv-decoration-one)",
    },
    tufts: {
      d: [
        tuft(120, 52, 14, 2),
        tuft(152, 54, 10, -2),
        tuft(232, 52, 12, 2),
        tuft(264, 54, 10, -2),
        tuft(356, 52, 14, 2),
      ].join(""),
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
  } satisfies Record<string, SheetSpec>;
  const { all, named } = sheetSet(specs);
  const cut = (...names: (keyof typeof specs)[]): ReactElement[] =>
    cutSheets(
      id,
      names.map((name) => named(name)),
    );

  return [
    sheetDefinitions(id, all),
    pawDefinition(id),
    ...cut("sky"),
    h("use", {
      key: "torn-line",
      href: `#${id("sky")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    h("use", {
      key: "sun-halo-fill",
      href: `#${id("halo")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.3,
    }),
    ...cut("sun"),
    h("g", { key: "divider-honey", fill: "var(--inv-decoration-one)", opacity: 0.85 }, [
      h("path", { key: "divider-drip-one", d: drip(168, 12, 6, 12) }),
      h("path", { key: "divider-drip-two", d: drip(182, 13, 3.6, 7) }),
      h("path", { key: "divider-drip-three", d: drip(292, 12, 5, 9) }),
    ]),
    ...cut("ground"),
    h("path", {
      key: "comb-thread",
      d: "M300 8V15",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      strokeLinecap: "round",
      opacity: 0.4,
    }),
    ...cut("comb"),
    ...cut("tufts"),
    daisy("divider-daisy", 334, 38, 0.85, "var(--inv-surface)"),
    paws("divider-paws", id, DIVIDER_TRAIL, "var(--inv-surface)", 0.4),
    bee("divider-bee", 60, 38, 0.78, -18),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const skyTear = tornEdge(SCENE_WIDTH, 9, 7.6, FOOTER_HEIGHT + 8);
  const groundTear = tornEdge(SCENE_WIDTH, 34, 2.3, FOOTER_HEIGHT + 8);
  const specs = {
    sky: { d: skyTear.sheet, fill: "var(--inv-soft)", shadow: false },
    ground: { d: groundTear.sheet, fill: "var(--inv-accent)", shadow: false },
    far: { d: hill(-12, 200, 14, 34, -8), fill: "var(--inv-decoration-two)", shadow: false },
    gback: {
      d: [
        tuft(60, 40, 12, 2),
        tuft(96, 42, 9, -2),
        tuft(206, 40, 12, 2),
        tuft(268, 42, 9, -2),
      ].join(""),
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
    gfront: {
      d: [
        tuft(18, 58, 24, 4),
        tuft(76, 60, 16, -3),
        tuft(170, 58, 20, 3),
        tuft(246, 60, 15, -3),
        tuft(310, 58, 20, 3),
        tuft(376, 60, 26, -4),
      ].join(""),
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
    leafL: {
      d: leaf(64, 28),
      fill: "var(--inv-decoration-two)",
      transform: "translate(4 66) rotate(-22)",
      shadow: false,
    },
    leafR: {
      d: leaf(66, 29),
      fill: "var(--inv-decoration-two)",
      transform: "translate(388 66) rotate(22)",
      shadow: false,
    },
  } satisfies Record<string, SheetSpec>;
  const { all, named } = sheetSet(specs);
  const cut = (...names: (keyof typeof specs)[]): ReactElement[] =>
    cutSheets(
      id,
      names.map((name) => named(name)),
    );

  return [
    sheetDefinitions(id, all),
    ...cut("sky"),
    h("use", {
      key: "torn-line",
      href: `#${id("sky")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    h("g", { key: "footer-hills", opacity: 0.45 }, ...cut("far")),
    h("path", {
      key: "footer-drips",
      d: drip(30, 9, 7, 16) + drip(48, 9, 4.6, 10) + drip(286, 9, 6, 13) + drip(302, 10, 3.6, 7),
      fill: "var(--inv-decoration-one)",
      opacity: 0.9,
    }),
    ...cut("ground"),
    h("use", {
      key: "tufts-back-tint",
      href: `#${id("gback")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 1,
    }),
    h("use", {
      key: "tufts-front-tint",
      href: `#${id("gfront")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.95,
    }),
    ...cut("leafL", "leafR"),
    h("path", {
      key: "footer-leaf-veins-left",
      d: leafVein(58, 26),
      transform: specs.leafL.transform,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      opacity: 0.28,
    }),
  ];
}

/** «Osito y miel» in paper cut-out: the honey diorama, the comb divider, and the picnic footer. */
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
