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
 * «Reino de hielo» in paper cut-out (I3b; S1-S4), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a layered diorama for the header — three
 * ribbons of aurora across the sky, two ranges of faceted snow peaks, an original ice castle of five towers
 * standing on a stepped plinth of ice, crystals in the drift, and six-arm snowflakes in the air — a torn
 * divider that carries snowflakes and icicles between two sections, and a footer strip of drift and crystals.
 *
 * Original work: the peaks, the castle, the flakes and the crystals are our own polygons. The castle is a
 * generic palace — crenellated wings, a keep with one spire, two slim turrets, pointed windows and an arched
 * gate — and never a character, a costume, a logo, or a signature location of any franchise. Every color is a
 * theme variable of `ice-kingdom`, so the whole drawing re-colours with its palette; tints are `opacity` on a
 * theme color and nothing else.
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

/** The six arms of the crystal: three lines through the center, drawn once and placed many times. */
const FLAKE_ARMS = "M0-7V7M-6.06-3.5L6.06 3.5M-6.06 3.5L6.06-3.5";

/** The little fork near each arm's tip, at all six ends. */
const FLAKE_BRANCHES =
  "M-2-6.6L0-4.4L2-6.6M-2 6.6L0 4.4L2 6.6M4.72-5.03L3.81-2.2L6.72-1.57" +
  "M-4.72 5.03L-3.81 2.2L-6.72 1.57M6.72 5.03L3.81 2.2L4.72 1.57M-6.72-5.03L-3.81-2.2L-4.72-1.57";

/** A standing ice crystal: a six-sided shard with a lit face, cut once and stood in the drift. */
const CRYSTAL = "M0 0L1.5-6L4.4-18L7.3-6L8.8 0Z";
const CRYSTAL_FACE = "M4.4-18L7.3-6L8.8 0L4.4 0Z";

/** Three ribbons of aurora, each a slow wave closed at top and bottom so it reads as a ribbon of light. */
const AURORA_HIGH =
  "M-8 36C26 10 60 46 98 30C136 14 170 44 208 30C246 16 290 44 328 26C356 13 380 26 396 18L396 40C374 55 " +
  "342 38 310 52C272 68 240 36 202 48C164 60 132 28 94 44C58 60 26 32 -8 58Z";

const AURORA_MID =
  "M-8 64C28 48 66 74 110 62C154 50 190 72 234 64C278 56 322 70 396 56L396 72C330 86 284 72 240 80C196 88 " +
  "160 66 114 78C70 90 30 70 -8 84Z";

const AURORA_LOW =
  "M-8 86C34 76 70 94 116 86C162 78 198 92 244 86C290 80 332 90 396 80L396 89C336 97 292 89 246 93C198 97 " +
  "164 85 118 91C74 97 32 87 -8 93Z";

/** The far range, high and pale: the peaks the castle is seen against. */
const PEAKS_FAR =
  "M-8 150L14 96L32 122L56 74L74 116L92 88L110 126L130 78L148 118L166 96L186 132L206 84L226 120L246 82L266 " +
  "124L286 92L304 128L326 72L346 118L366 90L396 130L396 182L-8 182Z";

/** The near range, lower and cooler, closing the sky behind the wings. */
const PEAKS_NEAR =
  "M-8 176L16 134L34 156L56 118L74 152L92 136L112 166L136 128L156 158L176 140L196 164L216 132L236 160L256 138L276 " +
  "166L296 130L318 158L340 124L362 152L396 136L396 182L-8 182Z";

/** The snow that settles on the upper summits, with a notched bottom edge like a cut paper cap. */
const SNOW_CAPS =
  "M42 108L56 74L70 108L63 102L56 108L49 100ZM116 114L130 78L144 114L137 107L130 113L123 106Z" +
  "M172 122L186 82L200 122L193 114L186 120L179 112ZM232 120L246 82L260 120L253 112L246 118L239 110Z" +
  "M290 112L304 72L318 112L311 104L304 110L297 102ZM342 112L356 90L370 112L365 106L356 110L350 105Z" +
  "M28 152L42 118L56 152L50 146L42 151L36 145ZM268 152L284 124L300 152L293 146L284 151L276 144Z";

/** The castle: a stepped plinth of ice, two crenellated wings, two slim turrets, and the keep. */
const PLINTH = "M108 178V166H124V154H146V146H244V154H266V166H282V178Z";
const WING_LEFT = "M136 178V106H140V99H146V106H152V99H158V106H164V99H168V178Z";
const WING_RIGHT = "M222 178V106H226V99H232V106H238V99H244V106H250V99H254V178Z";
const TURRET_LEFT = "M118 178V128H136V178Z";
const TURRET_RIGHT = "M254 178V128H272V178Z";
const KEEP = "M168 178V64H222V178Z";
const ROOF_KEEP = "M162 64L195 26L228 64Z";
const ROOF_TURRET_LEFT = "M114 128L127 98L140 128Z";
const ROOF_TURRET_RIGHT = "M250 128L263 98L276 128Z";

