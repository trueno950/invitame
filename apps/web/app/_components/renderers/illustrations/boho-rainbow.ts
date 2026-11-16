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
 * «Arcoíris boho» in paper cut-out (I3c; S1-S4, the technique of
 * `design/theme-illustrations/01-papel-recortado.html`): an earthy scene for the header — a torn sheet of warm
 * paper, a sage sun with short rays, four arcs of rainbow in sage, terracotta, blush and cream, pampas grass at
 * both edges, a soft ground, and a few dots of confetti — a torn divider that carries one small arc between two
 * sections, and a footer strip where the pampas closes the page.
 *
 * Original work (S3): the arcs, the rays, the plumes, and the dots are generic paper shapes of our own splines;
 * there is no character, no logo, and no protected name, and the drawing carries no text. Every color is a theme
 * variable of `boho-rainbow`; tints are `opacity` on a theme color, so the palette stays earthy and calm.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** One decimal is enough for a 390-unit drawing, and it keeps the markup cheap to ship inline. */
function n(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A hand-cut disc: an ellipse whose four quadrants differ by a hair, so it reads as cut, not drawn. */
function disc(cx: number, cy: number, radius: number, squash = 1): string {
  const rx = radius;
  const ry = radius * squash;
  const k = 0.5523;

  return (
    `M${n(cx - rx)} ${n(cy)}` +
    `C${n(cx - rx)} ${n(cy - ry * k)} ${n(cx - rx * k * 1.02)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}` +
    `C${n(cx + rx * k)} ${n(cy - ry * 0.99)} ${n(cx + rx)} ${n(cy - ry * k)} ${n(cx + rx)} ${n(cy)}` +
    `C${n(cx + rx * 0.99)} ${n(cy + ry * k)} ${n(cx + rx * k)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}` +
    `C${n(cx - rx * k * 0.99)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + ry * k * 1.01)} ${n(cx - rx)} ${n(cy)}Z`
  );
}

/**
 * A tapered blade of paper from its base at (`x`, `y`), `length` long, tilted `angle` degrees from straight
 * up. One helper serves the rays of the sun, the blades of the pampas, and the tufts of grass, so the same
 * cut edge runs through the whole drawing.
 */
function blade(x: number, y: number, length: number, width: number, angle: number): string {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const px = Math.cos(rad);
  const py = Math.sin(rad);
  const tipX = x + dx * length;
  const tipY = y + dy * length;
  const midX = x + dx * length * 0.55;
  const midY = y + dy * length * 0.55;

  return (
    `M${n(x)} ${n(y)}` +
    `C${n(midX + px * width)} ${n(midY + py * width)} ${n(tipX + px * width * 0.32)} ${n(tipY + py * width * 0.32)} ${n(tipX)} ${n(tipY)}` +
    `C${n(tipX - px * width * 0.32)} ${n(tipY - py * width * 0.32)} ${n(midX - px * width)} ${n(midY - py * width)} ${n(x)} ${n(y)}Z`
  );
}

/** A band of the rainbow: the ring between `outer` and `inner`, standing on `base`. */
function arc(cx: number, base: number, outer: number, inner: number): string {
  return (
    `M${n(cx - outer)} ${n(base)}` +
    `A${n(outer)} ${n(outer)} 0 0 1 ${n(cx + outer)} ${n(base)}` +
    `L${n(cx + inner)} ${n(base)}` +
    `A${n(inner)} ${n(inner)} 0 0 0 ${n(cx - inner)} ${n(base)}Z`
  );
}

/** The rays of the sun: eight short blades, the longest at the top, so the light is not a cog wheel. */
const SUN_RAYS = [
  blade(64, 22, 13, 3.4, 0),
  blade(64, 22, 11, 3, 26),
  blade(64, 22, 11, 3, -26),
  blade(64, 22, 12, 3.2, 52),
  blade(64, 22, 12, 3.2, -52),
  blade(64, 22, 10, 2.8, 78),
  blade(64, 22, 10, 2.8, -78),
  blade(64, 22, 9, 2.6, 104),
  blade(64, 22, 9, 2.6, -104),
].join("");

/** The rainbow: four rings, widest first, each one its own cut sheet. */
const BANDS = [
  { name: "band-outer", outer: 120, inner: 104, fill: "var(--inv-decoration-two)" },
  { name: "band-warm", outer: 102, inner: 86, fill: "var(--inv-accent)" },
  { name: "band-blush", outer: 84, inner: 70, fill: "var(--inv-decoration-one)" },
  { name: "band-cream", outer: 68, inner: 56, fill: "var(--inv-surface)" },
] as const;

/** One pampas plume: the stem it grows on, the angle it leans at, and how tall it stands. */
interface Plume {
  readonly x: number;
  readonly base: number;
  readonly height: number;
  readonly lean: number;
}

const PLUMES: readonly Plume[] = [
  { x: 18, base: 206, height: 96, lean: 8 },
  { x: 40, base: 208, height: 74, lean: -5 },
  { x: 60, base: 206, height: 52, lean: 15 },
  { x: 372, base: 206, height: 92, lean: -8 },
  { x: 350, base: 208, height: 70, lean: 5 },
  { x: 330, base: 206, height: 50, lean: -15 },
];

/** The stem of one plume: a thin blade of paper that leans with the plume. */
function plumeStem(plume: Plume): string {
  return blade(plume.x, plume.base, plume.height, 3, plume.lean);
}

/** Where the fluff of a plume hangs: the stem's own tip, so a plume never floats free of its stem. */
function plumeTip(plume: Plume): { readonly x: number; readonly y: number } {
  const rad = (plume.lean * Math.PI) / 180;

  return {
    x: n(plume.x + Math.sin(rad) * plume.height * 0.74),
    y: n(plume.base - Math.cos(rad) * plume.height * 0.74),
  };
}

/** The fluff at the tip of a plume: a fan of rounded feathers, cut as one piece of paper. */
function plumeFluff(key: string, plume: Plume, scale: number, paint: ThemePaint): ReactElement {
  const tip = plumeTip(plume);
  const feathers = [
    { dx: 0, dy: -9, rx: 5, ry: 10, tilt: 0 },
    { dx: -7, dy: -4, rx: 4.4, ry: 9, tilt: -26 },
    { dx: 7, dy: -4, rx: 4.4, ry: 9, tilt: 26 },
    { dx: -11, dy: 4, rx: 3.8, ry: 7, tilt: -46 },
    { dx: 11, dy: 4, rx: 3.8, ry: 7, tilt: 46 },
    { dx: -3, dy: 7, rx: 4, ry: 8, tilt: -12 },
    { dx: 4, dy: 7, rx: 4, ry: 8, tilt: 14 },
  ];

  return h(
    "g",
    { key, fill: paint },
    feathers.map((feather) => {
      const cx = n(tip.x + feather.dx * scale);
      const cy = n(tip.y + feather.dy * scale);

      return h("ellipse", {
        key: `${feather.dx}-${feather.dy}`,
        cx,
        cy,
        rx: n(feather.rx * scale),
        ry: n(feather.ry * scale),
        transform: `rotate(${feather.tilt} ${cx} ${cy})`,
      });
    }),
  );
}

const GROUND =
  "M-8 182C6 179 22 180 38 181C54 182 68 178 84 179C100 180 116 182 132 181C148 180 164 178 180 179C196 " +
  "180 212 182 228 181C244 180 260 178 276 179C292 180 308 182 324 181C340 180 356 178 372 179C382 180 " +
  "392 181 398 182L398 202L-8 202Z";

const DOTS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 150, y: 46, r: 3.4 },
  { x: 176, y: 34, r: 2.4 },
  { x: 202, y: 52, r: 3 },
  { x: 236, y: 40, r: 2.2 },
  { x: 300, y: 62, r: 3.2 },
  { x: 322, y: 44, r: 2.4 },
  { x: 118, y: 76, r: 2.6 },
  { x: 348, y: 82, r: 2.8 },
];

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 1.6, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "sun", d: disc(64, 50, 20), fill: "var(--inv-decoration-two)" },
    { name: "sun-rays", d: SUN_RAYS, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "ground", d: GROUND, fill: "var(--inv-accent)", shadow: false },
    ...BANDS.map(
      (band): CutSheet => ({
        name: band.name,
        d: arc(202, 186, band.outer, band.inner),
        fill: band.fill,
      }),
    ),
    { name: "plumes", d: PLUMES.map(plumeStem).join(""), fill: "var(--inv-accent)" },
    {
      name: "plume-leaves",
      d: [
        blade(20, 204, 44, 8, 36),
        blade(20, 204, 34, 7, -20),
        blade(368, 204, 42, 8, -36),
        blade(368, 204, 32, 7, 20),
      ].join(""),
      fill: "var(--inv-decoration-two)",
    },
    {
      name: "grass",
      d: [
        blade(112, 184, 12, 2.6, 6),
        blade(118, 184, 16, 2.8, -4),
        blade(280, 184, 11, 2.4, -6),
        blade(286, 184, 15, 2.6, 4),
        blade(84, 186, 9, 2.2, 8),
      ].join(""),
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "torn-line",
      href: `#${id("sheet")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.45,
    }),
    // The sun: a pale halo, the rays behind the disc, then the disc itself.
    h("circle", {
      key: "sun-halo",
      cx: 64,
      cy: 50,
      r: 32,
      fill: "var(--inv-decoration-one)",
      opacity: 0.28,
    }),
    h("use", {
      key: "sun-rays-fill",
      href: `#${id("sun-rays")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.6,
    }),
    ...cutSheets(id, [sheets[1] as CutSheet]),
    h("circle", {
      key: "sun-core",
      cx: 62,
      cy: 48,
      r: 5,
      fill: "var(--inv-surface)",
      opacity: 0.5,
    }),
    // The rainbow, lightest band inside, so the arcs read from the outside in.
    ...cutSheets(id, [
      sheets[5] as CutSheet,
      sheets[4] as CutSheet,
      sheets[6] as CutSheet,
      sheets[7] as CutSheet,
    ]),
    // The ground closes the scene; the far band under the rainbow is a tint so the arcs sit on paper.
    ...cutSheets(id, [sheets[3] as CutSheet]),
    h("use", {
      key: "ground-line",
      href: `#${id("ground")}`,
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1.4,
      opacity: 0.4,
    }),
    ...cutSheets(id, [sheets[8] as CutSheet, sheets[9] as CutSheet]),
    ...PLUMES.map((plume, index) => plumeFluff(`fluff-${index}`, plume, 1.5, "var(--inv-surface)")),
    h("use", {
      key: "grass-fill",
      href: `#${id("grass")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.7,
    }),
    h(
      "g",
      { key: "dots", fill: "var(--inv-accent)", opacity: 0.28 },
      DOTS.map((dot) => h("circle", { key: `${dot.x}-${dot.y}`, cx: dot.x, cy: dot.y, r: dot.r })),
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 24, 3.2, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 38, 5.4, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "arc-outer", d: arc(196, 50, 40, 33), fill: "var(--inv-accent)", shadow: false },
    { name: "arc-warm", d: arc(196, 50, 30, 23), fill: "var(--inv-decoration-one)", shadow: false },
    { name: "arc-cream", d: arc(196, 50, 20, 13), fill: "var(--inv-surface)", shadow: false },
    {
      name: "plumes",
      d: [
        plumeStem({ x: 24, base: 58, height: 40, lean: 8 }),
        plumeStem({ x: 364, base: 58, height: 36, lean: -8 }),
      ].join(""),
      fill: "var(--inv-accent)",
      shadow: false,
    },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.18,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet, sheets[3] as CutSheet, sheets[4] as CutSheet]),
    ...cutSheets(id, [sheets[5] as CutSheet]),
    plumeFluff("fluff-left", { x: 24, base: 58, height: 40, lean: 8 }, 0.86, "var(--inv-surface)"),
    plumeFluff(
      "fluff-right",
      { x: 364, base: 58, height: 36, lean: -8 },
      0.82,
      "var(--inv-surface)",
    ),
    h(
      "g",
      { key: "divider-dots", fill: "var(--inv-accent)", opacity: 0.3 },
      [92, 120, 272, 300].map((x, index) =>
        h("circle", { key: `dot-${index}`, cx: x, cy: 34 + (index % 2) * 8, r: 2.6 }),
      ),
    ),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.6, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 42, 2.1, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
    { name: "arc-outer", d: arc(195, 56, 34, 27), fill: "var(--inv-accent)", shadow: false },
    { name: "arc-warm", d: arc(195, 56, 24, 17), fill: "var(--inv-decoration-one)", shadow: false },
    {
      name: "plumes",
      d: [
        plumeStem({ x: 18, base: 64, height: 34, lean: 10 }),
        plumeStem({ x: 44, base: 64, height: 26, lean: -8 }),
        plumeStem({ x: 370, base: 64, height: 36, lean: -10 }),
        plumeStem({ x: 344, base: 64, height: 26, lean: 8 }),
      ].join(""),
      fill: "var(--inv-accent)",
    },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-accent)",
      opacity: 0.16,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet, sheets[3] as CutSheet]),
    ...cutSheets(id, [sheets[4] as CutSheet]),
    plumeFluff("fluff-one", { x: 18, base: 64, height: 34, lean: 10 }, 0.8, "var(--inv-surface)"),
    plumeFluff("fluff-two", { x: 44, base: 64, height: 26, lean: -8 }, 0.68, "var(--inv-surface)"),
    plumeFluff(
      "fluff-three",
      { x: 370, base: 64, height: 36, lean: -10 },
      0.82,
      "var(--inv-surface)",
    ),
    plumeFluff("fluff-four", { x: 344, base: 64, height: 26, lean: 8 }, 0.68, "var(--inv-surface)"),
  ];
}

/** «Arcoíris boho» in paper cut-out: the arc scene, the small arc divider, and the pampas footer. */
export const BOHO_RAINBOW_ILLUSTRATION: ThemeIllustration = {
  theme: "boho-rainbow",
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
