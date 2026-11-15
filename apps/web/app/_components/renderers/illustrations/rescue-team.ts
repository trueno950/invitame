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
 * «Equipo de rescate» in paper cut-out (I4b; S3, S5), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a layered diorama for the header — morning
 * clouds, the sun and rescue stars; three townhouses with pitched roofs, striped awnings and lit windows on the
 * far plane; a fire station with an open bay, a bell sign and its brick wall on the mid plane; a rescue engine
 * with a full ladder, a hose reel and its lights, an ambulance, an arcing water spray from the hydrant, a
 * traffic light, cones and the road in front; and three balloons tied to the station, the birthday touch — a
 * torn divider that carries the road, a hydrant and a cone between two sections, and a footer strip of road and
 * the small station silhouette.
 *
 * Original work: the engine and the ambulance are generic emergency vehicles, the town a plain row of
 * townhouses, and the props generic. No character, costume, badge, logo, lookout, animal, or protected name of
 * any franchise is drawn (S3). Every color is a theme variable of `rescue-team`, so the whole drawing
 * re-colours with its palette; tints are `opacity` on a theme color, and the only fills that are not plain
 * theme colors are patterns built from theme colors, referenced by ids the frame makes unique.
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

/** The morning sun: a hand-cut disc, not a perfect circle, with its own ring. */
const SUN =
  "M156 28C166 27.5 175 35 176.5 46C178 57 170 66 159 66.5C148 67 139 59 138.5 48C138 37 146 28.5 156 28Z";

const CLOUD_NEAR =
  "M100 40C99 35.5 103.5 28 109 26C114.5 24 124 25 127.5 29.5C131 34 129.5 41.5 125 44.5C120.5 " +
  "47.5 110 47.5 106 45.5C102.5 43.8 100.6 42.6 100 40Z";

const CLOUD_FAR =
  "M196 24C195 20.5 199 14.5 203 12.5C207 10.5 214.5 11.5 216.5 15C218.5 18.5 217.5 24.5 214 27C210.5 " +
  "29.5 203 29.5 199 27.5C197 26.5 196.6 25.5 196 24Z";

/** A balloon tied to the station: a sliced paper disc, a knot, and its string. */
const BALLOON = "M-10 0C-10-11-5-18 0-18C5-18 10-11 10 0C10 9 5 15 0 15C-5 15-10 9-10 0Z";
const BALLOON_KNOT = "M-3 15H3L0 19Z";

/** The three townhouses: their walls, their pitched roofs, and the chimneys on two of them. */
const TOWN_WALLS = "M158 176V132H234V176ZM240 176V140H312V176ZM318 176V128H392V176Z";
const TOWN_ROOFS = "M150 132L196 118L242 132ZM232 140L276 126L320 140ZM310 128L352 112L398 128Z";
const TOWN_CHIMNEYS = "M180 120V98H194V116ZM296 132V112H308V126Z";
const TOWN_EAVES = "M150 132H242V136H150ZM232 140H320V144H232ZM310 128H398V132H310Z";

/** The shopfront band under each awning, and the awnings themselves. */
const TOWN_SHOPFRONTS = "M164 168H228V176H164ZM246 170H288V176H246ZM326 172H352V176H326Z";
const TOWN_AWNINGS = "M160 156H232L226 168H166ZM244 158H292L286 170H250ZM320 160H358L353 172H325Z";
const TOWN_AWNING_SCALLOPS =
  "M166 168C171 172 176 172 181 168C186 172 191 172 196 168C201 172 206 172 211 168C216 172 221 172 226 168" +
  "M250 170C255 174 260 174 265 170C270 174 275 174 280 170C285 174 290 174 286 170" +
  "M325 172C330 175 335 175 340 172C345 175 350 175 353 172";

/** The station: its wall, its cornice, the open bay, and the bell above the bay. */
const STATION_WALL = "M-8 176V96H150V176Z";
const STATION_CORNICE = "M-8 96V86H152V96Z";
const STATION_BAY = "M42 176V112H120V176Z";
const STATION_BAY_FRAME = "M38 176V108H124V176";
const STATION_SLATS = "M42 114H120M42 120H120M42 126H120";
const STATION_SIGN = "M58 98H106V110H58Z";
const STATION_BELL = "M72 104C72 99 76 97 82 97C88 97 92 99 92 104L95 108H69Z";
const STATION_WINDOWS = "M10 102H28V114H10ZM124 102H142V114H124Z";
const STATION_LAMP = "M56 92V86H60V92ZM104 92V86H108V92Z";

