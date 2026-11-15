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
 * «Dinosaurios» in paper cut-out (I3a; S1-S4, style 01 of `design/theme-illustrations/01-papel-recortado.html`):
 * a layered diorama for the header — a torn sheet of soft paper, far hills, a volcano, the friendly dinosaur
 * with its four plates, clouds, the sun, the ground with a trail of footprints, and fronds at both edges — a
 * torn divider that carries the footprint trail between two sections, and a footer strip.
 *
 * Original work: the shapes are our own splines and the dinosaur is a generic long-necked friend, never
 * character artwork, a logo, or a protected name (S5). Every color is a theme variable of `dinosaurs`, so the
 * whole drawing re-colours with its palette; tints are `opacity` on a theme color and nothing else.
 *
 * The artboard's volcano read as a lump behind the near hill, so it is redrawn here: a proper cone with a
 * crater notch, a lava tongue down its front, a lit ridge, and its own plume of paper smoke above the rim.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** The dinosaur's silhouette: one long spline from muzzle to tail, drawn once and filled as a cut sheet. */
const DINOSAUR =
  "M154 88C153.5 85.9 154.8 78.4 156 76C157.2 73.6 160.3 71.3 163 70C165.7 68.7 172.4 66.3 176 66C179.6 65.7 " +
  "186.8 66.7 190 68C193.2 69.3 198.1 73.3 200 76C201.9 78.7 202.4 84.8 204 88C205.6 91.2 209.6 97.1 212 100C214.4 " +
  "102.9 218.5 109.5 222 110C225.5 110.5 232.9 105.1 238 104C243.1 102.9 253.9 101.7 260 102C266.1 102.3 277.9 " +
  "104.7 284 106C290.1 107.3 300.9 112.3 306 112C311.1 111.7 317.5 105.9 322 104C326.5 102.1 335.5 98.4 340 98C344.5 " +
  "97.6 355.2 99.4 356 101C356.8 102.6 349.5 108 346 110C342.5 112 334.3 113.9 330 116C325.7 118.1 316.7 122.8 314 " +
  "126C311.3 129.2 311.1 136.5 310 140C308.9 143.5 306.5 148.5 306 152C305.5 155.5 308.4 164.1 306 166C303.6 167.9 " +
  "290.4 168.1 288 166C285.6 163.9 290.1 152.4 288 150C285.9 147.6 276.8 148.3 272 148C267.2 147.7 255.2 146.9 252 " +
  "148C248.8 149.1 248.5 153.6 248 156C247.5 158.4 250.4 164.7 248 166C245.6 167.3 232.4 167.9 230 166C227.6 164.1 " +
  "231.3 154.7 230 152C228.7 149.3 222.4 148.4 220 146C217.6 143.6 213.9 137.2 212 134C210.1 130.8 207.6 125.2 206 " +
  "122C204.4 118.8 201.6 112.9 200 110C198.4 107.1 195.9 102.4 194 100C192.1 97.6 188.9 93.1 186 92C183.1 90.9 175.5 " +
  "92 172 92C168.5 92 162.4 92.5 160 92C157.6 91.5 154.5 90.1 154 88Z";

/** The four plates along the dinosaur's back: four sizes, two tilts, each a separate cut sheet. */
const PLATES: readonly { readonly name: string; readonly d: string; readonly tilt: string }[] = [
  { name: "plate-near", d: "M238 107L242 95L246 100L250 107Z", tilt: "rotate(-6 244 106)" },
  { name: "plate-tall", d: "M252 105L258 87L263 96L267 105Z", tilt: "rotate(5 259 104)" },
  { name: "plate-mid", d: "M269 105L274 91L278 97L282 105Z", tilt: "rotate(-6 275 104)" },
  { name: "plate-far", d: "M284 107L288 97L291 102L295 108Z", tilt: "rotate(5 289 106)" },
];

/** The far ridge behind everything, and the two near hills the dinosaur stands between. */
const HILL_FAR =
  "M-8 152C-0.8 143.3 24.4 142.6 40 142C55.6 141.4 79.5 145.9 96 148C112.5 150.1 132.9 156 150 156C167.1 156 192 " +
  "148.3 210 148C228 147.7 252 154.3 270 154C288 153.7 311.1 146.3 330 146C348.9 145.7 386.1 143.9 396 152C405.9 " +
  "160.1 456.6 192.8 396 200C335.4 207.2 52.6 207.2 -8 200C-68.6 192.8 -15.2 160.7 -8 152Z";

