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
 * «Nubes y estrellas» in paper cut-out (I3c; S1-S4, the technique of
 * `design/theme-illustrations/01-papel-recortado.html`): a calm sky for the header — a torn sheet of pale paper,
 * a mobile hanging from the top with a crescent, a star, and a small cloud, a second crescent in the corner,
 * stars scattered at three sizes, and a bank of layered clouds instead of ground — a torn divider that carries
 * a thread of stars between two sections, and a footer strip where the clouds close the page.
 *
 * Original work (S3): the crescent, the clouds, the stars, and the mobile are generic paper shapes of our own
 * splines; there is no character, no logo, and no protected name, and the drawing carries no text. Every color
 * is a theme variable of `clouds-stars`; tints are `opacity` on a theme color, so the star gold stays the only
 * warm note in the sky.
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

/** A four-point sparkle: two long points and two short ones, the small star of a night sky. */
function sparkle(cx: number, cy: number, radius: number): string {
  const waist = radius * 0.26;
  const near = (x: number, y: number): string => `${n(x)} ${n(y)}`;

  return (
    `M${near(cx, cy - radius)}` +
    `C${near(cx + waist, cy - waist)} ${near(cx + waist, cy - waist)} ${near(cx + radius, cy)}` +
    `C${near(cx + waist, cy + waist)} ${near(cx + waist, cy + waist)} ${near(cx, cy + radius)}` +
    `C${near(cx - waist, cy + waist)} ${near(cx - waist, cy + waist)} ${near(cx - radius, cy)}` +
    `C${near(cx - waist, cy - waist)} ${near(cx - waist, cy - waist)} ${near(cx, cy - radius)}Z`
  );
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

const BIG_STARS: readonly StarSpot[] = [
  { x: 58, y: 128, radius: 12 },
  { x: 318, y: 116, radius: 11, tilt: 12 },
  { x: 254, y: 94, radius: 9 },
  { x: 38, y: 86, radius: 8, tilt: -10 },
  { x: 316, y: 158, radius: 7 },
];

const SMALL_STARS: readonly StarSpot[] = [
  { x: 96, y: 60, radius: 6 },
  { x: 288, y: 58, radius: 6, tilt: 8 },
  { x: 78, y: 158, radius: 5.5 },
  { x: 24, y: 124, radius: 5 },
  { x: 214, y: 132, radius: 5 },
];

const SPARKLES: readonly StarSpot[] = [
  { x: 150, y: 112, radius: 7 },
  { x: 340, y: 86, radius: 6 },
  { x: 200, y: 44, radius: 5 },
  { x: 118, y: 92, radius: 5 },
];

const MOBILE_ROD = "M126 24C164 20 214 20 256 24";
const MOBILE_THREADS: readonly string[] = [
  "M140 23C140 34 139 44 138 52",
  "M192 21C192 30 192 38 192 44",
  "M242 23C242 32 241 38 240 42",
];
const MOBILE_CRESCENT = crescent(136, 68, 17, 5);
const MOBILE_STAR = star(192, 59, 15);
const MOBILE_CLOUD = cloud(218, 64, 56, 22);
const CORNER_CRESCENT = crescent(350, 44, 22, 7);

const CLOUD_BACK = cloud(-18, 208, 176, 46);
const CLOUD_MID_LEFT = cloud(86, 212, 172, 50);
const CLOUD_MID_RIGHT = cloud(236, 210, 176, 46);
const CLOUD_FRONT = cloud(10, 216, 210, 38);

/** One thread of the mobile, drawn as a hairline of ink. */
function thread(key: string, d: string): ReactElement {
  return h("path", {
    key,
    d,
    fill: "none",
    stroke: "var(--inv-ink)",
    strokeWidth: 1.1,
    strokeLinecap: "round",
    opacity: 0.42,
  });
}

/** The stars of the sky, each tilted a little so the paper looks placed, not stamped. */
function stars(
  key: string,
  spots: readonly StarSpot[],
  paint: ThemePaint,
  opacity: number,
  shape: (spot: StarSpot) => string,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    spots.map((spot) =>
      h("path", {
        key: `${spot.x}-${spot.y}`,
        d: shape(spot),
        ...(spot.tilt === undefined
          ? {}
          : { transform: `rotate(${spot.tilt} ${spot.x} ${spot.y})` }),
      }),
    ),
  );
}

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 2.2, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "corner-crescent", d: CORNER_CRESCENT, fill: "var(--inv-decoration-one)" },
    { name: "mobile-crescent", d: MOBILE_CRESCENT, fill: "var(--inv-decoration-two)" },
    { name: "mobile-star", d: MOBILE_STAR, fill: "var(--inv-decoration-one)" },
    { name: "mobile-cloud", d: MOBILE_CLOUD, fill: "var(--inv-surface)", shadow: false },
    { name: "cloud-back", d: CLOUD_BACK, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "cloud-mid-left", d: CLOUD_MID_LEFT, fill: "var(--inv-surface)", shadow: false },
    {
      name: "cloud-mid-right",
      d: CLOUD_MID_RIGHT,
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
    { name: "cloud-front", d: CLOUD_FRONT, fill: "var(--inv-surface)", shadow: false },
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
      opacity: 0.42,
    }),
    // The corner crescent, tinted back so the mobile stays the subject of the sky.
    h("use", {
      key: "corner-crescent-fill",
      href: `#${id("corner-crescent")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.5,
    }),
    stars("big-stars", BIG_STARS, "var(--inv-decoration-one)", 0.95, (spot) =>
      star(spot.x, spot.y, spot.radius),
    ),
    stars("small-stars", SMALL_STARS, "var(--inv-decoration-one)", 0.72, (spot) =>
      star(spot.x, spot.y, spot.radius),
    ),
    stars("sparkles", SPARKLES, "var(--inv-accent)", 0.4, (spot) =>
      sparkle(spot.x, spot.y, spot.radius),
    ),
    // The mobile: the rod, the three threads, and what hangs from them.
    h("path", {
      key: "mobile-rod",
      d: MOBILE_ROD,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 2.4,
      strokeLinecap: "round",
      opacity: 0.55,
    }),
    ...MOBILE_THREADS.map((d, index) => thread(`mobile-thread-${index}`, d)),
    ...cutSheets(id, [sheets[4] as CutSheet, sheets[2] as CutSheet, sheets[3] as CutSheet]),
    // The moon and the star on the mobile: one lighter notch each, so both read as cut paper.
    h("path", {
      key: "mobile-star-notch",
      d: disc(192, 60, 3.6),
      fill: "var(--inv-surface)",
      opacity: 0.62,
    }),
    // The bank of clouds that closes the sky, back to front.
    h("use", {
      key: "cloud-back-fill",
      href: `#${id("cloud-back")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.4,
    }),
    ...cutSheets(id, [sheets[6] as CutSheet, sheets[7] as CutSheet, sheets[8] as CutSheet]),
    h("use", {
      key: "cloud-mid-right-tint",
      href: `#${id("cloud-mid-right")}`,
      fill: "var(--inv-accent)",
      opacity: 0.12,
    }),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 26, 3.4, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 38, 5.8, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-surface)", shadow: false },
  ];
  const trail: readonly StarSpot[] = [
    { x: 48, y: 34, radius: 7 },
    { x: 86, y: 40, radius: 5.5, tilt: 10 },
    { x: 124, y: 34, radius: 7 },
    { x: 162, y: 40, radius: 5.5, tilt: -8 },
    { x: 200, y: 34, radius: 7 },
    { x: 238, y: 40, radius: 5.5, tilt: 10 },
    { x: 276, y: 34, radius: 7 },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "strip-under-tint",
      href: `#${id("strip-under")}`,
      fill: "var(--inv-surface)",
      opacity: 0.6,
    }),
    stars("divider-stars", trail, "var(--inv-surface)", 0.92, (spot) =>
      star(spot.x, spot.y, spot.radius),
    ),
    stars(
      "divider-sparkles",
      [
        { x: 322, y: 32, radius: 8 },
        { x: 352, y: 42, radius: 6 },
      ],
      "var(--inv-accent)",
      0.35,
      (spot) => sparkle(spot.x, spot.y, spot.radius),
    ),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.4, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 42, 2.6, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-surface)", shadow: false },
    { name: "crescent", d: crescent(310, 30, 15, 5), fill: "var(--inv-surface)", shadow: false },
    { name: "star", d: star(62, 40, 13), fill: "var(--inv-decoration-one)" },
  ];

  return [
    sheetDefinitions(id, sheets),
    ...cutSheets(id, [sheets[0] as CutSheet]),
    h("use", {
      key: "wash-tint",
      href: `#${id("wash")}`,
      fill: "var(--inv-surface)",
      opacity: 0.62,
    }),
    ...cutSheets(id, [sheets[3] as CutSheet, sheets[2] as CutSheet]),
    stars(
      "footer-sparkles",
      [
        { x: 132, y: 40, radius: 6 },
        { x: 200, y: 36, radius: 7 },
        { x: 252, y: 44, radius: 5 },
      ],
      "var(--inv-accent)",
      0.32,
      (spot) => sparkle(spot.x, spot.y, spot.radius),
    ),
  ];
}

/** «Nubes y estrellas» in paper cut-out: the mobile sky, the star divider, and the cloud footer. */
export const CLOUDS_STARS_ILLUSTRATION: ThemeIllustration = {
  theme: "clouds-stars",
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
