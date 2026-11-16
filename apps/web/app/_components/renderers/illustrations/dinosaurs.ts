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
 * «Dinosaurios» in paper cut-out (I4b; S3, S5), after the technique of `design/theme-illustrations/
 * 01-papel-recortado.html`: a layered diorama for the header — a torn sheet of soft paper, far hills, a
 * volcano with its plume and embers, two palms framing the edges and party bunting strung between them, three
 * distant flying reptiles, a cycad layer, the friendly dinosaur with a spotted hide and its plates, a baby
 * dinosaur beside a nest of spotted eggs, rocks, the ground with a trail of footprints, and fronds at both
 * edges — a torn divider that carries the footprint trail, a nest and a sprout between two sections, and a
 * footer strip with the nest and the trail running out of the page.
 *
 * Original work: every shape is our own spline, and the dinosaurs are generic long-necked friends — never
 * character artwork, a logo, or a protected name (S3). The palms, the nest, the bunting and the flying reptiles
 * are generic prehistoric props. Every color is a theme variable of `dinosaurs`, so the whole drawing
 * re-colours with its palette; tints are `opacity` on a theme color, and the only fill that is not a plain
 * theme color is a pattern built from theme colors, referenced by an id the frame makes unique.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** One placed stamp: where it sits, how far it turns, how big it is. */
