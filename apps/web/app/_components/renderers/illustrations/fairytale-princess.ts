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
 * «Princesa de cuento» in paper cut-out (I3b; S1-S4), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a storybook diorama for the header — two
 * rolling hills, an original castle of three towers with golden conical roofs, pennants, a pointed gate and
 * arched windows, two crowns and a scatter of stars in the sky, and flowers along the front hill — a torn
 * divider that carries a ribbon banner, a crown and flowers between two sections, and a footer strip of flowers
 * and stars.
 *
 * Original work: there is no princess, no figure, and no character of any story here; the castle is a generic
 * storybook castle of our own drawing, and the crowns, the banner and the flowers are generic party props.
 * Every color is a theme variable of `fairytale-princess`, so the whole drawing re-colours with its palette;
 * tints are `opacity` on a theme color and nothing else.
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

/** The four-point sparkle of a storybook sky. */
const SPARKLE = "M0-6.6L1.6-1.6L6.6 0L1.6 1.6L0 6.6L-1.6 1.6L-6.6 0L-1.6-1.6Z";

/** A crown: the band, the three points, and the jewels cut into the band. */
const CROWN = "M-15 8V-4L-9 2L0-9L9 2L15-4V8Z";
const CROWN_JEWELS = "M-10 4.5H-7V7H-10ZM-1.5 3.5H1.5V7H-1.5ZM7 4.5H10V7H7Z";

/** A flower: five round petals and the golden heart of it. */
const FLOWER_PETALS = [
  { cx: 0, cy: -6.4 },
  { cx: 6.1, cy: -2 },
  { cx: 3.8, cy: 5.2 },
  { cx: -3.8, cy: 5.2 },
  { cx: -6.1, cy: -2 },
] as const;

/** The back hill: a slow rise from the left, and the front hill that the castle stands on. */
const HILL_BACK =
  "M-8 168C18 150 44 122 76 112C100 104 124 112 148 118C172 124 196 116 222 112C252 108 286 118 316 132C340 " +
  "143 372 156 396 162V182H-8Z";

const HILL_FRONT =
  "M-8 200V172C26 160 54 158 88 166C118 173 148 186 180 186C212 186 244 172 276 166C308 160 344 166 396 180V200Z";

/** The castle: three towers with their golden roofs, the wall between them, and the gate. */
const TOWER_KEEP = "M180 176V102H210V176Z";
const TOWER_LEFT = "M148 176V120H176V176Z";
const TOWER_RIGHT = "M214 176V120H242V176Z";
const ROOF_KEEP = "M174 102L195 62L216 102Z";
const ROOF_LEFT = "M142 120L162 84L182 120Z";
const ROOF_RIGHT = "M208 120L228 84L248 120Z";
const WALL_LEFT = "M128 176V142H148V176Z";
const WALL_RIGHT = "M242 176V142H262V176Z";

/** The lit half of each roof, the fold down its middle, and the jewels on the ridges. */
const ROOF_FACETS = "M195 62L216 102L195 102ZM162 84L182 120L162 120ZM228 84L248 120L228 120Z";
const ROOF_FOLDS = "M195 62V102M162 84V120M228 84V120";

/** The gate and the windows: a pointed arch on the keep, arched slits on the towers and the walls. */
const GATE = "M186 176V152L195 140L204 152V176Z";
const WINDOWS =
  "M189 130V114L195 104L201 114V130ZM156 138V126L162 118L168 126V138ZM222 138V126L228 118L234 126V138Z" +
  "M133 158V146L138 140L143 146V158ZM247 158V146L252 140L257 146V158Z";

/** The pennants on the three spires, and the gold line along every eave. */
const PENNANTS = "M195 62V46L208 54ZM162 84V70L172 76ZM228 84V70L238 76Z";
const EAVES = "M174 102H216M142 120H182M208 120H248";

/** The crowns that hang in the sky, and the clouds that drift past them. */
const CLOUD_LEFT =
  "M44 62C43 56 48 48 54 46C60 44 70 45 74 50C78 55 76 63 71 66C66 69 54 69 50 66C46 64 44.6 64 44 62Z";

const CLOUD_RIGHT =
  "M296 44C295 39 300 32 306 30C312 28 322 29 326 34C330 39 328 46 323 49C318 52 306 52 302 49C298 47 296.6 46 296 44Z";

const SKY_STARS: readonly Place[] = [
  { x: 30, y: 34, rotate: -8, scale: 0.9 },
  { x: 92, y: 26, rotate: 14, scale: 0.65 },
  { x: 140, y: 44, rotate: -4, scale: 0.55 },
  { x: 252, y: 24, rotate: 18, scale: 0.75 },
  { x: 268, y: 74, rotate: -12, scale: 0.5 },
  { x: 352, y: 32, rotate: 8, scale: 0.85 },
  { x: 372, y: 96, rotate: -16, scale: 0.6 },
];