/** The engine: a box body, a sloped cab, a ladder on the roof, a white band, and its lights. */
const ENGINE_BODY = "M20 176V146H32V134H108L124 146H150V176Z";
const ENGINE_WINDOW = "M112 150H144V162H112Z";
const ENGINE_DOOR_WINDOW = "M90 148H108V162H90Z";
const ENGINE_BAND = "M20 162H150V170H20Z";
const ENGINE_LADDER = "M36 128H110M36 134H110";
const ENGINE_RUNGS = "M44 128V134M56 128V134M68 128V134M80 128V134M92 128V134M104 128V134";
const ENGINE_BEACON = "M94 128H112V134H94Z";
const ENGINE_COMPARTMENTS = "M24 148H48V158H24ZM116 164H146V172H116Z";
const ENGINE_BUMPER = "M144 168H152V176H144Z";

/** The hose reel on the engine's flank, and the hose that runs out to the nozzle. */
const HOSE_REEL = "M0 0C0-8 6-13 13-13C20-13 26-8 26 0C26 8 20 13 13 13C6 13 0 8 0 0Z";
const HOSE_REEL_HUB =
  "M0 0C0-4.4 3.4-7.4 7.6-7.4C11.8-7.4 15.2-4.4 15.2 0C15.2 4.4 11.8 7.4 7.6 7.4C3.4 7.4 0 4.4 0 0Z";
const HOSE_LINE = "M66 152C88 150 104 154 118 150C132 146 142 148 148 146";

/** The water spray leaves the nozzle in three arcs and falls to the road in drops. */
const SPRAY_OUTER = "M150 142C186 108 226 92 268 112C292 123 300 146 296 170";
const SPRAY_MIDDLE = "M150 146C184 116 222 102 258 120C278 130 286 148 284 168";
const SPRAY_INNER = "M150 150C182 124 218 112 248 128C264 137 272 152 270 166";
const SPRAY_DROPS =
  "M294 128V130M306 142V145M300 158V161M276 106V108M288 118V120M262 96V98M280 150V152M292 166V168";

/** The ambulance: a box body, a sloped bonnet, a red stripe, a light bar, and its wheels. */
const AMBULANCE_BODY = "M200 176V150H210L218 140H258L266 150H286V176Z";
const AMBULANCE_WINDOW = "M220 152H244V160H220ZM250 152H260V160H250Z";
const AMBULANCE_STRIPE = "M200 162H286V170H200Z";
const AMBULANCE_LIGHT = "M230 136H242V140H230Z";
const AMBULANCE_DOOR = "M204 150V176M256 150V176";

/** The traffic light: its pole, its base, and its box. */
const TRAFFIC_POLE = "M320 176V144";
const TRAFFIC_BASE = "M310 172H330V176H310Z";
const TRAFFIC_BOX = "M308 116H334V146H308Z";

/** The hydrant at the kerb, and the hose running from it to the engine. */
const HYDRANT_BODY = "M-7 0V-14H7V0Z";
const HYDRANT_CAP = "M-10 -14H10V-10H-10Z";
const HYDRANT_ARMS = "M-13 -8H-7V-4H-13ZM7 -8H13V-4H7Z";
const HYDRANT_TOP = "M-4 -14V-20H4V-14Z";

/** The road, the kerb, and the kerb stones. */
const ROAD = "M-8 176C60 174.5 130 177 200 176C270 175 330 177.5 396 176V202H-8Z";
const KERB = "M-8 172C70 170 150 173 230 172C300 171 350 173.5 396 172V177H-8Z";
const KERB_STONES =
  "M28 172V177M68 172V177M108 172V177M148 172V177M188 172V177M228 172V177M268 172V177M308 172V177M348 172V177";

const SKY_STARS: readonly Place[] = [
  { x: 118, y: 54, rotate: -8, scale: 0.85 },
  { x: 168, y: 38, rotate: 12, scale: 0.6 },
  { x: 240, y: 60, rotate: -14, scale: 0.7 },
  { x: 270, y: 92, rotate: 8, scale: 0.85 },
  { x: 300, y: 48, rotate: -10, scale: 0.55 },
];

