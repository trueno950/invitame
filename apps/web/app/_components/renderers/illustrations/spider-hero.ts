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
 * «Héroe arácnido» in paper cut-out (I4b; S3, S5), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a layered night diorama for the header — a
 * sheet of night paper, a full moon with its craters and its shaded limb, two generic corner webs with dew
 * drops, a far skyline, a suspension bridge with its towers and hangers, a near skyline with setback towers,
 * water tanks, antennas and many lit windows in two warm tones, three party balloons rising behind the town,
 * and the rooftop of the near building framing the bottom corners — a torn divider of night city between two
 * sections, and a footer strip of rooftops and stars.
 *
 * Original work: the city is a plain row of blocks, the bridge and the water towers are generic city props, and
 * the webs are the generic radial web every corner of the world carries. No masked or suited figure, spider,
 * emblem, costume, or logo of any franchise appears anywhere (S3). Every color is a theme variable of
 * `spider-hero`, so the whole drawing re-colours with its palette; tints are `opacity` on a theme color, and the
 * only fill that is not a plain theme color is the pattern of the foreground roof, built from theme colors and
 * referenced by an id the frame makes unique. The two lit tones of the windows are the palette's only light
 * papers: the accent and the surface.
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

/** The four-point sparkle the sky is full of, and the dot that fills the gaps between them. */
const SPARKLE = "M0-6.4L1.6-1.6L6.4 0L1.6 1.6L0 6.4L-1.6 1.6L-6.4 0L-1.6-1.6Z";

/** The moon: a hand-cut disc with three craters cut from the same sheet. */
const MOON =
  "M312 26C327 25.5 341 36 343 51C345 66 334 79 318 79.5C302 80 288.5 68 288 53C287.5 38 297 26.5 312 26Z";

const MOON_CRATERS =
  "M304 40C309 38.5 314 40.5 315 45C316 49.5 312 53 307.5 52.5C303 52 300 46 304 40Z" +
  "M320 58C325 56.5 330 59 330.5 63C331 67 327 70 322.5 69.5C318 69 316 62 320 58Z" +
  "M303 63C306 62 309 63.5 309 66.5C309 69.5 306 71 303.5 70.5C301 70 300 65 303 63Z" +
  "M316 34C318 33.5 320 34.5 320 36.5C320 38.5 318 39.5 316.5 39C315 38.5 314 35 316 34Z";

const MOON_SHADE = "M312 26C297 26.5 287.5 38 288 53C288.5 62 292 70 298 75C290 62 292 40 312 26Z";

const MOON_RIM = "M297 29C290 36 287.5 45 289 54";

/** The far skyline, taller and paler: what the near blocks are seen against. */
const SKYLINE_FAR =
  "M-8 168V96H22V84H48V104H70V168ZM86 168V88H118V76H146V100H170V168ZM186 168V104H214V92H244V112H268V168Z" +
  "M286 168V88H316V74H344V98H370V168ZM378 168V92H396V168Z";

/** The near skyline: four blocks of different heights, with a gap in the middle for the bridge. */
const SKYLINE_NEAR =
  "M-8 168V118H64V168ZM70 168V106H130V168ZM224 168V124H282V168ZM288 168V110H344V168ZM350 168V122H396V168Z";

/** The setbacks, cornices and roof rails that make each block a building and not a rectangle. */
const SKYLINE_DETAIL =
  "M12 118V104H52V118ZM70 106H130V111H70ZM224 124H282V129H224ZM288 110H344V115H288ZM350 122H396V127H350" +
  "M12 104H42V100H52M96 106V92H112V106M302 110V96H330V110";

/** The suspension bridge in the gap: towers, deck, main cable, and its hangers. */
const BRIDGE = "M150 132H286V137H150Z";
const BRIDGE_TOWERS = "M164 146V88H178V146ZM258 146V88H272V146Z";
const BRIDGE_BRACES = "M164 98H178M164 110H178M258 98H272M258 110H272";
const BRIDGE_CABLE =
  "M140 114C150 98 158 90 164 90C180 90 194 118 216 118C238 118 252 90 266 90C272 90 280 100 290 112";
const BRIDGE_HANGERS = "M152 104V132M184 116V132M200 118V132M232 118V132M248 108V132M280 104V132";

