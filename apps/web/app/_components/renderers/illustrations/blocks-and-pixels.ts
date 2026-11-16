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
 * «Bloques y píxeles» in paper cut-out (I3b, I4c; S1-S5), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`. The owner asked for richer birthday scenes
 * (S5, L6), so the header is now a pixel valley in three depth planes on a six-pixel grid: a square sun with
 * stepped rays and three floating clouds, three stepped mountain ranges with lit top rows, a pixel waterfall
 * that leaves a ledge of the middle range and a river that winds through the valley to the frame, a small cave
 * with its gems, four kinds of square tree, pixel flowers, and a foreground of terraced hills on both sides.
 * Every shape is cut on the same grid, so the drawing is one landscape and not a set of stamps.
 *
 * Original work: this is a voxel landscape of our own. No block has a face, no grass block is drawn as a brown
 * cube under a green band, and no character, icon, or name of any game franchise appears. Every color is a theme
 * variable of `blocks-and-pixels`, so the whole drawing re-colours with its palette.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** The drawing grid: every edge of every shape lands on a multiple of it. */
const UNIT = 6;

/** One placed stamp of a reusable shape: where it sits, how far it turns, how big it is. */
interface Place {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

/** One peak of a stepped mountain range: its middle, its height, and how wide it spreads. */
interface Peak {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

/** One column of a stepped silhouette: where it starts and how high it is. */
interface Column {
  readonly x: number;
  readonly top: number;
}

/** The grid columns of a silhouette, each one quantized to the drawing grid. */
function columns(peaks: readonly Peak[], base: number): Column[] {
  const list: Column[] = [];

  for (let x = -UNIT; x <= SCENE_WIDTH + UNIT; x += UNIT) {
    let top = base;

    for (const peak of peaks) {
      const reach = Math.abs(x - peak.x);
      if (reach > peak.width) {
        continue;
      }
      const rise = Math.round(((base - peak.y) * (peak.width - reach)) / peak.width);
      top = Math.min(top, Math.round((base - rise) / UNIT) * UNIT);
    }
    list.push({ x, top });
  }
  return list;
}

/** The staircase of a mountain range: one vertical face and one flat top per column. */
function rangePath(peaks: readonly Peak[], base: number): string {
  const list = columns(peaks, base);
  let d = `M${list[0]?.x ?? -UNIT} ${base}`;

  for (const column of list) {
    d += `V${column.top}H${column.x + UNIT}`;
  }
  return `${d}V${base}Z`;
}

/** The lit top row of a range, cut as one strip of blocks, the stepped shading of the light. */
function rangeLight(peaks: readonly Peak[], base: number): string {
  return columns(peaks, base)
    .filter((column) => column.top < base)
    .map((column) => `M${column.x} ${column.top}h${UNIT}v${UNIT}h-${UNIT}Z`)
    .join("");
}

/** The four square trees of the valley: a column of blocks on a block trunk. */
type TreeKind = "tall" | "round" | "small" | "pine";

/** One row of a canopy, from the left edge to the right one, at a height above the base. */
function row(x: number, y: number, height: number): string {
  return `M${x} ${y}h${height}v${UNIT}h-${height}Z`;
}

/** The trunk of a tree: one block wide, and as tall as its kind. */
function trunkPath(kind: TreeKind, x: number, y: number): string {
  const height = kind === "small" ? UNIT : UNIT * 2;
  return row(x - UNIT / 2, y - height, UNIT).replace(`h${UNIT}v${UNIT}`, `h${UNIT}v${height}`);
}

/** The canopy of a tree: one block wider at every row, and the block that crowns it. */
function canopyPath(kind: TreeKind, x: number, y: number): string {
  if (kind === "tall") {
    return row(x - UNIT * 2, y - UNIT * 5, UNIT * 4) + row(x - UNIT, y - UNIT * 6, UNIT * 2);
  }
  if (kind === "round") {
    return row(x - UNIT * 2, y - UNIT * 4, UNIT * 4) + row(x - UNIT, y - UNIT * 5, UNIT * 2);
  }
  if (kind === "pine") {
    return (
      row(x - UNIT * 2, y - UNIT * 2, UNIT * 4) +
      row(x - UNIT * 1.5, y - UNIT * 3, UNIT * 3) +
      row(x - UNIT, y - UNIT * 4, UNIT * 2) +
      row(x - UNIT / 2, y - UNIT * 5, UNIT)
    );
  }
  return row(x - UNIT, y - UNIT * 3, UNIT * 2) + row(x - UNIT / 2, y - UNIT * 4, UNIT);
}

/** The lit block of the canopy: the paper's light falls on its top left corner. */
function canopyLight(kind: TreeKind, x: number, y: number): string {
  if (kind === "tall") {
    return row(x - UNIT * 2, y - UNIT * 5, UNIT * 2);
  }
  if (kind === "round") {
    return row(x - UNIT * 2, y - UNIT * 4, UNIT * 1.5);
  }
  if (kind === "pine") {
    return row(x - UNIT * 1.5, y - UNIT * 3, UNIT);
  }
  return row(x - UNIT, y - UNIT * 3, UNIT);
}

/** The stem of a pixel flower: two blocks standing on the ground. */
function stemPath(x: number, y: number): string {
  return `M${x - UNIT / 2} ${y - UNIT * 2}h${UNIT}v${UNIT * 2}h-${UNIT}Z`;
}

/** The head of a pixel flower: a plus of five blocks, in the color of its stamp. */
function headPath(x: number, y: number): string {
  return (
    `M${x - UNIT / 2} ${y - UNIT * 4.5}h${UNIT}v-${UNIT}h${UNIT}v-${UNIT}h${UNIT}v${UNIT}h${UNIT}v${UNIT}h-${UNIT}` +
    `v${UNIT}h-${UNIT}v${UNIT}h-${UNIT}Z`
  );
}

/** A gem: the diamond of four stepped faces, and the sparkle above it. */
function gemPath(x: number, y: number): string {
  return `M${x} ${y - UNIT * 2}l${UNIT} ${UNIT}-${UNIT} ${UNIT}-${UNIT}-${UNIT}Z`;
}

/** The three ranges of the valley, the pool, and the river that runs out of it. */
const RANGE_FAR: readonly Peak[] = [
  { x: 34, y: 78, width: 52 },
  { x: 126, y: 66, width: 58 },
  { x: 228, y: 84, width: 46 },
  { x: 300, y: 66, width: 52 },
  { x: 372, y: 90, width: 40 },
];

const RANGE_MID: readonly Peak[] = [
  { x: 24, y: 108, width: 44 },
  { x: 106, y: 90, width: 52 },
  { x: 200, y: 102, width: 40 },
  { x: 288, y: 88, width: 52 },
  { x: 372, y: 104, width: 40 },
];

const HILL_LEFT: readonly Peak[] = [
  { x: -6, y: 130, width: 50 },
  { x: 76, y: 142, width: 52 },
];

const HILL_RIGHT: readonly Peak[] = [
  { x: 310, y: 128, width: 54 },
  { x: 392, y: 140, width: 52 },
];

/** The waterfall leaves the middle range at this ledge, and falls into the pool below it. */
const FALL_X = 192;
const FALL_TOP = 120;
const FALL_BOTTOM = 158;

const POOL = "M162 158H246V176H162Z";
const RIVER = "M168 176H232V184H240V192H252V200H212V192H204V184H186V176Z";
const RIVER_LIGHT =
  "M186 164H228V170H186ZM192 178H222V182H192ZM212 186H228V190H212ZM220 194H240V198H220Z";

const SUN = "M312 18H330V36H312Z";
const SUN_RAYS =
  "M318 6H324V12H318ZM318 42H324V48H318ZM300 24H306V30H300ZM336 24H342V30H336Z" +
  "M306 12H312V18H306ZM330 42H336V48H330ZM306 42H312V48H306ZM330 12H336V18H330Z";

const CLOUDS: readonly Place[] = [
  { x: 54, y: 26, rotate: 0, scale: 1 },
  { x: 180, y: 40, rotate: 0, scale: 0.8 },
  { x: 246, y: 20, rotate: 0, scale: 0.6 },
];

/** The gems: two inside the cave, two on the terraces and one on the river bank. */
const GEMS: readonly Place[] = [
  { x: 46, y: 172, rotate: 0, scale: 0.8 },
  { x: 66, y: 168, rotate: 0, scale: 0.6 },
  { x: 118, y: 168, rotate: 0, scale: 0.9 },
  { x: 282, y: 172, rotate: 0, scale: 0.85 },
  { x: 330, y: 164, rotate: 0, scale: 0.7 },
];

const FLOWERS: readonly Place[] = [
  { x: 92, y: 166, rotate: 0, scale: 1 },
  { x: 136, y: 178, rotate: 0, scale: 0.9 },
  { x: 270, y: 162, rotate: 0, scale: 1 },
  { x: 302, y: 178, rotate: 0, scale: 0.85 },
  { x: 364, y: 168, rotate: 0, scale: 0.95 },
];

/** The trees: a tall one and a round one on the left hill, a pine and a round one on the right. */
const TREES: readonly { readonly kind: TreeKind; readonly place: Place }[] = [
  { kind: "tall", place: { x: 34, y: 152, rotate: 0, scale: 1.5 } },
  { kind: "round", place: { x: 76, y: 158, rotate: 0, scale: 1.4 } },
  { kind: "small", place: { x: 106, y: 176, rotate: 0, scale: 1.2 } },
  { kind: "pine", place: { x: 298, y: 154, rotate: 0, scale: 1.5 } },
  { kind: "round", place: { x: 340, y: 158, rotate: 0, scale: 1.35 } },
  { kind: "small", place: { x: 366, y: 174, rotate: 0, scale: 1.2 } },
];

/** The gem stamp, the flower stamp and the tree stamps, each cut once and placed many times. */
function stampDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "stamp-definitions" },
    h(
      "g",
      { key: "gem", id: id("gem") },
      h("path", { key: "stone", d: gemPath(0, 0) }),
      h("path", {
        key: "facet",
        d: "M0-10L4-6L0-2L-4-6Z",
        fill: "var(--inv-surface)",
        opacity: 0.55,
      }),
      h("rect", {
        key: "spark",
        x: -1.5,
        y: -18,
        width: 3,
        height: 6,
        fill: "var(--inv-surface)",
        opacity: 0.8,
      }),
    ),
    h(
      "g",
      { key: "flower", id: id("flower") },
      h("path", { key: "stem", d: stemPath(0, 0), fill: "var(--inv-accent)" }),
      h("path", { key: "head", d: headPath(0, 0) }),
      h("rect", {
        key: "heart",
        x: -3,
        y: -21,
        width: 6,
        height: 6,
        fill: "var(--inv-decoration-one)",
      }),
    ),
    ...(["tall", "round", "small", "pine"] as const).map((kind) =>
      h(
        "g",
        { key: `tree-${kind}`, id: id(`tree-${kind}`) },
        h("path", { key: "trunk", d: trunkPath(kind, 0, 0), fill: "var(--inv-decoration-one)" }),
        h("path", { key: "canopy", d: canopyPath(kind, 0, 0) }),
        h("path", {
          key: "light",
          d: canopyLight(kind, 0, 0),
          fill: "var(--inv-surface)",
          opacity: 0.45,
        }),
        h("path", {
          key: "shade",
          d: canopyPath(kind, 0, 0),
          fill: "var(--inv-ink)",
          opacity: 0.14,
          transform: `translate(${UNIT} ${UNIT})`,
        }),
      ),
    ),
  );
}

/** One stamp, placed many times in one array: the keys are the array's own indexes. */
function stamps(
  key: string,
  id: IllustrationId,
  name: string,
  places: readonly Place[],
  paint: ThemePaint,
  opacity = 1,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    places.map((item, index) =>
      h("use", {
        key: `${key}-${index}`,
        href: `#${id(name)}`,
        transform: `translate(${item.x} ${item.y}) scale(${item.scale})`,
      }),
    ),
  );
}