const ROAD_CONES: readonly Place[] = [
  { x: 18, y: 190, rotate: -2, scale: 1 },
  { x: 46, y: 193, rotate: 3, scale: 0.85 },
  { x: 352, y: 190, rotate: 2, scale: 1 },
  { x: 378, y: 193, rotate: -3, scale: 0.85 },
];

/** The three party balloons, tied to the station roof. */
const BALLOONS: readonly {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly paint: ThemePaint;
}[] = [
  { name: "balloon-far", x: 56, y: 62, scale: 0.78, paint: "var(--inv-decoration-one)" },
  { name: "balloon-mid", x: 36, y: 42, scale: 0.92, paint: "var(--inv-decoration-two)" },
  { name: "balloon-near", x: 16, y: 52, scale: 1.04, paint: "var(--inv-accent)" },
];
const BALLOON_STRINGS = "M16 72C20 78 24 82 28 86M36 60C36 70 32 80 28 86M56 77C48 80 36 83 28 86";

/** The windows of the town, as cells: warm paper on one side of the street, pale on the other. */
interface Cell {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const WARM_CELLS: readonly Cell[] = [
  { x: 166, y: 140, w: 8, h: 11 },
  { x: 188, y: 140, w: 8, h: 11 },
  { x: 210, y: 140, w: 8, h: 11 },
  { x: 266, y: 146, w: 8, h: 11 },
  { x: 326, y: 134, w: 8, h: 11 },
  { x: 358, y: 134, w: 8, h: 11 },
  { x: 326, y: 148, w: 8, h: 11 },
  { x: 358, y: 148, w: 8, h: 11 },
];

const PALE_CELLS: readonly Cell[] = [
  { x: 248, y: 146, w: 8, h: 11 },
  { x: 284, y: 146, w: 8, h: 11 },
  { x: 342, y: 134, w: 8, h: 11 },
  { x: 374, y: 134, w: 8, h: 11 },
  { x: 342, y: 148, w: 8, h: 11 },
  { x: 374, y: 148, w: 8, h: 11 },
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

/**
 * The three patterns of the scene: the brick of the station wall, the stripes of the town awnings, and the
 * tread plate of the engine. Each is painted as the fill of a theme-colored sheet and gets its id from the
 * frame, so two invitations never share one.
 */
function patternDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "pattern-definitions" },
    h(
      "pattern",
      {
        key: "brick",
        id: id("brick"),
        width: 26,
        height: 12,
        patternUnits: "userSpaceOnUse",
      },
      h("path", {
        key: "courses",
        d: "M0 6H26M0 12H26M13 0V6M0 6V12",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 0.8,
        opacity: 0.16,
      }),
    ),
    h(
      "pattern",
      {
        key: "awning-stripe",
        id: id("awning-stripe"),
        width: 12,
        height: 12,
        patternUnits: "userSpaceOnUse",
      },
      h("rect", { key: "stripe-base", width: 12, height: 12, fill: "var(--inv-surface)" }),
      h("rect", { key: "stripe", width: 6, height: 12, fill: "var(--inv-accent)" }),
    ),
    h(
      "pattern",
      {
        key: "tread",
        id: id("tread"),
        width: 8,
        height: 8,
        patternUnits: "userSpaceOnUse",
      },
      h("path", {
        key: "plate",
        d: "M0 4H8M4 0V8",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 0.7,
        opacity: 0.18,
      }),
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

/** The cones, standing on the road with their feet on the asphalt. */
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

/** A column of lit windows, cut as one sheet each time: the town, lit house by house. */
function windows(
  key: string,
  cells: readonly Cell[],
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    cells.map((cell) =>
      h("rect", {
        key: `${key}-${cell.x}-${cell.y}`,
        x: cell.x,
        y: cell.y,
        width: cell.w,
        height: cell.h,
        rx: 1,
      }),
    ),
  );
}

/** The hydrant and the hose that runs from it to the engine's pump. */
function hydrant(key: string, x: number, y: number, scale: number): ReactElement {
  return h(
    "g",
    { key, transform: `translate(${x} ${y}) scale(${scale})` },
    h("path", { key: "body", d: HYDRANT_BODY, fill: "var(--inv-accent)" }),
    h("path", { key: "cap", d: HYDRANT_CAP, fill: "var(--inv-accent)" }),
    h("path", { key: "arms", d: HYDRANT_ARMS, fill: "var(--inv-accent)" }),
    h("path", { key: "top", d: HYDRANT_TOP, fill: "var(--inv-surface)" }),
    h("circle", { key: "bolt", cx: 0, cy: -12, r: 1.6, fill: "var(--inv-surface)", opacity: 0.85 }),
  );
}

/** The balloons tied to the station, with the strings that hold them down. */
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
      opacity: 0.45,
    }),
  ];
}

