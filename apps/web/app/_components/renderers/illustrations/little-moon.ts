import { createElement, type ReactElement } from "react";

import { type CutSheet, cutSheets, grain, sheetDefinitions, tornEdge } from "./primitives.ts";
import type { IllustrationId, ThemeIllustration } from "./types.ts";

/*
 * «Lunita» in paper cut-out (I3c; S1-S4, the technique of `design/theme-illustrations/01-papel-recortado.html`):
 * a quiet night for the header — a torn sheet of cream paper, a big round moon asleep with its closed eyes and
 * a small blush, a crescent and stars of gold and cream, three dots rising from the moon, and a bank of night
 * clouds under it instead of ground — a torn divider with the moon's dots between two sections, and a footer
 * strip where the night clouds close the page.
 *
 * Original work (S3): the moon, the clouds, the stars, and the dots are generic paper shapes of our own
 * splines; there is no character, no logo, and no protected name, and the drawing carries no text — the sleep
 * is told by closed eyes and rising dots, never by letters. Every color is a theme variable of `little-moon`;
 * tints are `opacity` on a theme color.
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
 * A paper cloud: three overlapping lobes on one flat base. The lobes are cut from one path, so the union of
 * their fill is the cloud and no seam shows, and they are placed far enough apart to read as lobes while still
 * overlapping: a cloud with a gap between two circles reads as stones, not as paper.
 */
function cloud(left: number, base: number, width: number, height: number): string {
  const small = height * 0.68;
  const big = height;
  const medium = height * 0.78;
  const span = 2 * (small + big + medium);
  const used = Math.min(width, span);
  const first = left + small;
  const last = left + used - medium;
  const lobes: readonly (readonly [number, number])[] = [
    [first, small],
    [(first + last) / 2, big],
    [last, medium],
  ];
  const flat = Math.max(2.5, height * 0.12);

  return (
    lobes.map(([cx, radius]) => disc(cx, base - radius, radius)).join("") +
    `M${n(left)} ${n(base - flat)}H${n(left + used)}V${n(base)}H${n(left)}Z`
  );
}

/** A five-point star: chunky points, a shallow waist, so it stays readable at 12 px. */
function star(cx: number, cy: number, radius: number): string {
  const points: string[] = [];

  for (let point = 0; point < 10; point += 1) {
    const reach = point % 2 === 0 ? radius : radius * 0.48;
    const angle = (Math.PI / 5) * point - Math.PI / 2;

    points.push(
      `${point === 0 ? "M" : "L"}${n(cx + reach * Math.cos(angle))} ${n(cy + reach * Math.sin(angle))}`,
    );
  }
  return `${points.join("")}Z`;
}

/**
 * A crescent: the moon's own disc, opened by a second disc `shift` to the right. The two discs cross at a known
 * point, so the path is the long arc of the moon (large-arc, drawn one way) and the short arc of the opening
 * disc (drawn back the other way) — the moon's body stays on the left and its two horns point right.
 */
function crescent(cx: number, cy: number, radius: number, shift: number): string {
  const inner = radius * 0.94;
  const distance = radius * (shift / radius < 0.5 ? 0.62 : 0.86);
  const along = (distance * distance - inner * inner + radius * radius) / (2 * distance);
  const half = Math.sqrt(Math.max(radius * radius - along * along, 0));
  const x = n(cx + along);
  const top = n(cy - half);
  const bottom = n(cy + half);

  return (
    `M${x} ${top}` +
    `A${n(radius)} ${n(radius)} 0 1 0 ${x} ${bottom}` +
    `A${n(inner)} ${n(inner)} 0 0 1 ${x} ${top}Z`
  );
}

/** A star placed on the sky: its center, its reach, and its tilt in degrees. */
interface StarSpot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly tilt?: number;
}

const MOON_CENTER = { x: 150, y: 96 };
const MOON = disc(MOON_CENTER.x, MOON_CENTER.y, 44);
const MOON_HALO = disc(MOON_CENTER.x, MOON_CENTER.y, 52);

