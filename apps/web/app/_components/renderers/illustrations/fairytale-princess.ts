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
 * «Princesa de cuento» in paper cut-out (I3b, I4c; S1-S5), after the technique of `dinosaurs.ts` and the
 * owner's artboard `design/theme-illustrations/01-papel-recortado.html`. The owner asked for richer birthday
 * scenes (S5, L6), so the header is now a storybook valley in four depth planes: a soft sky with a rainbow, three
 * layered clouds, birds, crowns and stars; two ranges of rolling hills with round trees on them; an original
 * castle of five towers of different heights, with battlements, pane windows, banners, shingled roofs and a
 * gatehouse whose drawbridge crosses the moat; and a foreground of two round trees that frame the page, a
 * winding path from the bridge and a garden of flowers.
 *
 * Original work: there is no princess, no figure, and no character of any story here. The castle is an
 * asymmetric storybook castle of our own drawing — five towers of different heights, gold conical roofs, a
 * gatehouse and a moat — not a known castle silhouette, and there is no pumpkin carriage and no glass slipper.
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
const CROWN = "M-14 7V-5L-8 0L0-9L8 0L14-5V7Z";
const CROWN_JEWELS = "M-9 3.4H-6V5.8H-9ZM-1.5 2.4H1.5V5.8H-1.5ZM6 3.4H9V5.8H6Z";

/** A flower: five round petals and the golden heart of it. */
const FLOWER_PETALS = [
  { cx: 0, cy: -6.4 },
  { cx: 6.1, cy: -2 },
  { cx: 3.8, cy: 5.2 },
  { cx: -3.8, cy: 5.2 },
  { cx: -6.1, cy: -2 },
] as const;

/** The two hills behind the castle: the far ridge, and the one the castle stands on. */
const HILL_FAR =
  "M-8 150C22 138 50 118 84 112C112 107 138 116 164 120C192 124 214 112 244 110C274 108 306 120 336 130C360 " +
  "138 380 144 398 148V170H-8Z";

const HILL_BACK =
  "M-8 164C24 152 52 142 86 144C118 146 140 156 172 154C204 152 226 140 258 140C290 140 322 152 352 158C370 " +
  "162 386 166 398 166V182H-8Z";

/** The front hill the path climbs, and the ribbon of the path itself. */
const HILL_FRONT =
  "M-8 200V176C26 166 56 168 90 174C122 180 148 190 180 190C212 190 244 178 276 174C308 170 344 176 398 188V200Z";

const PATH = "M184 162C170 176 214 184 200 200H240C250 186 216 180 228 162Z";

/** The castle: five towers of different heights, their battlements, and the wall between them. */
const TOWER_LEFT = "M138 146V78H168V146Z";
const TOWER_RIGHT = "M238 146V88H268V146Z";
const GATEHOUSE = "M172 146V90H232V146Z";
const TURRET = "M196 90V66H210V90Z";
const WING_LEFT = "M112 146V126H138V146Z";
const WING_RIGHT = "M268 146V126H294V146Z";

const ROOF_LEFT = "M132 78L153 46L174 78Z";
const ROOF_RIGHT = "M232 88L253 58L274 88Z";
const ROOF_TURRET = "M192 66L203 40L214 66Z";

/** The merlons of every battlement, cut as one sheet per wall. */
const MERLONS =
  "M172 84H181V90H190V84H199V90H208V84H217V90H226V84H232V90H172Z" +
  "M138 72H145V78H152V72H159V78H166V72H168V78H138Z" +
  "M238 82H245V88H252V82H259V88H266V82H268V88H238Z" +
  "M112 120H120V126H128V120H136V126H138V126H112Z" +
  "M268 120H276V126H284V120H292V126H294V126H268Z";

