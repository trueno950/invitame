import { createElement, type ReactElement } from "react";

import { type CutSheet, cutSheets, grain, sheetDefinitions, tornEdge } from "./primitives.ts";
import type { IllustrationId, ThemeIllustration } from "./types.ts";

/*
 * «Amigos del bosque» in paper cut-out (I3c; S1-S4, the technique of
 * `design/theme-illustrations/01-papel-recortado.html`): a forest clearing for the header — a torn sheet of pale
 * paper, a far line of pines, two tall pines, a friendly fox of our own simple shapes sitting between them,
 * ferns at both edges, two mushrooms, and a few leaves falling — a torn divider that carries the pines between
 * two sections, and a footer strip where the ferns close the page.
 *
 * Original work (S3): the fox is a generic paper animal — a dome body, a rounded head, two pointed ears, a
 * curling tail, a white chest — and could be any friendly woodland creature; it is not a character, a mascot, a
 * logo, or a protected name, and the drawing carries no text. Every color is a theme variable of
 * `woodland-friends`; tints are `opacity` on a theme color.
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

/**
 * A tapered blade of paper from its base at (`x`, `y`), `length` long, tilted `angle` degrees from straight up.
 * One helper serves the pine needles, the fern leaflets, and the grass, so one cut edge runs through the
 * drawing.
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

/** A pine: three tiers of different width on one trunk, merged into a single cut sheet. */
function pine(x: number, base: number, height: number, width: number): string {
  const half = width / 2;
  const tier = (left: number, right: number, foot: number, top: number): string =>
    `M${n(left)} ${n(foot)}L${n(x)} ${n(top)}L${n(right)} ${n(foot)}Z`;

  return (
    tier(x - half, x + half, base, base - height * 0.52) +
    tier(x - half * 0.8, x + half * 0.8, base - height * 0.3, base - height * 0.78) +
    tier(x - half * 0.56, x + half * 0.56, base - height * 0.52, base - height)
  );
}

/** A fern: a leaning stem with leaflets of falling size on both sides, merged into one sheet. */
function fern(x: number, base: number, height: number, lean: number): string {
  const pieces: string[] = [blade(x, base, height, 1.6, lean)];

  for (let step = 1; step <= 6; step += 1) {
    const along = step / 7;
    const stemX = x + lean * along * 1.2;
    const stemY = base - height * along;
    const reach = height * 0.3 * (1 - along * 0.66);
    const droop = 52 + along * 18;

    pieces.push(blade(stemX, stemY, reach, reach * 0.2, lean - droop));
    pieces.push(blade(stemX, stemY, reach * 0.94, reach * 0.2, lean + droop));
  }
  return pieces.join("");
}

/** A mushroom: a domed cap with a wavy rim, and a short stem. */
function mushroomCap(x: number, y: number, width: number): string {
  const half = width / 2;

  return (
    `M${n(x - half)} ${n(y)}` +
    `C${n(x - half)} ${n(y - width * 0.78)} ${n(x + half)} ${n(y - width * 0.78)} ${n(x + half)} ${n(y)}` +
    `C${n(x + half * 0.45)} ${n(y + width * 0.16)} ${n(x + half * 0.2)} ${n(y - width * 0.06)} ${n(x)} ${n(y + width * 0.1)}` +
    `C${n(x - half * 0.34)} ${n(y + width * 0.2)} ${n(x - half * 0.5)} ${n(y + width * 0.02)} ${n(x - half)} ${n(y)}Z`
  );
}

const HILL_FAR_LEFT = hill(-14, 208, 138, 162, -16);
const HILL_FAR_RIGHT = hill(168, 404, 144, 164, 12);
const GROUND_MID =
  "M-8 174C6 171 22 172 38 173C54 174 68 170 84 171C100 172 116 174 132 173C148 172 164 170 180 171C196 " +
  "172 212 174 228 173C244 172 260 170 276 171C292 172 308 174 324 173C340 172 356 170 372 171C382 172 " +
  "392 173 398 174L398 202L-8 202Z";