/** The header diorama: town, station, engine, spray, ambulance, and the road. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 2.2, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const sun: CutSheet = { name: "sun", d: SUN, fill: "var(--inv-decoration-two)" };
  const cloudNear: CutSheet = { name: "cloud-near", d: CLOUD_NEAR, fill: "var(--inv-surface)" };
  const cloudFar: CutSheet = { name: "cloud-far", d: CLOUD_FAR, fill: "var(--inv-surface)" };
  const townWalls: CutSheet = {
    name: "town-walls",
    d: TOWN_WALLS,
    fill: "var(--inv-decoration-one)",
    shadow: false,
  };
  const townRoofs: CutSheet = {
    name: "town-roofs",
    d: TOWN_ROOFS,
    fill: "var(--inv-ink)",
    shadow: false,
  };
  const kerb: CutSheet = {
    name: "kerb",
    d: KERB,
    fill: "var(--inv-surface)",
    shadow: false,
  };
  const road: CutSheet = { name: "road", d: ROAD, fill: "var(--inv-ink)", shadow: false };
  const station: CutSheet = {
    name: "station",
    d: STATION_WALL,
    fill: "var(--inv-surface)",
    outline: true,
  };
  const cornice: CutSheet = {
    name: "cornice",
    d: STATION_CORNICE,
    fill: "var(--inv-accent)",
  };
  const bay: CutSheet = { name: "bay", d: STATION_BAY, fill: "var(--inv-ink)", shadow: false };
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
  const engineDoor: CutSheet = {
    name: "engine-door",
    d: ENGINE_DOOR_WINDOW,
    fill: "var(--inv-decoration-two)",
    shadow: false,
  };
  const beacon: CutSheet = {
    name: "beacon",
    d: ENGINE_BEACON,
    fill: "var(--inv-decoration-one)",
    shadow: false,
  };
  const ambulance: CutSheet = {
    name: "ambulance",
    d: AMBULANCE_BODY,
    fill: "var(--inv-surface)",
    outline: true,
  };
  const ambulanceStripe: CutSheet = {
    name: "ambulance-stripe",
    d: AMBULANCE_STRIPE,
    fill: "var(--inv-accent)",
    shadow: false,
  };
  const ambulanceWindow: CutSheet = {
    name: "ambulance-window",
    d: AMBULANCE_WINDOW,
    fill: "var(--inv-decoration-two)",
    shadow: false,
  };
  const ambulanceLight: CutSheet = {
    name: "ambulance-light",
    d: AMBULANCE_LIGHT,
    fill: "var(--inv-accent)",
    shadow: false,
  };
  const trafficBox: CutSheet = {
    name: "traffic-box",
    d: TRAFFIC_BOX,
    fill: "var(--inv-ink)",
    outline: true,
  };
  const awnings: CutSheet = {
    name: "awnings",
    d: TOWN_AWNINGS,
    fill: "var(--inv-surface)",
  };

  return [
    sheetDefinitions(id, [
      sheet,
      sun,
      cloudNear,
      cloudFar,
      townWalls,
      townRoofs,
      kerb,
      road,
      station,
      cornice,
      bay,
      engine,
      engineBand,
      engineWindow,
      engineDoor,
      beacon,
      ambulance,
      ambulanceStripe,
      ambulanceWindow,
      ambulanceLight,
      trafficBox,
      awnings,
    ]),
    starDefinition(id),
    coneDefinition(id),
    patternDefinitions(id),
    ...cutSheets(id, [sheet]),
    // The sun gets its own paler disc behind, so it reads as two sheets of paper and not a flat stamp.
    h("circle", {
      key: "sun-halo",
      cx: 156,
      cy: 46,
      r: 23,
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    ...cutSheets(id, [sun, cloudFar, cloudNear]),
    stars("stars-sky", id, SKY_STARS, "var(--inv-decoration-two)", 0.9),
    ...balloons(),
    // The far plane: the town behind the station, veiled so the front plane stands out.
    ...cutSheets(id, [townWalls]),
    h("use", {
      key: "town-veil",
      href: `#${id(townWalls.name)}`,
      fill: "var(--inv-soft)",
      opacity: 0.3,
    }),
    ...cutSheets(id, [townRoofs]),
    h("use", {
      key: "town-roof-veil",
      href: `#${id(townRoofs.name)}`,
      fill: "var(--inv-soft)",
      opacity: 0.26,
    }),
    h("path", { key: "town-eaves", d: TOWN_EAVES, fill: "var(--inv-ink)", opacity: 0.55 }),
    h("path", { key: "town-chimneys", d: TOWN_CHIMNEYS, fill: "var(--inv-accent)" }),
    windows("town-windows-warm", WARM_CELLS, "var(--inv-decoration-two)", 0.95),
    windows("town-windows-pale", PALE_CELLS, "var(--inv-surface)", 0.9),
    h("path", {
      key: "town-shopfronts",
      d: TOWN_SHOPFRONTS,
      fill: "var(--inv-ink)",
      opacity: 0.32,
    }),
    // The awnings: striped paper over each shopfront, with a scalloped hem.
    ...cutSheets(id, [awnings]),
    h("use", {
      key: "awning-stripes",
      href: `#${id("awnings")}`,
      style: { fill: `url(#${id("awning-stripe")})` },
    }),
    h("path", {
      key: "awning-scallops",
      d: TOWN_AWNING_SCALLOPS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      opacity: 0.8,
    }),
    // The station: wall, brick, cornice, bay, sign, windows and lamp.
    ...cutSheets(id, [station]),
    h("use", {
      key: "station-brick",
      href: `#${id(station.name)}`,
      style: { fill: `url(#${id("brick")})` },
    }),
    ...cutSheets(id, [cornice]),
    h("path", {
      key: "cornice-light",
      d: "M-8 86H152V90H-8Z",
      fill: "var(--inv-decoration-two)",
      opacity: 0.55,
    }),
    h("path", { key: "bay", d: STATION_BAY, fill: "var(--inv-ink)" }),
    h("path", {
      key: "bay-glow",
      d: "M52 176V120H110V176Z",
      fill: "var(--inv-soft)",
      opacity: 0.18,
    }),
    h("path", {
      key: "bay-frame",
      d: STATION_BAY_FRAME,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 3,
      opacity: 0.85,
    }),
    h("path", {
      key: "bay-slats",
      d: STATION_SLATS,
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.4,
      opacity: 0.5,
    }),
    h("path", { key: "station-sign", d: STATION_SIGN, fill: "var(--inv-accent)" }),
    h("path", { key: "station-bell", d: STATION_BELL, fill: "var(--inv-decoration-two)" }),
    h("path", {
      key: "station-windows",
      d: STATION_WINDOWS,
      fill: "var(--inv-decoration-two)",
      opacity: 0.9,
    }),
    h("path", {
      key: "station-lamp",
      d: STATION_LAMP,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 2.6,
      strokeLinecap: "round",
    }),
    // The kerb and the road.
    ...cutSheets(id, [kerb, road]),
    h("path", {
      key: "kerb-stones",
      d: KERB_STONES,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 0.9,
      opacity: 0.16,
    }),
    h(
      "g",
      { key: "lane-dashes", fill: "var(--inv-decoration-two)", opacity: 0.85 },
      [24, 72, 120, 168, 216, 264, 312, 360].map((x) =>
        h("rect", { key: `dash-${x}`, x, y: 192, width: 26, height: 4, rx: 1 }),
      ),
    ),
    // The traffic light at the right edge, framing the front plane.
    h("path", {
      key: "traffic-pole",
      d: TRAFFIC_POLE,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 3,
      strokeLinecap: "round",
    }),
    h("path", { key: "traffic-base", d: TRAFFIC_BASE, fill: "var(--inv-ink)", opacity: 0.85 }),
    ...cutSheets(id, [trafficBox]),
    h("circle", { key: "traffic-red", cx: 321, cy: 126, r: 4.6, fill: "var(--inv-accent)" }),
    h("circle", {
      key: "traffic-yellow",
      cx: 321,
      cy: 134,
      r: 4.6,
      fill: "var(--inv-decoration-two)",
    }),
    h("circle", {
      key: "traffic-dark",
      cx: 321,
      cy: 142,
      r: 4.6,
      fill: "var(--inv-decoration-one)",
      opacity: 0.45,
    }),
    // The ambulance in front of the town, and the spray arcing over it from the engine.
    ...cutSheets(id, [ambulance]),
    h("use", {
      key: "ambulance-stripe",
      href: `#${id(ambulanceStripe.name)}`,
      fill: ambulanceStripe.fill,
    }),
    ...cutSheets(id, [ambulanceWindow]),
    h("use", {
      key: "ambulance-light",
      href: `#${id(ambulanceLight.name)}`,
      fill: "var(--inv-decoration-two)",
    }),
    h("path", {
      key: "ambulance-doors",
      d: AMBULANCE_DOOR,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      opacity: 0.3,
    }),
    h("use", {
      key: "ambulance-star",
      href: `#${id("star")}`,
      fill: "var(--inv-surface)",
      transform: "translate(242 167) scale(0.55)",
    }),
    h(
      "g",
      { key: "ambulance-wheels" },
      [218, 268].map((x) =>
        h("circle", { key: `wheel-${x}`, cx: x, cy: 176, r: 11, fill: "var(--inv-ink)" }),
      ),
    ),
    h(
      "g",
      { key: "ambulance-hubs", fill: "var(--inv-surface)" },
      [218, 268].map((x) => h("circle", { key: `hub-${x}`, cx: x, cy: 176, r: 4 })),
    ),
    h(
      "g",
      {
        key: "water-spray",
        fill: "none",
        strokeLinecap: "round",
      },
      h("path", {
        key: "spray-outer",
        d: SPRAY_OUTER,
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 5.6,
        opacity: 0.3,
      }),
      h("path", {
        key: "spray-middle",
        d: SPRAY_MIDDLE,
        stroke: "var(--inv-surface)",
        strokeWidth: 3.8,
        opacity: 0.82,
      }),
      h("path", {
        key: "spray-inner",
        d: SPRAY_INNER,
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 1.8,
        opacity: 0.55,
      }),
      h("path", {
        key: "spray-drops",
        d: SPRAY_DROPS,
        stroke: "var(--inv-surface)",
        strokeWidth: 2.4,
        opacity: 0.8,
      }),
    ),
    // The engine: body, band, windows, beacon, compartments, ladder, hose reel, and wheels.
    ...cutSheets(id, [engine]),
    h("use", {
      key: "engine-tread",
      href: `#${id(engine.name)}`,
      style: { fill: `url(#${id("tread")})` },
    }),
    h("use", { key: "engine-band-fill", href: `#${id(engineBand.name)}`, fill: engineBand.fill }),
    h("use", {
      key: "engine-window-fill",
      href: `#${id(engineWindow.name)}`,
      fill: engineWindow.fill,
    }),
    h("use", { key: "engine-door-fill", href: `#${id(engineDoor.name)}`, fill: engineDoor.fill }),
    h("use", {
      key: "engine-window-frame",
      href: `#${id(engineWindow.name)}`,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.3,
      opacity: 0.4,
    }),
    h("use", { key: "engine-beacon", href: `#${id(beacon.name)}`, fill: beacon.fill }),
    h("use", {
      key: "engine-beacon-glow",
      href: `#${id(beacon.name)}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.6,
      transform: "translate(0 -3.5)",
    }),
    h("path", {
      key: "engine-bumper",
      d: ENGINE_BUMPER,
      fill: "var(--inv-surface)",
    }),
    h("path", {
      key: "engine-compartments",
      d: ENGINE_COMPARTMENTS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.2,
      opacity: 0.35,
    }),
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
      { key: "hose-reel", transform: "translate(34 149) scale(0.72)" },
      h("path", { key: "coil", d: HOSE_REEL, fill: "var(--inv-decoration-two)" }),
      h("path", { key: "hub", d: HOSE_REEL_HUB, fill: "var(--inv-surface)", opacity: 0.95 }),
      h("path", {
        key: "spokes",
        d: "M13 -13V13M0 0H26",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1.2,
        opacity: 0.45,
      }),
    ),
    h("path", {
      key: "hose-line",
      d: HOSE_LINE,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      opacity: 0.6,
    }),
    h(
      "g",
      { key: "engine-wheels" },
      [54, 132].map((x) =>
        h("circle", { key: `wheel-${x}`, cx: x, cy: 176, r: 12, fill: "var(--inv-ink)" }),
      ),
    ),
    h(
      "g",
      { key: "engine-hubs", fill: "var(--inv-surface)" },
      [54, 132].map((x) => h("circle", { key: `hub-${x}`, cx: x, cy: 176, r: 4.4 })),
    ),
    h("use", {
      key: "engine-star",
      href: `#${id("star")}`,
      fill: "var(--inv-surface)",
      transform: "translate(76 158) scale(0.62)",
    }),
    // The hydrant and its hose, in the foreground at the left.
    hydrant("hydrant", 9, 180, 1.05),
    h("path", {
      key: "hydrant-hose",
      d: "M16 168C26 160 38 164 46 170",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      opacity: 0.75,
    }),
    cones("road-cones", id, ROAD_CONES, 0.95),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band of road with its dashes, a hydrant, a cone, and a row of rescue stars. */
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
      fill: "var(--inv-ink)",
      opacity: 0.72,
    }),
    h(
      "g",
      { key: "divider-dashes", fill: "var(--inv-decoration-two)", opacity: 0.75 },
      [44, 100, 156, 212, 268, 324].map((x) =>
        h("rect", { key: `divider-dash-${x}`, x, y: 48, width: 30, height: 4, rx: 1 }),
      ),
    ),
    hydrant("divider-hydrant", 150, 54, 0.5),
    cones(
      "divider-cones",
      id,
      [
        { x: 30, y: 48, rotate: -3, scale: 0.8 },
        { x: 362, y: 48, rotate: 3, scale: 0.8 },
      ],
      0.85,
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
    h("path", {
      key: "divider-hose",
      d: "M186 44C198 40 210 40 222 44",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 2.4,
      strokeLinecap: "round",
      opacity: 0.6,
    }),
  ];
}

