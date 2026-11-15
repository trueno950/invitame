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
 * «Bajo el mar» in paper cut-out (I3b; S1-S4), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`: a layered diorama for the header — three
 * bands of light coming down through the water, the waves on the surface, bubbles rising, three fish of our own
 * design, two corals, three ribbons of seaweed, a shell and a starfish on the sand — a torn divider that
 * carries a wave band, its bubbles and a small fish between two sections, and a footer strip of sand, shells and
 * seaweed tips.
 *
 * Original work: the fish are plain paper fish — a body, a tail, a dorsal fin and an eye — in the three
 * colors of this palette, never a clownfish, a character, or a logo of any franchise. Every color is a theme
 * variable of `under-the-sea`, so the whole drawing re-colours with its palette; tints are `opacity` on a theme
 * color and nothing else.
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

/** A plain paper fish: the body and the tail cut as one sheet, then its dorsal fin and its belly fin. */
const FISH_BODY =
  "M2 0C6-10 16-16 28-16C40-16 50-8 52 0C50 8 40 16 28 16C16 16 6 10 2 0ZM52 0L70-13L64 0L70 13Z";
const FISH_DORSAL = "M18-15L27-27L37-15Z";
const FISH_BELLY = "M15 9L21 19L31 11Z";
const FISH_GILL = "M18-13C24-8 24 8 18 13";

/** A ribbon of seaweed: one long wave with the leaves cut out of it, standing on the sand. */
const SEAWEED_TALL =
  "M26 182C22 164 34 156 30 140C26 124 38 118 34 102C30 88 40 80 38 68C47 78 42 92 46 104C50 118 38 126 42 " +
  "142C46 158 34 166 38 182Z";
const SEAWEED_SHORT =
  "M12 184C8 172 18 166 15 154C12 143 21 138 19 128C27 136 22 146 25 156C28 168 18 174 21 184Z";

/** A coral: a trunk that forks twice, with the tips cut flat like a paper fan. */
const CORAL =
  "M6 182V154C6 148 2 144 0 138C6 139 10 145 11 151C12 142 16 136 22 132C19 140 17 146 17 154V182Z" +
  "M17 168C24 164 30 156 31 148C34 154 30 164 22 170ZM17 158C12 152 11 144 13 136C17 142 20 150 19 158Z";

/** A scallop shell: the fan, its ribs, and the hinge. */
const SHELL = "M0 0C0-9 8-16 17-16C26-16 34-9 34 0C34 5 28 8 17 8C6 8 0 5 0 0Z";
const SHELL_RIBS = "M17 8V-16M9 6L6-14M25 6L28-14";

/** A short ribbon of seaweed for the footer, drawn at the footer's own size. */
const FOOTER_WEED = "M12 6C8 18 18 24 15 36C12 47 21 52 19 60C27 52 22 44 25 34C28 22 18 16 21 6Z";

/** A starfish: five arms on a short body, drawn as one sheet. */
const STARFISH =
  "M0-13C3-8 5-6 8-6C13-6 16-4 13 0C10 3 8 5 9 10C10 14 6 15 3 12C1 10-1 10-3 12C-6 15-10 14-9 10C-8 5-10 " +
  "3-13 0C-16-4-13-6-8-6C-5-6-3-8 0-13Z";

/** The waves on the surface: two bands, the near one heavier, running the whole width. */
const WAVES_FAR =
  "M-8 26C14 16 32 34 54 26C76 18 94 34 116 26C138 18 156 34 178 26C200 18 218 34 240 26C262 18 280 34 302 " +
  "26C324 18 342 34 364 26C378 21 390 24 396 26V40H-8Z";

const WAVES_NEAR =
  "M-8 38C16 26 36 46 60 38C84 30 104 46 128 38C152 30 172 46 196 38C220 30 240 46 264 38C288 30 308 46 332 " +
  "38C356 30 376 44 396 36V54H-8Z";

/** The sand: a slow bank with a shallow dune on top of it, and the pebbles the sea left there. */
const PEBBLES =
  "M40 192C43 190 47 191 48 193C49 195 46 197 43 196C40 195 39 193 40 192Z" +
  "M120 196C124 194 129 195 130 197C131 199 127 201 123 200C120 199 119 197 120 196Z" +
  "M262 192C266 190 271 191 272 193C273 195 269 197 265 196C262 195 261 193 262 192Z" +
  "M330 197C334 195 339 196 340 198C341 200 337 202 333 201C330 200 329 198 330 197Z";

const FISH_BIG: Place = { x: 158, y: 92, rotate: -4, scale: 1.15 };
const FISH_SMALL: Place = { x: 296, y: 60, rotate: 8, scale: 0.62 };
const FISH_LOW: Place = { x: 96, y: 138, rotate: -6, scale: 0.78 };

const BUBBLES: readonly Place[] = [
  { x: 132, y: 62, rotate: 0, scale: 1.1 },
  { x: 144, y: 40, rotate: 0, scale: 0.72 },
  { x: 128, y: 24, rotate: 0, scale: 0.5 },
  { x: 268, y: 118, rotate: 0, scale: 0.9 },
  { x: 280, y: 96, rotate: 0, scale: 0.6 },
  { x: 60, y: 96, rotate: 0, scale: 0.8 },
  { x: 52, y: 74, rotate: 0, scale: 0.55 },
  { x: 330, y: 136, rotate: 0, scale: 0.75 },
];

/** The fish stamp: body, fins and gill, drawn once and placed three times at three sizes. */
function fishDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "fish-definition" },
    h(
      "g",
      { id: id("fish") },
      h("path", { key: "body", d: FISH_BODY }),
      h("path", { key: "dorsal", d: FISH_DORSAL, fill: "var(--inv-surface)", opacity: 0.75 }),
      h("path", { key: "belly", d: FISH_BELLY, fill: "var(--inv-surface)", opacity: 0.75 }),
      h("path", {
        key: "gill",
        d: FISH_GILL,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.6,
        opacity: 0.6,
      }),
      h("circle", { key: "eye", cx: 17, cy: -3, r: 3.6, fill: "var(--inv-surface)" }),
      h("circle", { key: "pupil", cx: 16, cy: -3, r: 1.7, fill: "var(--inv-ink)" }),
    ),
  );
}

/** The bubble stamp: a ring of paper with one lit corner. */
function bubbleDefinition(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "bubble-definition" },
    h(
      "g",
      { id: id("bubble") },
      h("circle", {
        key: "ring",
        r: 6,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.6,
      }),
      h("circle", {
        key: "lit",
        cx: -2,
        cy: -2.4,
        r: 1.6,
        fill: "var(--inv-surface)",
        opacity: 0.85,
      }),
    ),
  );
}

/** Bubbles rising in a column, each one bigger than the one above it. */
function bubbles(
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
        key: `${key}-${place.x}-${place.y}`,
        href: `#${id("bubble")}`,
        transform: `translate(${place.x} ${place.y}) scale(${place.scale})`,
      }),
    ),
  );
}

