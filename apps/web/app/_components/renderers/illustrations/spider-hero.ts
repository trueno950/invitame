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
 * «Héroe arácnido» in paper cut-out (I3b; S1-S4), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a layered night diorama for the header — a
 * sheet of night paper, a full moon with its craters, star sparkles, a far skyline and a near skyline with lit
 * windows, a plain corner web and two threads across the sky, and the roof the invitation is watched from — a
 * torn divider of night city between two sections, and a footer strip of rooftops and stars.
 *
 * Original work: the city is a plain row of blocks, the web is the generic radial web every corner of the world
 * carries, and no masked or suited figure, spider emblem, costume, or logo of any franchise appears anywhere.
 * Every color is a theme variable of `spider-hero`, so the whole drawing re-colours with its palette; tints are
 * `opacity` on a theme color and nothing else.
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
  "M303 63C306 62 309 63.5 309 66.5C309 69.5 306 71 303.5 70.5C301 70 300 65 303 63Z";

/** The far skyline, taller and paler: what the near blocks are seen against. */
const SKYLINE_FAR =
  "M-8 178V70H16V92H36V60H58V96H78V178ZM120 178V84H142V66H164V100H186V178ZM210 178V62H232V88H254V70H276V104H298V178ZM320 178V76H342V58H364V96H396V178Z";

/** The near skyline: four blocks of different heights, each with a roof the eye can climb. */
const SKYLINE_NEAR =
  "M-8 178V112H14V96H34V120H56V104H76V178ZM96 178V82H118V70H138V104H158V178ZM178 178V116H200V100H222V124H242V108H262V178ZM282 178V94H304V78H324V110H346V96H368V118H396V178Z";

/** The lit windows of both skylines: a handful, never a grid, so the city reads as inhabited not lit up. */
const WINDOWS_FAR =
  "M6 80H14V88H6ZM22 100H30V108H22ZM6 112H14V120H6ZM128 94H136V102H128ZM146 76H154V84H146ZM128 112H136V120H128Z" +
  "M218 74H226V82H218ZM240 98H248V106H240ZM264 80H272V88H264ZM218 114H226V122H218ZM328 88H336V96H328ZM350 70H358V78H350Z";

const WINDOWS_NEAR =
  "M4 128H12V138H4ZM24 128H32V138H24ZM4 148H12V158H4ZM24 148H32V158H24ZM46 128H54V138H46Z" +
  "M104 96H112V106H104ZM124 96H132V106H124ZM104 118H112V128H104ZM124 118H132V128H124ZM104 140H112V150H104Z" +
  "M186 130H194V140H186ZM206 130H214V140H206ZM186 152H194V162H186ZM228 130H236V140H228Z" +
  "M290 108H298V118H290ZM310 108H318V118H310ZM332 108H340V118H332ZM290 132H298V142H290ZM310 132H318V142H310ZM332 132H340V142H332ZM290 154H298V164H290Z";

/** The web in the corner: five spokes out of the corner and three arcs across them. */
const WEB_SPOKES = "M-10-10L108 6M-10-10L100 44M-10-10L84 74M-10-10L52 96M-10-10L16 98";
const WEB_ARCS = "M18-4C28 4 36 14 42 26M42-7C56 8 66 24 72 44M68-9C86 12 98 32 104 56";

/** The thread that crosses the sky, and the two short threads that hang from it. */
const THREAD = "M0 74C60 46 150 44 236 58C300 68 350 62 396 50";
const THREAD_HANGS = "M150 50V68M230 58V78";

/** The roof the invitation is watched from, its chimney, its antenna, and the water tank beside it. */
const ROOF = "M-8 202V172H26V164H56V172H118V166H178V174H244V162H304V170H336V164H396V202Z";
const ROOF_CHIMNEY = "M60 164V140H78V164ZM196 174V152H210V174Z";
const ROOF_ANTENNA = "M320 162V126M306 136H334M311 148H329";
const ROOF_TANK =
  "M258 164V148H290V164ZM252 148H296V140H252ZM262 164V172M286 164V172M268 140V130H278V130V140";

const SKY_STARS: readonly Place[] = [
  { x: 26, y: 96, rotate: -10, scale: 0.9 },
  { x: 62, y: 40, rotate: 12, scale: 0.7 },
  { x: 118, y: 22, rotate: -4, scale: 1 },
  { x: 168, y: 34, rotate: 18, scale: 0.6 },
  { x: 226, y: 18, rotate: -14, scale: 0.85 },
  { x: 262, y: 88, rotate: 8, scale: 0.65 },
  { x: 360, y: 106, rotate: -6, scale: 0.9 },
  { x: 302, y: 30, rotate: 22, scale: 0.55 },
];