/** The lit half of each roof, the fold down its middle, and the rows of shingles. */
const ROOF_FACETS = "M153 46L174 78L153 78ZM253 58L274 88L253 88ZM203 40L214 66L203 66Z";
const ROOF_FOLDS = "M153 46V78M253 58V88M203 40V66";
const ROOF_SHINGLES =
  "M143 74C146 70 150 70 153 74C156 70 160 70 163 74M137 66C140 62 144 62 147 66" +
  "M243 84C246 80 250 80 253 84C256 80 260 80 263 84M237 76C240 72 244 72 247 76" +
  "M196 60C199 57 203 57 206 60C209 57 212 57 215 60";

/** The gate and the windows: a pointed arch on the keep, arched slits on the towers and the walls. */
const GATE = "M190 146V126C190 119 214 119 214 126V146Z";
const PORTCULLIS = "M190 128H214M195 126V142M203 126V142M210 126V142";

/** The banners on the three spires, and the gold line along every eave. */
const PENNANT_POLES = "M153 46V34M253 58V46M203 40V28";
const PENNANTS = "M153 34L168 38L153 42ZM253 46L266 49L253 52ZM203 28L216 31L203 34Z";
const EAVES = "M132 78H174M232 88H274M192 66H214";

/** The walls' stonework, the gatehouse's shutters, and the moat. */
const MASONRY =
  "M174 96H230M174 104H230M174 112H230M140 84H166M140 92H166M140 100H166" +
  "M240 94H266M240 102H266M114 130H136M270 130H292";

const MOAT = "M104 146H300V152C300 159 272 164 240 164H164C132 164 104 159 104 152Z";

/** The drawbridge: two chains, a deck of planks, and the shadow it throws on the water. */
const BRIDGE = "M188 145H216V158H184Z";
const BRIDGE_PLANKS = "M188 149H216M188 153H216M195 145V158M202 145V158M209 145V158";
const BRIDGE_CHAINS = "M188 145L184 158M216 145L220 158";

/** A window with its panes: the opening, and the two mullions that cross it. */
const WINDOW = "M0 0V-8C0-11 6-11 6-8V0Z";
const WINDOW_PANES = "M3-10V0M0-4H6";

/** The cloud of a storybook sky: three bumps, a flat base and a shaded under-edge. */
const CLOUD = "M0 0C-2-6 2-11 8-11C11-16 20-17 24-12C30-14 36-9 34-3C38 0 36 4 31 4H4C1 4-1 2 0 0Z";

const SKY_STARS: readonly Place[] = [
  { x: 34, y: 34, rotate: -8, scale: 0.9 },
  { x: 76, y: 22, rotate: 14, scale: 0.6 },
  { x: 128, y: 46, rotate: -4, scale: 0.5 },
  { x: 244, y: 22, rotate: 18, scale: 0.7 },
  { x: 300, y: 40, rotate: -12, scale: 0.55 },
  { x: 356, y: 28, rotate: 8, scale: 0.85 },
  { x: 378, y: 92, rotate: -16, scale: 0.55 },
  { x: 18, y: 84, rotate: 12, scale: 0.6 },
];

const CROWNS: readonly Place[] = [
  { x: 58, y: 92, rotate: -10, scale: 1.15 },
  { x: 330, y: 122, rotate: 12, scale: 0.8 },
];

const FLOWERS: readonly Place[] = [
  { x: 30, y: 184, rotate: -8, scale: 1 },
  { x: 64, y: 192, rotate: 6, scale: 0.8 },
  { x: 96, y: 180, rotate: -6, scale: 0.7 },
  { x: 300, y: 182, rotate: 8, scale: 0.75 },
  { x: 336, y: 192, rotate: -8, scale: 0.85 },
  { x: 368, y: 184, rotate: 10, scale: 0.95 },
];

const TREES_FAR: readonly Place[] = [
  { x: 48, y: 150, rotate: 0, scale: 0.55 },
  { x: 86, y: 146, rotate: 0, scale: 0.45 },
  { x: 322, y: 148, rotate: 0, scale: 0.5 },
  { x: 352, y: 152, rotate: 0, scale: 0.4 },
];