/** The lit half of each roof: the facet the low light catches, in the ice color. */
const ROOF_FACETS = "M195 26L228 64L195 64ZM127 98L140 128L127 128ZM263 98L276 128L263 128Z";

/** The fold of each roof, from spire to eave. */
const ROOF_FOLDS = "M195 26V64M127 98V128M263 98V128";

/** The icicles cut along the keep's eave, in a run of three depths. */
const ICICLES =
  "M162 64L228 64L228 68L221 68L218 80L214 68L207 68L203 82L199 68L192 68L189 78L185 68L177 68L174 72L169 " +
  "68L162 68Z";

/** The gate and the windows: two arched windows on the keep, slits on the wings and the turrets. */
const GATE = "M185 178V154L195 141L205 154V178Z";
const GLOW = "M188 178V156L195 146L202 156V178Z";
const WINDOWS =
  "M183 134V120L186 112L189 120V134ZM201 134V120L204 112L207 120V134Z" +
  "M148 158V146L150 140L152 146V158ZM238 158V146L240 140L242 146V158Z" +
  "M124 164V154L127 148L130 154V164ZM262 164V154L265 148L268 154V164Z";

/** Three pennants on the three spires, each a small triangle the wind has folded. */
const PENNANTS = "M195 26V11L207 18ZM127 98V86L136 90ZM263 98V86L272 90Z";

/** Four courses of ice the keep is cut in, so the wall is not one flat plate. */
const KEEP_COURSES = "M168 100H222M168 132H222M168 160H222";

const FLAKES_FAR: readonly Place[] = [
  { x: 34, y: 56, rotate: -12, scale: 1.1 },
  { x: 74, y: 30, rotate: 14, scale: 0.7 },
  { x: 108, y: 58, rotate: 40, scale: 0.9 },
  { x: 272, y: 32, rotate: -22, scale: 1 },
  { x: 310, y: 56, rotate: 10, scale: 0.8 },
  { x: 344, y: 30, rotate: 34, scale: 1.05 },
  { x: 368, y: 62, rotate: -14, scale: 0.7 },
];

const FLAKES_NEAR: readonly Place[] = [
  { x: 22, y: 142, rotate: 8, scale: 0.62 },
  { x: 356, y: 136, rotate: -8, scale: 0.58 },
  { x: 160, y: 52, rotate: 22, scale: 0.5 },
  { x: 232, y: 48, rotate: -16, scale: 0.55 },
];

const CRYSTAL_STANDS: readonly Place[] = [
  { x: 26, y: 180, rotate: -8, scale: 1.5 },
  { x: 48, y: 184, rotate: 5, scale: 1.1 },
  { x: 70, y: 180, rotate: -3, scale: 1.3 },
  { x: 316, y: 181, rotate: 6, scale: 1.25 },
  { x: 338, y: 185, rotate: -5, scale: 1 },
  { x: 362, y: 180, rotate: 3, scale: 1.45 },
];

/** The crystal stamp: the shard, and its lit face in the lighter ice. */
function crystalDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "crystal-definition" },
    h(
      "g",
      { id: id("crystal") },
      h("path", { key: "shard", d: CRYSTAL, fill: "var(--inv-decoration-two)" }),
      h("path", { key: "face", d: CRYSTAL_FACE, fill: "var(--inv-accent)", opacity: 0.65 }),
    ),
  );
}

/** The snowflake stamp: the arms and the forks, stroked in whatever color the placement asks for. */
function flakeDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "flake-definition" },
    h(
      "g",
      { id: id("flake"), fill: "none" },
      h("path", { key: "arms", d: FLAKE_ARMS, strokeWidth: 1.15 }),
      h("path", { key: "forks", d: FLAKE_BRANCHES, strokeWidth: 0.95 }),
    ),
  );
}