interface Place {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

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

/** The lit inner facet of each plate, so a plate is two pieces of paper and not one triangle. */
const PLATE_FACETS =
  "M242 100L246 100L244 104ZM258 92L263 96L259 99ZM274 95L278 97L275 100ZM288 100L291 102L289 105Z";

/** The baby dinosaur, drawn from the same silhouette and placed at a child's scale. */
const BABY_SCALE = 0.42;
const BABY_PLACE = "translate(31 102)";

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

/** The four paper plants at the bottom corners, drawn as torn, pointed leaves. */
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

/** The sun: a hand-cut disc between the bunting and the right palm. */
const SUN =
  "M204 14C214 13.6 223 20.6 224.5 31C226 41.4 217 50 206 50.4C195 50.8 186 43 185.5 32C185 21 194 14.4 204 14Z";

/** Two paper clouds, each built from a cut disc and a torn cap. */
const CLOUD_NEAR =
  "M302 30C300.8 26.4 305 21.4 309.4 20C313.8 18.6 320.4 19.4 322.6 22.4C324.8 25.4 324 30 321 32.4C318 " +
  "34.8 311 35.2 307.4 33.6C304.6 32.4 302.6 31.6 302 30Z";

const CLOUD_FAR =
  "M121 52C119.4 47.6 124.4 41.4 129.6 39.6C134.8 37.8 143 38.8 145.4 42.4C147.8 46 146.6 51.6 143.2 " +
  "54.4C139.8 57.2 131 57.8 126.6 56C123.2 54.6 121.6 53.6 121 52Z";

/** A distant flying reptile: two long wings and a small crested head, seen only as a silhouette. */
const FLYING_REPTILE = "M-17 3C-11 -4 -4 -6 0 -1C4 -6 11 -4 17 3C10 0 4 2 0 4C-4 2 -10 0 -17 3Z";
const FLYING_REPTILE_HEAD = "M0 4L-3 8L2 7L4 4Z";

/** The volcano: two crater rims with a dip between them, and a wide skirt down to the hills. */
const VOLCANO =
  "M2 152C14 150.5 22 144 30 135C34 130 38 118 40 104L44 108L47 112L51 107L54 103C62 116 74 134 90 143C97 147 " +
  "105 150 112 152Z";

/** The lava tongue: from the crater dip down the front of the cone. */
const LAVA = "M44 108L49 119L45.5 117L42 125L38.5 115L41 108Z";

/** The lit ridge of the cone, a hairline the eye follows up to the rim. */
const VOLCANO_RIDGE = "M47 112C44 123 39 135 32 146";

/** The plume: five puffs rising off the rim, the far ones smaller and paler. */
const PLUME: readonly {
  readonly key: string;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly o: number;
}[] = [
  { key: "puff-near", cx: 47, cy: 99, r: 6.4, o: 0.62 },
  { key: "puff-left", cx: 39, cy: 89, r: 5.6, o: 0.56 },
  { key: "puff-right", cx: 52, cy: 81, r: 6.8, o: 0.52 },
  { key: "puff-high", cx: 43, cy: 70, r: 5.4, o: 0.42 },
  { key: "puff-top", cx: 50, cy: 59, r: 4.6, o: 0.32 },
];

/** A palm leaf: the blade, and the midrib that folds it. */
const PALM_FROND = "M0 0C11 -9 26 -12 41 -8C28 1 13 5 0 0Z";
const PALM_MIDRIB = "M2 -0.4C13 -4 26 -6 39 -7";

/** The two trunks, one leaning in from each edge, and the rings that age them. */
const PALM_TRUNK_LEFT =
  "M14 176C18 148 22 118 32 94C37 82 42 72 48 66L62 74C54 82 48 94 44 108C36 132 32 154 31 176Z";
const PALM_TRUNK_RIGHT =
  "M376 176C372 148 368 118 358 94C353 82 348 72 344 66L330 74C338 82 344 94 348 108C356 132 360 154 361 176Z";

/** The trunk sheets are defined with the scene sheets, so one definition serves both palms. */
const PALM_TRUNKS: readonly CutSheet[] = [
  {
    name: "palm-trunk-left",
    d: PALM_TRUNK_LEFT,
    fill: "var(--inv-decoration-two)",
    outline: true,
  },
  {
    name: "palm-trunk-right",
    d: PALM_TRUNK_RIGHT,
    fill: "var(--inv-decoration-two)",
    outline: true,
  },
];
const PALM_RINGS =
  "M18 160C24 158 28 158 33 160M20 146C26 144 30 144 35 146M23 132C29 130 33 130 38 132" +
  "M357 160C362 158 366 158 372 160M355 146C360 144 364 144 370 146M352 132C357 130 361 130 366 132";

/** The crown's fronds: nine angles from the left to the right of the trunk. */
const CROWN_ANGLES: readonly number[] = [-150, -115, -80, -45, -8, 30, 70, 110];

/** A rock: the shape and the lit facet the low sun catches. */
const ROCK = "M0 0L7 -13L19 -16L31 -5L33 0Z";
const ROCK_FACET = "M7 -13L19 -16L20 -7L9 -5Z";

/** The nest: a bowl of twigs, and the woven line across it. */
const NEST = "M-36 0C-34 -13 -20 -22 0 -22C20 -22 34 -13 36 0Z";
const NEST_WEAVE =
  "M-33 -3C-22 -11 22 -11 33 -3M-27 -10C-16 -16 16 -16 27 -10M-14 -17C-5 -19 5 -19 14 -17";

/** The eggs in the nest: three ellipses, each turned a little, filled with the spotted pattern. */
const NEST_EGGS: readonly Place[] = [
  { x: -17, y: -13, rotate: -8, scale: 1 },
  { x: -3, y: -16, rotate: 3, scale: 1.06 },
  { x: 11, y: -13, rotate: -3, scale: 0.96 },
];

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

/** The new-born prints at the nest: two small prints, the baby's own. */
const NEST_PRINTS: readonly Footprint[] = [
  { x: 104, y: 180, rotate: -10, scale: 0.6 },
  { x: 118, y: 186, rotate: 8, scale: 0.55 },
];

/** Party confetti: small cut squares and dots scattered over the ground, in three paints. */
const CONFETTI: readonly {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly paint: ThemePaint;
}[] = [
  { x: 140, y: 60, rotate: 18, paint: "var(--inv-decoration-one)" },
  { x: 118, y: 78, rotate: -24, paint: "var(--inv-surface)" },
  { x: 176, y: 50, rotate: 40, paint: "var(--inv-decoration-two)" },
  { x: 296, y: 66, rotate: -16, paint: "var(--inv-decoration-one)" },
  { x: 320, y: 82, rotate: 28, paint: "var(--inv-surface)" },
  { x: 344, y: 112, rotate: -8, paint: "var(--inv-decoration-two)" },
  { x: 84, y: 112, rotate: 12, paint: "var(--inv-decoration-one)" },
  { x: 236, y: 74, rotate: -30, paint: "var(--inv-decoration-two)" },
];

/**
 * The two patterns of the scene: the dinosaur's spots, and the spots on the eggs. Both are built only from
 * theme colors, both are painted as the fill of a theme-colored sheet, and both get their id from the frame.
 */
function patternDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "pattern-definitions" },
    h(
      "pattern",
      {
        key: "dino-spots",
        id: id("dino-spots"),
        width: 18,
        height: 15,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(9)",
      },
      h("circle", {
        key: "spot-far",
        cx: 4,
        cy: 4,
        r: 2.6,
        fill: "var(--inv-decoration-two)",
        opacity: 0.8,
      }),
      h("circle", {
        key: "spot-near",
        cx: 13,
        cy: 10,
        r: 1.6,
        fill: "var(--inv-surface)",
        opacity: 0.65,
      }),
    ),
    h(
      "pattern",
      {
        key: "egg-spots",
        id: id("egg-spots"),
        width: 9,
        height: 9,
        patternUnits: "userSpaceOnUse",
      },
      h("rect", {
        key: "egg-base",
        width: 9,
        height: 9,
        fill: "var(--inv-surface)",
      }),
      h("circle", {
        key: "egg-spot-a",
        cx: 2.6,
        cy: 2.6,
        r: 1.3,
        fill: "var(--inv-decoration-one)",
        opacity: 0.9,
      }),
      h("circle", {
        key: "egg-spot-b",
        cx: 6.4,
        cy: 6.4,
        r: 0.9,
        fill: "var(--inv-accent)",
        opacity: 0.7,
      }),
    ),
  );
}