const CROWNS: readonly Place[] = [
  { x: 74, y: 96, rotate: -8, scale: 1.15 },
  { x: 318, y: 118, rotate: 10, scale: 0.8 },
];

const FLOWERS: readonly Place[] = [
  { x: 34, y: 186, rotate: -8, scale: 1 },
  { x: 66, y: 192, rotate: 6, scale: 0.8 },
  { x: 300, y: 188, rotate: -6, scale: 1.05 },
  { x: 336, y: 194, rotate: 8, scale: 0.85 },
  { x: 366, y: 188, rotate: -10, scale: 0.95 },
];

/** The sparkle stamp: one shape, placed with a turn and a size like the flakes of the other themes. */
function sparkleDefinition(id: IllustrationId): ReactElement {
  return h("defs", { key: "sparkle-definition" }, h("path", { id: id("sparkle"), d: SPARKLE }));
}

/** The flower stamp: the five petals, and the golden heart drawn over them. */
function flowerDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "flower-definition" },
    h(
      "g",
      { id: id("flower") },
      FLOWER_PETALS.map((petal, index) =>
        h("circle", { key: `petal-${index}`, cx: petal.cx, cy: petal.cy, r: 4.2 }),
      ),
      h("circle", { key: "heart", r: 3.1, fill: "var(--inv-decoration-two)" }),
    ),
  );
}

