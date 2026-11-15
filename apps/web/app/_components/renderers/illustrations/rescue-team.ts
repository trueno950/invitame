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
 * «Equipo de rescate» in paper cut-out (I3b; S1-S4), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a layered diorama for the header — the morning
 * sun, two clouds, a town skyline, a rescue engine with its ladder and its beacon, a helicopter flying over the
 * rooftops, cones along the road, and rescue stars in the air — a torn divider that carries a cone and a star
 * row between two sections, and a footer strip of road and marks.
 *
 * Original work: the engine is a generic red rescue vehicle, the helicopter a generic machine, the cones and the
 * stars generic party props, and the town a plain row of blocks. No character, costume, badge, logo, lookout, or
 * protected name of any franchise is drawn. Every color is a theme variable of `rescue-team`, so the whole
 * drawing re-colours with its palette; tints are `opacity` on a theme color and nothing else.
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

/** A five-point rescue star, drawn once and placed with the other stamps. */
const STAR = "M0-7.4L2.2-2.3L7.1-1.7L3.4 1.6L4.4 6.4L0 3.6L-4.4 6.4L-3.4 1.6L-7.1-1.7L-2.2-2.3Z";

/** A traffic cone: the cone, the reflective band, and the foot it stands on. */
const CONE = "M0-26L7.4 0H-7.4Z";
const CONE_BAND = "M-5.3-13H5.3L6.5-6.5H-6.5Z";
const CONE_FOOT = "M-11 .5H11V4.5H-11Z";

/** The morning sun: a hand-cut disc, not a perfect circle. */
const SUN =
  "M46 24C52.5 23.5 61 27 64 33C67 39 65 51.5 58.5 55C52 58.5 39 56.5 34.5 50C30 43.5 32 32 38 26.5C40.5 24.3 43.4 24.2 46 24Z";

const CLOUD_NEAR =
  "M100 44C99 39.5 103.5 32 109 30C114.5 28 124 29 127.5 33.5C131 38 129.5 45.5 125 48.5C120.5 " +
  "51.5 110 51.5 106 49.5C102.5 47.8 100.6 46.6 100 44Z";

const CLOUD_FAR =
  "M196 28C195 24.5 199 18.5 203 16.5C207 14.5 214.5 15.5 216.5 19C218.5 22.5 217.5 28.5 214 31C210.5 " +
  "33.5 203 33.5 199 31.5C197 30.5 196.6 29.5 196 28Z";

/** The town: two clusters of plain blocks with flat roofs, one chimney, and their lit windows. */
const TOWN =
  "M-8 180V126H18V110H44V140H66V180ZM248 180V134H272V118H296V146H318V128H344V150H370V132H396V180Z";

const TOWN_WINDOWS =
  "M4 134H13V143H4ZM24 134H33V143H24ZM4 152H13V161H4ZM24 152H33V161H24ZM46 148H56V157H46Z" +
  "M258 142H267V151H258ZM278 142H287V151H278ZM258 160H267V169H258ZM278 160H287V169H278Z" +
  "M326 136H335V145H326ZM350 136H359V145H350ZM326 156H335V165H326ZM350 156H359V165H350Z";

/** The roof of each block, a strip of warmer paper so the skyline is not one flat silhouette. */
const TOWN_ROOFS =
  "M-8 126H18V131H-8ZM44 140H66V145H44ZM248 134H272V139H248ZM296 146H318V151H296ZM344 150H370V155H344ZM370 " +
  "132H396V137H370Z";

/** The engine: a box body, a sloped cab, a ladder on the roof, a white band, and its beacon. */
const ENGINE_BODY = "M92 180V134H176L188 144H210C214 144 217 147 217 151V180Z";
const ENGINE_WINDOW = "M180 150H196L205 158V167H180Z";
const ENGINE_BAND = "M92 156H176V164H92Z";
const ENGINE_LADDER = "M96 124H174M96 131H174";
const ENGINE_RUNGS =
  "M104 124V131M114 124V131M124 124V131M134 124V131M144 124V131M154 124V131M164 124V131";
const ENGINE_BEACON = "M189 137H206V144H189Z";
const ENGINE_BUMPER = "M213 166H221V180H213Z";