/** The water tanks on the roofs: a tank, its conical lid, and its four legs. */
const TANK = "M0 0V-18H26V0Z";
const TANK_LID = "M-3 -18L13 -27L29 -18Z";
const TANK_LEGS = "M2 0V8M24 0V8M6-18V-12M20-18V-12";

/** The corner web: five spokes out of the corner and three arcs across them. */
const WEB_SPOKES = "M-10-10L108 6M-10-10L100 44M-10-10L84 74M-10-10L52 96M-10-10L16 98";
const WEB_ARCS = "M18-4C28 4 36 14 42 26M42-7C56 8 66 24 72 44M68-9C86 12 98 32 104 56";

/** The balloons rising behind the town, and the strings that tie them to the roof. */
const BALLOON = "M-10 0C-10-11-5-18 0-18C5-18 10-11 10 0C10 9 5 15 0 15C-5 15-10 9-10 0Z";
const BALLOON_KNOT = "M-3 15H3L0 19Z";
const BALLOON_STRINGS =
  "M112 110C112 96 110 82 108 68M112 110C118 92 124 80 128 60M112 110C120 100 132 88 140 78";

/** The foreground rooftop at the left, with its parapet and chimney, and the right one with its rail. */
const ROOF_LEFT = "M-8 202V172H72V166H96V202Z";
const ROOF_LEFT_CHIMNEY = "M24 172V146H42V172Z";
const ROOF_RIGHT = "M296 202V176H330V170H396V202Z";
const ROOF_RAIL = "M300 176V158H326V176M306 158V176M314 158V176M322 158V176";

const SKY_STARS: readonly Place[] = [
  { x: 22, y: 92, rotate: -10, scale: 0.9 },
  { x: 62, y: 38, rotate: 12, scale: 0.7 },
  { x: 118, y: 20, rotate: -4, scale: 1 },
  { x: 168, y: 34, rotate: 18, scale: 0.6 },
  { x: 204, y: 92, rotate: -14, scale: 0.55 },
  { x: 262, y: 112, rotate: 8, scale: 0.65 },
  { x: 300, y: 26, rotate: -6, scale: 0.85 },
  { x: 356, y: 84, rotate: 22, scale: 0.6 },
];

const SKY_DOTS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 40, y: 66, r: 1.1 },
  { x: 90, y: 44, r: 0.9 },
  { x: 142, y: 58, r: 1.2 },
  { x: 190, y: 22, r: 0.9 },
  { x: 232, y: 70, r: 1 },
  { x: 276, y: 46, r: 0.8 },
  { x: 330, y: 60, r: 1.1 },
  { x: 372, y: 34, r: 0.9 },
];

/** The pages of windows: small rectangles in the two light tones of the palette. */
interface Cell {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const WARM_CELLS: readonly Cell[] = [
  { x: 4, y: 126, w: 5, h: 7 },
  { x: 16, y: 126, w: 5, h: 7 },
  { x: 34, y: 126, w: 5, h: 7 },
  { x: 46, y: 126, w: 5, h: 7 },
  { x: 4, y: 144, w: 5, h: 7 },
  { x: 34, y: 144, w: 5, h: 7 },
  { x: 84, y: 116, w: 5, h: 7 },
  { x: 100, y: 116, w: 5, h: 7 },
  { x: 84, y: 134, w: 5, h: 7 },
  { x: 118, y: 152, w: 5, h: 7 },
  { x: 232, y: 134, w: 5, h: 7 },
  { x: 250, y: 134, w: 5, h: 7 },
  { x: 232, y: 152, w: 5, h: 7 },
  { x: 298, y: 120, w: 5, h: 7 },
  { x: 316, y: 120, w: 5, h: 7 },
  { x: 298, y: 138, w: 5, h: 7 },
  { x: 334, y: 138, w: 5, h: 7 },
  { x: 360, y: 132, w: 5, h: 7 },
  { x: 378, y: 132, w: 5, h: 7 },
  { x: 360, y: 150, w: 5, h: 7 },
];

const PALE_CELLS: readonly Cell[] = [
  { x: 24, y: 126, w: 5, h: 7 },
  { x: 24, y: 144, w: 5, h: 7 },
  { x: 46, y: 144, w: 5, h: 7 },
  { x: 8, y: 154, w: 5, h: 7 },
  { x: 84, y: 150, w: 5, h: 7 },
  { x: 100, y: 134, w: 5, h: 7 },
  { x: 240, y: 152, w: 5, h: 7 },
  { x: 264, y: 152, w: 5, h: 7 },
  { x: 316, y: 138, w: 5, h: 7 },
  { x: 378, y: 150, w: 5, h: 7 },
  { x: 370, y: 120, w: 5, h: 7 },
];

/** The sparkle stamp: one shape, placed with a turn and a size like the flakes of the other themes. */
function sparkleDefinition(id: IllustrationId): ReactElement {
  return h("defs", { key: "sparkle-definition" }, h("path", { id: id("sparkle"), d: SPARKLE }));
}

/** The balloon stamp: the paper disc, the knot, and the glint, defined once and placed three times. */
function balloonDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "balloon-definition" },
    h(
      "g",
      { id: id("balloon") },
      h("path", { key: "body", d: BALLOON }),
      h("path", { key: "knot", d: BALLOON_KNOT }),
    ),
  );
}

