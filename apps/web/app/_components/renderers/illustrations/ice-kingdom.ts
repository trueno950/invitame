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
 * «Reino de hielo» in paper cut-out (I4b; S3, S5), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a layered diorama for the header — four
 * ribbons of aurora with bright streaks, two ranges of faceted peaks, three banked drifts, an original ice
 * castle with lit windows, banners, a rose window and an arched ice bridge over a frozen lake that mirrors it,
 * snowy pines framing both edges, crystals catching the light, and three party balloons tied to the bridge rail
 * — a torn divider that carries snowflakes, icicles and a short garland between two sections, and a footer
 * strip of drift, pines and crystals.
 *
 * Original work: the peaks, the castle, the bridge, the pines, the flakes and the crystals are our own
 * polygons. The castle is a generic palace — crenellated wings, turrets, a keep with one spire, pointed
 * windows, banners and an arched gate — and never a character, a costume, a logo, or a signature location of any
 * franchise. Every color is a theme variable of `ice-kingdom`, so the whole drawing re-colours with its
 * palette; tints are `opacity` on a theme color, and the only fill that is not a plain theme color is a pattern
 * built from theme colors, referenced by an id the frame makes unique.
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

/** A fourth, paler ribbon above the rest, and the two brightest lines inside them. */
const AURORA_TOP =
  "M-8 18C36 2 76 26 120 16C164 6 204 24 250 16C296 8 342 22 396 10L396 20C344 32 298 18 252 26C206 34 " +
  "166 16 122 26C78 36 36 14 -8 30Z";

const AURORA_STREAKS =
  "M30 22C80 12 120 34 168 24C216 14 258 30 306 22C340 16 368 22 392 18" +
  "M16 70C64 58 104 78 150 68C196 58 238 74 286 66C324 60 360 68 390 62";

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

/** Two towers of the outer curtain wall, behind the wings, so the castle is more than one facade. */
const BACK_TOWER_LEFT = "M146 178V122H162V178Z";
const BACK_TOWER_RIGHT = "M228 178V116H244V178Z";
const BACK_ROOF_LEFT = "M143 122L154 96L165 122Z";
const BACK_ROOF_RIGHT = "M225 116L236 88L247 116Z";

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
  "M124 164V154L127 148L130 154V164ZM262 164V154L265 148L268 154V164Z" +
  "M150 138V128L154 122L158 128V138ZM236 138V128L240 122L244 128V138Z";

/** Four courses of ice the keep is cut in, so the wall is not one flat plate. */
const KEEP_COURSES = "M168 100H222M168 132H222M168 160H222";

/** A second row of windows on the keep, and the frost that catches on their sills. */
const WINDOWS_KEEP_LOWER = "M180 158V148L183 142L186 148V158ZM204 158V148L207 142L210 148V158Z";
const SILL_FROST = "M180 158H186M204 158H210M183 134H189M201 134H207M148 158H152M238 158H242";

/** Three swallow-tailed banners, one on each spire, hanging from a pole. */
const BANNERS =
  "M186 36H204V58L195 51L186 58ZM119 104H135V122L127 116L119 122ZM255 104H271V122L263 116L255 122Z";
const BANNER_STRIPES = "M191 36V54M199 36V54M123 104V118M131 104V118M259 104V118M267 104V118";

/** The ice bridge: a deck arching from the plinth to the right bank, with rails and posts. */
const BRIDGE_DECK = "M238 174C250 154 288 154 302 170L302 176C288 162 252 162 240 180Z";
const BRIDGE_RAIL = "M242 166C254 150 286 150 298 164";
const BRIDGE_POSTS = "M250 160V172M270 154V166M290 160V172";

/** The frozen lake, and the cracks the cold has drawn across it. */
const LAKE =
  "M-8 158C40 154 92 160 142 157C192 154 242 160 292 157C330 155 366 159 396 156V184H-8Z";