/** A stepped cloud: three blocks of two heights, with a pale under-row. */
function cloud(key: string, place: Place, paint: ThemePaint, opacity = 1): ReactElement {
  const { x, y, scale } = place;

  return h(
    "g",
    { key, transform: `translate(${x} ${y}) scale(${scale})`, fill: paint, opacity },
    h("path", {
      key: "body",
      d: "M0 0H24V-6H42V0H54V6H48V12H0V6Z",
    }),
    h("rect", {
      key: "shade",
      x: 6,
      y: 6,
      width: 42,
      height: 3,
      fill: "var(--inv-soft)",
      opacity: 0.8,
    }),
  );
}

/** The cave: a stepped opening in the left hill, with its floor, its shadow and the gems inside it. */
function cave(id: IllustrationId, x: number, y: number): ReactElement[] {
  return [
    h("path", {
      key: "cave-frame",
      d: `M${x - 24} ${y}H${x + 24}V${y - 12}H${x + 18}V${y - 18}H${x + 12}V${y - 24}H${x - 12}V${y - 18}H${x - 18}V${y - 12}H${x - 24}Z`,
      fill: "var(--inv-ink)",
      opacity: 0.55,
    }),
    h("path", {
      key: "cave-mouth",
      d: `M${x - 18} ${y}H${x + 18}V${y - 12}H${x + 12}V${y - 18}H${x - 12}V${y - 12}H${x - 18}Z`,
      fill: "var(--inv-ink)",
      opacity: 0.75,
    }),
    h("rect", {
      key: "cave-glow",
      x: x - 6,
      y: y - 6,
      width: 12,
      height: 6,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
    }),
    h("use", {
      key: "cave-gem-one",
      href: `#${id("gem")}`,
      fill: "var(--inv-decoration-two)",
      transform: `translate(${x - 8} ${y - 2}) scale(0.7)`,
    }),
    h("use", {
      key: "cave-gem-two",
      href: `#${id("gem")}`,
      fill: "var(--inv-surface)",
      transform: `translate(${x + 8} ${y - 2}) scale(0.55)`,
    }),
  ];
}

