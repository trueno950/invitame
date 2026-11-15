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
 * «Bloques y píxeles» in paper cut-out (I3b; S1-S4), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: the paper-cut technique drawn on a square grid
 * for the header — a band of sky with clouds made of squares, three ranges of stepped hills, square trees, and
 * gems standing on the ground — a torn divider that carries a stepped band, a tree and a gem between two
 * sections, and a footer strip of ground, gems and trees.
 *
 * Original work: this is a voxel landscape of our own — stepped terraces, square-topped trees and cut gems. No
 * block here has a face, no dirt-and-grass block texture is drawn, and no character, icon, or name of any game
 * franchise appears. Every color is a theme variable of `blocks-and-pixels`, so the whole drawing re-colours
 * with its palette; tints are `opacity` on a theme color and nothing else.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** One placed stamp of a reusable shape: where it sits, how far it turns, how big it is. */
interface Place {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

/** The sky: one flat block of it, cut square at both ends like everything else here. */
const SKY = "M-8 12H396V96H-8Z";

/** Two clouds, each a stack of squares the size of the grid. */
const CLOUD_NEAR = "M56 52H80V44H104V52H120V68H56ZM64 68H112V76H64Z";
const CLOUD_FAR = "M248 34H268V26H292V34H304V46H248ZM256 46H296V54H256Z";

/** The four ranges of stepped hills: the deepened ridge behind, pale behind it, green in the middle, ground in front. */
const HILLS_DEEP =
  "M-8 148V120H20V112H52V106H84V112H116V106H148V112H180V106H212V112H244V106H276V112H308V106H340V112H372V120H396V148Z";

const HILLS_BACK =
  "M-8 140V132H24V124H56V116H88V124H120V116H152V124H184V132H216V124H248V116H280V124H312V132H344V124H376V132H396V140Z";

const HILLS_MID =
  "M-8 200V164H32V156H72V148H112V156H152V148H192V156H232V164H272V156H312V148H352V156H396V200Z";

/** The lit top of each terrace: the light that makes a stepped hill read as paper and not as a bar. */
const TERRACE_LIGHT =
  "M-8 132H24V124H56V116H88V124H120V116H152V124H184V132H216V124H248V116H280V124H312V132H344V124H376V132H396V134H-8Z";

/** Trees: a trunk of two blocks and a canopy of three, its top face the palest of the papers. */
const TREE_TRUNK = "M-4 0H4V18H-4Z";
const TREE_CANOPY = "M-14-30H14V-2H-14ZM-6-38H6V-30H-6Z";
const TREE_CANOPY_TOP = "M-14-30H14V-24H-14ZM-6-38H6V-33H-6Z";

/** A gem: the diamond, its lit facet, and the sparkle that comes off its corner. */
const GEM = "M0-11L9 0L0 11L-9 0Z";
const GEM_FACET = "M0-11L9 0L0 0Z";
const GEM_SPARK = "M0-4L1-1L4 0L1 1L0 4L-1 1L-4 0L-1-1Z";

const TREES: readonly Place[] = [
  { x: 88, y: 152, rotate: 0, scale: 1 },
  { x: 330, y: 154, rotate: 0, scale: 0.82 },
];

const GEMS: readonly Place[] = [
  { x: 128, y: 178, rotate: 0, scale: 0.85 },
  { x: 212, y: 192, rotate: 0, scale: 1.1 },
  { x: 262, y: 180, rotate: 0, scale: 0.7 },
  { x: 356, y: 190, rotate: 0, scale: 0.9 },
];

/** The gem stamp: the diamond, its lit facet, and the sparkle above it. */
function gemDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "gem-definition" },
    h(
      "g",
      { id: id("gem") },
      h("path", { key: "stone", d: GEM }),
      h("path", {
        key: "facet",
        d: GEM_FACET,
        fill: "var(--inv-surface)",
        opacity: 0.5,
      }),
      h("path", {
        key: "spark",
        d: GEM_SPARK,
        fill: "var(--inv-surface)",
        opacity: 0.85,
        transform: "translate(0 -17)",
      }),
    ),
  );
}