/** One fish, with its own color, turn and size. */
function fish(
  key: string,
  id: IllustrationId,
  place: Place,
  paint: ThemePaint,
  opacity = 1,
): ReactElement {
  return h("use", {
    key,
    href: `#${id("fish")}`,
    fill: paint,
    opacity,
    transform: `translate(${place.x} ${place.y}) rotate(${place.rotate}) scale(${place.scale})`,
  });
}

/** The header diorama: light, waves, fish, coral, seaweed, and the sand on the floor. */
function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 1.2, SCENE_HEIGHT + 8);
  const bank = tornEdge(SCENE_WIDTH, 183, 3.4, SCENE_HEIGHT + 8);
  const sheet: CutSheet = { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false };
  const wavesFar: CutSheet = {
    name: "waves-far",
    d: WAVES_FAR,
    fill: "var(--inv-surface)",
    shadow: false,
  };
  const wavesNear: CutSheet = {
    name: "waves-near",
    d: WAVES_NEAR,
    fill: "var(--inv-decoration-two)",
    shadow: false,
  };
  const sand: CutSheet = { name: "sand", d: bank.sheet, fill: "var(--inv-surface)" };
  const coral: CutSheet = { name: "coral", d: CORAL, fill: "var(--inv-decoration-two)" };
  const shell: CutSheet = { name: "shell", d: SHELL, fill: "var(--inv-decoration-two)" };
  const starfish: CutSheet = {
    name: "starfish",
    d: STARFISH,
    fill: "var(--inv-decoration-one)",
  };
  const weedTall: CutSheet = {
    name: "weed-tall",
    d: SEAWEED_TALL,
    fill: "var(--inv-accent)",
  };
  const weedShort: CutSheet = {
    name: "weed-short",
    d: SEAWEED_SHORT,
    fill: "var(--inv-accent)",
  };

  return [
    sheetDefinitions(id, [
      sheet,
      wavesFar,
      wavesNear,
      sand,
      coral,
      shell,
      starfish,
      weedTall,
      weedShort,
    ]),
    fishDefinition(id),
    bubbleDefinition(id),
    ...cutSheets(id, [sheet]),
    // Three shafts of light coming down through the water, laid over the sheet as tinted paper.
    h("path", {
      key: "light-one",
      d: "M30 12L64 12L122 208H54Z",
      fill: "var(--inv-surface)",
      opacity: 0.3,
    }),
    h("path", {
      key: "light-two",
      d: "M150 12L172 12L206 208H160Z",
      fill: "var(--inv-surface)",
      opacity: 0.22,
    }),
    h("path", {
      key: "light-three",
      d: "M268 12L304 12L318 208H252Z",
      fill: "var(--inv-surface)",
      opacity: 0.26,
    }),
    ...cutSheets(id, [wavesFar, wavesNear]),
    bubbles("bubbles-scene", id, BUBBLES, 0.85),
    // The far water: two fish swimming behind the two in front.
    fish("fish-small", id, FISH_SMALL, "var(--inv-decoration-two)", 0.95),
    fish("fish-low", id, FISH_LOW, "var(--inv-accent)", 0.95),
    ...cutSheets(id, [weedTall, weedShort]),
    ...cutSheets(id, [coral]),
    // The big fish of the scene, in the middle of the water.
    fish("fish-big", id, FISH_BIG, "var(--inv-decoration-one)"),
    // The floor: the sand, its pebbles, a shell and a starfish.
    ...cutSheets(id, [sand]),
    h("path", { key: "pebbles", d: PEBBLES, fill: "var(--inv-soft)", opacity: 0.9 }),
    // The floor: a shell, a starfish, and the two corals that close the scene at both edges.
    h("use", {
      key: "shell-on-sand",
      href: `#${id(shell.name)}`,
      fill: shell.fill,
      transform: "translate(252 186) rotate(-4) scale(1.15)",
    }),
    h("path", {
      key: "shell-ribs",
      d: SHELL_RIBS,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      opacity: 0.7,
      transform: "translate(252 186) rotate(-4) scale(1.15)",
    }),
    h("use", {
      key: "starfish-on-sand",
      href: `#${id(starfish.name)}`,
      fill: starfish.fill,
      transform: "translate(134 180) rotate(6) scale(1.05)",
    }),
    h("use", {
      key: "coral-right",
      href: `#${id(coral.name)}`,
      fill: coral.fill,
      transform: "translate(348 -6) scale(0.9)",
    }),
    h("use", {
      key: "weed-tall-right",
      href: `#${id(weedTall.name)}`,
      fill: weedTall.fill,
      transform: "translate(296 -8)",
    }),
    h("use", {
      key: "weed-short-right",
      href: `#${id(weedShort.name)}`,
      fill: weedShort.fill,
      transform: "translate(344 -2) scale(0.9)",
    }),
    h("path", {
      key: "sand-line",
      d: "M-8 196C60 190 130 198 200 194C270 190 340 198 396 194",
      fill: "none",
      stroke: "var(--inv-soft)",
      strokeWidth: 2,
      opacity: 0.7,
    }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

/** The divider: a torn band of water with a wave on it, bubbles, and one fish swimming through. */
function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 24, 2.6, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 40, 4.8, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-accent)", shadow: false },
  ];
  const wave: CutSheet = {
    name: "wave",
    d: WAVES_NEAR,
    fill: "var(--inv-surface)",
    shadow: false,
  };

  return [
    sheetDefinitions(id, [sheets[0] as CutSheet, sheets[1] as CutSheet, wave]),
    fishDefinition(id),
    bubbleDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.22,
    }),
    h("use", {
      key: "wave-fill",
      href: `#${id("wave")}`,
      fill: "var(--inv-surface)",
      opacity: 0.45,
      transform: "translate(0 22) scale(1 0.6)",
    }),
    bubbles(
      "divider-bubbles",
      id,
      [
        { x: 268, y: 26, rotate: 0, scale: 0.9 },
        { x: 282, y: 14, rotate: 0, scale: 0.6 },
        { x: 300, y: 34, rotate: 0, scale: 0.7 },
        { x: 90, y: 18, rotate: 0, scale: 0.65 },
      ],
      0.9,
    ),
    fish("divider-fish", id, { x: 150, y: 32, rotate: -4, scale: 0.8 }, "var(--inv-accent)", 0.85),
    h("path", {
      key: "divider-weed",
      d: "M40 62C36 46 46 40 43 28C53 38 49 48 52 62Z",
      fill: "var(--inv-accent)",
      opacity: 0.6,
    }),
  ];
}