const LAKE_CRACKS =
  "M4 172L18 166L30 174M40 180L54 172L64 178M74 166L88 174L100 168M118 178L132 170L146 176" +
  "M166 168L180 176L192 170M212 180L226 172L240 178M256 166L270 174L282 168M300 178L314 170L328 176" +
  "M344 168L358 176L374 170";

/** The snowy pine: three stepped tiers, a snow cap on the crown, and a short trunk. */
const PINE_BODY = "M0-64L15-38H-15ZM0-46L22-16H-22ZM0-26L30 0H-30Z";
const PINE_SNOW = "M0-64L8-50L0-53L-8-50ZM0-46L12-28L0-32L-12-28ZM0-26L16-8L0-12L-16-8Z";
const PINE_TRUNK = "M-3 0H3V6H-3Z";

/** The balloon: a sliced paper disc with a knot, and the string that ties it to the bridge. */
const BALLOON = "M-10 0C-10-11-5-18 0-18C5-18 10-11 10 0C10 9 5 15 0 15C-5 15-10 9-10 0Z";
const BALLOON_KNOT = "M-3 15H3L0 19Z";

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
  { x: 300, y: 112, rotate: 12, scale: 0.5 },
  { x: 96, y: 96, rotate: -20, scale: 0.45 },
];

const CRYSTAL_STANDS: readonly Place[] = [
  { x: 78, y: 196, rotate: -8, scale: 1.35 },
  { x: 96, y: 199, rotate: 5, scale: 1 },
  { x: 114, y: 196, rotate: -3, scale: 1.15 },
  { x: 272, y: 197, rotate: 6, scale: 1.1 },
  { x: 290, y: 200, rotate: -5, scale: 0.9 },
  { x: 310, y: 196, rotate: 3, scale: 1.25 },
];

/** The pines that frame the two edges: three on each side, at three sizes. */
const PINES: readonly Place[] = [
  { x: 24, y: 198, rotate: 0, scale: 0.92 },
  { x: 54, y: 200, rotate: 0, scale: 0.62 },
  { x: 6, y: 201, rotate: 0, scale: 0.48 },
  { x: 366, y: 198, rotate: 0, scale: 0.9 },
  { x: 338, y: 200, rotate: 0, scale: 0.64 },
  { x: 386, y: 201, rotate: 0, scale: 0.46 },
];

/** The three balloons and their strings, tied to the bridge rail. */
const BALLOONS: readonly {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly paint: ThemePaint;
}[] = [
  { name: "balloon-far", x: 336, y: 98, scale: 0.72, paint: "var(--inv-decoration-two)" },
  { name: "balloon-mid", x: 322, y: 76, scale: 0.86, paint: "var(--inv-decoration-one)" },
  { name: "balloon-near", x: 304, y: 94, scale: 1, paint: "var(--inv-accent)" },
];

const BALLOON_STRINGS =
  "M304 113C302 128 298 146 296 164M322 91C318 116 310 144 298 166M336 111C330 132 316 152 300 168";

/** The twinkles that catch the aurora: small four-point stars among the flakes. */
const TWINKLES: readonly Place[] = [
  { x: 56, y: 44, rotate: 0, scale: 0.9 },
  { x: 90, y: 74, rotate: 0, scale: 0.6 },
  { x: 158, y: 30, rotate: 0, scale: 0.75 },
  { x: 244, y: 24, rotate: 0, scale: 0.65 },
  { x: 300, y: 44, rotate: 0, scale: 0.85 },
  { x: 356, y: 96, rotate: 0, scale: 0.55 },
];

/** The four-point twinkle: two crossed lozenges, defined once and placed over the sky. */
const TWINKLE = "M0-5L1.3-1.3L5 0L1.3 1.3L0 5L-1.3 1.3L-5 0L-1.3-1.3Z";

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