/** The tree stamp: the trunk, the canopy, and the paler face of the canopy. */
function treeDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "tree-definition" },
    h(
      "g",
      { id: id("tree") },
      h("path", { key: "trunk", d: TREE_TRUNK, fill: "var(--inv-decoration-one)" }),
      h("path", { key: "canopy", d: TREE_CANOPY, fill: "var(--inv-accent)" }),
      h("path", {
        key: "canopy-top",
        d: TREE_CANOPY_TOP,
        fill: "var(--inv-soft)",
        opacity: 0.6,
      }),
    ),
  );
}

/** Gems standing on the ground, each one a little off true so the row is not a ruler. */
function gems(
  key: string,
  id: IllustrationId,
  places: readonly Place[],
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    places.map((place) =>
      h("use", {
        key: `${key}-${place.x}-${place.y}`,
        href: `#${id("gem")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

/** Trees, standing on the terrace they belong to. */
function trees(
  key: string,
  id: IllustrationId,
  places: readonly Place[],
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key, opacity },
    places.map((place) =>
      h("use", {
        key: `${key}-${place.x}-${place.y}`,
        href: `#${id("tree")}`,
        transform: `translate(${place.x} ${place.y}) scale(${place.scale})`,
      }),
    ),
  );
}

/** The header diorama: sky, clouds, four stepped hills, trees, and the gems on the ground. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 2.4, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const sky: CutSheet = { name: "sky", d: SKY, fill: "var(--inv-decoration-two)", shadow: false };
  const cloudNear: CutSheet = { name: "cloud-near", d: CLOUD_NEAR, fill: "var(--inv-surface)" };
  const cloudFar: CutSheet = { name: "cloud-far", d: CLOUD_FAR, fill: "var(--inv-surface)" };
  const hillsDeep: CutSheet = { name: "hills-deep", d: HILLS_DEEP, fill: "var(--inv-accent)" };
  const hillsBack: CutSheet = { name: "hills-back", d: HILLS_BACK, fill: "var(--inv-accent)" };
  const hillsMid: CutSheet = { name: "hills-mid", d: HILLS_MID, fill: "var(--inv-soft)" };

  return [
    sheetDefinitions(id, [sheet, sky, cloudNear, cloudFar, hillsDeep, hillsBack, hillsMid]),
    gemDefinition(id),
    treeDefinition(id),
    ...cutSheets(id, [sheet]),
    ...cutSheets(id, [sky]),
    // The sky is tinted so it stays the pale paper of the theme and not a blue wall.
    h("use", {
      key: "sky-veil",
      href: `#${id(sky.name)}`,
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    ...cutSheets(id, [cloudFar, cloudNear]),
    // The deepest range sits behind the others, darkened with one ink veil so the four terraces read as depth
    // and the drawing no longer looks flat.
    ...cutSheets(id, [hillsDeep]),
    h("use", {
      key: "deep-veil",
      href: `#${id(hillsDeep.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.28,
    }),
    // The far ridge is the dark green of the theme; the terrace in front of it is the pale paper the trees and
    // the light stand on, so the two are never the same sheet.
    ...cutSheets(id, [hillsBack]),
    h("path", { key: "ridge-light", d: TERRACE_LIGHT, fill: "var(--inv-soft)", opacity: 0.5 }),
    ...cutSheets(id, [hillsMid]),
    h("use", {
      key: "terrace-veil",
      href: `#${id(hillsMid.name)}`,
      fill: "var(--inv-surface)",
      opacity: 0.3,
    }),
    trees("trees-terrace", id, TREES, 1),
    h("path", {
      key: "terrace-line",
      d: "M-8 180H32V172H72V164H112V172H152V164H192V172H232V180H272V172H312V164H352V172H396",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.6,
      opacity: 0.35,
    }),
    gems("gems-ground", id, GEMS, "var(--inv-decoration-two)", 1),
    // The lit top faces of a few steps, so each terrace has a light block and the ground is not one flat sheet.
    h(
      "g",
      { key: "lit-blocks", fill: "var(--inv-surface)", opacity: 0.55 },
      [
        { x: 60, y: 160 },
        { x: 148, y: 152 },
        { x: 226, y: 158 },
        { x: 300, y: 150 },
        { x: 128, y: 176 },
        { x: 318, y: 174 },
      ].map((block) =>
        h("rect", {
          key: `lit-${block.x}`,
          x: block.x,
          y: block.y,
          width: 6,
          height: 6,
        }),
      ),
    ),
    // Small blocks of light on the ground, the pixel version of confetti.
    h(
      "g",
      { key: "blocks-of-light", fill: "var(--inv-decoration-one)", opacity: 0.7 },
      [96, 176, 286, 336].map((x, index) =>
        h("rect", {
          key: `block-${x}`,
          x,
          y: index % 2 === 0 ? 190 : 194,
          width: 6,
          height: 6,
        }),
      ),
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band of stepped ground with a tree, a gem, and its blocks of light. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 22, 3, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 38, 5.2, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    gemDefinition(id),
    treeDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.32,
    }),
    // A small stepped ridge standing on the band, so the divider is a horizon and not a stripe.
    h("path", {
      key: "divider-steps",
      d: "M-8 46V40H32V34H72V40H112V34H152V40H192V46H232V40H272V34H312V40H352V34H396V46Z",
      fill: "var(--inv-accent)",
      opacity: 0.85,
    }),
    trees(
      "divider-trees",
      id,
      [
        { x: 72, y: 34, rotate: 0, scale: 0.72 },
        { x: 300, y: 34, rotate: 0, scale: 0.6 },
      ],
      0.95,
    ),
    gems(
      "divider-gems",
      id,
      [
        { x: 150, y: 44, rotate: 0, scale: 0.7 },
        { x: 196, y: 50, rotate: 0, scale: 0.85 },
        { x: 226, y: 42, rotate: 0, scale: 0.55 },
      ],
      "var(--inv-decoration-two)",
      0.95,
    ),
    h(
      "g",
      { key: "divider-blocks", fill: "var(--inv-decoration-one)", opacity: 0.75 },
      [40, 128, 268, 356].map((x) =>
        h("rect", { key: `divider-block-${x}`, x, y: 48, width: 6, height: 6 }),
      ),
    ),
  ];
}

/** The footer: a torn band of ground with trees at both ends, gems, and blocks of light. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.6, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 34, 2.8, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    gemDefinition(id),
    treeDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-accent)",
      opacity: 0.3,
    }),
    h("path", {
      key: "footer-steps",
      d: "M-8 44V38H48V34H96V38H144V34H192V38H240V34H288V38H336V34H396V44Z",
      fill: "var(--inv-accent)",
      opacity: 0.8,
    }),
    trees(
      "footer-trees",
      id,
      [
        { x: 60, y: 42, rotate: 0, scale: 0.62 },
        { x: 330, y: 44, rotate: 0, scale: 0.55 },
      ],
      1,
    ),
    gems(
      "footer-gems",
      id,
      [
        { x: 148, y: 44, rotate: 0, scale: 0.7 },
        { x: 196, y: 48, rotate: 0, scale: 0.9 },
        { x: 244, y: 44, rotate: 0, scale: 0.7 },
      ],
      "var(--inv-decoration-two)",
      0.95,
    ),
    h(
      "g",
      { key: "footer-blocks", fill: "var(--inv-decoration-one)", opacity: 0.8 },
      [108, 176, 216, 284].map((x, index) =>
        h("rect", {
          key: `footer-block-${x}`,
          x,
          y: index % 2 === 0 ? 54 : 58,
          width: 6,
          height: 6,
        }),
      ),
    ),
  ];
}

/** «Bloques y píxeles» in paper cut-out: the stepped diorama, the block divider, and the gem footer. */
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