const STARS: readonly StarSpot[] = [
  { x: 44, y: 46, radius: 11 },
  { x: 300, y: 40, radius: 9, tilt: 10 },
  { x: 258, y: 82, radius: 7 },
  { x: 340, y: 92, radius: 6.5, tilt: -8 },
  { x: 66, y: 116, radius: 7.5 },
  { x: 30, y: 152, radius: 5.5 },
  { x: 320, y: 138, radius: 5.5 },
];

const DOTS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 214, y: 44, r: 3 },
  { x: 232, y: 30, r: 2.4 },
  { x: 96, y: 30, r: 2.6 },
  { x: 350, y: 62, r: 2.6 },
  { x: 118, y: 158, r: 2.4 },
  { x: 274, y: 118, r: 2.6 },
];

/** The three dots that rise from the sleeping moon, each one a little higher and smaller. */
const SLEEP_DOTS: readonly { readonly x: number; readonly y: number; readonly r: number }[] = [
  { x: 196, y: 66, r: 3.6 },
  { x: 206, y: 52, r: 4.4 },
  { x: 218, y: 36, r: 5.2 },
];

const CLOUD_BACK = cloud(-34, 212, 210, 44);
const CLOUD_LEFT = cloud(40, 218, 236, 54);
const CLOUD_RIGHT = cloud(206, 216, 224, 50);
const CLOUD_FRONT = cloud(-16, 226, 250, 38);

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 2.4, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "moon-halo", d: MOON_HALO, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "moon", d: MOON, fill: "var(--inv-decoration-one)", outline: true },
    { name: "corner-crescent", d: crescent(336, 58, 17, 5), fill: "var(--inv-decoration-two)" },
    { name: "cloud-back", d: CLOUD_BACK, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "cloud-left", d: CLOUD_LEFT, fill: "var(--inv-accent)", shadow: false },
    { name: "cloud-right", d: CLOUD_RIGHT, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "cloud-front", d: CLOUD_FRONT, fill: "var(--inv-accent)", shadow: false },
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
    h("use", {
      key: "moon-halo-fill",
      href: `#${id("moon-halo")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.2,
    }),
    // The moon and its face: a closed eye each side, a small smile, and a blush on the near cheek.
    ...cutSheets(id, [sheets[2] as CutSheet]),
    h("circle", {
      key: "moon-glow",
      cx: MOON_CENTER.x - 12,
      cy: MOON_CENTER.y - 14,
      r: 16,
      fill: "var(--inv-surface)",
      opacity: 0.34,
    }),
    h("path", {
      key: "eye-left",
      d: "M136 92C139 96 145 96 148 92",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 2.2,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "eye-right",
      d: "M158 92C161 96 167 96 170 92",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 2.2,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "smile",
      d: "M150 106C154 110 160 110 163 106",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.9,
      strokeLinecap: "round",
    }),
    h("ellipse", {
      key: "blush-left",
      cx: 132,
      cy: 102,
      rx: 6.4,
      ry: 4.2,
      fill: "var(--inv-decoration-two)",
      opacity: 0.55,
    }),
    h("ellipse", {
      key: "blush-right",
      cx: 174,
      cy: 102,
      rx: 6.4,
      ry: 4.2,
      fill: "var(--inv-decoration-two)",
      opacity: 0.55,
    }),
    h("use", {
      key: "corner-crescent-fill",
      href: `#${id("corner-crescent")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.7,
    }),
    h(
      "g",
      { key: "stars", fill: "var(--inv-decoration-one)", opacity: 0.85 },
      STARS.map((spot) =>
        h("path", {
          key: `${spot.x}-${spot.y}`,
          d: star(spot.x, spot.y, spot.radius),
          ...(spot.tilt === undefined
            ? {}
            : { transform: `rotate(${spot.tilt} ${spot.x} ${spot.y})` }),
        }),
      ),
    ),
    h(
      "g",
      { key: "dots", fill: "var(--inv-surface)", opacity: 0.8 },
      DOTS.map((dot) => h("circle", { key: `${dot.x}-${dot.y}`, cx: dot.x, cy: dot.y, r: dot.r })),
    ),
    h(
      "g",
      { key: "sleep-dots", fill: "var(--inv-surface)", opacity: 0.72 },
      SLEEP_DOTS.map((dot) =>
        h("circle", { key: `${dot.x}-${dot.y}`, cx: dot.x, cy: dot.y, r: dot.r }),
      ),
    ),
    // The bank of night clouds, back to front: two tints behind, two sheets in front.
    h("use", {
      key: "cloud-back-fill",
      href: `#${id("cloud-back")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.32,
    }),
    ...cutSheets(id, [sheets[6] as CutSheet]),
    h("use", {
      key: "cloud-right-tint",
      href: `#${id("cloud-right")}`,
      fill: "var(--inv-accent)",
      opacity: 0.16,
    }),
    h("g", { key: "clouds-front", opacity: 0.34 }, ...cutSheets(id, [sheets[5] as CutSheet])),
    h("g", { key: "clouds-near", opacity: 0.22 }, ...cutSheets(id, [sheets[7] as CutSheet])),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 26, 3.3, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 38, 5.5, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-accent)", shadow: false },
    { name: "moon", d: crescent(46, 32, 13, 4), fill: "var(--inv-decoration-one)" },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-accent)",
      opacity: 0.2,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
    h(
      "g",
      { key: "divider-stars", fill: "var(--inv-surface)", opacity: 0.9 },
      [
        { x: 106, y: 30, r: 6 },
        { x: 148, y: 36, r: 4.6, tilt: 12 },
        { x: 190, y: 28, r: 6 },
        { x: 232, y: 36, r: 4.6, tilt: -10 },
        { x: 274, y: 30, r: 6 },
      ].map((spot) =>
        h("path", {
          key: `${spot.x}-${spot.y}`,
          d: star(spot.x, spot.y, spot.r),
          ...(spot.tilt === undefined
            ? {}
            : { transform: `rotate(${spot.tilt} ${spot.x} ${spot.y})` }),
        }),
      ),
    ),
    h(
      "g",
      { key: "divider-dots", fill: "var(--inv-accent)", opacity: 0.2 },
      [86, 120, 214, 248, 330].map((x, index) =>
        h("circle", { key: `dot-${index}`, cx: x, cy: 44 - (index % 2) * 6, r: 2.4 }),
      ),
    ),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.8, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 44, 2.5, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
    { name: "cloud", d: cloud(-6, 66, 200, 30), fill: "var(--inv-decoration-two)", shadow: false },
    {
      name: "cloud-right",
      d: cloud(232, 68, 176, 28),
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
    { name: "moon", d: crescent(206, 34, 15, 4), fill: "var(--inv-decoration-one)" },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-accent)",
      opacity: 0.2,
    }),
    h("g", { key: "cloud-left-fill", opacity: 0.55 }, ...cutSheets(id, [sheets[2] as CutSheet])),
    h("g", { key: "cloud-right-fill", opacity: 0.4 }, ...cutSheets(id, [sheets[3] as CutSheet])),
    ...cutSheets(id, [sheets[4] as CutSheet]),
    h(
      "g",
      { key: "footer-stars", fill: "var(--inv-surface)", opacity: 0.85 },
      [
        { x: 60, y: 30, r: 5.5 },
        { x: 96, y: 38, r: 4 },
        { x: 300, y: 32, r: 5 },
        { x: 332, y: 40, r: 4 },
      ].map((spot) => h("path", { key: `${spot.x}-${spot.y}`, d: star(spot.x, spot.y, spot.r) })),
    ),
  ];
}

/** «Lunita» in paper cut-out: the sleeping moon, the star divider, and the night-cloud footer. */
export const LITTLE_MOON_ILLUSTRATION: ThemeIllustration = {
  theme: "little-moon",
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