const HILL_NEAR_LEFT =
  "M-8 164C-4.7 160.1 5.9 150.4 14 146C22.1 141.6 36.1 137 46 135C55.9 133 70.1 132.1 80 133C89.9 133.9 103.3 " +
  "137.7 112 141C120.7 144.3 131.4 150.4 138 155C144.6 159.6 177.9 169.4 156 172C134.1 174.6 16.6 173.2 -8 172C-32.6 " +
  "170.8 -11.3 167.9 -8 164Z";

const HILL_NEAR_RIGHT =
  "M236 172C239 169.6 248.2 160.2 256 156C263.8 151.8 278.4 146.4 288 144C297.6 141.6 310.7 139.7 320 140C329.3 " +
  "140.3 341.3 143.2 350 146C358.7 148.8 370.8 155.1 378 159C385.2 162.9 419.3 170 398 172C376.7 174 260.3 172 236 " +
  "172C211.7 172 233 174.4 236 172Z";

const GROUND =
  "M-8 172C-4.4 171.1 8.2 166.3 16 166C23.8 165.7 35.3 170.3 44 170C52.7 169.7 65 163.8 74 164C83 164.2 95 170.8 " +
  "104 171C113 171.2 125 165.2 134 165C143 164.8 154.7 170.2 164 170C173.3 169.8 186.4 163.8 196 164C205.6 164.2 " +
  "218.7 170.7 228 171C237.3 171.3 248.7 166 258 166C267.3 166 280.7 171.3 290 171C299.3 170.7 311 164.3 320 164C329 " +
  "163.7 341.3 168.8 350 169C358.7 169.2 371.1 164.7 378 165C384.9 165.3 393.3 170.1 396 171L396 202L-8 202Z";

const FRONDS = [
  {
    name: "frond-short-left",
    d:
      "M-11.3 207C-10.3 206.9 3.9 205 5.2 204.2C6.5 203.4 10.4 194.7 11.5 193.7C12.6 192.7 23.1 188.9 24.1 187.9C25.1 " +
      "186.9 27.3 176.9 28.1 175.8C28.9 174.7 37.9 169.6 38.6 168.4C39.3 167.2 39.9 156 40.5 154.7C41.1 153.4 48.3 " +
      "147.2 48.7 145.7C49.1 144.2 46.9 130 46.7 129C46.5 128 46.2 127.8 45.6 128.2C45 128.6 37.7 135.7 36.4 136.5C35.1 " +
      "137.3 23.9 140.5 22.8 141.5C21.7 142.5 18.6 151.8 17.6 152.8C16.6 153.9 7 158.4 6.2 159.5C5.4 160.6 3.8 171.1 " +
      "3.1 172.3C2.4 173.5 -5.6 179.2 -6.2 180.5C-6.8 181.8 -6.7 193.5 -7.1 195C-7.5 196.5 -12.2 205.5 -12.4 206.2C-12.6 " +
      "206.9 -12.3 207.1 -11.3 207Z",
  },
  {
    name: "frond-tall-left",
    d:
      "M1.2 208.6C2.1 208.9 15.2 212.2 16.6 212C18 211.8 24.1 204.9 25.3 204.4C26.5 203.9 36.8 203.7 37.9 203C39 202.3 " +
      "43.6 193.3 44.6 192.4C45.6 191.5 54.4 189.2 55.3 188C56.2 186.8 59 173.6 59.2 172.6C59.4 171.6 59.1 171.3 58.4 " +
      "171.5C57.7 171.7 49.2 175.7 47.8 175.9C46.4 176.1 35.5 175.2 34.3 175.7C33.1 176.2 27.7 184.2 26.6 184.9C25.5 " +
      "185.6 15.9 186.8 14.9 187.7C13.9 188.6 9.9 198.7 9.1 199.9C8.3 201.1 0.9 207 0.4 207.5C-0.1 208 0.3 208.3 1.2 208.6Z",
  },
  {
    name: "frond-tall-right",
    d:
      "M394.7 209C394.8 208 396.5 193.4 396.1 191.9C395.7 190.4 388.1 184 387.4 182.6C386.7 181.2 385.7 169.9 384.9 " +
      "168.6C384.1 167.3 374.9 162.2 374 161C373.1 159.8 370.4 149.7 369.4 148.6C368.4 147.5 357.6 143.6 356.4 142.6C355.2 " +
      "141.6 351 132.7 349.6 131.9C348.2 131.1 333.8 129.1 332.7 129C331.6 128.9 331.3 129.1 331.6 129.8C331.9 130.5 337.1 " +
      "139.8 337.5 141.3C337.9 142.8 338.2 154.8 338.9 156.2C339.6 157.6 348 163.3 348.8 164.6C349.6 165.9 351.5 176.6 " +
      "352.4 177.8C353.3 179 363.3 183.5 364.3 184.6C365.3 185.7 368.8 195.2 369.9 196.2C371 197.2 382.6 200.5 384 201.3C385.4 " +
      "202.1 393 209.4 393.6 209.8C394.2 210.2 394.6 210 394.7 209Z",
  },
  {
    name: "frond-short-right",
    d:
      "M387.1 211.3C387 210.4 385.9 198.5 385.3 197.5C384.7 196.5 377.2 194.7 376.4 193.9C375.6 193.1 372.8 184.7 371.9 " +
      "184.1C371 183.5 362.1 183.8 361.1 183.3C360.1 182.8 355.9 176.4 354.7 176.2C353.5 176 341.9 179 341.1 179.3C340.3 " +
      "179.6 339.9 180.1 340.3 180.5C340.7 180.9 346.7 185.7 347.3 186.7C347.9 187.7 350.1 197.1 350.9 197.9C351.7 198.7 " +
      "359.9 199.5 360.8 200.1C361.7 200.7 365.3 208 366.3 208.5C367.3 209 376.8 207.9 378 208.1C379.2 208.3 385.8 212.3 " +
      "386.3 212.5C386.8 212.7 387.2 212.2 387.1 211.3Z",
  },
] as const;