/** The sparkle stamp: one shape, placed with a turn and a size like the stars of a storybook sky. */
function sparkleDefinition(id: IllustrationId): ReactElement {
  return h("defs", { key: "sparkle-definition" }, h("path", { id: id("sparkle"), d: SPARKLE }));
}

/** The flower, the window, the crown and the round tree, each drawn once and placed many times. */
function stampDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "stamp-definitions" },
    h(
      "g",
      { key: "flower", id: id("flower") },
      FLOWER_PETALS.map((petal, index) =>
        h("circle", { key: `petal-${index}`, cx: petal.cx, cy: petal.cy, r: 4.2 }),
      ),
      h("circle", { key: "heart", r: 3.1, fill: "var(--inv-decoration-two)" }),
    ),
    h(
      "g",
      { key: "window", id: id("window") },
      h("path", { key: "frame", d: WINDOW, fill: "var(--inv-accent)", opacity: 0.72 }),
      h("path", {
        key: "panes",
        d: WINDOW_PANES,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.1,
        opacity: 0.85,
      }),
    ),
    h(
      "g",
      { key: "crown", id: id("crown") },
      h("path", { key: "band", d: CROWN }),
      h("path", { key: "jewels", d: CROWN_JEWELS, fill: "var(--inv-accent)" }),
    ),
    h(
      "g",
      { key: "tree", id: id("tree") },
      h("path", { key: "trunk", d: "M-3 0H3V-18H-3Z", fill: "var(--inv-decoration-two)" }),
      h("circle", { key: "low", cx: 0, cy: -24, r: 14 }),
      h("circle", { key: "left", cx: -10, cy: -32, r: 10 }),
      h("circle", { key: "right", cx: 10, cy: -32, r: 9.5 }),
      h("circle", { key: "top", cx: 0, cy: -40, r: 9 }),
      h("circle", {
        key: "light",
        cx: -4,
        cy: -34,
        r: 6,
        fill: "var(--inv-surface)",
        opacity: 0.35,
      }),
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
        transform: `translate(${item.x} ${item.y}) rotate(${item.rotate}) scale(${item.scale})`,
      }),
    ),
  );
}

/** One crown, with its jewels, at a turn and a size of its own. */
function crown(
  key: string,
  id: IllustrationId,
  place: Place,
  paint: ThemePaint,
  opacity = 1,
): ReactElement {
  return h("use", {
    key,
    href: `#${id("crown")}`,
    fill: paint,
    opacity,
    transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
  });
}