/** One row of snowflakes, turned and sized one by one so the row is a fall, not a stamp. */
function flakes(
  key: string,
  id: IllustrationId,
  places: readonly Place[],
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key, stroke: paint, opacity },
    places.map((place) =>
      h("use", {
        key: `${key}-${place.x}-${place.y}`,
        href: `#${id("flake")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

/** The crystals standing in the drift, each one turned a little off true. */
function crystals(
  key: string,
  id: IllustrationId,
  places: readonly Place[],
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity, stroke: "var(--inv-surface)", strokeWidth: 0.7 },
    places.map((place) =>
      h("use", {
        key: `${key}-${place.x}`,
        href: `#${id("crystal")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

/** The header diorama: the aurora sky, both ranges, the castle on its plinth, and the snow it stands in. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 1.4, SCENE_HEIGHT + 8);
  const drift = tornEdge(SCENE_WIDTH, 172, 2.6, SCENE_HEIGHT + 8);
  const lowDrift = tornEdge(SCENE_WIDTH, 187, 5.2, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const peaksFar: CutSheet = { name: "peaks-far", d: PEAKS_FAR, fill: "var(--inv-decoration-one)" };
  const peaksNear: CutSheet = {
    name: "peaks-near",
    d: PEAKS_NEAR,
    fill: "var(--inv-accent)",
    shadow: false,
  };
  const plinth: CutSheet = { name: "plinth", d: PLINTH, fill: "var(--inv-surface)", outline: true };
  const wingLeft: CutSheet = { name: "wing-left", d: WING_LEFT, fill: "var(--inv-decoration-two)" };
  const wingRight: CutSheet = {
    name: "wing-right",
    d: WING_RIGHT,
    fill: "var(--inv-decoration-two)",
  };
  const turretLeft: CutSheet = {
    name: "turret-left",
    d: TURRET_LEFT,
    fill: "var(--inv-soft)",
    outline: true,
  };
  const turretRight: CutSheet = {
    name: "turret-right",
    d: TURRET_RIGHT,
    fill: "var(--inv-soft)",
    outline: true,
  };
  const keep: CutSheet = { name: "keep", d: KEEP, fill: "var(--inv-surface)", outline: true };
  const roofKeep: CutSheet = { name: "roof-keep", d: ROOF_KEEP, fill: "var(--inv-accent)" };
  const roofTurretLeft: CutSheet = {
    name: "roof-turret-left",
    d: ROOF_TURRET_LEFT,
    fill: "var(--inv-accent)",
  };
  const roofTurretRight: CutSheet = {
    name: "roof-turret-right",
    d: ROOF_TURRET_RIGHT,
    fill: "var(--inv-accent)",
  };
  const ground: CutSheet = { name: "ground", d: drift.sheet, fill: "var(--inv-surface)" };
  const lowSnow: CutSheet = { name: "low-snow", d: lowDrift.sheet, fill: "var(--inv-soft)" };

  return [
    sheetDefinitions(id, [
      sheet,
      peaksFar,
      peaksNear,
      plinth,
      wingLeft,
      wingRight,
      turretLeft,
      turretRight,
      keep,
      roofKeep,
      roofTurretLeft,
      roofTurretRight,
      ground,
      lowSnow,
    ]),
    flakeDefinition(id),
    crystalDefinition(id),
    ...cutSheets(id, [sheet]),
    // The aurora: ribbons of tinted paper laid over the sky, each one paler than the one before.
    h("path", {
      key: "aurora-high",
      d: AURORA_HIGH,
      fill: "var(--inv-decoration-one)",
      opacity: 0.42,
    }),
    h("path", {
      key: "aurora-mid",
      d: AURORA_MID,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
    }),
    h("path", {
      key: "aurora-low",
      d: AURORA_LOW,
      fill: "var(--inv-decoration-one)",
      opacity: 0.24,
    }),
    ...cutSheets(id, [peaksFar, peaksNear]),
    // The lower range is the accent seen through frozen air, so the pale castle in front of it stands out.
    h("use", {
      key: "peaks-near-veil",
      href: `#${id(peaksNear.name)}`,
      fill: "var(--inv-surface)",
      opacity: 0.42,
    }),
    h("path", { key: "snow-caps", d: SNOW_CAPS, fill: "var(--inv-surface)" }),
    // The castle: the plinth, the wings and turrets behind, the keep in front, the roofs over both.
    ...cutSheets(id, [plinth]),
    ...cutSheets(id, [wingLeft, wingRight, turretLeft, turretRight, keep]),
    ...cutSheets(id, [roofTurretLeft, roofKeep, roofTurretRight]),
    h("path", {
      key: "roof-facets",
      d: ROOF_FACETS,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
    }),
    h("path", {
      key: "roof-folds",
      d: ROOF_FOLDS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1,
      opacity: 0.35,
    }),
    h("path", { key: "icicles", d: ICICLES, fill: "var(--inv-decoration-two)", opacity: 0.6 }),
    h("path", { key: "pennants", d: PENNANTS, fill: "var(--inv-decoration-one)" }),
    h("path", {
      key: "keep-courses",
      d: KEEP_COURSES,
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.1,
      opacity: 0.9,
    }),
    h("path", { key: "windows", d: WINDOWS, fill: "var(--inv-ink)", opacity: 0.5 }),
    h("circle", { key: "rose-window", cx: 195, cy: 84, r: 7.5, fill: "var(--inv-decoration-two)" }),
    h("circle", { key: "rose-center", cx: 195, cy: 84, r: 3, fill: "var(--inv-accent)" }),
    h("path", { key: "gate", d: GATE, fill: "var(--inv-ink)", opacity: 0.55 }),
    h("path", { key: "gate-glow", d: GLOW, fill: "var(--inv-decoration-two)", opacity: 0.55 }),
    // The snow the castle stands in: the lit sheet, then the colder drift that fronts it.
    ...cutSheets(id, [ground]),
    ...cutSheets(id, [lowSnow]),
    crystals("crystals-far", id, CRYSTAL_STANDS.slice(0, 3), "var(--inv-accent)", 0.85),
    crystals("crystals-near", id, CRYSTAL_STANDS.slice(3), "var(--inv-accent)", 0.85),
    flakes("flakes-far", id, FLAKES_FAR, "var(--inv-accent)", 0.4),
    flakes("flakes-near", id, FLAKES_NEAR, "var(--inv-decoration-one)", 0.65),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: two torn strips of snow with icicles hanging from the tear and flakes falling across it. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 26, 1.9, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 4.2, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    flakeDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.22,
    }),
    // Icicles hanging from the torn edge, at four depths, so the strip is a cut of ice and not a band.
    h("path", {
      key: "icicle-row",
      d:
        "M18 27L24 27L21 39ZM44 26L50 26L47 36ZM96 27L102 27L99 40ZM140 28L146 28L143 37ZM186 29L192 29L189 41Z" +
        "M230 29L236 29L233 38ZM276 28L282 28L279 40ZM318 28L324 28L321 37ZM356 28L362 28L359 39Z",
      fill: "var(--inv-surface)",
      opacity: 0.75,
    }),
    h("path", {
      key: "drift-line",
      d: "M-8 44C40 36 84 48 132 43C180 38 230 48 278 43C318 39 360 45 396 41V70H-8Z",
      fill: "var(--inv-surface)",
      opacity: 0.45,
    }),
    flakes(
      "flakes-divider",
      id,
      [
        { x: 70, y: 38, rotate: -10, scale: 1.35 },
        { x: 128, y: 34, rotate: 18, scale: 0.9 },
        { x: 196, y: 38, rotate: 42, scale: 1.5 },
        { x: 262, y: 35, rotate: -6, scale: 0.85 },
        { x: 320, y: 38, rotate: 26, scale: 1.25 },
      ],
      "var(--inv-accent)",
      0.6,
    ),
  ];
}

/** The footer: a torn strip of drift with crystals standing along it and the flakes dying out at the edges. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 11, 5.6, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 40, 2.1, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    flakeDefinition(id),
    crystalDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-accent)",
      opacity: 0.14,
    }),
    h("path", {
      key: "snow-line",
      d: "M-8 42C36 34 78 46 124 41C170 36 216 46 262 41C306 37 350 44 396 39V70H-8Z",
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    crystals(
      "footer-crystals",
      id,
      [
        { x: 30, y: 54, rotate: -6, scale: 1 },
        { x: 58, y: 57, rotate: 5, scale: 0.75 },
        { x: 88, y: 54, rotate: -3, scale: 0.9 },
        { x: 302, y: 55, rotate: 4, scale: 0.85 },
        { x: 332, y: 58, rotate: -5, scale: 0.7 },
        { x: 362, y: 54, rotate: 2, scale: 1 },
      ],
      "var(--inv-accent)",
      0.55,
    ),
    crystals(
      "footer-crystals-front",
      id,
      [
        { x: 152, y: 59, rotate: 3, scale: 1.15 },
        { x: 196, y: 60, rotate: -4, scale: 0.95 },
        { x: 238, y: 59, rotate: 5, scale: 1.1 },
      ],
      "var(--inv-surface)",
      0.9,
    ),
    flakes(
      "flakes-footer",
      id,
      [
        { x: 118, y: 24, rotate: 8, scale: 0.8 },
        { x: 168, y: 18, rotate: -14, scale: 0.55 },
        { x: 276, y: 20, rotate: 30, scale: 0.65 },
        { x: 348, y: 26, rotate: -8, scale: 0.85 },
      ],
      "var(--inv-accent)",
      0.45,
    ),
  ];
}

/** «Reino de hielo» in paper cut-out: the aurora diorama, the icicle divider, and the crystal footer. */
export const ICE_KINGDOM_ILLUSTRATION: ThemeIllustration = {
  theme: "ice-kingdom",
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