/** The sun: a hand-cut disc, not a perfect circle, at the top right of the diorama. */
const SUN =
  "M322 28C325.5 27.6 333.2 28.9 336 31C338.8 33.1 342.5 40.3 343 44C343.5 47.7 342.3 56.2 340 59C337.7 61.8 329.9 " +
  "64.7 326 65C322.1 65.3 313.9 63.3 311 61C308.1 58.7 304.1 51.6 304 48C303.9 44.4 307.6 36.7 310 34C312.4 31.3 " +
  "318.5 28.4 322 28Z";

/** Two paper clouds above the far hills, the lower one larger. */
const CLOUD_LOW =
  "M38 86C37.2 84.3 39.4 78 41 76C42.6 74 47.3 71.3 50 71C52.7 70.7 59 72.5 61 74C63 75.5 65.3 80.1 65 82C64.7 83.9 " +
  "61.4 87.1 59 88C56.6 88.9 49.8 89.3 47 89C44.2 88.7 38.8 87.7 38 86Z";

const CLOUD_HIGH =
  "M58 68C57.7 66 60.9 59.7 63 58C65.1 56.3 71.2 54.7 74 55C76.8 55.3 82.5 58.1 84 60C85.5 61.9 86.1 67.1 85 69C83.9 " +
  "70.9 78.7 73.5 76 74C73.3 74.5 67.4 73.8 65 73C62.6 72.2 58.3 70 58 68Z";

/** The volcano: two crater rims with a dip between them, and a wide skirt down to the hills. */
const VOLCANO =
  "M2 152C14 150.5 22 144 30 135C34 130 38 118 40 104L44 108L47 112L51 107L54 103C62 116 74 134 90 143C97 147 " +
  "105 150 112 152Z";

/** The lava tongue: from the crater dip down the front of the cone. */
const LAVA = "M44 108L49 119L45.5 117L42 125L38.5 115L41 108Z";

/** The lit ridge of the cone, a hairline the eye follows up to the rim. */
const VOLCANO_RIDGE = "M47 112C44 123 39 135 32 146";

