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
 * «Ratón clásico» in paper cut-out (I3b; S1-S4), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a vintage party diorama for the header — two
 * swags of polka-dot bunting, three balloons on their strings, a three-tier cake on its stand with its candles
 * lit, two wrapped gifts with their bows, and confetti across the paper — a torn divider that carries a swag of
 * flags between two sections, and a footer strip of confetti, bows and a gift.
 *
 * Original work: there is no mouse, no character, no costume, and no logo here — the theme is a vintage party,
 * and every shape is a generic party prop of our own: bunting, balloons, cake, gifts, bows, confetti. Every
 * color is a theme variable of `classic-mouse`, so the whole drawing re-colours with its palette; tints are
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

/** A triangle flag, hung from a bunting string: the string's point is the top edge's center. */
const FLAG = "M-11 0H11L0 22Z";

/** A balloon: a hand-cut body, its knot, and the string that follows it down. */
const BALLOON =
  "M0 0C-9.5-1-14.5-9.5-12.5-18.5C-10.5-27.5 2-31.5 8.5-26.5C15-21.5 15-10 8.5-5C5.5-2.5 3 0 0 0Z";
const BALLOON_KNOT = "M0 0L-3.4 5.4H3.4Z";

/** The cake: three tiers with their icing, five cherries, and three candles with their flames. */
const CAKE_TIERS = "M148 178V148H242V178ZM168 148V122H222V148Z";
const CAKE_ICING =
  "M148 148C154 157 160 148 166 155C172 161 178 150 184 156C190 162 196 149 202 155C208 160 214 150 220 " +
  "155C226 159 232 151 238 154C240 155 241 150 242 148Z" +
  "M168 122C172 129 177 122 182 127C187 132 192 123 197 128C202 133 207 123 212 127C216 130 220 123 222 122Z";

/** The polka dots pressed into the cake's sides, like the bunting's. */
const CAKE_DOTS =
  "M160 168H164V172H160ZM180 172H184V176H180ZM202 168H206V172H202ZM224 172H228V176H224Z" +
  "M178 138H182V142H178ZM192 140H196V144H192ZM208 136H212V140H208Z";

const CAKE_STAND = "M140 178H250V183H140ZM188 183V190H202V183Z";
const CAKE_STAND_FOOT = "M170 190H220V195H170Z";
const CANDLES = "M182 122V106H185V122ZM193 122V103H196V122ZM204 122V107H207V122Z";

/** The two gifts: a lid, a body, and the ribbon that crosses both. */
const GIFT_NEAR = "M296 152H344V178H296Z";
const GIFT_NEAR_LID = "M292 146H348V154H292Z";
const GIFT_FAR = "M266 160H296V178H266Z";
const GIFT_FAR_LID = "M263 155H299V162H263Z";
const GIFT_RIBBON = "M316 146H324V178H316ZM263 168H299V174H263Z";
const GIFT_NEAR_RIBBON = "M316 146H324V178H316ZM292 160H348V166H292Z";

/** The bow that ties a gift, and the bow that closes a swag of bunting. */
const BOW = "M0 0C-6-7-15-6-15 1C-15 8-6 8 0 2C6 8 15 8 15 1C15-6 6-7 0 0Z" + "M-2 0L-5 9H5L2 0Z";

/** The swag strings, and the balloons' strings. */
const SWAG_LEFT = "M-6 26C60 62 140 44 196 30";
const SWAG_RIGHT = "M196 30C254 46 330 64 396 22";
const BALLOON_STRINGS =
  "M58 116C62 132 78 140 82 156M84 94C92 116 76 136 84 156M36 136C40 148 56 152 66 158";

/** Confetti: one stamp, placed at eight angles and sizes across the paper. */
const CONFETTI = "M-4-3L4-4L5 3L-3 4Z";

const FLAGS: readonly { readonly x: number; readonly y: number; readonly rotate: number }[] = [
  { x: 30, y: 38, rotate: -12 },
  { x: 62, y: 47, rotate: -6 },
  { x: 96, y: 51, rotate: 0 },
  { x: 130, y: 51, rotate: 5 },
  { x: 164, y: 45, rotate: 10 },
  { x: 230, y: 38, rotate: -10 },
  { x: 262, y: 46, rotate: -5 },
  { x: 296, y: 51, rotate: 2 },
  { x: 330, y: 49, rotate: 8 },
  { x: 364, y: 38, rotate: 13 },
];