const GROUND =
  "M-8 186C6 183 22 184 38 185C54 186 68 182 84 183C100 184 116 186 132 185C148 184 164 182 180 183C196 " +
  "184 212 186 228 185C244 184 260 182 276 183C292 184 308 186 324 185C340 184 356 182 372 183C382 184 " +
  "392 185 398 186L398 202L-8 202Z";

/** The far pines, a row of small triangles the eye reads as a forest before the near trees exist. */
const PINES_FAR = [
  pine(30, 166, 34, 22),
  pine(56, 168, 26, 17),
  pine(84, 166, 38, 24),
  pine(232, 168, 30, 20),
  pine(262, 166, 40, 25),
  pine(292, 168, 28, 18),
  pine(320, 166, 34, 22),
  pine(352, 168, 24, 16),
  pine(376, 166, 30, 20),
].join("");

const PINE_LEFT = pine(64, 186, 118, 66);
const PINE_RIGHT = pine(324, 186, 128, 70);
const TRUNKS = "M58 178H70L72 200H56Z M318 178H330L332 200H316Z";

const FOX_BODY = "M156 172C150 154 160 138 179 138C198 138 208 154 202 172Z";
const FOX_HEAD =
  "M179 104C190 104 200 112 200 122C200 133 190 140 179 140C168 140 158 133 158 122C158 112 168 104 179 104Z";
const FOX_EAR_LEFT = "M160 112L149 86L174 99Z";
const FOX_EAR_RIGHT = "M198 112L209 86L184 99Z";
const FOX_TAIL =
  "M202 172C220 174 234 166 236 154C238 143 229 135 221 139C214 142 212 151 217 157C221 162 228 161 231 156" +
  "L225 150C223 153 219 152 218 149C217 145 220 142 224 143C229 145 231 151 229 156C226 164 216 168 204 166Z";
const FOX_CHEST = disc(179, 160, 12, 1.06);
const FOX_MUZZLE = disc(179, 132, 9.4, 0.74);

const FERNS = [
  fern(20, 198, 96, 26),
  fern(48, 200, 68, 14),
  fern(368, 198, 92, -26),
  fern(344, 200, 64, -14),
].join("");

const MUSHROOM_CAPS = mushroomCap(262, 178, 22) + mushroomCap(286, 186, 16);

const FALLING_LEAVES: readonly string[] = [
  blade(96, 52, 12, 3.4, 118),
  blade(124, 38, 10, 3, 64),
  blade(268, 46, 12, 3.4, -118),
  blade(300, 34, 9, 2.8, -70),
];