/** The four-toe print, defined once and placed along a trail. */
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

/** The palm leaf, the flying reptile, and the confetti stamp, each defined once and placed many times. */
function sceneDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "scene-definitions" },
    h("path", { key: "frond", id: id("palm-frond"), d: PALM_FROND }),
    h("path", { key: "midrib", id: id("palm-midrib"), d: PALM_MIDRIB }),
    h(
      "g",
      { key: "reptile", id: id("reptile") },
      h("path", { key: "wings", d: FLYING_REPTILE }),
      h("path", { key: "head", d: FLYING_REPTILE_HEAD }),
    ),
    h("path", { key: "confetti-square", id: id("confetti"), d: "M-2-2H2V2H-2Z" }),
  );
}

/** The four-toe prints along a trail. */
function footprints(
  key: string,
  id: IllustrationId,
  prints: readonly Footprint[],
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    prints.map((print) =>
      h("use", {
        key: `${print.x}-${print.y}`,
        href: `#${id("foot")}`,
        transform: `translate(${print.x} ${print.y}) rotate(${print.rotate}) scale(${print.scale})`,
      }),
    ),
  );
}

/** The flying reptiles, small and half transparent, so they read as far away. */
function flyingReptiles(id: IllustrationId, places: readonly Place[]): ReactElement {
  return h(
    "g",
    { key: "flying-reptiles", fill: "var(--inv-ink)", opacity: 0.34 },
    places.map((place) =>
      h("use", {
        key: `reptile-${place.x}-${place.y}`,
        href: `#${id("reptile")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

/**
 * One palm: a shadowed trunk, then the crown. The crown is drawn twice — once as one ink silhouette shifted
 * by the paper shadow, once in its own colors — so ten leaves do not cost ten shadows in the markup.
 */
function palm(id: IllustrationId, side: "left" | "right"): ReactElement[] {
  const trunk = PALM_TRUNKS[side === "left" ? 0 : 1] as CutSheet;
  const crownX = side === "left" ? 52 : 346;
  const crownY = side === "left" ? 64 : 62;
  const flip = side === "left" ? 1 : -1;
  const at = `translate(${crownX} ${crownY}) scale(${flip} 1)`;

  const leaves = (key: string, extra: Record<string, unknown>): ReactElement =>
    h(
      "g",
      { key, transform: at, ...extra },
      CROWN_ANGLES.map((angle, index) =>
        h("use", {
          key: `leaf-${index}`,
          href: `#${id("palm-frond")}`,
          transform: `rotate(${angle}) scale(${0.6 + (index % 3) * 0.05})`,
        }),
      ),
    );

  return [
    ...cutSheets(id, [trunk]),
    h("path", {
      key: `rings-${side}`,
      d: PALM_RINGS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      opacity: 0.28,
    }),
    h(
      "g",
      {
        key: `crown-shadow-${side}`,
        fill: "var(--inv-ink)",
        opacity: 0.12,
        transform: `translate(1.1 3.4) ${at}`,
      },
      CROWN_ANGLES.map((angle, index) =>
        h("use", {
          key: `shadow-leaf-${index}`,
          href: `#${id("palm-frond")}`,
          transform: `rotate(${angle}) scale(${0.6 + (index % 3) * 0.05})`,
        }),
      ),
    ),
    leaves(`crown-${side}`, { fill: "var(--inv-decoration-two)" }),
    h(
      "g",
      {
        key: `crown-lift-${side}`,
        transform: at,
        fill: "none",
        stroke: "var(--inv-accent)",
        strokeWidth: 1,
        opacity: 0.4,
        strokeLinecap: "round",
      },
      CROWN_ANGLES.filter((_, index) => index % 2 === 0).map((angle, index) =>
        h("use", {
          key: `midrib-${index}`,
          href: `#${id("palm-midrib")}`,
          transform: `rotate(${angle}) scale(${0.6 + (index % 3) * 0.05})`,
        }),
      ),
    ),
  ];
}