/** The brick of the foreground roof, painted as the fill of a theme-colored sheet. */
function patternDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "pattern-definitions" },
    h(
      "pattern",
      {
        key: "roof-brick",
        id: id("roof-brick"),
        width: 26,
        height: 12,
        patternUnits: "userSpaceOnUse",
      },
      h("path", {
        key: "courses",
        d: "M0 6H26M0 12H26M13 0V6M0 6V12",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 0.8,
        opacity: 0.14,
      }),
    ),
  );
}

/** The sparkles of the sky, and the small dots that keep them from looking like a pattern. */
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

/** The lit windows, in the palette's two light papers: the red accent and the white surface. */
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
        rx: 0.8,
      }),
    ),
  );
}

/** One corner web, with the dew drops that catch the moonlight on its strands. */
function cornerWeb(
  key: string,
  transform: string,
  dew: readonly { readonly x: number; readonly y: number; readonly r: number }[],
): ReactElement {
  return h(
    "g",
    { key, transform },
    h("path", {
      key: "spokes",
      d: WEB_SPOKES,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      opacity: 0.55,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "arcs",
      d: WEB_ARCS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.45,
      strokeLinecap: "round",
    }),
    h(
      "g",
      { key: "dew", fill: "var(--inv-surface)", opacity: 0.85 },
      dew.map((drop) =>
        h("circle", { key: `dew-${drop.x}-${drop.y}`, cx: drop.x, cy: drop.y, r: drop.r }),
      ),
    ),
  );
}

/** The three party balloons rising behind the town, with the strings that tie them to the roof. */
function balloons(id: IllustrationId): ReactElement[] {
  const places: readonly {
    readonly key: string;
    readonly x: number;
    readonly y: number;
    readonly scale: number;
    readonly paint: ThemePaint;
  }[] = [
    { key: "balloon-far", x: 140, y: 78, scale: 0.66, paint: "var(--inv-soft)" },
    { key: "balloon-mid", x: 128, y: 60, scale: 0.78, paint: "var(--inv-surface)" },
    { key: "balloon-near", x: 108, y: 68, scale: 0.9, paint: "var(--inv-accent)" },
  ];

  return [
    ...places.map((place) =>
      h("use", {
        key: place.key,
        href: `#${id("balloon")}`,
        fill: place.paint,
        transform: `translate(${place.x} ${place.y}) scale(${place.scale})`,
      }),
    ),
    h("path", {
      key: "balloon-strings",
      d: BALLOON_STRINGS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 0.9,
      opacity: 0.5,
    }),
    h(
      "g",
      { key: "balloon-glints", fill: "var(--inv-surface)", opacity: 0.55 },
      places.map((place) =>
        h("circle", {
          key: `${place.key}-glint`,
          cx: place.x - 3 * place.scale,
          cy: place.y - 6 * place.scale,
          r: 1.6 * place.scale,
        }),
      ),
    ),
  ];
}