function scene(id: IllustrationId): ReactElement[] {
  const tear = tornEdge(SCENE_WIDTH, 10, 1.7, SCENE_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false },
    { name: "hill-far-left", d: HILL_FAR_LEFT, fill: "var(--inv-accent)", shadow: false },
    { name: "hill-far-right", d: HILL_FAR_RIGHT, fill: "var(--inv-accent)", shadow: false },
    { name: "pines-far", d: PINES_FAR, fill: "var(--inv-accent)", shadow: false },
    { name: "ground-mid", d: GROUND_MID, fill: "var(--inv-accent)" },
    { name: "ground", d: GROUND, fill: "var(--inv-accent)", shadow: false },
    { name: "trunks", d: TRUNKS, fill: "var(--inv-decoration-one)" },
    { name: "pine-left", d: PINE_LEFT, fill: "var(--inv-accent)" },
    { name: "pine-right", d: PINE_RIGHT, fill: "var(--inv-decoration-two)" },
    { name: "fox-body", d: FOX_BODY, fill: "var(--inv-decoration-one)" },
    { name: "fox-head", d: FOX_HEAD, fill: "var(--inv-decoration-one)" },
    { name: "fox-ear-left", d: FOX_EAR_LEFT, fill: "var(--inv-decoration-one)" },
    { name: "fox-ear-right", d: FOX_EAR_RIGHT, fill: "var(--inv-decoration-one)" },
    { name: "fox-tail", d: FOX_TAIL, fill: "var(--inv-decoration-one)", shadow: false },
    { name: "fox-chest", d: FOX_CHEST, fill: "var(--inv-surface)", shadow: false },
    { name: "fox-muzzle", d: FOX_MUZZLE, fill: "var(--inv-surface)", shadow: false },
    { name: "mushroom-caps", d: MUSHROOM_CAPS, fill: "var(--inv-decoration-one)" },
    { name: "ferns", d: FERNS, fill: "var(--inv-accent)" },
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
    // The far forest: hills and pines tinted back to a single washed green.
    h(
      "g",
      { key: "far-forest", opacity: 0.22 },
      ...cutSheets(id, [sheets[1] as CutSheet, sheets[2] as CutSheet, sheets[3] as CutSheet]),
    ),
    h("use", {
      key: "hill-line",
      href: `#${id("hill-far-right")}`,
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 1.2,
      opacity: 0.5,
    }),
    // The falling leaves of the clearing, above the trees so they read against the sky.
    h(
      "g",
      { key: "falling-leaves", fill: "var(--inv-decoration-one)", opacity: 0.7 },
      FALLING_LEAVES.map((d, index) => h("path", { key: `falling-leaf-${index}`, d })),
    ),
    ...cutSheets(id, [sheets[4] as CutSheet, sheets[5] as CutSheet]),
    ...cutSheets(id, [sheets[7] as CutSheet, sheets[8] as CutSheet]),
    // The fox, back to front: tail, body, chest, ears, head, muzzle, and its face.
    ...cutSheets(id, [
      sheets[13] as CutSheet,
      sheets[9] as CutSheet,
      sheets[14] as CutSheet,
      sheets[11] as CutSheet,
      sheets[12] as CutSheet,
      sheets[10] as CutSheet,
      sheets[15] as CutSheet,
    ]),
    h("path", {
      key: "fox-tail-tip",
      d: "M224 141C231 143 234 150 232 156C229 164 219 168 207 166C214 163 220 158 222 152C224 147 225 144 224 141Z",
      fill: "var(--inv-surface)",
      opacity: 0.9,
    }),
    h("path", {
      key: "fox-ear-inner-left",
      d: "M161 108L153 91L171 100Z",
      fill: "var(--inv-soft)",
      opacity: 0.9,
    }),
    h("path", {
      key: "fox-ear-inner-right",
      d: "M197 108L205 91L187 100Z",
      fill: "var(--inv-soft)",
      opacity: 0.9,
    }),
    h("circle", { key: "fox-eye-left", cx: 170, cy: 119, r: 2.5, fill: "var(--inv-ink)" }),
    h("circle", { key: "fox-eye-right", cx: 188, cy: 119, r: 2.5, fill: "var(--inv-ink)" }),
    h("path", { key: "fox-nose", d: "M174 126H184L179 132Z", fill: "var(--inv-ink)" }),
    h("path", {
      key: "fox-mouth",
      d: "M179 132V136M179 136C176 139 172 138 171 135M179 136C182 139 186 138 187 135",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
    }),
    h("ellipse", {
      key: "fox-cheek-left",
      cx: 164,
      cy: 128,
      rx: 5.4,
      ry: 3.4,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
    }),
    h("ellipse", {
      key: "fox-cheek-right",
      cx: 194,
      cy: 128,
      rx: 5.4,
      ry: 3.4,
      fill: "var(--inv-decoration-two)",
      opacity: 0.5,
    }),
    h("ellipse", {
      key: "fox-paw-left",
      cx: 167,
      cy: 170,
      rx: 6.4,
      ry: 4.4,
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    h("ellipse", {
      key: "fox-paw-right",
      cx: 191,
      cy: 170,
      rx: 6.4,
      ry: 4.4,
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    // The tiers of the near pines, a hairline each, so a pine is three cut sheets and not one triangle.
    h(
      "g",
      {
        key: "pine-tiers",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.2,
        opacity: 0.2,
      },
      h("path", { key: "left-tier-two", d: "M38 150.6H90" }),
      h("path", { key: "left-tier-three", d: "M46 124.6H82" }),
      h("path", { key: "right-tier-two", d: "M296 147.6H352" }),
      h("path", { key: "right-tier-three", d: "M305 119.4H343" }),
    ),
    // The mushrooms at the foot of the near pine.
    h("path", {
      key: "mushroom-stem-one",
      d: "M257 176H267L268 188H256Z",
      fill: "var(--inv-surface)",
    }),
    h("path", {
      key: "mushroom-stem-two",
      d: "M282 184H290L291 194H281Z",
      fill: "var(--inv-surface)",
    }),
    ...cutSheets(id, [sheets[16] as CutSheet]),
    h(
      "g",
      { key: "mushroom-spots", fill: "var(--inv-surface)", opacity: 0.75 },
      h("circle", { key: "spot-one", cx: 257, cy: 172, r: 2.4 }),
      h("circle", { key: "spot-two", cx: 268, cy: 174, r: 1.9 }),
      h("circle", { key: "spot-three", cx: 283, cy: 182, r: 1.7 }),
    ),
    ...cutSheets(id, [sheets[17] as CutSheet]),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 26, 3.5, DIVIDER_HEIGHT + 8);
  const under = tornEdge(SCENE_WIDTH, 39, 5.3, DIVIDER_HEIGHT + 8);
  const trees = [
    pine(52, 44, 30, 20),
    pine(92, 46, 24, 16),
    pine(132, 44, 32, 22),
    pine(258, 44, 30, 20),
    pine(298, 46, 24, 16),
    pine(338, 44, 32, 22),
  ].join("");
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "strip-under", d: under.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "pines", d: trees, fill: "var(--inv-accent)" },
    {
      name: "thicket",
      d: pine(188, 52, 34, 22) + pine(210, 54, 26, 17),
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
      opacity: 0.2,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
    h("use", {
      key: "thicket-fill",
      href: `#${id("thicket")}`,
      fill: "var(--inv-accent)",
      opacity: 0.42,
    }),
    h("path", {
      key: "divider-leaf",
      d: blade(168, 46, 10, 3, 120) + blade(234, 44, 10, 3, -120),
      fill: "var(--inv-decoration-one)",
      opacity: 0.7,
    }),
  ];
}

function footer(id: IllustrationId): ReactElement[] {
  const top = tornEdge(SCENE_WIDTH, 10, 6.7, FOOTER_HEIGHT + 8);
  const wash = tornEdge(SCENE_WIDTH, 44, 2.3, FOOTER_HEIGHT + 8);
  const sheets: readonly CutSheet[] = [
    { name: "strip", d: top.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    { name: "wash", d: wash.sheet, fill: "var(--inv-accent)", shadow: false },
    {
      name: "ferns",
      d:
        fern(24, 60, 42, 16) +
        fern(58, 62, 30, -10) +
        fern(366, 60, 40, -16) +
        fern(332, 62, 28, 10),
      fill: "var(--inv-accent)",
    },
    {
      name: "pines",
      d: pine(120, 58, 34, 24) + pine(168, 60, 26, 18) + pine(268, 58, 30, 22),
      fill: "var(--inv-accent)",
      shadow: false,
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
    h("use", {
      key: "pines-fill",
      href: `#${id("pines")}`,
      fill: "var(--inv-accent)",
      opacity: 0.4,
    }),
    ...cutSheets(id, [sheets[2] as CutSheet]),
  ];
}

/** «Amigos del bosque» in paper cut-out: the fox clearing, the pine divider, and the fern footer. */
export const WOODLAND_FRIENDS_ILLUSTRATION: ThemeIllustration = {
  theme: "woodland-friends",
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