/** The helicopter: body, windshield, tail boom, fin, rotor, and skids. */
const HELICOPTER_BODY =
  "M300 80C300 71 309 63 320 63C332 63 343 69 347 79C349 85 345 91 337 93H307C301 91 300 86 300 80Z";
const HELICOPTER_GLASS = "M304 78C306 70 312 65 320 65L318 80Z";
const HELICOPTER_TAIL = "M345 79H372L377 86H346Z";
const HELICOPTER_FIN = "M368 78L378 62L381 86Z";
const HELICOPTER_ROTOR = "M320 63V49M284 49H358";
const HELICOPTER_SKID = "M306 95V102H334M312 95V99M330 95V99";

/** The road the engine stands on, and the sidewalk in front of the town. */
const ROAD = "M-8 178C60 176.5 130 179 200 178C270 177 330 179.5 396 178V202H-8Z";
const SIDEWALK = "M-8 172C70 170 150 173 230 172C300 171 350 173.5 396 172V179H-8Z";

const SKY_STARS: readonly Place[] = [
  { x: 110, y: 58, rotate: -8, scale: 0.85 },
  { x: 168, y: 40, rotate: 12, scale: 0.6 },
  { x: 238, y: 76, rotate: -14, scale: 0.7 },
  { x: 262, y: 118, rotate: 8, scale: 0.95 },
  { x: 372, y: 118, rotate: -10, scale: 0.65 },
];

const ROAD_CONES: readonly Place[] = [
  { x: 28, y: 190, rotate: -2, scale: 1 },
  { x: 60, y: 193, rotate: 3, scale: 0.85 },
  { x: 344, y: 190, rotate: 2, scale: 1 },
  { x: 374, y: 193, rotate: -3, scale: 0.85 },
];

/** The star stamp: one shape, placed with a turn and a size like the flakes of the other themes. */
function starDefinition(id: IllustrationId): ReactElement {
  return h("defs", { key: "star-definition" }, h("path", { id: id("star"), d: STAR }));
}

/** The cone stamp: the cone, its band, and its foot, in three cut sheets. */
function coneDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "cone-definition" },
    h(
      "g",
      { id: id("cone") },
      h("path", { key: "cone", d: CONE, fill: "var(--inv-accent)" }),
      h("path", { key: "band", d: CONE_BAND, fill: "var(--inv-surface)" }),
      h("path", { key: "foot", d: CONE_FOOT, fill: "var(--inv-ink)", opacity: 0.75 }),
    ),
  );
}

/** The rescue stars, placed with a turn and a size each so they read as a scatter, not a row. */
function stars(
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
        href: `#${id("star")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

/** The cones, standing in the road with their feet on the asphalt. */
function cones(
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
        key: `${key}-${place.x}`,
        href: `#${id("cone")}`,
        transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
      }),
    ),
  );
}