/** The header diorama: night sky, moon, webs, bridge, skylines, and the roof in front. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 3.4, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-ink)", shadow: false };
  const moon: CutSheet = { name: "moon", d: MOON, fill: "var(--inv-surface)" };
  const skylineFar: CutSheet = {
    name: "skyline-far",
    d: SKYLINE_FAR,
    fill: "var(--inv-decoration-one)",
    shadow: false,
  };
  const skylineNear: CutSheet = {
    name: "skyline-near",
    d: SKYLINE_NEAR,
    fill: "var(--inv-decoration-one)",
    outline: true,
  };
  const bridge: CutSheet = {
    name: "bridge",
    d: BRIDGE,
    fill: "var(--inv-decoration-one)",
    shadow: false,
  };
  const bridgeTowers: CutSheet = {
    name: "bridge-towers",
    d: BRIDGE_TOWERS,
    fill: "var(--inv-decoration-one)",
    shadow: false,
  };
  const roofLeft: CutSheet = {
    name: "roof-left",
    d: ROOF_LEFT,
    fill: "var(--inv-decoration-one)",
    outline: true,
  };
  const roofRight: CutSheet = {
    name: "roof-right",
    d: ROOF_RIGHT,
    fill: "var(--inv-decoration-one)",
    outline: true,
  };
  const tankLeft: CutSheet = {
    name: "tank-left",
    d: TANK,
    fill: "var(--inv-ink)",
    shadow: false,
  };
  const tankLeftLid: CutSheet = {
    name: "tank-left-lid",
    d: TANK_LID,
    fill: "var(--inv-ink)",
    shadow: false,
  };
  const tankRight: CutSheet = {
    name: "tank-right",
    d: TANK,
    fill: "var(--inv-ink)",
    shadow: false,
  };
  const tankRightLid: CutSheet = {
    name: "tank-right-lid",
    d: TANK_LID,
    fill: "var(--inv-ink)",
    shadow: false,
  };

  return [
    sheetDefinitions(id, [
      sheet,
      moon,
      skylineFar,
      skylineNear,
      bridge,
      bridgeTowers,
      roofLeft,
      roofRight,
      tankLeft,
      tankLeftLid,
      tankRight,
      tankRightLid,
    ]),
    sparkleDefinition(id),
    balloonDefinition(id),
    patternDefinitions(id),
    ...cutSheets(id, [sheet]),
    sparkles("stars-sky", id, SKY_STARS, "var(--inv-surface)", 0.9),
    h(
      "g",
      { key: "sky-dots", fill: "var(--inv-surface)", opacity: 0.55 },
      SKY_DOTS.map((dot) =>
        h("circle", { key: `dot-${dot.x}-${dot.y}`, cx: dot.x, cy: dot.y, r: dot.r }),
      ),
    ),
    // The moon: halo, disc, the craters cut from it, its shaded limb, and a rim of light.
    h("circle", {
      key: "moon-halo",
      cx: 237,
      cy: 44,
      r: 36,
      fill: "var(--inv-surface)",
      opacity: 0.1,
    }),
    h(
      "g",
      { key: "moon-figure", transform: "translate(-78 -10)" },
      ...cutSheets(id, [moon]),
      h("path", { key: "craters", d: MOON_CRATERS, fill: "var(--inv-soft)", opacity: 0.9 }),
      h("path", { key: "shade", d: MOON_SHADE, fill: "var(--inv-soft)", opacity: 0.55 }),
      h("path", {
        key: "rim",
        d: MOON_RIM,
        fill: "none",
        stroke: "var(--inv-soft)",
        strokeWidth: 1.4,
        opacity: 0.5,
      }),
    ),
    // The two generic corner webs, each with its dew drops.
    cornerWeb("web-left", "translate(0 0) scale(0.88)", [
      { x: 30, y: 12, r: 1.6 },
      { x: 62, y: 32, r: 1.2 },
      { x: 46, y: 66, r: 1.4 },
    ]),
    cornerWeb("web-right", "translate(390 0) scale(-0.88 0.88)", [
      { x: 26, y: 18, r: 1.4 },
      { x: 58, y: 44, r: 1.6 },
      { x: 38, y: 72, r: 1.1 },
    ]),
    // The far skyline, the bridge in the gap, then the near blocks in front of both.
    ...cutSheets(id, [skylineFar]),
    h("use", {
      key: "skyline-far-veil",
      href: `#${id(skylineFar.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.36,
    }),
    windows("windows-far", WARM_CELLS.slice(0, 3), "var(--inv-accent)", 0.45),
    ...cutSheets(id, [bridge, bridgeTowers]),
    h("use", {
      key: "bridge-veil",
      href: `#${id(bridge.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.42,
    }),
    h("use", {
      key: "bridge-towers-veil",
      href: `#${id(bridgeTowers.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.42,
    }),
    h("path", {
      key: "bridge-braces",
      d: BRIDGE_BRACES,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1,
      opacity: 0.25,
    }),
    h("path", {
      key: "bridge-cable",
      d: BRIDGE_CABLE,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      opacity: 0.5,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "bridge-hangers",
      d: BRIDGE_HANGERS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 0.8,
      opacity: 0.35,
    }),
    h("path", {
      key: "bridge-lights",
      d: "M156 132h3v3h-3ZM180 132h3v3h-3ZM216 132h3v3h-3ZM252 132h3v3h-3ZM276 132h3v3h-3",
      fill: "var(--inv-accent)",
      opacity: 0.85,
    }),
    ...cutSheets(id, [skylineNear]),
    h("use", {
      key: "skyline-near-veil",
      href: `#${id(skylineNear.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.6,
    }),
    h("path", {
      key: "skyline-detail",
      d: SKYLINE_DETAIL,
      fill: "var(--inv-decoration-one)",
      opacity: 0.32,
    }),
    windows("windows-warm", WARM_CELLS, "var(--inv-accent)", 0.95),
    windows("windows-pale", PALE_CELLS, "var(--inv-surface)", 0.85),
    // The rooftops that frame the bottom: a tank on the left, a rail on the right, and the party in between.
    ...balloons(id),
    h("use", {
      key: "tank-left",
      href: `#${id("tank-left")}`,
      fill: "var(--inv-ink)",
      transform: "translate(18 118)",
    }),
    h("use", {
      key: "tank-left-lid",
      href: `#${id("tank-left-lid")}`,
      fill: "var(--inv-accent)",
      transform: "translate(18 118)",
    }),
    h("path", {
      key: "tank-left-legs",
      d: TANK_LEGS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.6,
      transform: "translate(18 118)",
    }),
    h("use", {
      key: "tank-right",
      href: `#${id("tank-right")}`,
      fill: "var(--inv-ink)",
      transform: "translate(306 112) scale(0.72)",
    }),
    h("use", {
      key: "tank-right-lid",
      href: `#${id("tank-right-lid")}`,
      fill: "var(--inv-accent)",
      transform: "translate(306 112) scale(0.72)",
    }),
    h("path", {
      key: "tank-right-legs",
      d: TANK_LEGS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.8,
      transform: "translate(306 112) scale(0.72)",
    }),
    h("path", {
      key: "antennas",
      d: "M76 106V88M70 94H82M116 106V92M111 98H121M336 110V92M330 98H342",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      opacity: 0.9,
    }),
    // The roof the party is watched from, with its brick and its chimney, and the rail at the right.
    ...cutSheets(id, [roofLeft, roofRight]),
    h("use", {
      key: "roof-left-veil",
      href: `#${id(roofLeft.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.48,
    }),
    h("use", {
      key: "roof-right-veil",
      href: `#${id(roofRight.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.48,
    }),
    h("use", {
      key: "roof-brick",
      href: `#${id(roofLeft.name)}`,
      style: { fill: `url(#${id("roof-brick")})` },
    }),
    h("use", {
      key: "roof-brick-right",
      href: `#${id(roofRight.name)}`,
      style: { fill: `url(#${id("roof-brick")})` },
    }),
    h("path", {
      key: "roof-parapet",
      d: "M-8 172H72M-8 166H96M296 176H330M330 170H396",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      opacity: 0.3,
    }),
    h("path", { key: "roof-chimney", d: ROOF_LEFT_CHIMNEY, fill: "var(--inv-ink)", opacity: 0.9 }),
    h("path", {
      key: "roof-rail",
      d: ROOF_RAIL,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.6,
      strokeLinecap: "round",
      opacity: 0.85,
    }),
    h("path", {
      key: "roof-tiles",
      d: "M-8 186H96M-8 194H96M296 188H396M296 196H396",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      opacity: 0.2,
    }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band of night city — a skyline with its lit windows and its stars. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 22, 3.6, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 40, 5.1, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    sparkleDefinition(id),
    balloonDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-ink)",
      opacity: 0.8,
    }),
    // A small city standing on the strip, in the ink of the night, with its windows still lit.
    h("path", {
      key: "divider-city",
      d: "M-8 46V30H12V22H30V38H48V18H68V46ZM148 46V26H166V14H184V32H202V20H220V46ZM300 46V28H318V18H338V32H356V22H378V46Z",
      fill: "var(--inv-ink)",
      opacity: 0.9,
    }),
    h("path", {
      key: "divider-windows",
      d: "M18 28H23V33H18ZM40 26H45V31H40ZM156 24H161V29H156ZM210 28H215V33H210ZM326 26H331V31H326ZM344 30H349V35H344Z",
      fill: "var(--inv-accent)",
      opacity: 0.9,
    }),
    h("path", {
      key: "divider-windows-pale",
      d: "M8 36H13V41H8ZM190 36H195V41H190ZM366 34H371V39H366Z",
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    h("path", {
      key: "divider-cable",
      d: "M96 20C112 14 130 14 146 20",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 0.9,
      opacity: 0.5,
    }),
    // A web in the left corner of the strip, and two balloons rising out of the city.
    cornerWeb("divider-web", "translate(0 0) scale(0.72)", [
      { x: 30, y: 14, r: 1.2 },
      { x: 54, y: 34, r: 1 },
    ]),
    h("use", {
      key: "divider-balloon-a",
      href: `#${id("balloon")}`,
      fill: "var(--inv-accent)",
      transform: "translate(252 30) scale(0.5)",
    }),
    h("use", {
      key: "divider-balloon-b",
      href: `#${id("balloon")}`,
      fill: "var(--inv-surface)",
      transform: "translate(272 22) scale(0.44)",
    }),
    sparkles(
      "divider-stars",
      id,
      [
        { x: 76, y: 12, rotate: 8, scale: 0.7 },
        { x: 112, y: 26, rotate: -12, scale: 0.5 },
        { x: 246, y: 10, rotate: 16, scale: 0.6 },
        { x: 290, y: 40, rotate: -8, scale: 0.45 },
      ],
      "var(--inv-surface)",
      0.85,
    ),
  ];
}

/** The footer: a torn band of night with the rooftops in front of it and the stars above. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 7.2, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 36, 2.6, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-ink)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    sparkleDefinition(id),
    balloonDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-ink)",
      opacity: 0.88,
    }),
    h("path", {
      key: "footer-rooftops",
      d: "M-8 70V54H16V46H34V58H52V70ZM104 70V50H122V42H140V56H158V70ZM212 70V52H230V44H248V58H266V70ZM296 70V48H314V40H332V54H350V70H396V70Z",
      fill: "var(--inv-ink)",
      opacity: 0.95,
    }),
    h("path", {
      key: "footer-tanks",
      d: "M22 46V40H34V46ZM22 40H34M118 42V36H130V42ZM118 36H130",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 1.2,
      opacity: 0.5,
    }),
    h("path", {
      key: "footer-windows",
      d: "M22 56H27V62H22ZM118 54H123V60H118ZM226 56H231V62H226ZM310 52H315V58H310ZM126 62H131V68H126ZM318 60H323V66H318Z",
      fill: "var(--inv-accent)",
      opacity: 0.9,
    }),
    h("path", {
      key: "footer-windows-pale",
      d: "M34 56H39V62H34ZM236 56H241V62H236ZM330 52H335V58H330Z",
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    h("path", {
      key: "footer-thread",
      d: "M0 22C80 10 170 16 260 10C310 7 356 12 396 8",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 0.9,
      opacity: 0.4,
    }),
    cornerWeb("footer-web", "translate(390 0) scale(-0.8 0.8)", [
      { x: 30, y: 14, r: 1.2 },
      { x: 52, y: 30, r: 1 },
    ]),
    h("use", {
      key: "footer-balloon",
      href: `#${id("balloon")}`,
      fill: "var(--inv-accent)",
      transform: "translate(84 30) scale(0.5)",
    }),
    h("use", {
      key: "footer-balloon-b",
      href: `#${id("balloon")}`,
      fill: "var(--inv-surface)",
      transform: "translate(104 22) scale(0.42)",
    }),
    sparkles(
      "footer-stars",
      id,
      [
        { x: 46, y: 26, rotate: 10, scale: 0.6 },
        { x: 88, y: 16, rotate: -14, scale: 0.45 },
        { x: 178, y: 26, rotate: 8, scale: 0.55 },
        { x: 272, y: 20, rotate: -6, scale: 0.5 },
        { x: 356, y: 26, rotate: 12, scale: 0.6 },
      ],
      "var(--inv-surface)",
      0.85,
    ),
  ];
}

/** «Héroe arácnido» in paper cut-out: the night diorama, the city divider, and the rooftop footer. */
export const SPIDER_HERO_ILLUSTRATION: ThemeIllustration = {
  theme: "spider-hero",
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