/** A clump of cycad leaves standing in the grass: the same leaves, short and splayed. */
function cycad(id: IllustrationId, key: string, x: number, y: number, scale: number): ReactElement {
  const angles = [-148, -104, -58, -8, 46, 106];

  return h(
    "g",
    {
      key,
      transform: `translate(${x} ${y}) scale(${scale})`,
      fill: "var(--inv-accent)",
      opacity: 0.85,
    },
    angles.map((angle, index) =>
      h("use", {
        key: `cycad-leaf-${index}`,
        href: `#${id("palm-frond")}`,
        transform: `rotate(${angle}) scale(${0.44 + (index % 3) * 0.06})`,
      }),
    ),
  );
}

/** The nest with its spotted eggs; one helper for the scene, the divider, and the footer. */
function nestWithEggs(
  id: IllustrationId,
  key: string,
  x: number,
  y: number,
  scale: number,
  eggs: readonly Place[],
): ReactElement {
  return h(
    "g",
    { key, transform: `translate(${x} ${y}) scale(${scale})` },
    eggs.map((egg, index) =>
      h("ellipse", {
        key: `egg-${index}`,
        cx: egg.x,
        cy: egg.y,
        rx: 7 * egg.scale,
        ry: 9 * egg.scale,
        transform: `rotate(${egg.rotate} ${egg.x} ${egg.y})`,
        style: { fill: `url(#${id("egg-spots")})` },
        stroke: "var(--inv-ink)",
        strokeWidth: 0.8,
        strokeOpacity: 0.25,
      }),
    ),
    h("path", { key: "nest", d: NEST, fill: "var(--inv-ink)" }),
    h("path", {
      key: "nest-weave",
      d: NEST_WEAVE,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      opacity: 0.34,
    }),
  );
}

/** Three rocks in the grass, the two smaller ones behind the larger one. */
function rocks(key: string, places: readonly Place[], paint: ThemePaint): ReactElement {
  return h(
    "g",
    { key },
    places.map((place) =>
      h(
        "g",
        {
          key: `rock-${place.x}-${place.y}`,
          transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
        },
        h("path", { key: "rock", d: ROCK, fill: paint }),
        h("path", { key: "facet", d: ROCK_FACET, fill: "var(--inv-surface)", opacity: 0.34 }),
      ),
    ),
  );
}