function sparkles(
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
        href: `#${id("sparkle")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

function flowers(
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
        href: `#${id("flower")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

/** One crown, with its jewels, at a turn and a size of its own. */
function crown(key: string, place: Place, paint: ThemePaint, opacity = 1): ReactElement {
  return h(
    "g",
    {
      key,
      fill: paint,
      opacity,
      transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
    },
    h("path", { key: "band", d: CROWN }),
    h("path", { key: "jewels", d: CROWN_JEWELS, fill: "var(--inv-accent)" }),
  );
}

/** The header diorama: the sky with its crowns, the two hills, and the castle on the front one. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 1.8, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const hillBack: CutSheet = { name: "hill-back", d: HILL_BACK, fill: "var(--inv-decoration-one)" };
  const hillFront: CutSheet = { name: "hill-front", d: HILL_FRONT, fill: "var(--inv-soft)" };
  const cloudLeft: CutSheet = { name: "cloud-left", d: CLOUD_LEFT, fill: "var(--inv-surface)" };
  const cloudRight: CutSheet = { name: "cloud-right", d: CLOUD_RIGHT, fill: "var(--inv-surface)" };
  const keep: CutSheet = { name: "keep", d: TOWER_KEEP, fill: "var(--inv-surface)", outline: true };
  const towerLeft: CutSheet = {
    name: "tower-left",
    d: TOWER_LEFT,
    fill: "var(--inv-surface)",
    outline: true,
  };
  const towerRight: CutSheet = {
    name: "tower-right",
    d: TOWER_RIGHT,
    fill: "var(--inv-surface)",
    outline: true,
  };
  const wallLeft: CutSheet = { name: "wall-left", d: WALL_LEFT, fill: "var(--inv-soft)" };
  const wallRight: CutSheet = { name: "wall-right", d: WALL_RIGHT, fill: "var(--inv-soft)" };
  const roofKeep: CutSheet = { name: "roof-keep", d: ROOF_KEEP, fill: "var(--inv-decoration-two)" };
  const roofLeft: CutSheet = { name: "roof-left", d: ROOF_LEFT, fill: "var(--inv-decoration-two)" };
  const roofRight: CutSheet = {
    name: "roof-right",
    d: ROOF_RIGHT,
    fill: "var(--inv-decoration-two)",
  };

  return [
    sheetDefinitions(id, [
      sheet,
      hillBack,
      hillFront,
      cloudLeft,
      cloudRight,
      keep,
      towerLeft,
      towerRight,
      wallLeft,
      wallRight,
      roofKeep,
      roofLeft,
      roofRight,
    ]),
    sparkleDefinition(id),
    flowerDefinition(id),
    ...cutSheets(id, [sheet]),
    sparkles("stars-sky", id, SKY_STARS, "var(--inv-decoration-two)", 0.95),
    ...cutSheets(id, [cloudLeft, cloudRight]),
    crown("crown-high", CROWNS[0] as Place, "var(--inv-decoration-two)"),
    // The hills: the pink one behind, the pale one the castle stands on.
    ...cutSheets(id, [hillBack]),
    crown("crown-low", CROWNS[1] as Place, "var(--inv-decoration-two)", 0.9),
    // The castle, wings first, then the towers, then the three roofs over all of them.
    ...cutSheets(id, [wallLeft, wallRight, towerLeft, towerRight, keep]),
    ...cutSheets(id, [roofLeft, roofKeep, roofRight]),
    h("path", { key: "roof-facets", d: ROOF_FACETS, fill: "var(--inv-accent)", opacity: 0.28 }),
    h("path", {
      key: "roof-folds",
      d: ROOF_FOLDS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1,
      opacity: 0.45,
    }),
    h("path", {
      key: "eaves",
      d: EAVES,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.6,
      opacity: 0.5,
    }),
    h("path", { key: "pennants", d: PENNANTS, fill: "var(--inv-accent)" }),
    h("path", { key: "windows", d: WINDOWS, fill: "var(--inv-accent)", opacity: 0.55 }),
    h("path", { key: "gate", d: GATE, fill: "var(--inv-ink)", opacity: 0.6 }),
    // The front hill, and the flowers that grow along it.
    ...cutSheets(id, [hillFront]),
    flowers("flowers-front", id, FLOWERS, "var(--inv-decoration-one)", 1),
    sparkles(
      "sparkles-hill",
      id,
      [
        { x: 116, y: 186, rotate: 30, scale: 0.5 },
        { x: 246, y: 182, rotate: -20, scale: 0.45 },
      ],
      "var(--inv-decoration-two)",
      0.9,
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band with a golden ribbon banner across it, a crown, and two flowers. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 22, 3.8, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 38, 5.6, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
  ];
  const banner: CutSheet = {
    name: "banner",
    d: "M28 22H362V40H28Z",
    fill: "var(--inv-decoration-two)",
  };

  return [
    sheetDefinitions(id, [sheets[0] as CutSheet, sheets[1] as CutSheet, banner]),
    sparkleDefinition(id),
    flowerDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.28,
    }),
    // The banner's two tails, then the band itself, then the fold each tail makes.
    h("path", {
      key: "banner-tails",
      d: "M28 22L6 31L28 40ZM362 22L384 31L362 40Z",
      fill: "var(--inv-accent)",
      opacity: 0.85,
    }),
    ...cutSheets(id, [banner]),
    h("path", {
      key: "banner-folds",
      d: "M28 40L6 31V40ZM362 40L384 31V40Z",
      fill: "var(--inv-accent)",
      opacity: 0.4,
    }),
    h("path", {
      key: "banner-hem",
      d: "M28 24.5H362M28 37.5H362",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.2,
      opacity: 0.55,
    }),
    crown("divider-crown", { x: 195, y: 34, rotate: 0, scale: 1.15 }, "var(--inv-accent)"),
    flowers(
      "divider-flowers",
      id,
      [
        { x: 74, y: 30, rotate: -10, scale: 1.05 },
        { x: 120, y: 38, rotate: 8, scale: 0.8 },
        { x: 300, y: 38, rotate: -8, scale: 0.8 },
        { x: 344, y: 30, rotate: 10, scale: 1.05 },
      ],
      "var(--inv-decoration-one)",
      1,
    ),
    sparkles(
      "divider-stars",
      id,
      [
        { x: 168, y: 14, rotate: 8, scale: 0.55 },
        { x: 226, y: 12, rotate: -12, scale: 0.5 },
      ],
      "var(--inv-decoration-two)",
      0.9,
    ),
  ];
}

/** The footer: a torn band of flowers with a crown in the middle and stars along it. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 7.4, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 36, 2.6, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-decoration-two)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    sparkleDefinition(id),
    flowerDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.24,
    }),
    flowers(
      "footer-flowers",
      id,
      [
        { x: 36, y: 42, rotate: -8, scale: 1 },
        { x: 82, y: 52, rotate: 6, scale: 0.85 },
        { x: 128, y: 44, rotate: -6, scale: 0.75 },
        { x: 264, y: 44, rotate: 8, scale: 0.75 },
        { x: 308, y: 52, rotate: -6, scale: 0.85 },
        { x: 354, y: 42, rotate: 8, scale: 1 },
      ],
      "var(--inv-decoration-one)",
      1,
    ),
    crown("footer-crown", { x: 195, y: 46, rotate: 0, scale: 1.25 }, "var(--inv-decoration-two)"),
    crown(
      "footer-crown-small",
      { x: 158, y: 52, rotate: -12, scale: 0.55 },
      "var(--inv-accent)",
      0.75,
    ),
    crown(
      "footer-crown-small-right",
      { x: 232, y: 52, rotate: 12, scale: 0.55 },
      "var(--inv-accent)",
      0.75,
    ),
    sparkles(
      "footer-stars",
      id,
      [
        { x: 104, y: 20, rotate: 10, scale: 0.6 },
        { x: 148, y: 14, rotate: -8, scale: 0.45 },
        { x: 246, y: 14, rotate: 12, scale: 0.45 },
        { x: 292, y: 20, rotate: -10, scale: 0.6 },
      ],
      "var(--inv-decoration-two)",
      0.95,
    ),
  ];
}

/** «Princesa de cuento» in paper cut-out: the castle diorama, the banner divider, and the flower footer. */
export const FAIRYTALE_PRINCESS_ILLUSTRATION: ThemeIllustration = {
  theme: "fairytale-princess",
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