/** The header diorama: sky, rainbow, hills, the castle, its moat and bridge, and the garden below. */
function scene(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const tear = tornEdge(SCENE_WIDTH, 8, 1.8, SCENE_HEIGHT + 8);

  body.push(
    ...collect({ name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false }),
    // Plane one: the sky, its glow, the rainbow and the stars.
    h("circle", { key: "glow", cx: 195, cy: 118, r: 96, fill: "var(--inv-surface)", opacity: 0.5 }),
    h("circle", {
      key: "glow-inner",
      cx: 195,
      cy: 132,
      r: 58,
      fill: "var(--inv-surface)",
      opacity: 0.3,
    }),
    h("path", {
      key: "rainbow-one",
      d: "M18 168A177 177 0 0 1 372 168",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 9,
      opacity: 0.35,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "rainbow-two",
      d: "M34 168A161 161 0 0 1 356 168",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 9,
      opacity: 0.55,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "rainbow-three",
      d: "M50 168A145 145 0 0 1 340 168",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 8,
      opacity: 0.25,
      strokeLinecap: "round",
    }),
    stamps("stars", id, "sparkle", SKY_STARS, "var(--inv-decoration-two)", 0.95),
    // Plane one: three layered clouds, with a shaded under-edge each.
    h(
      "g",
      { key: "cloud-left", transform: "translate(44 44) scale(1.1)" },
      h("path", {
        key: "shadow",
        d: CLOUD,
        fill: "var(--inv-ink)",
        opacity: 0.1,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "body", d: CLOUD, fill: "var(--inv-surface)" }),
      h("path", {
        key: "shade",
        d: "M4 2C10 5 28 5 34 1C32 4 26 6 18 6H6C3 6 2 4 4 2Z",
        fill: "var(--inv-decoration-one)",
        opacity: 0.7,
      }),
    ),
    h(
      "g",
      { key: "cloud-right", transform: "translate(296 62) scale(0.85)" },
      h("path", {
        key: "shadow",
        d: CLOUD,
        fill: "var(--inv-ink)",
        opacity: 0.1,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "body", d: CLOUD, fill: "var(--inv-surface)" }),
    ),
    h(
      "g",
      { key: "cloud-high", transform: "translate(150 24) scale(0.7)" },
      h("path", { key: "body", d: CLOUD, fill: "var(--inv-surface)", opacity: 0.8 }),
    ),
    // Plane one: two crowns float in the sky, and three birds cross it.
    crown("crown-high", id, CROWNS[0] as Place, "var(--inv-decoration-two)"),
    h("path", {
      key: "birds",
      d:
        "M250 84C253 80 257 80 260 84C263 80 267 80 270 84M222 96C224 93 227 93 229 96C231 93 234 93 236 96" +
        "M292 76C294 73 297 73 299 76C301 73 304 73 306 76",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      opacity: 0.35,
      strokeLinecap: "round",
    }),
    // Plane two: the far ridge, the hill the castle stands on, and the round trees on it.
    ...collect({ name: "hill-far", d: HILL_FAR, fill: "var(--inv-decoration-one)" }),
    h("use", {
      key: "hill-far-veil",
      href: `#${id("hill-far")}`,
      fill: "var(--inv-surface)",
      opacity: 0.35,
    }),
    ...collect({ name: "hill-back", d: HILL_BACK, fill: "var(--inv-accent)", shadow: false }),
    h("use", {
      key: "hill-back-veil",
      href: `#${id("hill-back")}`,
      fill: "var(--inv-soft)",
      opacity: 0.6,
    }),
    stamps("trees-far", id, "tree", TREES_FAR, "var(--inv-accent)", 0.45),
    crown("crown-low", id, CROWNS[1] as Place, "var(--inv-decoration-two)", 0.9),
  );

  // Plane two: the castle. Walls, then the towers, then the roofs, then every cut detail.
  body.push(
    ...collect({ name: "wing-left", d: WING_LEFT, fill: "var(--inv-surface)" }),
    ...collect({ name: "wing-right", d: WING_RIGHT, fill: "var(--inv-surface)" }),
    ...collect({ name: "tower-left", d: TOWER_LEFT, fill: "var(--inv-surface)", outline: true }),
    ...collect({ name: "tower-right", d: TOWER_RIGHT, fill: "var(--inv-surface)", outline: true }),
    ...collect({ name: "gatehouse", d: GATEHOUSE, fill: "var(--inv-surface)", outline: true }),
    ...collect({ name: "turret", d: TURRET, fill: "var(--inv-soft)", outline: true }),
    h("path", { key: "merlons", d: MERLONS, fill: "var(--inv-surface)" }),
    h("path", {
      key: "masonry",
      d: MASONRY,
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1,
      opacity: 0.55,
    }),
    ...collect({ name: "roof-left", d: ROOF_LEFT, fill: "var(--inv-decoration-two)" }),
    ...collect({ name: "roof-right", d: ROOF_RIGHT, fill: "var(--inv-decoration-two)" }),
    ...collect({ name: "roof-turret", d: ROOF_TURRET, fill: "var(--inv-decoration-two)" }),
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
      key: "roof-shingles",
      d: ROOF_SHINGLES,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 0.9,
      opacity: 0.35,
    }),
    h("path", {
      key: "eaves",
      d: EAVES,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.6,
      opacity: 0.5,
    }),
    h("path", {
      key: "pennant-poles",
      d: PENNANT_POLES,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 1.4,
      opacity: 0.9,
    }),
    h("path", { key: "pennants", d: PENNANTS, fill: "var(--inv-accent)" }),
    h("path", { key: "gate", d: GATE, fill: "var(--inv-ink)", opacity: 0.6 }),
    h("path", {
      key: "gate-light",
      d: "M193 146V127C193 122 211 122 211 127V146Z",
      fill: "var(--inv-soft)",
      opacity: 0.8,
    }),
    h("path", {
      key: "portcullis",
      d: PORTCULLIS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.1,
      opacity: 0.45,
    }),
    h(
      "g",
      { key: "windows", fill: "var(--inv-accent)" },
      [
        { x: 146, y: 100, scale: 1 },
        { x: 146, y: 124, scale: 1 },
        { x: 246, y: 104, scale: 1 },
        { x: 246, y: 126, scale: 0.9 },
        { x: 176, y: 106, scale: 0.9 },
        { x: 220, y: 106, scale: 0.9 },
        { x: 120, y: 136, scale: 0.8 },
        { x: 282, y: 136, scale: 0.8 },
      ].map((place, index) =>
        h("use", {
          key: `window-${index}`,
          href: `#${id("window")}`,
          transform: `translate(${place.x} ${place.y}) scale(${place.scale})`,
        }),
      ),
    ),
    // Plane three: the moat, the drawbridge that crosses it, and the front hill under them.
    ...collect({ name: "moat", d: MOAT, fill: "var(--inv-surface)" }),
    h("use", {
      key: "moat-tint",
      href: `#${id("moat")}`,
      fill: "var(--inv-accent)",
      opacity: 0.22,
    }),
    h("path", {
      key: "moat-waves",
      d:
        "M116 152C136 148 152 156 172 152C192 148 208 156 228 152C248 148 264 156 284 152" +
        "M128 158C148 155 164 161 184 158C204 155 220 161 240 158C258 156 272 160 288 157",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.6,
      opacity: 0.8,
      strokeLinecap: "round",
    }),
    ...collect({ name: "bridge", d: BRIDGE, fill: "var(--inv-decoration-one)" }),
    h("path", {
      key: "bridge-planks",
      d: BRIDGE_PLANKS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      opacity: 0.35,
    }),
    h("path", {
      key: "bridge-chains",
      d: BRIDGE_CHAINS,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 1.4,
      opacity: 0.85,
    }),
    ...collect({ name: "hill-front", d: HILL_FRONT, fill: "var(--inv-soft)" }),
    h("use", {
      key: "hill-front-veil",
      href: `#${id("hill-front")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.35,
    }),
    // Plane four: the winding path, the garden, and the two round trees that frame the page.
    h("path", { key: "path", d: PATH, fill: "var(--inv-surface)", opacity: 0.9 }),
    h("path", {
      key: "path-edge",
      d: "M184 162C170 176 214 184 200 200M228 162C216 174 240 184 236 200",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1.4,
      opacity: 0.8,
    }),
    stamps("flowers-front", id, "flower", FLOWERS, "var(--inv-decoration-one)"),
    h("path", {
      key: "flower-stems",
      d: "M30 184V194M64 192V198M96 180V190M300 182V192M336 192V198M368 184V194",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.4,
      opacity: 0.5,
    }),
    h(
      "g",
      { key: "tree-foreground-left", transform: "translate(24 198) scale(1.05)" },
      h("use", { key: "tree", href: `#${id("tree")}`, fill: "var(--inv-accent)" }),
    ),
    h(
      "g",
      { key: "tree-foreground-right", transform: "translate(368 198) scale(0.95)" },
      h("use", { key: "tree", href: `#${id("tree")}`, fill: "var(--inv-accent)" }),
    ),
    h(
      "g",
      { key: "bush-left", transform: "translate(76 196)" },
      h("ellipse", {
        key: "one",
        cx: 0,
        cy: 0,
        rx: 14,
        ry: 9,
        fill: "var(--inv-accent)",
        opacity: 0.8,
      }),
      h("ellipse", {
        key: "two",
        cx: 12,
        cy: 2,
        rx: 10,
        ry: 7,
        fill: "var(--inv-accent)",
        opacity: 0.7,
      }),
    ),
    h(
      "g",
      { key: "bush-right", transform: "translate(300 198)" },
      h("ellipse", {
        key: "one",
        cx: 0,
        cy: 0,
        rx: 12,
        ry: 8,
        fill: "var(--inv-accent)",
        opacity: 0.8,
      }),
      h("ellipse", {
        key: "two",
        cx: 10,
        cy: 2,
        rx: 9,
        ry: 6,
        fill: "var(--inv-accent)",
        opacity: 0.7,
      }),
    ),
    stamps(
      "sparkles-ground",
      id,
      "sparkle",
      [
        { x: 130, y: 186, rotate: 30, scale: 0.5 },
        { x: 262, y: 184, rotate: -20, scale: 0.45 },
        { x: 204, y: 176, rotate: 10, scale: 0.4 },
      ],
      "var(--inv-decoration-two)",
      0.9,
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  );

  return [sheetDefinitions(id, sheets), sparkleDefinition(id), stampDefinitions(id), ...body];
}

