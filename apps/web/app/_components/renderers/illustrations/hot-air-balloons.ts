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
 * «Globos aerostáticos» in paper cut-out (I3c; S1-S4, the technique of
 * `design/theme-illustrations/01-papel-recortado.html`): a fair poster for the header — a torn sheet of warm
 * paper, paper clouds, one big balloon of coral and gold panels with a woven basket, a small blue balloon
 * behind it, two ranges of soft hills, and a couple of birds — a torn divider that hangs three little balloons
 * between two sections, and a footer strip where a balloon rises out of the page.
 *
 * Original work (S3): the envelope, the gores, the ropes, and the basket are generic paper shapes of our own
 * splines; there is no character, no logo, and no protected name, and the drawing carries no text. Every color
 * is a theme variable of `hot-air-balloons`; tints are `opacity` on a theme color, so the gold of the gores is
 * the only warm note besides the coral.
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

/** A soft hill: a wide arch whose crown sits a little left or right of the middle, closed to the bottom. */
function hill(left: number, right: number, crown: number, bottom: number, lean = 0): string {
  const span = right - left;
  const crest = (left + right) / 2 + lean;

  return (
    `M${n(left)} ${n(bottom)}` +
    `C${n(left + span * 0.14)} ${n(crown + (bottom - crown) * 0.34)} ${n(crest - span * 0.24)} ${n(crown)} ${n(crest)} ${n(crown)}` +
    `C${n(crest + span * 0.26)} ${n(crown)} ${n(right - span * 0.12)} ${n(crown + (bottom - crown) * 0.3)} ${n(right)} ${n(bottom)}` +
    `L${n(right)} ${n(bottom + 40)}L${n(left)} ${n(bottom + 40)}Z`
  );
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

/**
 * A balloon envelope: the crown at `top`, the widest point at half its height, and the throat at `bottom`,
 * where the basket hangs. The mouth is narrower than the crown, so the silhouette reads as a balloon and not
 * as an egg.
 */
function envelope(cx: number, top: number, width: number, height: number): string {
  const half = width / 2;
  const bottom = top + height;
  const waist = top + height * 0.5;
  const shoulder = top + height * 0.76;
  const throat = half * 0.3;

  return (
    `M${n(cx)} ${n(top)}` +
    `C${n(cx + half * 0.88)} ${n(top)} ${n(cx + half)} ${n(top + height * 0.3)} ${n(cx + half)} ${n(waist)}` +
    `C${n(cx + half)} ${n(top + height * 0.72)} ${n(cx + half * 0.56)} ${n(shoulder)} ${n(cx + throat)} ${n(bottom)}` +
    `L${n(cx - throat)} ${n(bottom)}` +
    `C${n(cx - half * 0.56)} ${n(shoulder)} ${n(cx - half)} ${n(top + height * 0.72)} ${n(cx - half)} ${n(waist)}` +
    `C${n(cx - half)} ${n(top + height * 0.3)} ${n(cx - half * 0.88)} ${n(top)} ${n(cx)} ${n(top)}Z`
  );
}

/** One balloon: the envelope, its gore panels, the band at the throat, the ropes, and the basket. */
interface Balloon {
  readonly key: string;
  readonly cx: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly shell: ThemePaint;
  readonly panel: ThemePaint;
  readonly band: ThemePaint;
  readonly basket: ThemePaint;
  readonly rope: ThemePaint;
}

function balloon(id: IllustrationId, balloonShape: Balloon): ReactElement {
  const { key, cx, top, width, height, shell, panel, band, basket, rope } = balloonShape;
  const bottom = top + height;
  const half = width / 2;
  const basketTop = bottom + height * 0.2;
  const basketWidth = width * 0.3;
  const basketHeight = height * 0.14;
  const clip = id(`${key}-clip`);

  return h(
    "g",
    { key },
    h(
      "defs",
      { key: "clip" },
      h("clipPath", { id: clip }, h("path", { d: envelope(cx, top, width, height) })),
    ),
    h("path", {
      key: "shadow",
      d: envelope(cx, top, width, height),
      fill: "var(--inv-ink)",
      opacity: 0.14,
      transform: "translate(1.1 3.4)",
    }),
    h("path", { key: "shell", d: envelope(cx, top, width, height), fill: shell }),
    // Two gores of the second color, clipped by the envelope so no panel pokes out of the balloon.
    h(
      "g",
      { key: "gores", clipPath: `url(#${clip})`, fill: panel, opacity: 0.92 },
      h("path", {
        key: "gore-left",
        d: `M${n(cx - half * 0.72)} ${n(top)}C${n(cx - half * 0.4)} ${n(top + height * 0.4)} ${n(cx - half * 0.42)} ${n(top + height * 0.66)} ${n(cx - half * 0.3)} ${n(bottom)}H${n(cx - half * 0.5)}C${n(cx - half * 0.7)} ${n(top + height * 0.6)} ${n(cx - half)} ${n(top + height * 0.4)} ${n(cx - half * 0.72)} ${n(top)}Z`,
      }),
      h("path", {
        key: "gore-right",
        d: `M${n(cx + half * 0.34)} ${n(top)}C${n(cx + half * 0.16)} ${n(top + height * 0.4)} ${n(cx + half * 0.18)} ${n(top + height * 0.7)} ${n(cx + half * 0.16)} ${n(bottom)}H${n(cx + half * 0.3)}C${n(cx + half * 0.44)} ${n(top + height * 0.7)} ${n(cx + half * 0.56)} ${n(top + height * 0.4)} ${n(cx + half * 0.34)} ${n(top)}Z`,
      }),
    ),
    // The band at the throat: two lines of paper, so the envelope ends in a cut edge.
    h("path", {
      key: "band",
      d: `M${n(cx - half * 0.34)} ${n(bottom - height * 0.09)}C${n(cx - half * 0.1)} ${n(bottom - height * 0.05)} ${n(cx + half * 0.1)} ${n(bottom - height * 0.05)} ${n(cx + half * 0.34)} ${n(bottom - height * 0.09)}L${n(cx + half * 0.3)} ${n(bottom)}H${n(cx - half * 0.3)}Z`,
      fill: band,
    }),
    // The ropes: four hairlines from the throat to the four corners of the basket.
    h(
      "g",
      {
        key: "ropes",
        fill: "none",
        stroke: rope,
        strokeWidth: Math.max(0.9, width * 0.012),
        opacity: 0.75,
      },
      h("path", {
        key: "rope-left",
        d: `M${n(cx - basketWidth * 0.4)} ${n(bottom)}L${n(cx - basketWidth * 0.5)} ${n(basketTop)}`,
      }),
      h("path", {
        key: "rope-right",
        d: `M${n(cx + basketWidth * 0.4)} ${n(bottom)}L${n(cx + basketWidth * 0.5)} ${n(basketTop)}`,
      }),
      h("path", {
        key: "rope-near-left",
        d: `M${n(cx - basketWidth * 0.14)} ${n(bottom)}L${n(cx - basketWidth * 0.22)} ${n(basketTop)}`,
      }),
      h("path", {
        key: "rope-near-right",
        d: `M${n(cx + basketWidth * 0.14)} ${n(bottom)}L${n(cx + basketWidth * 0.22)} ${n(basketTop)}`,
      }),
    ),
    // The basket: a woven box with a rim, and one lighter band to read as weaving.
    h("rect", {
      key: "basket-shadow",
      x: n(cx - basketWidth / 2 + 1.1),
      y: n(basketTop + 3.4),
      width: n(basketWidth),
      height: n(basketHeight),
      rx: n(basketHeight * 0.22),
      fill: "var(--inv-ink)",
      opacity: 0.14,
    }),
    h("rect", {
      key: "basket",
      x: n(cx - basketWidth / 2),
      y: n(basketTop),
      width: n(basketWidth),
      height: n(basketHeight),
      rx: n(basketHeight * 0.22),
      fill: basket,
    }),
    h("rect", {
      key: "basket-weave",
      x: n(cx - basketWidth * 0.36),
      y: n(basketTop + basketHeight * 0.3),
      width: n(basketWidth * 0.72),
      height: n(basketHeight * 0.2),
      rx: n(basketHeight * 0.1),
      fill: "var(--inv-surface)",
      opacity: 0.42,
    }),
    h("rect", {
      key: "basket-rim",
      x: n(cx - basketWidth * 0.56),
      y: n(basketTop - basketHeight * 0.14),
      width: n(basketWidth * 1.12),
      height: n(basketHeight * 0.2),
      rx: n(basketHeight * 0.1),
      fill: band,
    }),
  );
}

/** One bird: two strokes of ink, so it reads as a bird at 8 px. */
function bird(key: string, x: number, y: number, scale: number): ReactElement {
  return h("path", {
    key,
    d: "M-7 0C-4.6 -3.4 -2 -3.4 0 -0.6C2 -3.4 4.6 -3.4 7 0",
    fill: "none",
    stroke: "var(--inv-ink)",
    strokeWidth: 1.9,
    strokeLinecap: "round",
    transform: `translate(${x} ${y}) scale(${scale})`,
    opacity: 0.42,
  });
}

const CLOUD_HIGH = cloud(24, 62, 86, 22);
const CLOUD_MID = cloud(276, 88, 96, 24);
const CLOUD_LOW = cloud(128, 74, 54, 15);
const HILL_FAR_LEFT = hill(-14, 210, 140, 164, -18);
const HILL_FAR_RIGHT = hill(170, 404, 146, 166, 12);
const HILL_NEAR_LEFT = hill(-14, 178, 158, 178, 8);
const HILL_NEAR_RIGHT = hill(212, 404, 156, 178, -8);
const GROUND =
  "M-8 176C6 173 22 174 38 175C54 176 68 172 84 173C100 174 116 176 132 175C148 174 164 172 180 173C196 " +
  "174 212 176 228 175C244 174 260 172 276 173C292 174 308 176 324 175C340 174 356 172 372 173C382 174 " +
  "392 175 398 176L398 202L-8 202Z";

const BIG_BALLOON: Balloon = {
  key: "big-balloon",
  cx: 214,
  top: 34,
  width: 92,
  height: 104,
  shell: "var(--inv-decoration-one)",
  panel: "var(--inv-decoration-two)",
  band: "var(--inv-accent)",
  basket: "var(--inv-accent)",
  rope: "var(--inv-ink)",
};

const SMALL_BALLOON: Balloon = {
  key: "small-balloon",
  cx: 96,
  top: 60,
  width: 54,
  height: 62,
  shell: "var(--inv-accent)",
  panel: "var(--inv-surface)",
  band: "var(--inv-surface)",
  basket: "var(--inv-decoration-two)",
  rope: "var(--inv-ink)",
};

const FAR_BALLOON: Balloon = {
  key: "far-balloon",
  cx: 336,
  top: 96,
  width: 34,
  height: 40,
  shell: "var(--inv-decoration-two)",
  panel: "var(--inv-surface)",
  band: "var(--inv-accent)",
  basket: "var(--inv-decoration-two)",
  rope: "var(--inv-ink)",
};

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 2.6, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "hill-far-left", d: HILL_FAR_LEFT, fill: "var(--inv-accent)", shadow: false },
    { name: "hill-far-right", d: HILL_FAR_RIGHT, fill: "var(--inv-accent)", shadow: false },
    { name: "hill-near-left", d: HILL_NEAR_LEFT, fill: "var(--inv-decoration-two)" },
    { name: "hill-near-right", d: HILL_NEAR_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "ground", d: GROUND, fill: "var(--inv-accent)", shadow: false },
    { name: "cloud-high", d: CLOUD_HIGH, fill: "var(--inv-surface)", shadow: false },
    { name: "cloud-mid", d: CLOUD_MID, fill: "var(--inv-surface)", shadow: false },
    { name: "cloud-low", d: CLOUD_LOW, fill: "var(--inv-surface)", shadow: false },
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
    ...cutSheets(id, [sheets[8] as CutSheet, sheets[6] as CutSheet, sheets[7] as CutSheet]),
    // The far range is a tint of the accent, the near range a tint of the gold, so the hills step back.
    h(
      "g",
      { key: "hills-far", opacity: 0.14 },
      ...cutSheets(id, [sheets[1] as CutSheet, sheets[2] as CutSheet]),
    ),
    h(
      "g",
      { key: "hills-near", opacity: 0.5 },
      ...cutSheets(id, [sheets[3] as CutSheet, sheets[4] as CutSheet]),
    ),
    ...cutSheets(id, [sheets[5] as CutSheet]),
    h("use", {
      key: "ground-line",
      href: `#${id("ground")}`,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 1.4,
      opacity: 0.42,
    }),
    balloon(id, FAR_BALLOON),
    balloon(id, SMALL_BALLOON),
    balloon(id, BIG_BALLOON),
    // A glint on the big envelope, and a tuft of grass, so the air is not empty.
    h("path", {
      key: "glint",
      d: `M${n(BIG_BALLOON.cx - 24)} ${n(BIG_BALLOON.top + 34)}C${n(BIG_BALLOON.cx - 30)} ${n(BIG_BALLOON.top + 48)} ${n(BIG_BALLOON.cx - 30)} ${n(BIG_BALLOON.top + 58)} ${n(BIG_BALLOON.cx - 26)} ${n(BIG_BALLOON.top + 68)}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 3,
      strokeLinecap: "round",
      opacity: 0.42,
    }),
    bird("bird-one", 44, 104, 0.9),
    bird("bird-two", 74, 116, 0.68),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 38, 3.6, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 47, 5.6, DIVIDER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
  ];
  const sky = [
    {
      x: 72,
      y: 8,
      width: 26,
      height: 26,
      shell: "var(--inv-decoration-one)" as ThemePaint,
      basket: "var(--inv-accent)" as ThemePaint,
    },
    {
      x: 168,
      y: 2,
      width: 32,
      height: 32,
      shell: "var(--inv-accent)" as ThemePaint,
      basket: "var(--inv-decoration-two)" as ThemePaint,
    },
    {
      x: 278,
      y: 8,
      width: 26,
      height: 26,
      shell: "var(--inv-decoration-two)" as ThemePaint,
      basket: "var(--inv-accent)" as ThemePaint,
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
    ...sky.flatMap((mini, index) =>
      balloon(id, {
        key: `mini-balloon-${index}`,
        cx: mini.x,
        top: mini.y,
        width: mini.width,
        height: mini.height,
        shell: mini.shell,
        panel: "var(--inv-surface)",
        band: "var(--inv-decoration-two)",
        basket: mini.basket,
        rope: "var(--inv-ink)",
      }),
    ),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.2, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 44, 2.4, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
    { name: "cloud-left", d: cloud(6, 46, 96, 20), fill: "var(--inv-surface)", shadow: false },
    { name: "cloud-right", d: cloud(276, 44, 104, 22), fill: "var(--inv-surface)", shadow: false },
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
    balloon(id, {
      key: "footer-balloon",
      cx: 196,
      top: 2,
      width: 34,
      height: 32,
      shell: "var(--inv-decoration-one)",
      panel: "var(--inv-surface)",
      band: "var(--inv-accent)",
      basket: "var(--inv-accent)",
      rope: "var(--inv-ink)",
    }),
  ];
}

/** «Globos aerostáticos» in paper cut-out: the balloon fair, the balloon divider, and the cloud footer. */
export const HOT_AIR_BALLOONS_ILLUSTRATION: ThemeIllustration = {
  theme: "hot-air-balloons",
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