/** Where a footprint lands: at four angles and two sizes, so the trail reads as a walk, not a stamp. */
interface Footprint {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

const SCENE_TRAIL: readonly Footprint[] = [
  { x: 62, y: 190, rotate: -13, scale: 1.05 },
  { x: 94, y: 184, rotate: 5, scale: 1 },
  { x: 126, y: 188, rotate: -7, scale: 1.1 },
  { x: 158, y: 181, rotate: 9, scale: 1 },
];

const DIVIDER_TRAIL: readonly Footprint[] = [
  { x: 62, y: 42, rotate: -12, scale: 1.05 },
  { x: 96, y: 44, rotate: 6, scale: 1.05 },
  { x: 130, y: 46, rotate: -8, scale: 1.05 },
  { x: 164, y: 47, rotate: 9, scale: 1.05 },
  { x: 198, y: 46, rotate: -6, scale: 1.05 },
  { x: 232, y: 44, rotate: 7, scale: 1.05 },
];

const FOOTER_TRAIL: readonly Footprint[] = [
  { x: 58, y: 40, rotate: -12, scale: 1.1 },
  { x: 94, y: 44, rotate: 6, scale: 1 },
  { x: 130, y: 40, rotate: -8, scale: 1.15 },
  { x: 166, y: 45, rotate: 9, scale: 1 },
  { x: 202, y: 41, rotate: -5, scale: 1.1 },
  { x: 238, y: 44, rotate: 7, scale: 1 },
];

/** The four-toe print, defined once and placed along a trail. */
function footprints(
  id: IllustrationId,
  prints: readonly Footprint[],
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key: "footprint-trail", fill: paint, opacity },
    prints.map((print) =>
      h("use", {
        key: `${print.x}-${print.y}`,
        href: `#${id("foot")}`,
        transform: `translate(${print.x} ${print.y}) rotate(${print.rotate}) scale(${print.scale})`,
      }),
    ),
  );
}

/** The footprint shape itself: one heel pad and three toes, with the outer toes splayed. Defined, never drawn. */
function footprintDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "footprint-definition" },
    h(
      "g",
      { id: id("foot") },
      h("ellipse", { key: "heel", cx: 0, cy: 2.6, rx: 2.9, ry: 2.7 }),
      h("ellipse", {
        key: "toe-left",
        cx: -3.9,
        cy: -2.6,
        rx: 1.9,
        ry: 3,
        transform: "rotate(-26 -3.9 -2.6)",
      }),
      h("ellipse", { key: "toe-middle", cx: 0, cy: -4.4, rx: 2, ry: 3.2 }),
      h("ellipse", {
        key: "toe-right",
        cx: 3.9,
        cy: -2.6,
        rx: 1.9,
        ry: 3,
        transform: "rotate(26 3.9 -2.6)",
      }),
    ),
  );
}