/** The divider: a torn band with a ribbon banner, a crown, pennants and a garden of flowers. */
function divider(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 10, 3.8, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 40, 5.6, DIVIDER_HEIGHT + 8);

  sheets.push({
    name: "strip-under",
    d: under.sheet,
    fill: "var(--inv-decoration-two)",
    shadow: false,
  });

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.25,
    }),
    // A small pennant garland above the banner.
    h("path", {
      key: "garland-string",
      d: "M-8 12C60 30 140 26 195 16C250 26 330 30 398 12",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.1,
      opacity: 0.35,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "garland-flags",
      d:
        "M40 18L46 18L43 28ZM110 24L116 24L113 34ZM180 17L186 17L183 27ZM210 17L216 17L213 27M280 24L286 " +
        "24L283 34ZM350 18L356 18L353 28Z",
      fill: "var(--inv-accent)",
    }),
    // The banner across the band, with its two tails and its folds.
    h("path", {
      key: "banner-tails",
      d: "M46 30L20 40L46 50ZM344 30L370 40L344 50Z",
      fill: "var(--inv-accent)",
      opacity: 0.85,
    }),
    ...collect({ name: "banner", d: "M46 28H344V50H46Z", fill: "var(--inv-decoration-two)" }),
    h("path", {
      key: "banner-folds",
      d: "M46 50L20 40V50ZM344 50L370 40V50Z",
      fill: "var(--inv-accent)",
      opacity: 0.45,
    }),
    h("path", {
      key: "banner-hem",
      d: "M46 30.5H344M46 47.5H344",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.2,
      opacity: 0.5,
    }),
    h("use", {
      key: "divider-crown",
      href: `#${id("crown")}`,
      fill: "var(--inv-accent)",
      transform: "translate(195 43) scale(1.35)",
    }),
    h("use", {
      key: "divider-crown-small",
      href: `#${id("crown")}`,
      fill: "var(--inv-accent)",
      opacity: 0.7,
      transform: "translate(112 42) scale(0.5)",
    }),
    h("use", {
      key: "divider-crown-small-right",
      href: `#${id("crown")}`,
      fill: "var(--inv-accent)",
      opacity: 0.7,
      transform: "translate(278 42) scale(0.5)",
    }),
    stamps(
      "divider-flowers",
      id,
      "flower",
      [
        { x: 74, y: 42, rotate: -10, scale: 1.05 },
        { x: 316, y: 42, rotate: 10, scale: 1.05 },
      ],
      "var(--inv-decoration-one)",
    ),
    stamps(
      "divider-stars",
      id,
      "sparkle",
      [
        { x: 168, y: 16, rotate: 8, scale: 0.55 },
        { x: 226, y: 14, rotate: -12, scale: 0.5 },
        { x: 146, y: 20, rotate: 20, scale: 0.35 },
      ],
      "var(--inv-decoration-two)",
      0.9,
    ),
  );

  return [sheetDefinitions(id, sheets), sparkleDefinition(id), stampDefinitions(id), ...body];
}