/** The twinkle stamp: one shape, placed over the sky. */
function twinkleDefinition(id: IllustrationId): ReactElement {
  return h("defs", { key: "twinkle-definition" }, h("path", { id: id("twinkle"), d: TWINKLE }));
}

/**
 * The two patterns of the scene: the cracks of the frozen lake, and the frost running through the ice of the
 * castle wall. Both are painted as the fill of a theme-colored sheet and both get their id from the frame.
 */
function patternDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "pattern-definitions" },
    h(
      "pattern",
      {
        key: "ice-cracks",
        id: id("ice-cracks"),
        width: 64,
        height: 40,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(-6)",
      },
      h("path", {
        key: "crack",
        d: LAKE_CRACKS,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1,
        opacity: 0.7,
        strokeLinecap: "round",
      }),
    ),
    h(
      "pattern",
      {
        key: "frost",
        id: id("frost"),
        width: 22,
        height: 18,
        patternUnits: "userSpaceOnUse",
      },
      h("path", {
        key: "rune-a",
        d: "M3 2L6 8L3 13M15 4L12 9L15 14",
        fill: "none",
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 0.9,
        opacity: 0.5,
        strokeLinecap: "round",
      }),
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

/** A placed snowy pine with its shadow: one body, one snow cap, one trunk, one ink copy behind. */
function pines(places: readonly Place[]): ReactElement[] {
  return places.flatMap((place) => {
    const at = `translate(${place.x} ${place.y}) scale(${place.scale})`;

    return [
      h(
        "g",
        { key: `pine-shadow-${place.x}`, transform: `${at} translate(1.1 3.4)` },
        h("path", { key: "body", d: PINE_BODY, fill: "var(--inv-ink)", opacity: 0.12 }),
      ),
      h(
        "g",
        { key: `pine-${place.x}`, transform: at },
        h("path", { key: "body", d: PINE_BODY, fill: "var(--inv-accent)" }),
        h("path", { key: "snow", d: PINE_SNOW, fill: "var(--inv-surface)" }),
        h("path", { key: "trunk", d: PINE_TRUNK, fill: "var(--inv-ink)", opacity: 0.7 }),
      ),
    ];
  });
}

/** The three balloons, their knots, and the strings that tie them to the bridge. */
function balloons(): ReactElement[] {
  return [
    ...BALLOONS.flatMap((balloon) => {
      const at = `translate(${balloon.x} ${balloon.y}) scale(${balloon.scale})`;

      return [
        h("path", {
          key: `${balloon.name}-shadow`,
          d: BALLOON,
          fill: "var(--inv-ink)",
          opacity: 0.14,
          transform: `${at} translate(1.1 3.4)`,
        }),
        h("path", { key: balloon.name, d: BALLOON, fill: balloon.paint, transform: at }),
        h("path", {
          key: `${balloon.name}-knot`,
          d: BALLOON_KNOT,
          fill: balloon.paint,
          transform: at,
        }),
        h("path", {
          key: `${balloon.name}-glint`,
          d: "M-5 -4C-4 -8 -1 -10 2 -10",
          fill: "none",
          stroke: "var(--inv-surface)",
          strokeWidth: 1.3,
          strokeLinecap: "round",
          opacity: 0.6,
          transform: at,
        }),
      ];
    }),
    h("path", {
      key: "balloon-strings",
      d: BALLOON_STRINGS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 0.9,
      opacity: 0.4,
    }),
  ];
}

/** The header diorama: aurora sky, both ranges, the castle above its lake, the pines, and the party. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 1.4, SCENE_HEIGHT + 8);
  const farDrift = tornEdge(SCENE_WIDTH, 158, 3.2, SCENE_HEIGHT + 8);
  const drift = tornEdge(SCENE_WIDTH, 182, 2.6, SCENE_HEIGHT + 8);
  const lowDrift = tornEdge(SCENE_WIDTH, 191, 5.2, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const peaksFar: CutSheet = { name: "peaks-far", d: PEAKS_FAR, fill: "var(--inv-decoration-one)" };
  const peaksNear: CutSheet = {
    name: "peaks-near",
    d: PEAKS_NEAR,
    fill: "var(--inv-accent)",
    shadow: false,
  };
  const backDrift: CutSheet = {
    name: "back-drift",
    d: farDrift.sheet,
    fill: "var(--inv-soft)",
    shadow: false,
  };
  const backTowerLeft: CutSheet = {
    name: "back-tower-left",
    d: BACK_TOWER_LEFT,
    fill: "var(--inv-soft)",
    outline: true,
  };
  const backTowerRight: CutSheet = {
    name: "back-tower-right",
    d: BACK_TOWER_RIGHT,
    fill: "var(--inv-soft)",
    outline: true,
  };
  const backRoofLeft: CutSheet = {
    name: "back-roof-left",
    d: BACK_ROOF_LEFT,
    fill: "var(--inv-decoration-two)",
  };
  const backRoofRight: CutSheet = {
    name: "back-roof-right",
    d: BACK_ROOF_RIGHT,
    fill: "var(--inv-decoration-two)",
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
  const lake: CutSheet = {
    name: "lake",
    d: LAKE,
    fill: "var(--inv-decoration-two)",
    shadow: false,
  };
  const bridge: CutSheet = {
    name: "bridge",
    d: BRIDGE_DECK,
    fill: "var(--inv-surface)",
    outline: true,
  };

  return [
    sheetDefinitions(id, [
      sheet,
      peaksFar,
      peaksNear,
      backDrift,
      backTowerLeft,
      backTowerRight,
      backRoofLeft,
      backRoofRight,
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
      lake,
      bridge,
    ]),
    flakeDefinition(id),
    crystalDefinition(id),
    twinkleDefinition(id),
    patternDefinitions(id),
    ...cutSheets(id, [sheet]),
    // The aurora: four ribbons of tinted paper, each one paler than the one before, with two bright streaks.
    h("path", {
      key: "aurora-top",
      d: AURORA_TOP,
      fill: "var(--inv-decoration-one)",
      opacity: 0.22,
    }),
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
    h("path", {
      key: "aurora-streaks",
      d: AURORA_STREAKS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      opacity: 0.35,
    }),
    h(
      "g",
      { key: "twinkles", fill: "var(--inv-surface)", opacity: 0.85 },
      TWINKLES.map((place) =>
        h("use", {
          key: `twinkle-${place.x}-${place.y}`,
          href: `#${id("twinkle")}`,
          transform: `translate(${place.x} ${place.y}) scale(${place.scale})`,
        }),
      ),
    ),
    ...cutSheets(id, [peaksFar, peaksNear]),
    // The lower range is the accent seen through frozen air, so the pale castle in front of it stands out.
    h("use", {
      key: "peaks-near-veil",
      href: `#${id(peaksNear.name)}`,
      fill: "var(--inv-surface)",
      opacity: 0.42,
    }),
    h("path", { key: "snow-caps", d: SNOW_CAPS, fill: "var(--inv-surface)" }),
    ...cutSheets(id, [backDrift]),
    // The outer curtain wall, in the pale ice, behind the wings and the keep.
    ...cutSheets(id, [backTowerLeft, backTowerRight, backRoofLeft, backRoofRight]),
    h("path", {
      key: "back-windows",
      d: "M150 136H156V146H150ZM150 156H156V166H150ZM232 130H238V140H232ZM232 150H238V160H232Z",
      fill: "var(--inv-ink)",
      opacity: 0.28,
    }),
    // The castle: the plinth, the wings and turrets, the keep, the roofs, and the bridge over the lake.
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
    h("path", { key: "banners", d: BANNERS, fill: "var(--inv-decoration-one)" }),
    h("path", {
      key: "banner-stripes",
      d: BANNER_STRIPES,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 0.9,
      opacity: 0.45,
    }),
    h("use", {
      key: "keep-frost",
      href: `#${id("keep")}`,
      style: { fill: `url(#${id("frost")})` },
    }),
    h("path", {
      key: "keep-courses",
      d: KEEP_COURSES,
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.1,
      opacity: 0.9,
    }),
    h("path", { key: "windows", d: WINDOWS, fill: "var(--inv-ink)", opacity: 0.5 }),
    h("path", {
      key: "windows-lower",
      d: WINDOWS_KEEP_LOWER,
      fill: "var(--inv-decoration-two)",
      opacity: 0.85,
    }),
    h("path", {
      key: "sill-frost",
      d: SILL_FROST,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      opacity: 0.6,
    }),
    h("circle", { key: "rose-window", cx: 195, cy: 84, r: 7.5, fill: "var(--inv-decoration-two)" }),
    h("circle", { key: "rose-center", cx: 195, cy: 84, r: 3, fill: "var(--inv-accent)" }),
    h("path", { key: "gate", d: GATE, fill: "var(--inv-ink)", opacity: 0.55 }),
    h("path", { key: "gate-glow", d: GLOW, fill: "var(--inv-decoration-two)", opacity: 0.55 }),
    // The frozen lake in front of the plinth, with its cracks and the castle reflected in it.
    ...cutSheets(id, [lake]),
    h("use", {
      key: "lake-cracks",
      href: `#${id(lake.name)}`,
      style: { fill: `url(#${id("ice-cracks")})` },
    }),
    h("use", {
      key: "reflection-keep",
      href: `#${id(keep.name)}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.34,
      transform: "translate(0 316) scale(1 -1)",
    }),
    h("use", {
      key: "reflection-roof",
      href: `#${id(roofKeep.name)}`,
      fill: "var(--inv-accent)",
      opacity: 0.22,
      transform: "translate(0 316) scale(1 -1)",
    }),
    h("path", {
      key: "reflection-glow",
      d: GLOW,
      fill: "var(--inv-decoration-two)",
      opacity: 0.35,
      transform: "translate(0 316) scale(1 -1)",
    }),
    h("path", {
      key: "lake-sheen",
      d: "M28 186C92 182 154 188 218 184C276 180 330 186 372 183",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      opacity: 0.45,
    }),
    ...cutSheets(id, [bridge]),
    h("path", {
      key: "bridge-rail",
      d: BRIDGE_RAIL,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      opacity: 0.85,
    }),
    h("path", {
      key: "bridge-posts",
      d: BRIDGE_POSTS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      opacity: 0.4,
    }),
    // The drifts in front: the lit bank, the cold layer over it, and the crystals standing in both.
    ...cutSheets(id, [ground]),
    ...cutSheets(id, [lowSnow]),
    h("path", {
      key: "drift-line",
      d: "M-8 186C40 180 88 188 136 184C184 180 232 188 280 184C326 180 364 186 396 183",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1,
      opacity: 0.2,
    }),
    ...pines(PINES),
    crystals("crystals-far", id, CRYSTAL_STANDS.slice(0, 3), "var(--inv-accent)", 0.85),
    crystals("crystals-near", id, CRYSTAL_STANDS.slice(3), "var(--inv-accent)", 0.85),
    ...balloons(),
    flakes("flakes-far", id, FLAKES_FAR, "var(--inv-accent)", 0.4),
    flakes("flakes-near", id, FLAKES_NEAR, "var(--inv-decoration-one)", 0.65),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: two torn strips of snow with icicles, flakes, and a short garland across them. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 26, 1.9, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 4.2, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
  ];
  const pennants: readonly { readonly x: number; readonly paint: ThemePaint }[] = [
    { x: 148, paint: "var(--inv-accent)" },
    { x: 168, paint: "var(--inv-surface)" },
    { x: 188, paint: "var(--inv-decoration-one)" },
    { x: 208, paint: "var(--inv-accent)" },
    { x: 228, paint: "var(--inv-surface)" },
    { x: 248, paint: "var(--inv-decoration-one)" },
  ];

  return [
    sheetDefinitions(id, sheets),
    flakeDefinition(id),
    crystalDefinition(id),
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
    // A paper garland across the middle, the strip's party touch.
    h("path", {
      key: "garland-string",
      d: "M138 30C170 44 222 44 258 30",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      opacity: 0.4,
    }),
    h(
      "g",
      { key: "garland-pennants" },
      pennants.map((pennant, index) =>
        h("path", {
          key: `pennant-${index}`,
          d: `M${pennant.x} ${34 + Math.abs(index - 2.5) * 2}l8 0l-4 9Z`,
          fill: pennant.paint,
          opacity: 0.9,
        }),
      ),
    ),
    flakes(
      "flakes-divider",
      id,
      [
        { x: 70, y: 38, rotate: -10, scale: 1.35 },
        { x: 128, y: 34, rotate: 18, scale: 0.9 },
        { x: 196, y: 22, rotate: 42, scale: 1.2 },
        { x: 262, y: 35, rotate: -6, scale: 0.85 },
        { x: 320, y: 38, rotate: 26, scale: 1.25 },
      ],
      "var(--inv-accent)",
      0.6,
    ),
  ];
}

/** The footer: a torn strip of drift with pines, crystals and the flakes dying out at the edges. */
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
    // Two small pines stand in the strip, one at each end, framing the crystals in the middle.
    ...pines([
      { x: 44, y: 60, rotate: 0, scale: 0.72 },
      { x: 348, y: 60, rotate: 0, scale: 0.68 },
    ]),
    crystals(
      "footer-crystals",
      id,
      [
        { x: 96, y: 57, rotate: -6, scale: 0.9 },
        { x: 126, y: 59, rotate: 5, scale: 0.7 },
        { x: 158, y: 58, rotate: -3, scale: 0.8 },
        { x: 242, y: 58, rotate: 4, scale: 0.8 },
        { x: 272, y: 59, rotate: -5, scale: 0.7 },
        { x: 302, y: 57, rotate: 2, scale: 0.9 },
      ],
      "var(--inv-accent)",
      0.6,
    ),
    h("path", {
      key: "footer-garland",
      d: "M100 22C130 30 160 24 190 28C220 32 250 24 280 28",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 0.9,
      opacity: 0.3,
    }),
    h(
      "g",
      { key: "footer-pennants" },
      [
        { x: 112, paint: "var(--inv-accent)" as ThemePaint },
        { x: 140, paint: "var(--inv-surface)" as ThemePaint },
        { x: 168, paint: "var(--inv-decoration-one)" as ThemePaint },
        { x: 196, paint: "var(--inv-accent)" as ThemePaint },
        { x: 224, paint: "var(--inv-surface)" as ThemePaint },
        { x: 252, paint: "var(--inv-decoration-one)" as ThemePaint },
      ].map((pennant, index) =>
        h("path", {
          key: `pennant-${index}`,
          d: `M${pennant.x} ${24 + Math.abs(index - 2.5)}l7 0l-3.5 8Z`,
          fill: pennant.paint,
          opacity: 0.85,
        }),
      ),
    ),
    flakes(
      "flakes-footer",
      id,
      [
        { x: 118, y: 14, rotate: 8, scale: 0.7 },
        { x: 168, y: 10, rotate: -14, scale: 0.5 },
        { x: 276, y: 12, rotate: 30, scale: 0.55 },
        { x: 348, y: 16, rotate: -8, scale: 0.7 },
      ],
      "var(--inv-accent)",
      0.45,
    ),
  ];
}

/** «Reino de hielo» in paper cut-out: the lake diorama, the icicle divider, and the pine footer. */
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