/** The footer: a torn band of sand with a shell, a starfish, and two tips of seaweed. */
function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.2, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 36, 2.2, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-surface)", shadow: false },
  ];

  return [
    sheetDefinitions(id, sheets),
    bubbleDefinition(id),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    // Two shells and a starfish lie on the sand, with the bubbles still coming up from the sea.
    h("path", {
      key: "footer-shell-left",
      d: SHELL,
      fill: "var(--inv-accent)",
      opacity: 0.75,
      transform: "translate(52 49) rotate(-6) scale(0.85)",
    }),
    h("path", {
      key: "footer-shell-right",
      d: SHELL,
      fill: "var(--inv-accent)",
      opacity: 0.75,
      transform: "translate(312 50) rotate(8) scale(0.8)",
    }),
    h("path", {
      key: "footer-starfish",
      d: STARFISH,
      fill: "var(--inv-decoration-one)",
      transform: "translate(182 44) rotate(-8) scale(0.85)",
    }),
    h("path", {
      key: "footer-weed-left",
      d: FOOTER_WEED,
      fill: "var(--inv-accent)",
      opacity: 0.55,
      transform: "translate(96 0) scale(0.9)",
    }),
    h("path", {
      key: "footer-weed-right",
      d: FOOTER_WEED,
      fill: "var(--inv-accent)",
      opacity: 0.55,
      transform: "translate(266 6) scale(0.8)",
    }),
    bubbles(
      "footer-bubbles",
      id,
      [
        { x: 130, y: 24, rotate: 0, scale: 0.8 },
        { x: 144, y: 12, rotate: 0, scale: 0.55 },
        { x: 236, y: 20, rotate: 0, scale: 0.65 },
        { x: 250, y: 34, rotate: 0, scale: 0.5 },
      ],
      0.9,
    ),
  ];
}

/** «Bajo el mar» in paper cut-out: the reef diorama, the wave divider, and the sand footer. */
export const UNDER_THE_SEA_ILLUSTRATION: ThemeIllustration = {
  theme: "under-the-sea",
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