/** The footer: a torn band with a hedge, flowers, two round trees and the crowns of the garden. */
function footer(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 8, 7.4, FOOTER_HEIGHT + 8);
  const hedge = tornEdge(SCENE_WIDTH, 34, 2.6, FOOTER_HEIGHT + 8);

  sheets.push({ name: "hedge", d: hedge.sheet, fill: "var(--inv-accent)", shadow: false });

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    h("use", {
      key: "hedge-tint",
      href: `#${id("hedge")}`,
      fill: "var(--inv-accent)",
      opacity: 0.25,
    }),
    stamps(
      "footer-stars",
      id,
      "sparkle",
      [
        { x: 104, y: 18, rotate: 10, scale: 0.6 },
        { x: 148, y: 12, rotate: -8, scale: 0.45 },
        { x: 246, y: 12, rotate: 12, scale: 0.45 },
        { x: 292, y: 18, rotate: -10, scale: 0.6 },
      ],
      "var(--inv-decoration-two)",
      0.95,
    ),
    h("path", {
      key: "hedge-tops",
      d:
        "M-8 36C8 30 20 36 32 32C44 28 56 34 68 32C80 30 92 36 108 34C124 32 136 38 152 36C168 34 180 40 196 " +
        "38C212 36 224 42 240 40C256 38 268 44 284 42C300 40 312 46 328 42C344 38 356 42 372 38C382 36 390 38 398 36",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 2,
      opacity: 0.7,
      strokeLinecap: "round",
    }),
    stamps(
      "footer-flowers",
      id,
      "flower",
      [
        { x: 40, y: 42, rotate: -8, scale: 1 },
        { x: 82, y: 52, rotate: 6, scale: 0.85 },
        { x: 126, y: 44, rotate: -6, scale: 0.75 },
        { x: 264, y: 44, rotate: 8, scale: 0.75 },
        { x: 308, y: 52, rotate: -6, scale: 0.85 },
        { x: 352, y: 42, rotate: 8, scale: 1 },
      ],
      "var(--inv-decoration-one)",
    ),
    h(
      "g",
      { key: "footer-tree-left", transform: "translate(166 58) scale(0.55)" },
      h("use", { key: "tree", href: `#${id("tree")}`, fill: "var(--inv-accent)" }),
    ),
    h(
      "g",
      { key: "footer-tree-right", transform: "translate(226 58) scale(0.5)" },
      h("use", { key: "tree", href: `#${id("tree")}`, fill: "var(--inv-accent)" }),
    ),
    h("use", {
      key: "footer-crown",
      href: `#${id("crown")}`,
      fill: "var(--inv-decoration-two)",
      transform: "translate(196 50) scale(1.1)",
    }),
    h(
      "g",
      { key: "footer-birds" },
      h("path", {
        key: "birds",
        d: "M104 30C106 27 109 27 111 30C113 27 116 27 118 30M282 28C284 25 287 25 289 28C291 25 294 25 296 28",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1.2,
        opacity: 0.35,
        strokeLinecap: "round",
      }),
    ),
  );

  return [sheetDefinitions(id, sheets), sparkleDefinition(id), stampDefinitions(id), ...body];
}

/** «Princesa de cuento» in paper cut-out: the castle valley, the banner divider, and the garden footer. */
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