const BALLOONS: readonly { readonly place: Place; readonly paint: ThemePaint }[] = [
  { place: { x: 58, y: 116, rotate: -8, scale: 1.15 }, paint: "var(--inv-accent)" },
  { place: { x: 84, y: 94, rotate: 6, scale: 0.9 }, paint: "var(--inv-decoration-one)" },
  { place: { x: 36, y: 136, rotate: -14, scale: 0.78 }, paint: "var(--inv-surface)" },
];

const CONFETTI_PLACES: readonly Place[] = [
  { x: 118, y: 90, rotate: 12, scale: 1 },
  { x: 150, y: 66, rotate: -22, scale: 0.7 },
  { x: 268, y: 96, rotate: 34, scale: 0.9 },
  { x: 300, y: 70, rotate: -8, scale: 0.65 },
  { x: 348, y: 110, rotate: 18, scale: 0.8 },
  { x: 200, y: 74, rotate: -16, scale: 0.6 },
  { x: 92, y: 152, rotate: 26, scale: 0.85 },
  { x: 250, y: 132, rotate: -30, scale: 0.75 },
];

/** The flag stamp: one triangle, filled with whatever color the placement asks for. */
function flagDefinition(id: IllustrationId): ReactElement {
  return h("defs", { key: "flag-definition" }, h("path", { id: id("flag"), d: FLAG }));
}

/** The balloon stamp: the body, the knot, and a highlight cut from the same sheet. */
function balloonDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "balloon-definition" },
    h(
      "g",
      { id: id("balloon") },
      h("path", { key: "body", d: BALLOON }),
      h("path", { key: "knot", d: BALLOON_KNOT }),
      h("ellipse", {
        key: "shine",
        cx: -4,
        cy: -20,
        rx: 2.6,
        ry: 4.4,
        transform: "rotate(-24 -4 -20)",
        fill: "var(--inv-surface)",
        opacity: 0.5,
      }),
    ),
  );
}

/** The swag of bunting: the string, then the flags that hang from it, one tilt each. */
function bunting(
  key: string,
  id: IllustrationId,
  path: string,
  flags: readonly { readonly x: number; readonly y: number; readonly rotate: number }[],
  paint: ThemePaint,
): ReactElement[] {
  return [
    h("path", {
      key: `${key}-string`,
      d: path,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.3,
      opacity: 0.5,
      strokeLinecap: "round",
    }),
    h(
      "g",
      { key: `${key}-flags` },
      flags.map((flag, index) =>
        h("use", {
          key: `${key}-flag-${flag.x}`,
          href: `#${id("flag")}`,
          fill:
            index % 3 === 0 ? "var(--inv-accent)" : index % 3 === 1 ? paint : "var(--inv-surface)",
          transform: `translate(${flag.x} ${flag.y}) rotate(${flag.rotate})`,
        }),
      ),
    ),
    // The polka dots of the vintage bunting: three dots on every red or yellow flag.
    h(
      "g",
      { key: `${key}-dots`, fill: "var(--inv-surface)", opacity: 0.85 },
      flags.flatMap((flag) => [
        h("circle", { key: `${key}-dot-a-${flag.x}`, cx: flag.x, cy: flag.y + 7, r: 1.5 }),
        h("circle", { key: `${key}-dot-b-${flag.x}`, cx: flag.x - 5, cy: flag.y + 14, r: 1.5 }),
        h("circle", { key: `${key}-dot-c-${flag.x}`, cx: flag.x + 5, cy: flag.y + 14, r: 1.5 }),
      ]),
    ),
  ];
}