/** The header diorama: morning sky, town, road, engine, helicopter, cones. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 2.2, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const sun: CutSheet = { name: "sun", d: SUN, fill: "var(--inv-decoration-two)" };
  const cloudNear: CutSheet = { name: "cloud-near", d: CLOUD_NEAR, fill: "var(--inv-surface)" };
  const cloudFar: CutSheet = { name: "cloud-far", d: CLOUD_FAR, fill: "var(--inv-surface)" };
  const town: CutSheet = { name: "town", d: TOWN, fill: "var(--inv-decoration-one)" };
  const sidewalk: CutSheet = {
    name: "sidewalk",
    d: SIDEWALK,
    fill: "var(--inv-surface)",
    shadow: false,
  };
  const road: CutSheet = { name: "road", d: ROAD, fill: "var(--inv-ink)", shadow: false };
  const engine: CutSheet = {
    name: "engine",
    d: ENGINE_BODY,
    fill: "var(--inv-accent)",
    outline: true,
  };
  const engineBand: CutSheet = {
    name: "engine-band",
    d: ENGINE_BAND,
    fill: "var(--inv-surface)",
    shadow: false,
  };
  const engineWindow: CutSheet = {
    name: "engine-window",
    d: ENGINE_WINDOW,
    fill: "var(--inv-decoration-two)",
    shadow: false,
  };
  const beacon: CutSheet = {
    name: "beacon",
    d: ENGINE_BEACON,
    fill: "var(--inv-decoration-one)",
    shadow: false,
  };
  const bumper: CutSheet = {
    name: "bumper",
    d: ENGINE_BUMPER,
    fill: "var(--inv-surface)",
    shadow: false,
  };
  const helicopterBody: CutSheet = {
    name: "helicopter-body",
    d: HELICOPTER_BODY,
    fill: "var(--inv-decoration-one)",
    outline: true,
  };
  const helicopterGlass: CutSheet = {
    name: "helicopter-glass",
    d: HELICOPTER_GLASS,
    fill: "var(--inv-surface)",
    shadow: false,
  };
  const helicopterTail: CutSheet = {
    name: "helicopter-tail",
    d: HELICOPTER_TAIL,
    fill: "var(--inv-decoration-one)",
  };
  const helicopterFin: CutSheet = {
    name: "helicopter-fin",
    d: HELICOPTER_FIN,
    fill: "var(--inv-decoration-one)",
  };

  return [
    sheetDefinitions(id, [
      sheet,
      sun,
      cloudNear,
      cloudFar,
      town,
      sidewalk,
      road,
      engine,
      engineBand,
      engineWindow,
      beacon,
      bumper,
      helicopterBody,
      helicopterGlass,
      helicopterTail,
      helicopterFin,
    ]),
    starDefinition(id),
    coneDefinition(id),
    ...cutSheets(id, [sheet]),
    // The sun gets its own paler disc behind, so it reads as two sheets of paper and not a flat stamp.
    h("use", {
      key: "sun-halo",
      href: `#${id(sun.name)}`,
      fill: "var(--inv-surface)",
      opacity: 0.55,
      transform: "translate(-5 -4) scale(1.08)",
    }),
    ...cutSheets(id, [sun, cloudFar, cloudNear]),
    stars("stars-sky", id, SKY_STARS, "var(--inv-decoration-two)", 0.9),
    ...cutSheets(id, [town]),
    h("path", { key: "town-roofs", d: TOWN_ROOFS, fill: "var(--inv-surface)", opacity: 0.5 }),
    h("path", {
      key: "town-windows",
      d: TOWN_WINDOWS,
      fill: "var(--inv-soft)",
      opacity: 0.95,
    }),
    ...cutSheets(id, [sidewalk, road]),
    // The lane markings: short dashes, warm on the dark asphalt.
    h(
      "g",
      { key: "lane-dashes", fill: "var(--inv-decoration-two)", opacity: 0.85 },
      [26, 74, 122, 170, 218, 266, 314, 362].map((x) =>
        h("rect", { key: `dash-${x}`, x, y: 192, width: 26, height: 4, rx: 1 }),
      ),
    ),
    // The helicopter over the rooftops: body, glass, tail, fin, rotor, skids, and a star on the door.
    ...cutSheets(id, [helicopterTail, helicopterFin, helicopterBody, helicopterGlass]),
    h("path", {
      key: "helicopter-rotor",
      d: HELICOPTER_ROTOR,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 2.4,
      strokeLinecap: "round",
      opacity: 0.8,
    }),
    h("circle", { key: "rotor-hub", cx: 320, cy: 49, r: 3, fill: "var(--inv-ink)", opacity: 0.8 }),
    h("path", {
      key: "helicopter-skid",
      d: HELICOPTER_SKID,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      opacity: 0.8,
    }),
    h("use", {
      key: "helicopter-star",
      href: `#${id("star")}`,
      fill: "var(--inv-surface)",
      transform: "translate(326 82) scale(0.62)",
    }),
    // The engine: body, white band, window, beacon, bumper, ladder, wheels.
    ...cutSheets(id, [engine]),
    h("use", { key: "engine-band-fill", href: `#${id(engineBand.name)}`, fill: engineBand.fill }),
    h("use", {
      key: "engine-window-fill",
      href: `#${id(engineWindow.name)}`,
      fill: engineWindow.fill,
    }),
    h("use", {
      key: "engine-window-frame",
      href: `#${id(engineWindow.name)}`,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      opacity: 0.35,
    }),
    h("use", { key: "engine-beacon", href: `#${id(beacon.name)}`, fill: beacon.fill }),
    h("use", {
      key: "engine-beacon-glow",
      href: `#${id(beacon.name)}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
      transform: "translate(0 -3)",
    }),
    h("use", { key: "engine-bumper", href: `#${id(bumper.name)}`, fill: bumper.fill }),
    h(
      "g",
      {
        key: "engine-ladder",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 2,
        opacity: 0.85,
      },
      h("path", { key: "ladder-rails", d: ENGINE_LADDER, strokeLinecap: "round" }),
      h("path", { key: "ladder-rungs", d: ENGINE_RUNGS, strokeWidth: 1.5 }),
    ),
    h(
      "g",
      { key: "engine-wheels" },
      [114, 194].map((x) =>
        h("circle", { key: `wheel-${x}`, cx: x, cy: 176, r: 13, fill: "var(--inv-ink)" }),
      ),
    ),
    h(
      "g",
      { key: "engine-hubs", fill: "var(--inv-surface)" },
      [114, 194].map((x) => h("circle", { key: `hub-${x}`, cx: x, cy: 176, r: 4.6 })),
    ),
    // The cones close the foreground, two on each side of the engine.
    cones("road-cones", id, ROAD_CONES, 0.95),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band of road with its dashes, two cones, and a row of rescue stars. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 26, 2.4, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 42, 4.6, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    starDefinition(id),
    coneDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.2,
    }),
    h(
      "g",
      { key: "divider-dashes", fill: "var(--inv-ink)", opacity: 0.28 },
      [40, 96, 152, 208, 264, 320].map((x) =>
        h("rect", { key: `divider-dash-${x}`, x, y: 46, width: 30, height: 4, rx: 1 }),
      ),
    ),
    cones(
      "divider-cones",
      id,
      [
        { x: 30, y: 48, rotate: -3, scale: 0.8 },
        { x: 362, y: 48, rotate: 3, scale: 0.8 },
      ],
      0.8,
    ),
    stars(
      "divider-stars",
      id,
      [
        { x: 74, y: 20, rotate: -10, scale: 0.9 },
        { x: 128, y: 14, rotate: 8, scale: 0.65 },
        { x: 196, y: 18, rotate: -6, scale: 1 },
        { x: 262, y: 13, rotate: 14, scale: 0.7 },
        { x: 318, y: 20, rotate: -12, scale: 0.9 },
      ],
      "var(--inv-accent)",
      0.6,
    ),
  ];
}

/** The footer: a torn band of road, its dashes, and the stars dying out at both ends. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 11, 6.4, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 38, 2.9, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-ink)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    starDefinition(id),
    coneDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-ink)",
      opacity: 0.82,
    }),
    h(
      "g",
      { key: "footer-dashes", fill: "var(--inv-decoration-two)", opacity: 0.8 },
      [96, 152, 208, 264].map((x) =>
        h("rect", { key: `footer-dash-${x}`, x, y: 52, width: 30, height: 4, rx: 1 }),
      ),
    ),
    stars(
      "footer-stars",
      id,
      [
        { x: 42, y: 44, rotate: -8, scale: 1 },
        { x: 92, y: 34, rotate: 10, scale: 0.6 },
        { x: 196, y: 30, rotate: -6, scale: 0.7 },
        { x: 300, y: 34, rotate: 12, scale: 0.6 },
        { x: 348, y: 44, rotate: -10, scale: 1 },
      ],
      "var(--inv-accent)",
      0.75,
    ),
    cones(
      "footer-cones",
      id,
      [
        { x: 66, y: 55, rotate: -3, scale: 0.75 },
        { x: 326, y: 55, rotate: 3, scale: 0.75 },
      ],
      0.9,
    ),
    h("use", {
      key: "footer-star-foot",
      href: `#${id("star")}`,
      fill: "var(--inv-surface)",
      opacity: 0.9,
      transform: "translate(170 52) rotate(-6) scale(0.9)",
    }),
    h("use", {
      key: "footer-star-foot-near",
      href: `#${id("star")}`,
      fill: "var(--inv-surface)",
      opacity: 0.9,
      transform: "translate(226 52) rotate(10) scale(0.9)",
    }),
  ];
}

/** «Equipo de rescate» in paper cut-out: the engine diorama, the road divider, and the star footer. */
export const RESCUE_TEAM_ILLUSTRATION: ThemeIllustration = {
  theme: "rescue-team",
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