/** The header diorama: the torn sheet and everything that stands on it, back to front. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 1.7, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const sun: CutSheet = { name: "sun", d: SUN, fill: "var(--inv-surface)" };
  const hillFar: CutSheet = { name: "hill-far", d: HILL_FAR, fill: "var(--inv-decoration-two)" };
  const cloudLow: CutSheet = { name: "cloud-low", d: CLOUD_LOW, fill: "var(--inv-surface)" };
  const cloudHigh: CutSheet = { name: "cloud-high", d: CLOUD_HIGH, fill: "var(--inv-surface)" };
  const volcano: CutSheet = {
    name: "volcano",
    d: VOLCANO,
    fill: "var(--inv-ink)",
    outline: true,
  };
  const lava: CutSheet = {
    name: "lava",
    d: LAVA,
    fill: "var(--inv-decoration-one)",
    shadow: false,
  };
  const hillLeft: CutSheet = {
    name: "hill-left",
    d: HILL_NEAR_LEFT,
    fill: "var(--inv-decoration-two)",
  };
  const hillRight: CutSheet = {
    name: "hill-right",
    d: HILL_NEAR_RIGHT,
    fill: "var(--inv-decoration-two)",
  };
  const dinosaur: CutSheet = {
    name: "dinosaur",
    d: DINOSAUR,
    fill: "var(--inv-decoration-one)",
    outline: true,
  };
  const plates: readonly CutSheet[] = PLATES.map((plate) => ({
    name: plate.name,
    d: plate.d,
    fill: "var(--inv-decoration-two)",
    outline: true,
    transform: plate.tilt,
  }));
  const ground: CutSheet = {
    name: "ground",
    d: GROUND,
    fill: "var(--inv-accent)",
    shadow: false,
  };
  const fronds: readonly CutSheet[] = FRONDS.map((frond) => ({
    name: frond.name,
    d: frond.d,
    fill: "var(--inv-decoration-two)",
    outline: true,
  }));
  const sheets: readonly CutSheet[] = [
    sheet,
    sun,
    hillFar,
    cloudLow,
    cloudHigh,
    volcano,
    lava,
    hillLeft,
    hillRight,
    dinosaur,
    ...plates,
    ground,
    ...fronds,
  ];

  return [
    sheetDefinitions(id, sheets),
    footprintDefinition(id),
    // Bottom layer: the torn paper sheet and its lighter tear line.
    ...cutSheets(id, [sheet]),
    h("use", {
      key: "torn-line",
      href: `#${id(sheet.name)}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.38,
    }),
    // The sun: its own warmer disc behind, then the paper disc with the shadow every sheet casts.
    h("use", {
      key: "sun-halo",
      href: `#${id(sun.name)}`,
      fill: "var(--inv-decoration-one)",
      transform: "translate(6 -6)",
    }),
    ...cutSheets(id, [sun, hillFar, cloudLow, cloudHigh]),
    // The volcano: cone, lava tongue, plume above the rim, and the lit ridge on the way up.
    ...cutSheets(id, [volcano]),
    h("use", { key: "lava-fill", href: `#${id(lava.name)}`, fill: lava.fill }),
    h(
      "g",
      { key: "plume", fill: "var(--inv-surface)", opacity: 0.62 },
      h("circle", { key: "puff-near", cx: 47, cy: 97, r: 4.5 }),
      h("circle", { key: "puff-far", cx: 41, cy: 89, r: 3.2 }),
    ),
    h("path", {
      key: "volcano-ridge",
      d: VOLCANO_RIDGE,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      opacity: 0.22,
    }),
    ...cutSheets(id, [hillLeft, hillRight, dinosaur, ...plates]),
    // The dinosaur's face: a soft cheek, a white eye with its pupil, a nostril, and a smile.
    h("circle", { key: "cheek", cx: 173, cy: 86, r: 5, fill: "var(--inv-soft)", opacity: 0.5 }),
    h("circle", { key: "eye", cx: 188, cy: 78, r: 7, fill: "var(--inv-surface)" }),
    h("circle", { key: "pupil", cx: 186.2, cy: 78.6, r: 3.2, fill: "var(--inv-ink)" }),
    h("circle", { key: "nostril", cx: 160, cy: 84, r: 1.5, fill: "var(--inv-ink)" }),
    h("path", {
      key: "smile",
      d: "M161 87c4 3.6 9.5 4.2 14 2.6",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.9,
      strokeLinecap: "round",
    }),
    ...cutSheets(id, [ground]),
    footprints(id, SCENE_TRAIL, "var(--inv-surface)", 0.92),
    ...cutSheets(id, fronds),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn strip of paper carrying the footprint trail from one section to the next. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 34, 3.1, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 44, 5.4, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    footprintDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    // The lower strip, tinted with the accent instead of drawn in a second color.
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.28,
    }),
    // Grass blades at the right end, drawn with the accent so the strip is not one flat band.
    h("path", {
      key: "blade-a",
      d: "M330 46C324 38 316 32 306 28 316 27 326 32 332 38 336 41 334 45 330 46Z",
      fill: "var(--inv-accent)",
      opacity: 0.55,
    }),
    h("path", {
      key: "blade-b",
      d: "M338 46C336 37 338 29 344 23 344 32 343 39 341 46Z",
      fill: "var(--inv-accent)",
      opacity: 0.45,
    }),
    h("path", {
      key: "blade-c",
      d: "M348 46C350 39 356 33 365 30 358 38 352 43 351 47Z",
      fill: "var(--inv-accent)",
      opacity: 0.35,
    }),
    footprints(id, DIVIDER_TRAIL, "var(--inv-accent)", 0.5),
  ];
}

/** The footer: a torn strip with frond tips at both ends and the trail running out of the page. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 11, 7.6, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 45, 2.3, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    footprintDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    // The accent wash under the strip, a tint of the theme accent rather than a second color.
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-accent)",
      opacity: 0.18,
    }),
    h("path", {
      key: "leaf-left-broad",
      d: "M8 12C22 16 34 26 40 42 26 38 14 28 6 14Z",
      fill: "var(--inv-accent)",
      opacity: 0.4,
    }),
    h("path", {
      key: "leaf-left-narrow",
      d: "M22 11C31 19 36 30 36 44 30 35 25 24 18 13Z",
      fill: "var(--inv-accent)",
      opacity: 0.28,
    }),
    h("path", {
      key: "leaf-right-broad",
      d: "M382 12C368 16 356 26 350 42 364 38 376 28 384 14Z",
      fill: "var(--inv-accent)",
      opacity: 0.4,
    }),
    h("path", {
      key: "leaf-right-narrow",
      d: "M368 11C359 19 354 30 354 44 360 35 365 24 372 13Z",
      fill: "var(--inv-accent)",
      opacity: 0.28,
    }),
    footprints(id, FOOTER_TRAIL, "var(--inv-surface)", 0.85),
  ];
}

/** «Dinosaurios» in paper cut-out: the header diorama, the footprint divider, and the footer trail. */
export const DINOSAURS_ILLUSTRATION: ThemeIllustration = {
  theme: "dinosaurs",
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