/** The header diorama: bunting, balloons, the cake on its stand, the gifts, and the confetti. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 12, 2.8, SCENE_HEIGHT + 8);
  const table = tornEdge(SCENE_WIDTH, 176, 4.4, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const tableTop: CutSheet = { name: "table", d: table.sheet, fill: "var(--inv-surface)" };
  const tiers: CutSheet = {
    name: "cake",
    d: CAKE_TIERS,
    fill: "var(--inv-decoration-one)",
    outline: true,
  };
  const icing: CutSheet = {
    name: "icing",
    d: CAKE_ICING,
    fill: "var(--inv-accent)",
    shadow: false,
  };
  const stand: CutSheet = { name: "stand", d: CAKE_STAND, fill: "var(--inv-accent)" };
  const standFoot: CutSheet = {
    name: "stand-foot",
    d: CAKE_STAND_FOOT,
    fill: "var(--inv-accent)",
  };
  const giftNear: CutSheet = { name: "gift-near", d: GIFT_NEAR, fill: "var(--inv-accent)" };
  const giftNearLid: CutSheet = {
    name: "gift-near-lid",
    d: GIFT_NEAR_LID,
    fill: "var(--inv-accent)",
  };
  const giftFar: CutSheet = { name: "gift-far", d: GIFT_FAR, fill: "var(--inv-ink)" };
  const giftFarLid: CutSheet = { name: "gift-far-lid", d: GIFT_FAR_LID, fill: "var(--inv-ink)" };

  return [
    sheetDefinitions(id, [
      sheet,
      tableTop,
      tiers,
      icing,
      stand,
      standFoot,
      giftNear,
      giftNearLid,
      giftFar,
      giftFarLid,
    ]),
    flagDefinition(id),
    balloonDefinition(id),
    ...cutSheets(id, [sheet]),
    // A pale disc of paper behind the cake, so the table is lit like a stage.
    h("circle", {
      key: "spotlight",
      cx: 196,
      cy: 116,
      r: 74,
      fill: "var(--inv-surface)",
      opacity: 0.45,
    }),
    h(
      "g",
      { key: "confetti", fill: "var(--inv-accent)", opacity: 0.55 },
      CONFETTI_PLACES.slice(0, 4).map((place) =>
        h("path", {
          key: `confetti-${place.x}`,
          d: CONFETTI,
          transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
        }),
      ),
    ),
    h(
      "g",
      { key: "confetti-warm", fill: "var(--inv-decoration-one)", opacity: 0.85 },
      CONFETTI_PLACES.slice(4).map((place) =>
        h("path", {
          key: `confetti-warm-${place.x}`,
          d: CONFETTI,
          transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
        }),
      ),
    ),
    ...bunting("swag-left", id, SWAG_LEFT, FLAGS.slice(0, 5), "var(--inv-decoration-one)"),
    ...bunting("swag-right", id, SWAG_RIGHT, FLAGS.slice(5), "var(--inv-decoration-one)"),
    // A bow hangs from the middle of both swags, where the two strings meet.
    h("path", {
      key: "swag-bow",
      d: BOW,
      fill: "var(--inv-accent)",
      transform: "translate(196 30)",
    }),
    // The balloons, on their strings, before the table covers their ends.
    h("path", {
      key: "balloon-strings",
      d: BALLOON_STRINGS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      opacity: 0.45,
    }),
    ...BALLOONS.flatMap((balloon) => [
      h("use", {
        key: `balloon-${balloon.place.x}`,
        href: `#${id("balloon")}`,
        fill: balloon.paint,
        transform: `translate(${balloon.place.x} ${balloon.place.y}) rotate(${balloon.place.rotate}) scale(${balloon.place.scale})`,
      }),
    ]),
    ...cutSheets(id, [tableTop]),
    // The gifts sit on the table, in front of the cake stand's shadow.
    ...cutSheets(id, [giftFar, giftFarLid]),
    h("path", { key: "gift-far-ribbon", d: GIFT_RIBBON, fill: "var(--inv-surface)", opacity: 0.9 }),
    h("path", {
      key: "gift-far-bow",
      d: BOW,
      fill: "var(--inv-surface)",
      transform: "translate(281 150) scale(0.7)",
    }),
    ...cutSheets(id, [giftNear, giftNearLid]),
    h("path", { key: "gift-near-ribbon", d: GIFT_NEAR_RIBBON, fill: "var(--inv-decoration-one)" }),
    h("path", {
      key: "gift-near-bow",
      d: BOW,
      fill: "var(--inv-decoration-one)",
      transform: "translate(320 142) scale(0.8)",
    }),
    // The cake: the stand, the three tiers, the icing that spills over each one, the cherries, the candles.
    ...cutSheets(id, [standFoot, stand]),
    ...cutSheets(id, [tiers]),
    h("use", { key: "icing-fill", href: `#${id(icing.name)}`, fill: icing.fill }),
    h("path", { key: "cake-dots", d: CAKE_DOTS, fill: "var(--inv-surface)", opacity: 0.85 }),
    h("path", { key: "candles", d: CANDLES, fill: "var(--inv-accent)" }),
    h(
      "g",
      { key: "flames", fill: "var(--inv-decoration-one)" },
      [
        [183.5, 101],
        [194.5, 98],
        [205.5, 102],
      ].map(([cx, cy]) => h("circle", { key: `flame-${cx}`, cx, cy, r: 2.8 })),
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band of paper with a swag of bunting and its confetti between two sections. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 24, 3.2, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 40, 5.4, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-accent)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    flagDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.2,
    }),
    h("path", {
      key: "divider-dots",
      d: "M56 30H60V34H56ZM96 30H100V34H96ZM136 30H140V34H136ZM236 30H240V34H236ZM276 30H280V34H276ZM316 30H320V34H316Z",
      fill: "var(--inv-surface)",
      opacity: 0.7,
    }),
    ...bunting(
      "divider-swag",
      id,
      "M-6 16C80 44 160 40 240 30C300 24 350 30 396 16",
      [
        { x: 34, y: 24, rotate: -8 },
        { x: 86, y: 32, rotate: -3 },
        { x: 138, y: 34, rotate: 2 },
        { x: 190, y: 33, rotate: 6 },
        { x: 242, y: 31, rotate: 3 },
        { x: 294, y: 26, rotate: -2 },
        { x: 348, y: 20, rotate: -7 },
      ],
      "var(--inv-decoration-one)",
    ),
  ];
}

/** The footer: a torn strip with confetti, a bow at each end, and a small gift in the middle. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 11, 6.8, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 38, 2.4, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-soft)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    h(
      "g",
      { key: "footer-confetti", fill: "var(--inv-accent)", opacity: 0.7 },
      [40, 74, 108, 142, 250, 284, 318, 352].map((x, index) =>
        h("path", {
          key: `footer-confetti-${x}`,
          d: CONFETTI,
          transform: `translate(${x} ${index % 2 === 0 ? 30 : 40}) rotate(${index * 23}) scale(${index % 3 === 0 ? 1 : 0.75})`,
        }),
      ),
    ),
    h("path", {
      key: "footer-bow-left",
      d: BOW,
      fill: "var(--inv-accent)",
      transform: "translate(56 54)",
    }),
    h("path", {
      key: "footer-bow-right",
      d: BOW,
      fill: "var(--inv-accent)",
      transform: "translate(336 54)",
    }),
    // A small wrapped gift in the middle, its ribbon and its bow: the last present of the page.
    h("path", {
      key: "footer-gift",
      d: "M176 62V44H214V62ZM173 44V38H217V44Z",
      fill: "var(--inv-accent)",
    }),
    h("path", {
      key: "footer-gift-ribbon",
      d: "M192 62V38H198V62ZM173 50H217V55H173Z",
      fill: "var(--inv-decoration-one)",
    }),
    h("path", {
      key: "footer-gift-bow",
      d: BOW,
      fill: "var(--inv-decoration-one)",
      transform: "translate(195 36) scale(0.72)",
    }),
    h(
      "g",
      { key: "footer-dots", fill: "var(--inv-surface)", opacity: 0.8 },
      [150, 176, 202, 228, 254].map((x) =>
        h("circle", { key: `footer-dot-${x}`, cx: x, cy: 22, r: 2 }),
      ),
    ),
  ];
}

/** «Ratón clásico» in paper cut-out: the party diorama, the bunting divider, and the gift footer. */
export const CLASSIC_MOUSE_ILLUSTRATION: ThemeIllustration = {
  theme: "classic-mouse",
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