/** The footer: a torn band of road, the station silhouette, its dashes, and the stars at both ends. */
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
      [110, 166, 222, 278].map((x) =>
        h("rect", { key: `footer-dash-${x}`, x, y: 52, width: 30, height: 4, rx: 1 }),
      ),
    ),
    // The station, small, at the left of the strip: a wall, a bay, and its sign.
    h("path", {
      key: "footer-station",
      d: "M-8 62V38H66V62Z",
      fill: "var(--inv-surface)",
      opacity: 0.95,
    }),
    h("path", {
      key: "footer-station-roof",
      d: "M-8 38V32H70L66 38Z",
      fill: "var(--inv-accent)",
    }),
    h("path", {
      key: "footer-bay",
      d: "M16 62V44H48V62Z",
      fill: "var(--inv-ink)",
      opacity: 0.8,
    }),
    h("path", {
      key: "footer-sign",
      d: "M26 34H42V40H26Z",
      fill: "var(--inv-accent)",
      opacity: 0.9,
    }),
    stars(
      "footer-stars",
      id,
      [
        { x: 120, y: 44, rotate: -8, scale: 1 },
        { x: 168, y: 34, rotate: 10, scale: 0.6 },
        { x: 236, y: 30, rotate: -6, scale: 0.7 },
        { x: 312, y: 34, rotate: 12, scale: 0.6 },
        { x: 360, y: 44, rotate: -10, scale: 1 },
      ],
      "var(--inv-accent)",
      0.75,
    ),
    cones(
      "footer-cones",
      id,
      [
        { x: 86, y: 55, rotate: -3, scale: 0.75 },
        { x: 330, y: 55, rotate: 3, scale: 0.75 },
      ],
      0.9,
    ),
    hydrant("footer-hydrant", 296, 60, 0.46),
    h("use", {
      key: "footer-star-foot",
      href: `#${id("star")}`,
      fill: "var(--inv-surface)",
      opacity: 0.9,
      transform: "translate(186 54) rotate(-6) scale(0.9)",
    }),
    h("use", {
      key: "footer-star-foot-near",
      href: `#${id("star")}`,
      fill: "var(--inv-surface)",
      opacity: 0.9,
      transform: "translate(238 54) rotate(10) scale(0.9)",
    }),
  ];
}

/** «Equipo de rescate» in paper cut-out: the station diorama, the road divider, and the star footer. */
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