/** The confetti, cut squares turned at different angles over the air of the scene. */
function confetti(key: string, id: IllustrationId, places: typeof CONFETTI): ReactElement {
  return h(
    "g",
    { key },
    places.map((piece) =>
      h("use", {
        key: `confetti-${piece.x}-${piece.y}`,
        href: `#${id("confetti")}`,
        fill: piece.paint,
        opacity: 0.85,
        transform: `translate(${piece.x} ${piece.y}) rotate(${piece.rotate})`,
      }),
    ),
  );
}

/** The party bunting: a string between the two palms, and nine pennants hanging from it. */
function bunting(): ReactElement[] {
  const start = { x: 52, y: 38 };
  const control = { x: 200, y: 66 };
  const end = { x: 346, y: 38 };
  const paints: readonly ThemePaint[] = [
    "var(--inv-decoration-one)",
    "var(--inv-surface)",
    "var(--inv-accent)",
    "var(--inv-decoration-two)",
  ];
  const pennants: ReactElement[] = [];

  // The string, as one curve from palm to palm.
  const string = `M${start.x} ${start.y}Q${control.x} ${control.y} ${end.x} ${end.y}`;

  for (let index = 1; index <= 9; index += 1) {
    const t = index / 10;
    const inverse = 1 - t;
    const x = inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x;
    const y = inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y;
    const paint = paints[index % paints.length] as ThemePaint;

    pennants.push(
      h("path", {
        key: `pennant-${index}`,
        d: `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + 8).toFixed(1)} ${y.toFixed(1)}L${(x + 4).toFixed(1)} ${(y + 10).toFixed(1)}Z`,
        fill: paint,
        opacity: 0.95,
      }),
    );
  }

  return [
    h("path", {
      key: "bunting-string",
      d: string,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.1,
      opacity: 0.55,
      strokeLinecap: "round",
    }),
    h("g", { key: "bunting-pennants" }, pennants),
  ];
}