/** The sparkle stamp: one shape, placed with a turn and a size like the flakes of the other themes. */
function sparkleDefinition(id: IllustrationId): ReactElement {
  return h("defs", { key: "sparkle-definition" }, h("path", { id: id("sparkle"), d: SPARKLE }));
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

/** The header diorama: night sky, moon, skylines, web, and the roof in front. */
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
    fill: "var(--inv-ink)",
    outline: true,
  };
  const roof: CutSheet = {
    name: "roof",
    d: ROOF,
    fill: "var(--inv-decoration-one)",
    outline: true,
  };
  const chimney: CutSheet = {
    name: "chimney",
    d: ROOF_CHIMNEY,
    fill: "var(--inv-ink)",
    shadow: false,
  };
  const tank: CutSheet = { name: "tank", d: ROOF_TANK, fill: "var(--inv-ink)", shadow: false };

  return [
    sheetDefinitions(id, [sheet, moon, skylineFar, skylineNear, roof, chimney, tank]),
    sparkleDefinition(id),
    ...cutSheets(id, [sheet]),
    // The moon: a paler halo behind it, the disc, and the craters cut into the same sheet.
    h("circle", {
      key: "moon-halo",
      cx: 316,
      cy: 52,
      r: 36,
      fill: "var(--inv-surface)",
      opacity: 0.1,
    }),
    ...cutSheets(id, [moon]),
    h("path", { key: "moon-craters", d: MOON_CRATERS, fill: "var(--inv-soft)", opacity: 0.85 }),
    h("path", {
      key: "moon-shade",
      d: "M312 26C297 26.5 287.5 38 288 53C288.5 62 292 70 298 75 290 62 292 40 312 26Z",
      fill: "var(--inv-soft)",
      opacity: 0.5,
    }),
    sparkles("stars-sky", id, SKY_STARS, "var(--inv-surface)", 0.9),
    // The far skyline is the blue of the city at night, seen through the near one.
    ...cutSheets(id, [skylineFar]),
    h("use", {
      key: "skyline-far-veil",
      href: `#${id(skylineFar.name)}`,
      fill: "var(--inv-ink)",
      opacity: 0.35,
    }),
    h("path", { key: "windows-far", d: WINDOWS_FAR, fill: "var(--inv-surface)", opacity: 0.5 }),
    // The corner web, and the long thread that crosses the sky in front of the moon.
    h("path", {
      key: "web-spokes",
      d: WEB_SPOKES,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.42,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "web-arcs",
      d: WEB_ARCS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1,
      opacity: 0.36,
      strokeLinecap: "round",
    }),
    ...cutSheets(id, [skylineNear]),
    h("path", { key: "windows-near", d: WINDOWS_NEAR, fill: "var(--inv-soft)", opacity: 0.92 }),
    h("path", {
      key: "thread",
      d: THREAD,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 0.9,
      opacity: 0.32,
    }),
    h("path", {
      key: "thread-hangs",
      d: THREAD_HANGS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 0.8,
      opacity: 0.26,
    }),
    // The roof the invitation is watched from, with the chimney, the antenna, and the water tank on it.
    ...cutSheets(id, [roof]),
    ...cutSheets(id, [chimney, tank]),
    h("path", {
      key: "roof-antenna",
      d: ROOF_ANTENNA,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      opacity: 0.9,
    }),
    h("path", {
      key: "roof-tiles",
      d: "M-8 182H396M-8 192H396",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      opacity: 0.22,
    }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band of night city — a skyline silhouette with its lit windows and two stars. */
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
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.22,
    }),
    // A small city standing on the strip, in the ink of the night, with four windows still lit.
    h("path", {
      key: "divider-city",
      d: "M-8 46V30H12V22H30V38H48V18H68V46ZM148 46V26H166V14H184V32H202V20H220V46ZM300 46V28H318V18H338V32H356V22H378V46Z",
      fill: "var(--inv-ink)",
      opacity: 0.85,
    }),
    h("path", {
      key: "divider-windows",
      d: "M18 28H24V34H18ZM40 26H46V32H40ZM156 24H162V30H156ZM210 28H216V34H210ZM326 26H332V32H326ZM344 30H350V36H344Z",
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    h("path", {
      key: "divider-thread",
      d: "M96 20C112 14 130 14 146 20",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 0.9,
      opacity: 0.5,
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
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-ink)",
      opacity: 0.88,
    }),
    h("path", {
      key: "footer-rooftops",
      d: "M-8 70V54H16V46H34V58H52V70ZM104 70V50H122V42H140V56H158V70ZM212 70V52H230V44H248V58H266V70ZM296 70V48H314V40H332V54H350V70H396V70V70Z",
      fill: "var(--inv-ink)",
      opacity: 0.9,
    }),
    h("path", {
      key: "footer-windows",
      d: "M22 56H28V62H22ZM118 54H124V60H118ZM226 56H232V62H226ZM310 52H316V58H310ZM126 62H132V68H126ZM318 60H324V66H318Z",
      fill: "var(--inv-soft)",
      opacity: 0.85,
    }),
    h("path", {
      key: "footer-thread",
      d: "M0 22C80 10 170 16 260 10C310 7 356 12 396 8",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 0.9,
      opacity: 0.4,
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