/** The header diorama: sky, sun, clouds, three ranges, the waterfall and the river, and the terraces. */
function scene(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const tear = tornEdge(SCENE_WIDTH, 6, 2.4, SCENE_HEIGHT + 8);

  body.push(
    ...collect({ name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false }),
    // Plane one: the sky, its sun and its clouds.
    h("rect", {
      key: "sky",
      x: -4,
      y: 0,
      width: 398,
      height: 150,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
    }),
    h("rect", {
      key: "sky-veil",
      x: -4,
      y: 0,
      width: 398,
      height: 150,
      fill: "var(--inv-surface)",
      opacity: 0.4,
    }),
    ...collect({ name: "sun", d: SUN, fill: "var(--inv-surface)", shadow: false }),
    h("path", { key: "sun-rays", d: SUN_RAYS, fill: "var(--inv-decoration-two)", opacity: 0.7 }),
    h("path", {
      key: "sun-ring",
      d: "M306 12H336V18H306ZM306 36H336V42H306ZM306 18H312V36H306ZM330 18H336V36H330Z",
      fill: "var(--inv-decoration-two)",
      opacity: 0.25,
    }),
    ...CLOUDS.map((place, index) =>
      cloud(`cloud-${index}`, place, "var(--inv-surface)", 0.9 - index * 0.1),
    ),
    // Plane one: the far range, pale and low.
    ...collect({
      name: "range-far",
      d: rangePath(RANGE_FAR, 150),
      fill: "var(--inv-accent)",
      shadow: false,
    }),
    h("use", {
      key: "range-far-veil",
      href: `#${id("range-far")}`,
      fill: "var(--inv-surface)",
      opacity: 0.45,
    }),
    h("path", {
      key: "range-far-light",
      d: rangeLight(RANGE_FAR, 150),
      fill: "var(--inv-soft)",
      opacity: 0.45,
    }),
    // Plane two: the middle range, with its lit tops and its shadowed right faces.
    ...collect({ name: "range-mid", d: rangePath(RANGE_MID, 176), fill: "var(--inv-accent)" }),
    h("use", {
      key: "range-mid-veil",
      href: `#${id("range-mid")}`,
      fill: "var(--inv-surface)",
      opacity: 0.3,
    }),
    h("path", {
      key: "range-mid-light",
      d: rangeLight(RANGE_MID, 176),
      fill: "var(--inv-soft)",
      opacity: 0.55,
    }),
    // The waterfall: it leaves a pond on the shoulder of the middle range, and drops into the pool.
    h("path", {
      key: "ledge-pond",
      d: `M${FALL_X - 18} ${FALL_TOP - 8}H${FALL_X + 18}V${FALL_TOP}H${FALL_X - 18}Z`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.9,
    }),
    h("path", {
      key: "ledge-light",
      d: `M${FALL_X - 12} ${FALL_TOP - 6}h12v3h-12ZM${FALL_X + 3} ${FALL_TOP - 6}h9v3h-9Z`,
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    h("path", {
      key: "fall-banks",
      d: `M${FALL_X - 12} ${FALL_TOP}H${FALL_X + 12}V${FALL_BOTTOM}H${FALL_X - 12}Z`,
      fill: "var(--inv-ink)",
      opacity: 0.18,
    }),
    h("path", {
      key: "fall",
      d: `M${FALL_X - 9} ${FALL_TOP}H${FALL_X + 9}V${FALL_BOTTOM}H${FALL_X - 9}Z`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.95,
    }),
    h("path", {
      key: "fall-light",
      d: `M${FALL_X - 6} ${FALL_TOP + 6}h6v12h-6ZM${FALL_X + 3} ${FALL_TOP + 24}h6v18h-6ZM${FALL_X - 6} ${FALL_TOP + 36}h6v12h-6Z`,
      fill: "var(--inv-surface)",
      opacity: 0.85,
    }),
    // Plane three: the pool, the river, and the mist of the falling water.
    ...collect({ name: "pool", d: POOL, fill: "var(--inv-decoration-two)" }),
    h("use", {
      key: "pool-veil",
      href: `#${id("pool")}`,
      fill: "var(--inv-surface)",
      opacity: 0.3,
    }),
    ...collect({ name: "river", d: RIVER, fill: "var(--inv-decoration-two)" }),
    h("use", {
      key: "river-veil",
      href: `#${id("river")}`,
      fill: "var(--inv-surface)",
      opacity: 0.3,
    }),
    h("path", { key: "water-light", d: RIVER_LIGHT, fill: "var(--inv-surface)", opacity: 0.75 }),
    h(
      "g",
      { key: "mist", fill: "var(--inv-surface)", opacity: 0.55 },
      [168, 180, 192, 204, 216].map((x, index) =>
        h("rect", { key: `mist-${index}`, x, y: 152 + (index % 2) * 6, width: 6, height: 6 }),
      ),
    ),
    // Plane four: the two terraced hills that frame the river, and their trees, flowers and gems.
    ...collect({ name: "hill-left", d: rangePath(HILL_LEFT, 200), fill: "var(--inv-accent)" }),
    h("use", {
      key: "hill-left-veil",
      href: `#${id("hill-left")}`,
      fill: "var(--inv-surface)",
      opacity: 0.18,
    }),
    h("path", {
      key: "hill-left-light",
      d: rangeLight(HILL_LEFT, 200),
      fill: "var(--inv-soft)",
      opacity: 0.6,
    }),
    ...collect({ name: "hill-right", d: rangePath(HILL_RIGHT, 200), fill: "var(--inv-accent)" }),
    h("use", {
      key: "hill-right-veil",
      href: `#${id("hill-right")}`,
      fill: "var(--inv-surface)",
      opacity: 0.18,
    }),
    h("path", {
      key: "hill-right-light",
      d: rangeLight(HILL_RIGHT, 200),
      fill: "var(--inv-soft)",
      opacity: 0.6,
    }),
    // The terraced front edge: one lit row of blocks along the bottom of both hills.
    h("path", {
      key: "terrace-edge",
      d:
        "M-6 182H12V176H30V170H48V176H72V182H96V188H120V194H150V200H-6Z" +
        "M396 182H378V176H360V170H342V176H318V182H294V188H270V194H240V200H396Z",
      fill: "var(--inv-soft)",
      opacity: 0.45,
    }),
    ...cave(id, 52, 184),
    ...TREES.map((tree, index) =>
      h("use", {
        key: `tree-${index}`,
        href: `#${id(`tree-${tree.kind}`)}`,
        fill: "var(--inv-accent)",
        transform: `translate(${tree.place.x} ${tree.place.y}) scale(${tree.place.scale})`,
      }),
    ),
    stamps("flowers", id, "flower", FLOWERS, "var(--inv-decoration-two)"),
    stamps("gems", id, "gem", GEMS, "var(--inv-decoration-two)"),
    // The near plane: the river mouth, and the blocks of light that the water throws on the bank.
    h(
      "g",
      { key: "bank-stones", fill: "var(--inv-ink)", opacity: 0.15 },
      [
        { x: 156, y: 190 },
        { x: 240, y: 194 },
        { x: 168, y: 200 },
      ].map((stone, index) =>
        h("rect", { key: `stone-${index}`, x: stone.x, y: stone.y, width: 12, height: 6 }),
      ),
    ),
    h(
      "g",
      { key: "light-blocks", fill: "var(--inv-surface)", opacity: 0.6 },
      [
        { x: 12, y: 158 },
        { x: 96, y: 160 },
        { x: 126, y: 186 },
        { x: 282, y: 156 },
        { x: 312, y: 184 },
        { x: 366, y: 160 },
      ].map((block, index) =>
        h("rect", { key: `light-${index}`, x: block.x, y: block.y, width: 6, height: 6 }),
      ),
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  );

  return [sheetDefinitions(id, sheets), stampDefinitions(id), ...body];
}

/** The divider: a stepped ridge over a pond, with a pine, a round tree and the gems of the valley. */
function divider(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 4, 3, DIVIDER_HEIGHT + 8);
  const ridge: readonly Peak[] = [
    { x: -6, y: 26, width: 48 },
    { x: 66, y: 18, width: 48 },
    { x: 156, y: 24, width: 44 },
    { x: 246, y: 16, width: 48 },
    { x: 336, y: 22, width: 48 },
    { x: 396, y: 26, width: 36 },
  ];

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    h("rect", {
      key: "divider-sky",
      x: -4,
      y: 0,
      width: 398,
      height: 40,
      fill: "var(--inv-decoration-two)",
      opacity: 0.45,
    }),
    h("rect", {
      key: "divider-sky-veil",
      x: -4,
      y: 0,
      width: 398,
      height: 40,
      fill: "var(--inv-surface)",
      opacity: 0.4,
    }),
    cloud("divider-cloud", { x: 288, y: 4, rotate: 0, scale: 0.6 }, "var(--inv-surface)", 0.9),
    cloud(
      "divider-cloud-small",
      { x: 128, y: 8, rotate: 0, scale: 0.4 },
      "var(--inv-surface)",
      0.7,
    ),
    ...collect({ name: "ridge", d: rangePath(ridge, 52), fill: "var(--inv-accent)" }),
    h("path", {
      key: "ridge-light",
      d: rangeLight(ridge, 52),
      fill: "var(--inv-soft)",
      opacity: 0.6,
    }),
    // A pond in the valley, with the light that the water throws on its surface.
    h("path", {
      key: "divider-pond",
      d: "M168 44H222V52H234V56H162V50H168Z",
      fill: "var(--inv-decoration-two)",
      opacity: 0.9,
    }),
    h("path", {
      key: "divider-pond-light",
      d: "M174 46h24v3h-24ZM168 51h12v3h-12Z",
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    h("use", {
      key: "divider-pine",
      href: `#${id("tree-pine")}`,
      fill: "var(--inv-accent)",
      transform: "translate(66 46) scale(1.3)",
    }),
    h("use", {
      key: "divider-round",
      href: `#${id("tree-round")}`,
      fill: "var(--inv-accent)",
      transform: "translate(320 44) scale(1.2)",
    }),
    stamps(
      "divider-flowers",
      id,
      "flower",
      [
        { x: 120, y: 48, rotate: 0, scale: 0.8 },
        { x: 268, y: 50, rotate: 0, scale: 0.7 },
        { x: 356, y: 46, rotate: 0, scale: 0.75 },
      ],
      "var(--inv-decoration-two)",
    ),
    stamps(
      "divider-gems",
      id,
      "gem",
      [
        { x: 150, y: 52, rotate: 0, scale: 0.8 },
        { x: 246, y: 52, rotate: 0, scale: 0.7 },
        { x: 382, y: 54, rotate: 0, scale: 0.6 },
      ],
      "var(--inv-decoration-two)",
    ),
    h(
      "g",
      { key: "divider-light", fill: "var(--inv-surface)", opacity: 0.55 },
      [
        { x: 36, y: 40 },
        { x: 214, y: 34 },
        { x: 300, y: 38 },
      ].map((block, index) =>
        h("rect", { key: `divider-light-${index}`, x: block.x, y: block.y, width: 6, height: 6 }),
      ),
    ),
  );

  return [sheetDefinitions(id, sheets), stampDefinitions(id), ...body];
}

/** The footer: terraced ground with a cave, a pine, gems, flowers and the river leaving the page. */
function footer(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 6, 6.6, FOOTER_HEIGHT + 8);
  const terrace: readonly Peak[] = [
    { x: -6, y: 14, width: 56 },
    { x: 96, y: 20, width: 60 },
    { x: 200, y: 26, width: 54 },
    { x: 300, y: 16, width: 60 },
    { x: 392, y: 22, width: 50 },
  ];

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    h("rect", {
      key: "footer-sky",
      x: -4,
      y: 0,
      width: 398,
      height: 40,
      fill: "var(--inv-decoration-two)",
      opacity: 0.4,
    }),
    h("rect", {
      key: "footer-sky-veil",
      x: -4,
      y: 0,
      width: 398,
      height: 40,
      fill: "var(--inv-surface)",
      opacity: 0.45,
    }),
    cloud("footer-cloud", { x: 60, y: 6, rotate: 0, scale: 0.7 }, "var(--inv-surface)", 0.85),
    cloud(
      "footer-cloud-right",
      { x: 272, y: 10, rotate: 0, scale: 0.55 },
      "var(--inv-surface)",
      0.7,
    ),
    ...collect({ name: "terrace", d: rangePath(terrace, 62), fill: "var(--inv-accent)" }),
    h("path", {
      key: "terrace-light",
      d: rangeLight(terrace, 62),
      fill: "var(--inv-soft)",
      opacity: 0.85,
    }),
    h(
      "g",
      { key: "footer-river", fill: "var(--inv-decoration-two)" },
      h("path", { key: "river", d: "M174 30H216V40H228V50H240V62H180V50H168V40H174Z" }),
    ),
    h("path", {
      key: "footer-river-light",
      d: "M186 34h12v6h-12ZM192 46h12v6h-12ZM198 54h12v6h-12Z",
      fill: "var(--inv-surface)",
      opacity: 0.75,
    }),
    ...cave(id, 96, 44),
    h("use", {
      key: "footer-pine",
      href: `#${id("tree-pine")}`,
      fill: "var(--inv-accent)",
      transform: "translate(302 44)",
    }),
    h("use", {
      key: "footer-small",
      href: `#${id("tree-small")}`,
      fill: "var(--inv-accent)",
      transform: "translate(348 46)",
    }),
    stamps(
      "footer-flowers",
      id,
      "flower",
      [
        { x: 40, y: 44, rotate: 0, scale: 1 },
        { x: 140, y: 40, rotate: 0, scale: 1 },
        { x: 260, y: 42, rotate: 0, scale: 1 },
        { x: 380, y: 40, rotate: 0, scale: 1 },
      ],
      "var(--inv-decoration-two)",
    ),
    stamps(
      "footer-gems",
      id,
      "gem",
      [
        { x: 66, y: 50, rotate: 0, scale: 0.7 },
        { x: 318, y: 50, rotate: 0, scale: 0.8 },
        { x: 360, y: 52, rotate: 0, scale: 0.6 },
      ],
      "var(--inv-decoration-two)",
    ),
    h(
      "g",
      { key: "footer-light", fill: "var(--inv-surface)", opacity: 0.55 },
      [
        { x: 24, y: 26 },
        { x: 156, y: 34 },
        { x: 286, y: 30 },
      ].map((block, index) =>
        h("rect", { key: `footer-light-${index}`, x: block.x, y: block.y, width: 6, height: 6 }),
      ),
    ),
  );

  return [sheetDefinitions(id, sheets), stampDefinitions(id), ...body];
}

/** «Bloques y píxeles» in paper cut-out: the stepped valley, the ridge divider, and the cave footer. */
export const BLOCKS_AND_PIXELS_ILLUSTRATION: ThemeIllustration = {
  theme: "blocks-and-pixels",
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