/** The header diorama: torn sheet, sky, volcano, plants, the two dinosaurs, and the party. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 1.7, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const sun: CutSheet = { name: "sun", d: SUN, fill: "var(--inv-decoration-one)" };
  const hillFar: CutSheet = { name: "hill-far", d: HILL_FAR, fill: "var(--inv-decoration-two)" };
  const cloudNear: CutSheet = { name: "cloud-near", d: CLOUD_NEAR, fill: "var(--inv-surface)" };
  const cloudFar: CutSheet = {
    name: "cloud-far",
    d: CLOUD_FAR,
    fill: "var(--inv-surface)",
    transform: "translate(34 -14)",
  };
  const volcano: CutSheet = {
    name: "volcano",
    d: VOLCANO,
    fill: "var(--inv-ink)",
    outline: true,
    transform: "translate(44 0)",
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
  const ground: CutSheet = { name: "ground", d: GROUND, fill: "var(--inv-accent)", shadow: false };
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
    cloudNear,
    cloudFar,
    volcano,
    lava,
    hillLeft,
    hillRight,
    dinosaur,
    ...plates,
    ...PALM_TRUNKS,
    ground,
    ...fronds,
  ];

  return [
    sheetDefinitions(id, sheets),
    footprintDefinition(id),
    sceneDefinitions(id),
    patternDefinitions(id),
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
      fill: "var(--inv-decoration-two)",
      transform: "translate(5 -5)",
    }),
    h("path", {
      key: "sun-rays",
      d: "M204 11V4M204 53V60M182 32H175M226 32H233M188.4 16.4L183.4 11.4M219.6 16.4L224.6 11.4M188.4 47.6L183.4 52.6M219.6 47.6L224.6 52.6",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      opacity: 0.5,
    }),
    ...cutSheets(id, [sun]),
    ...cutSheets(id, [hillFar, cloudNear, cloudFar]),
    // The far ridge is the paper seen through warm air, so the near hills stand in front of it.
    h("use", {
      key: "hill-far-veil",
      href: `#${id(hillFar.name)}`,
      fill: "var(--inv-surface)",
      opacity: 0.22,
    }),
    flyingReptiles(id, [
      { x: 66, y: 46, rotate: -6, scale: 0.56 },
      { x: 152, y: 24, rotate: 4, scale: 0.4 },
      { x: 300, y: 68, rotate: -10, scale: 0.46 },
    ]),
    // The volcano: cone, lava tongue, plume above the rim, and the lit ridge on the way up.
    ...cutSheets(id, [volcano]),
    h(
      "g",
      { key: "volcano-detail", transform: "translate(44 0)" },
      h("use", { key: "lava-fill", href: `#${id(lava.name)}`, fill: lava.fill }),
      h(
        "g",
        { key: "plume", fill: "var(--inv-surface)" },
        PLUME.map((puff) =>
          h("circle", { key: puff.key, cx: puff.cx, cy: puff.cy, r: puff.r, opacity: puff.o }),
        ),
      ),
      h(
        "g",
        { key: "plume-ash", fill: "var(--inv-ink)", opacity: 0.4 },
        [
          { key: "ash-a", cx: 60, cy: 58, r: 1.4 },
          { key: "ash-b", cx: 37, cy: 60, r: 1.1 },
          { key: "ash-c", cx: 66, cy: 70, r: 0.9 },
        ].map((ash) => h("circle", { key: ash.key, cx: ash.cx, cy: ash.cy, r: ash.r })),
      ),
      h("circle", {
        key: "ember",
        cx: 49,
        cy: 106,
        r: 1.8,
        fill: "var(--inv-decoration-one)",
        opacity: 0.9,
      }),
      h("path", {
        key: "volcano-ridge",
        d: VOLCANO_RIDGE,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.2,
        opacity: 0.22,
      }),
    ),
    ...cutSheets(id, [hillLeft, hillRight]),
    // The mid-ground plants: cycads on the far bank, before the animals take the stage.
    cycad(id, "cycad-far-left", 118, 152, 1),
    // The party: bunting between the palms, behind the dinosaur so the pennants never cross its face.
    ...bunting(),
    confetti("confetti-scene", id, CONFETTI),
    // The big friend: spotted hide, plates, belly light, toes, and a face.
    ...cutSheets(id, [dinosaur, ...plates]),
    h("use", {
      key: "dinosaur-spots",
      href: `#${id("dinosaur")}`,
      style: { fill: `url(#${id("dino-spots")})` },
    }),
    h("path", { key: "plate-facets", d: PLATE_FACETS, fill: "var(--inv-surface)", opacity: 0.36 }),
    h(
      "g",
      {
        key: "dinosaur-scales",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.2,
        strokeLinecap: "round",
        opacity: 0.3,
      },
      h("path", { key: "scale-a", d: "M214 98C222 104 232 109 244 113" }),
      h("path", { key: "scale-b", d: "M228 108C238 116 250 122 264 126" }),
      h("path", { key: "scale-c", d: "M244 119C254 126 268 131 280 133" }),
    ),
    h("path", {
      key: "back-light",
      d: "M196 74C210 69 226 73 238 82",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      opacity: 0.3,
    }),
    h("circle", { key: "cheek", cx: 173, cy: 86, r: 5, fill: "var(--inv-soft)", opacity: 0.5 }),
    h("circle", { key: "eye", cx: 188, cy: 78, r: 7, fill: "var(--inv-surface)" }),
    h("circle", { key: "pupil", cx: 186.2, cy: 78.6, r: 3.2, fill: "var(--inv-ink)" }),
    h("circle", { key: "glint", cx: 187.4, cy: 77.3, r: 1.1, fill: "var(--inv-surface)" }),
    h("circle", { key: "nostril", cx: 160, cy: 84, r: 1.5, fill: "var(--inv-ink)" }),
    h("path", {
      key: "smile",
      d: "M161 87c4 3.6 9.5 4.2 14 2.6",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.9,
      strokeLinecap: "round",
    }),
    h(
      "g",
      {
        key: "toes",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1.4,
        strokeLinecap: "round",
        opacity: 0.65,
      },
      h("path", { key: "toe-a", d: "M233 164v5M238 164v5M243 164v5" }),
      h("path", { key: "toe-b", d: "M291 164v5M296 164v5M301 164v5" }),
    ),
    // The baby, turned toward the nest; the same hide pattern at a child's scale.
    h(
      "g",
      { key: "baby", transform: `${BABY_PLACE} scale(${BABY_SCALE})` },
      h("use", { key: "baby-hide", href: `#${id("dinosaur")}`, fill: "var(--inv-decoration-one)" }),
      h("use", {
        key: "baby-spots",
        href: `#${id("dinosaur")}`,
        style: { fill: `url(#${id("dino-spots")})` },
      }),
      h("path", {
        key: "baby-plate",
        d: "M252 105L258 90L263 99L267 105Z",
        fill: "var(--inv-decoration-two)",
        opacity: 0.95,
      }),
      h("circle", { key: "baby-eye", cx: 188, cy: 78, r: 7, fill: "var(--inv-surface)" }),
      h("circle", { key: "baby-pupil", cx: 186, cy: 79, r: 3.4, fill: "var(--inv-ink)" }),
      h("path", {
        key: "baby-smile",
        d: "M161 87c4 3.6 9.5 4.2 14 2.6",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 2.4,
        strokeLinecap: "round",
      }),
    ),
    ...cutSheets(id, [ground]),
    ...cutSheets(id, fronds),
    // The nest, its eggs, and the baby's first prints.
    nestWithEggs(id, "nest", 70, 180, 1.15, NEST_EGGS),
    footprints("nest-prints", id, NEST_PRINTS, "var(--inv-surface)", 0.7),
    rocks(
      "rocks-scene",
      [
        { x: 146, y: 178, rotate: -3, scale: 0.72 },
        { x: 166, y: 180, rotate: 6, scale: 0.9 },
        { x: 300, y: 178, rotate: -4, scale: 0.62 },
      ],
      "var(--inv-ink)",
    ),
    cycad(id, "cycad-near-left", 112, 178, 0.8),
    // The palms at both edges, the framing pieces of the foreground.
    ...palm(id, "left"),
    ...palm(id, "right"),
    footprints("scene-trail", id, SCENE_TRAIL, "var(--inv-surface)", 0.92),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn strip carrying the trail, a nest, a cycad, and the confetti onwards. */
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
    sceneDefinitions(id),
    patternDefinitions(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    // The lower strip, tinted with the accent instead of drawn in a second color.
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.28,
    }),
    // A cycad sprouting at the left end, and grass blades at the right.
    cycad(id, "divider-cycad", 26, 52, 0.62),
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
    nestWithEggs(id, "divider-nest", 282, 56, 0.72, NEST_EGGS.slice(0, 2)),
    rocks(
      "divider-rocks",
      [
        { x: 250, y: 55, rotate: -4, scale: 0.5 },
        { x: 332, y: 55, rotate: 5, scale: 0.42 },
      ],
      "var(--inv-ink)",
    ),
    footprints("divider-trail", id, DIVIDER_TRAIL, "var(--inv-accent)", 0.5),
    confetti(
      "divider-confetti",
      id,
      CONFETTI.slice(0, 5).map((piece) => ({
        ...piece,
        x: piece.x,
        y: 20 + (piece.y % 22),
        paint: "var(--inv-accent)" as ThemePaint,
      })),
    ),
  ];
}

/** The footer: the trail runs out of the page past the nest, with frond tips at both ends. */
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
    sceneDefinitions(id),
    patternDefinitions(id),
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
    cycad(id, "footer-cycad-left", 96, 58, 0.5),
    nestWithEggs(id, "footer-nest", 195, 58, 0.62, NEST_EGGS.slice(1, 3)),
    rocks(
      "footer-rocks",
      [
        { x: 150, y: 58, rotate: -3, scale: 0.4 },
        { x: 240, y: 59, rotate: 5, scale: 0.36 },
      ],
      "var(--inv-ink)",
    ),
    footprints("footer-trail", id, FOOTER_TRAIL, "var(--inv-surface)", 0.85),
    confetti(
      "footer-confetti",
      id,
      CONFETTI.slice(2, 6).map((piece) => ({
        ...piece,
        y: 14 + (piece.y % 24),
      })),
    ),
  ];
}

/** «Dinosaurios» in paper cut-out: the family diorama, the nest divider, and the footer trail. */
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
