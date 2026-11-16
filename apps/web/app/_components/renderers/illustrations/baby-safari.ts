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
 * «Safari bebé» in paper cut-out, second pass (I4a; S3, S5). The owner asked for this theme to be improved, so
 * the diorama now has real depth: a hazy sky with a soft-rayed sun and distant birds, two ranges of far hills,
 * an acacia silhouette and a small distant copy of it, a middle savanna floor, and a front ground with tall
 * grass. The hero pair gained detail — a giraffe with a spot-patterned neck and body, ossicones, mane, ears,
 * muzzle and tail, and an elephant with a folded ear, an inner-ear tint, a curling tusk-free trunk, toenails and
 * a tail — plus a third, gentler animal, a small zebra foal with a striped pattern and a dark mane. Layered palm
 * fronds frame both edges in the foreground, and a few paper flowers sit in the grass. The divider and the
 * footer carry the same savanna as a low strip.
 *
 * Original work (S3): the animals are generic paper shapes drawn from our own splines — a giraffe, an elephant
 * and a zebra foal — never a character, a mascot, a logo, or a protected name. Every color is a theme variable of
 * `baby-safari`, tints are `opacity` on a theme color, and the drawing carries no text. Pattern fills (the
 * giraffe's spots and the foal's stripes) are SVG `<pattern>` definitions whose ids come from the frame, so two
 * invitations on one page never share one.
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
 * A round palm frond, defined at the origin and pointing up, so a frond is placed with a turn around its own
 * base. The belly is broad and the tip is round, with a shallow notch on each shoulder as in a cut leaf.
 */
function frond(length: number, width: number): string {
  const tip = length * 0.9;

  return (
    `M0 0` +
    `C${n(-width)} ${n(-length * 0.16)} ${n(-width * 1.04)} ${n(-length * 0.56)} ${n(-width * 0.6)} ${n(-tip)}` +
    `C${n(-width * 0.36)} ${n(-length * 0.99)} ${n(-width * 0.12)} ${n(-length * 1.01)} ${n(-width * 0.2)} ${n(-length * 0.9)}` +
    `C${n(-width * 0.02)} ${n(-length * 1.03)} ${n(width * 0.12)} ${n(-length * 1.02)} ${n(width * 0.3)} ${n(-length * 0.92)}` +
    `C${n(width * 0.24)} ${n(-length * 1.01)} ${n(width * 0.44)} ${n(-length * 0.97)} ${n(width * 0.64)} ${n(-tip)}` +
    `C${n(width * 1.04)} ${n(-length * 0.55)} ${n(width)} ${n(-length * 0.16)} 0 0Z`
  );
}

/** The midrib of a frond and a few side ribs, drawn over its cut sheet at the same placement. */
function frondVeins(length: number, width: number): string {
  const rib = (at: number, side: number, reach: number): string =>
    `M0 ${n(-length * at)}Q${n(side * width * reach * 0.55)} ${n(-length * (at + 0.06))} ` +
    `${n(side * width * reach)} ${n(-length * (at + 0.14))}`;

  return (
    `M0 0L0 ${n(-length * 0.84)}` +
    rib(0.22, -1, 0.5) +
    rib(0.44, -1, 0.44) +
    rib(0.24, 1, 0.48) +
    rib(0.5, 1, 0.4)
  );
}

/** A blade of grass: a narrow crescent leaning a little, so a tuft is never a row of sticks. */
function blade(x: number, base: number, height: number, lean: number): string {
  return (
    `M${n(x - 2.8)} ${n(base)}` +
    `C${n(x - 3.2)} ${n(base - height * 0.5)} ${n(x + lean - 1.8)} ${n(base - height * 0.82)} ${n(x + lean)} ${n(base - height)}` +
    `C${n(x + lean * 0.4 + 2.6)} ${n(base - height * 0.66)} ${n(x + 3.4)} ${n(base - height * 0.3)} ${n(x + 2.8)} ${n(base)}Z`
  );
}

/** A tuft of grass: three blades of different heights, cut as one piece. */
function tuft(x: number, base: number, height: number, lean: number): string {
  return (
    blade(x - 4.4, base, height * 0.74, lean * 0.5) +
    blade(x, base, height, lean) +
    blade(x + 4.8, base, height * 0.6, lean * 1.4)
  );
}

/** One bird: two strokes of ink, the far wing shorter, so it reads as a bird at 8 px. */
function bird(key: string, x: number, y: number, scale: number, opacity = 0.45): ReactElement {
  return h("path", {
    key,
    d: "M-7 0C-4.6 -3.4 -2 -3.4 0 -0.6C2 -3.4 4.6 -3.4 7 0",
    fill: "none",
    stroke: "var(--inv-ink)",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    transform: `translate(${x} ${y}) scale(${scale})`,
    opacity,
  });
}

/** Soft sun rays: rounded lines placed around the disc, one theme tint, no outline. */
function sunRays(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  count: number,
  paint: ThemePaint,
  opacity: number,
): ReactElement {
  const rays: ReactElement[] = [];

  for (let index = 0; index < count; index += 1) {
    rays.push(
      h("line", {
        key: `ray-${index}`,
        x1: n(cx),
        y1: n(cy - inner),
        x2: n(cx),
        y2: n(cy - outer),
        transform: `rotate(${n((360 / count) * index)} ${n(cx)} ${n(cy)})`,
      }),
    );
  }
  return h(
    "g",
    { key: "sun-rays", stroke: paint, strokeWidth: 3, strokeLinecap: "round", opacity },
    rays,
  );
}

/** A sheet spec, so a set of sheets can be declared as one typed record and referenced by name. */
type SheetSpec = {
  readonly d: string;
  readonly fill: ThemePaint;
  readonly shadow?: boolean;
  readonly outline?: boolean;
  readonly transform?: string;
};

/** One named sheet, built explicitly so optional props are only present when they are set. */
function toSheet(name: string, spec: SheetSpec): CutSheet {
  return {
    name,
    d: spec.d,
    fill: spec.fill,
    ...(spec.shadow === undefined ? {} : { shadow: spec.shadow }),
    ...(spec.outline === undefined ? {} : { outline: spec.outline }),
    ...(spec.transform === undefined ? {} : { transform: spec.transform }),
  };
}

/** A record of named sheets, with the `<defs>` list and a by-name accessor cutSheets can take. */
function sheetSet<T extends Record<string, SheetSpec>>(specs: T) {
  const all: CutSheet[] = Object.entries(specs).map(([name, spec]) =>
    toSheet(name, spec as SheetSpec),
  );
  const named = (name: keyof T & string): CutSheet => toSheet(name, specs[name] as SheetSpec);

  return { all, named };
}

/* ── The scene: sky, sun, hills, acacia, ground, animals, fronds ─────────────────────────────────────── */

const SUN_HALO = disc(326, 44, 31);
const SUN = disc(326, 44, 20);

const HILL_FAR_LEFT = hill(-24, 186, 126, 158, -18);
const HILL_FAR_RIGHT = hill(146, 418, 134, 160, 18);
const HILL_MID_LEFT = hill(-24, 154, 144, 172, 10);
const HILL_MID_RIGHT = hill(186, 418, 142, 172, -10);

const HAZE = disc(196, 130, 186, 0.16);

const ACACIA_CANOPY_BACK = [
  disc(-2, 68, 38, 0.4),
  disc(32, 58, 44, 0.4),
  disc(70, 64, 32, 0.38),
].join("");
const ACACIA_CANOPY = [
  disc(0, 64, 29, 0.36),
  disc(24, 57, 31, 0.38),
  disc(46, 52, 33, 0.38),
  disc(70, 57, 27, 0.36),
  disc(90, 65, 16, 0.32),
].join("");
const ACACIA_CROWN = [disc(24, 52, 12, 0.28), disc(48, 46, 15, 0.26), disc(70, 52, 9, 0.26)].join(
  "",
);
const ACACIA_TREE =
  "M32 181C33 164 35 146 37 128C38 114 39 100 40 88L45 88C45 100 46 114 47 128C49 146 52 164 55 181Z" +
  "M40 116C34 105 27 93 16 81L19 76C30 84 38 96 45 110Z" +
  "M44 108C52 97 61 88 72 80L75 85C64 91 55 101 48 113Z";

const GROUND_MID = tornEdge(SCENE_WIDTH, 158, 4.1, SCENE_HEIGHT + 8).sheet;
const GROUND_NEAR = tornEdge(SCENE_WIDTH, 174, 2.3, SCENE_HEIGHT + 8).sheet;
/** A low bush on the middle floor, filling the gap between the two animals at a further plane. */
const MID_BUSH = [disc(188, 157, 9, 0.72), disc(197, 154, 11, 0.76), disc(206, 158, 8, 0.7)].join(
  "",
);

/* The giraffe: body, neck, head, ears, four tapered legs, and a tail, facing right. */
const GIRAFFE_BODY =
  "M94 154C94 142 104 135 119 134C135 133 148 139 152 149C155 157 149 163 141 165L107 167C99 165 94 161 94 154Z";
const GIRAFFE_NECK = "M139 146C137 130 143 115 152 103L164 108C158 119 154 132 155 147Z";
const GIRAFFE_HEAD =
  "M154 99C152 89 159 81 169 81C179 81 186 88 185 96C184 104 176 107 167 106C161 105 155 104 154 99Z";
const GIRAFFE_LEGS: readonly string[] = [
  "M100 160C100 168 100 176 101 183L107 183C108 176 108 168 108 161Z",
  "M114 162C114 169 114 176 115 183L121 183C122 176 122 169 122 162Z",
  "M133 163C133 170 134 177 135 183L141 183C142 176 142 169 142 163Z",
  "M145 162C145 169 146 176 147 183L153 183C154 176 154 169 154 161Z",
];
const GIRAFFE_EARS: readonly string[] = [
  "M153 90C147 85 142 87 141 92C144 96 149 97 154 95Z",
  "M159 84C154 78 149 79 147 83C150 87 155 89 160 89Z",
];
const GIRAFFE_OSSICONES: readonly string[] = [
  "M163 83C162 77 162 73 162 69",
  "M176 84C176 79 177 75 178 72",
];

/* The elephant: round body, head, big folded ear, curling tusk-free trunk, four legs, a tail. */
const ELEPHANT_BODY = disc(273, 155, 28, 0.78);
const ELEPHANT_HEAD = disc(237, 151, 20, 0.98);
const ELEPHANT_EAR = disc(259, 141, 21, 0.98);
const ELEPHANT_EAR_INNER =
  "M253 132C261 127 271 132 275 141C279 150 272 160 262 159C254 158 249 151 250 143Z";
const ELEPHANT_TRUNK =
  "M214 138C202 146 196 158 198 170C199 179 208 184 216 180C223 177 224 168 218 165C214 162 209 166 211 171" +
  "L205 172C198 165 202 153 209 145C213 141 219 139 225 137Z";
const ELEPHANT_LEGS: readonly string[] = [
  "M232 160C232 168 233 176 234 184L241 184C242 176 242 168 241 159Z",
  "M247 162C247 170 248 177 249 185L256 185C257 177 257 170 256 161Z",
  "M276 162C276 170 277 177 278 185L285 185C286 177 286 170 285 161Z",
  "M291 159C291 168 292 176 293 184L300 184C301 176 301 168 300 158Z",
];

/* The zebra foal: a small striped body, neck and head, slim legs, and a dark mane. */
const ZEBRA_BODY = disc(331, 164, 16, 0.72);
const ZEBRA_NECK = "M340 157C344 152 348 148 352 146L356 153C352 155 348 159 345 163Z";
const ZEBRA_HEAD =
  "M350 149C348 143 352 137 358 137C364 137 368 142 367 147C366 152 361 154 357 152Z";
const ZEBRA_LEGS: readonly string[] = [
  "M319 167C319 172 319 177 320 182L324 182C325 177 325 172 325 166Z",
  "M329 169C329 173 329 178 330 182L334 182C335 178 335 173 335 168Z",
  "M340 169C340 173 340 178 341 182L345 182C346 178 346 173 346 168Z",
  "M351 166C351 171 352 177 353 182L357 182C358 177 358 171 357 165Z",
];
const ZEBRA_EARS: readonly string[] = [
  "M352 140C348 135 344 136 343 140C346 143 350 144 353 143Z",
  "M360 138C357 133 353 134 351 137C354 140 358 142 361 141Z",
];

/** The grass of the middle floor, cut as one sheet in the darker of the two greens. */
const TUFTS_MID = [
  tuft(64, 174, 15, 2),
  tuft(90, 170, 11, -2),
  tuft(196, 172, 14, 2),
  tuft(222, 176, 10, -2),
  tuft(318, 172, 13, 2),
  tuft(366, 176, 15, -2),
].join("");
/** Tall foreground grass at the bottom edge, in the lighter green over the dark ground band. */
const TUFTS_FRONT = [
  tuft(24, 208, 34, 4),
  tuft(70, 208, 26, -3),
  tuft(160, 208, 30, 3),
  tuft(252, 208, 26, -4),
  tuft(316, 206, 32, 3),
  tuft(382, 208, 36, -4),
].join("");

/** The tiny acacias of the far range: a flat crown on a short trunk, repeated at hazy distance. */
const DISTANT_TREES = [
  [150, 144],
  [236, 141],
]
  .map(([x, y]) => {
    const cx = x as number;
    const cy = y as number;
    return (
      disc(cx, cy, 6, 0.36) +
      disc(cx + 7, cy - 2.4, 4.4, 0.34) +
      disc(cx - 6, cy + 0.6, 3.6, 0.32) +
      `M${n(cx + 1.2)} ${n(cy + 1)}V${n(cy + 8)}H${n(cx + 2.8)}V${n(cy + 1)}Z`
    );
  })
  .join("");

/** Two small termite mounds on the near floor, a quiet savanna prop. */
const MOUND_ONE = "M56 178C56 170 61 166 69 166C77 166 82 170 82 178Z";
const MOUND_TWO = "M292 176C292 170 296 167 301 167C306 167 310 170 310 176Z";

/** The patterned spot cells of the giraffe: a clipped pattern sheet, painted over body and neck. */
function spotPattern(id: IllustrationId): ReactElement {
  return h(
    "pattern",
    {
      key: "giraffe-spot-pattern",
      id: id("giraffe-spots"),
      width: 14,
      height: 13,
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(9)",
    },
    h("path", {
      key: "spot-one",
      d: disc(3, 4, 2.6, 0.86),
      fill: "var(--inv-surface)",
      opacity: 0.7,
    }),
    h("path", {
      key: "spot-two",
      d: disc(10, 2, 1.6, 0.9),
      fill: "var(--inv-surface)",
      opacity: 0.5,
    }),
    h("path", {
      key: "spot-three",
      d: disc(8.6, 9, 2.1, 0.8),
      fill: "var(--inv-surface)",
      opacity: 0.62,
    }),
  );
}

/** The zebra's stripes: narrow ink bands over a white body, tilted a little like a real coat. */
function stripePattern(id: IllustrationId): ReactElement {
  return h(
    "pattern",
    {
      key: "zebra-stripe-pattern",
      id: id("zebra-stripes"),
      width: 9,
      height: 10,
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(21)",
    },
    h("rect", {
      key: "stripe-wide",
      width: 2.2,
      height: 10,
      fill: "var(--inv-ink)",
      opacity: 0.55,
    }),
    h("rect", {
      key: "stripe-narrow",
      x: 5.2,
      width: 1.4,
      height: 10,
      fill: "var(--inv-ink)",
      opacity: 0.36,
    }),
  );
}

/** A pattern overlay: the referenced sheet, painted with a pattern whose cells are theme tints. */
function patterned(
  key: string,
  id: IllustrationId,
  sheet: CutSheet,
  pattern: string,
  opacity = 1,
): ReactElement {
  return h("use", {
    key,
    href: `#${id(sheet.name)}`,
    style: { fill: `url(#${id(pattern)})` },
    opacity,
  });
}

function scene(id: IllustrationId): ReactElement[] {
  const skyTear = tornEdge(SCENE_WIDTH, 9, 1.9, SCENE_HEIGHT + 8);
  const farTear = tornEdge(SCENE_WIDTH, 150, 2.7, SCENE_HEIGHT + 8);
  const specs = {
    sky: { d: skyTear.sheet, fill: "var(--inv-soft)", shadow: false },
    "sun-halo": { d: SUN_HALO, fill: "var(--inv-decoration-one)", shadow: false },
    sun: { d: SUN, fill: "var(--inv-decoration-one)" },
    "hill-far-left": { d: HILL_FAR_LEFT, fill: "var(--inv-decoration-two)", shadow: false },
    "hill-far-right": { d: HILL_FAR_RIGHT, fill: "var(--inv-decoration-two)", shadow: false },
    "hill-mid-left": { d: HILL_MID_LEFT, fill: "var(--inv-decoration-two)" },
    "hill-mid-right": { d: HILL_MID_RIGHT, fill: "var(--inv-decoration-two)" },
    "far-floor": { d: farTear.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    "acacia-canopy-back": { d: ACACIA_CANOPY_BACK, fill: "var(--inv-decoration-two)" },
    acacia: { d: ACACIA_TREE, fill: "var(--inv-accent)" },
    "acacia-canopy": { d: ACACIA_CANOPY, fill: "var(--inv-accent)" },
    "acacia-crown": { d: ACACIA_CROWN, fill: "var(--inv-decoration-two)", shadow: false },
    "distant-trees": { d: DISTANT_TREES, fill: "var(--inv-accent)", shadow: false },
    "mound-one": { d: MOUND_ONE, fill: "var(--inv-decoration-two)" },
    "mound-two": { d: MOUND_TWO, fill: "var(--inv-decoration-two)", shadow: false },
    "mid-bush": { d: MID_BUSH, fill: "var(--inv-decoration-two)" },
    "ground-mid": { d: GROUND_MID, fill: "var(--inv-decoration-two)", shadow: false },
    "ground-near": { d: GROUND_NEAR, fill: "var(--inv-accent)", shadow: false },
    "giraffe-body": { d: GIRAFFE_BODY + GIRAFFE_NECK, fill: "var(--inv-decoration-one)" },
    "giraffe-head": {
      d: GIRAFFE_HEAD,
      fill: "var(--inv-decoration-one)",
      outline: true,
    },
    "giraffe-legs": { d: GIRAFFE_LEGS.join(""), fill: "var(--inv-decoration-one)" },
    "giraffe-ears": { d: GIRAFFE_EARS.join(""), fill: "var(--inv-decoration-one)" },
    "elephant-body": { d: ELEPHANT_BODY, fill: "var(--inv-decoration-two)" },
    "elephant-head": {
      d: ELEPHANT_HEAD,
      fill: "var(--inv-decoration-two)",
      outline: true,
    },
    "elephant-ear": { d: ELEPHANT_EAR, fill: "var(--inv-decoration-two)", outline: true },
    "elephant-ear-inner": {
      d: ELEPHANT_EAR_INNER,
      fill: "var(--inv-soft)",
      shadow: false,
    },
    "elephant-trunk": { d: ELEPHANT_TRUNK, fill: "var(--inv-decoration-two)" },
    "elephant-legs": { d: ELEPHANT_LEGS.join(""), fill: "var(--inv-decoration-two)" },
    "zebra-body": {
      d: ZEBRA_BODY + ZEBRA_NECK + ZEBRA_HEAD,
      fill: "var(--inv-surface)",
      outline: true,
    },
    "zebra-legs": { d: ZEBRA_LEGS.join(""), fill: "var(--inv-surface)" },
    "zebra-ears": { d: ZEBRA_EARS.join(""), fill: "var(--inv-surface)" },
    "tufts-mid": { d: TUFTS_MID, fill: "var(--inv-accent)", shadow: false },
    "tufts-front": { d: TUFTS_FRONT, fill: "var(--inv-decoration-two)", shadow: false },
    "frond-left-one": {
      d: frond(88, 36),
      fill: "var(--inv-decoration-two)",
      transform: "translate(-6 207) rotate(-20)",
      shadow: false,
    },
    "frond-left-two": {
      d: frond(94, 40),
      fill: "var(--inv-accent)",
      transform: "translate(2 209) rotate(0)",
    },
    "frond-left-three": {
      d: frond(66, 28),
      fill: "var(--inv-decoration-two)",
      transform: "translate(2 208) rotate(26)",
      shadow: false,
    },
    "frond-right-one": {
      d: frond(88, 36),
      fill: "var(--inv-decoration-two)",
      transform: "translate(398 207) rotate(20)",
      shadow: false,
    },
    "frond-right-two": {
      d: frond(94, 40),
      fill: "var(--inv-accent)",
      transform: "translate(392 209) rotate(0)",
    },
    "frond-right-three": {
      d: frond(64, 27),
      fill: "var(--inv-decoration-two)",
      transform: "translate(392 208) rotate(-26)",
      shadow: false,
    },
  } satisfies Record<string, SheetSpec>;
  const { all, named } = sheetSet(specs);
  const cut = (...names: (keyof typeof specs)[]): ReactElement[] =>
    cutSheets(
      id,
      names.map((name) => named(name)),
    );
  const frondVein = (name: keyof typeof specs, length: number, width: number): ReactElement => {
    const transform = (specs[name] as SheetSpec).transform;

    return h("path", {
      key: `${name}-veins`,
      d: frondVeins(length, width),
      ...(transform === undefined ? {} : { transform }),
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      opacity: 0.32,
    });
  };

  return [
    sheetDefinitions(id, all),
    h("defs", { key: "pattern-definitions" }, spotPattern(id), stripePattern(id)),
    ...cut("sky"),
    h("use", {
      key: "torn-line",
      href: `#${id("sky")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    // Far plane: a warm haze, two ranges of tinted hills, a distant acacia, and birds.
    h("path", { key: "haze", d: HAZE, fill: "var(--inv-decoration-one)", opacity: 0.13 }),
    sunRays(326, 44, 32, 40, 7, "var(--inv-decoration-one)", 0.3),
    h("use", {
      key: "sun-halo-fill",
      href: `#${id("sun-halo")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.26,
    }),
    ...cut("sun"),
    h("use", {
      key: "sun-core",
      href: `#${id("sun")}`,
      fill: "var(--inv-surface)",
      opacity: 0.24,
    }),
    h("g", { key: "hills-far", opacity: 0.28 }, ...cut("hill-far-left", "hill-far-right")),
    h("g", { key: "hills-mid", opacity: 0.5 }, ...cut("hill-mid-left", "hill-mid-right")),
    ...cut("far-floor"),
    h("use", {
      key: "distant-trees-tint",
      href: `#${id("distant-trees")}`,
      fill: "var(--inv-accent)",
      opacity: 0.26,
    }),
    bird("bird-one", 118, 52, 1),
    bird("bird-two", 148, 38, 0.82),
    bird("bird-three", 212, 58, 0.7),
    // Middle plane: the acacia in front of the far range, with its trunk and a layered canopy.
    ...cut("acacia-canopy-back"),
    h(
      "g",
      { key: "acacia-canopy-back-tint", opacity: 0.5 },
      h("use", {
        key: "acacia-canopy-back-overlay",
        href: `#${id("acacia-canopy-back")}`,
        fill: "var(--inv-accent)",
      }),
    ),
    ...cut("acacia", "acacia-canopy"),
    h("g", { key: "acacia-crown-tint", opacity: 0.5 }, ...cut("acacia-crown")),
    h(
      "g",
      { key: "canopy-texture", fill: "var(--inv-surface)", opacity: 0.16 },
      h("path", { key: "leaf-dot-one", d: disc(20, 58, 3.4, 0.6) }),
      h("path", { key: "leaf-dot-two", d: disc(58, 60, 2.6, 0.6) }),
    ),
    // The savanna floor, then the front ground where the animals stand.
    ...cut("ground-mid"),
    ...cut("mid-bush"),
    ...cut("ground-near"),
    ...cut("mound-one", "mound-two"),
    h("use", {
      key: "tufts-mid-tint",
      href: `#${id("tufts-mid")}`,
      fill: "var(--inv-accent)",
      opacity: 1,
    }),
    // The giraffe, back to front: legs, tail, body, ears, head, mane, spots, and its face.
    ...cut("giraffe-legs"),
    h("path", {
      key: "giraffe-hooves",
      d:
        "M101 180L107 180L107 183.5L101 183.5ZM115 180L121 180L121 183.5L115 183.5Z" +
        "M135 180L141 180L141 183.5L135 183.5ZM147 180L153 180L153 183.5L147 183.5Z",
      fill: "var(--inv-ink)",
      opacity: 0.72,
    }),
    h("path", {
      key: "giraffe-tail",
      d: "M94 150C86 156 85 165 87 171",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 2.8,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "giraffe-tail-tuft",
      d: disc(87, 172, 3.2, 1.3),
      fill: "var(--inv-decoration-two)",
    }),
    ...cut("giraffe-body", "giraffe-ears", "giraffe-head"),
    patterned("giraffe-body-spots", id, named("giraffe-body"), "giraffe-spots"),
    h("path", {
      key: "giraffe-ear-inner",
      d:
        "M151 90C147 87 144 88 143 92C145 94 148 94 151 93Z" +
        "M157 84C153 80 150 81 149 84C151 86 154 87 157 86Z",
      fill: "var(--inv-soft)",
      opacity: 0.7,
    }),
    h(
      "g",
      {
        key: "giraffe-mane",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 3,
        strokeLinecap: "round",
        opacity: 0.3,
      },
      h("path", {
        key: "mane-line",
        d: "M140 142C138 131 144 117 152 105",
      }),
    ),
    h(
      "g",
      {
        key: "giraffe-ossicones",
        fill: "none",
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 2.6,
        strokeLinecap: "round",
      },
      GIRAFFE_OSSICONES.map((d, index) => h("path", { key: `ossicone-${index}`, d })),
    ),
    h("path", {
      key: "giraffe-knobs",
      d: disc(162, 68, 2.8) + disc(178, 71, 2.8),
      fill: "var(--inv-decoration-two)",
    }),
    h("path", {
      key: "giraffe-muzzle",
      d: disc(181, 101, 7.4, 0.62),
      fill: "var(--inv-soft)",
      opacity: 0.55,
    }),
    h("path", {
      key: "giraffe-cheek",
      d: disc(170, 100, 4.4, 0.7),
      fill: "var(--inv-decoration-two)",
      opacity: 0.34,
    }),
    h("circle", { key: "giraffe-eye", cx: 177, cy: 94, r: 2.2, fill: "var(--inv-ink)" }),
    h("circle", {
      key: "giraffe-eye-glint",
      cx: 177.8,
      cy: 93.2,
      r: 0.72,
      fill: "var(--inv-surface)",
      opacity: 0.9,
    }),
    h("circle", { key: "giraffe-nostril", cx: 184, cy: 99, r: 1.4, fill: "var(--inv-ink)" }),
    h("path", {
      key: "giraffe-smile",
      d: "M177 103C180 105 183 104 185 101",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.4,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "giraffe-highlight",
      d: "M158 85C163 82 169 82 174 84",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 2,
      strokeLinecap: "round",
      opacity: 0.34,
    }),
    // The elephant, back to front: legs, body, ear, head, trunk, tail, and its face.
    ...cut("elephant-legs", "elephant-body"),
    h("use", {
      key: "elephant-back-shade",
      href: `#${id("elephant-body")}`,
      fill: "var(--inv-ink)",
      opacity: 0.08,
    }),
    h("path", {
      key: "giraffe-neck-highlight",
      d: "M148 138C147 127 150 116 155 108",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      opacity: 0.28,
    }),
    h("path", {
      key: "elephant-tail",
      d: "M300 152C306 156 308 165 305 172",
      fill: "none",
      stroke: "var(--inv-decoration-two)",
      strokeWidth: 2.6,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "elephant-tail-tuft",
      d: disc(305, 173, 3.2, 1.1),
      fill: "var(--inv-accent)",
      opacity: 0.7,
    }),
    ...cut("elephant-ear", "elephant-ear-inner", "elephant-head", "elephant-trunk"),
    h("use", {
      key: "elephant-ear-inner-tint",
      href: `#${id("elephant-ear-inner")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.18,
    }),
    h(
      "g",
      {
        key: "elephant-ear-folds",
        fill: "none",
        stroke: "var(--inv-accent)",
        strokeWidth: 1.2,
        strokeLinecap: "round",
        opacity: 0.34,
      },
      h("path", { key: "fold-one", d: "M254 134C251 142 252 151 256 158" }),
      h("path", { key: "fold-two", d: "M262 131C260 140 261 150 265 157" }),
      h("path", { key: "fold-three", d: "M270 135C268 142 269 149 271 154" }),
    ),
    h("path", {
      key: "elephant-trunk-edge",
      d:
        "M214 139C204 147 198 159 200 170C201 179 209 184 217 180" +
        "M212 146C205 154 201 166 208 173C211 176 215 177 218 176",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.2,
      strokeLinecap: "round",
      opacity: 0.3,
    }),
    h("circle", {
      key: "elephant-cheek",
      cx: 229,
      cy: 156,
      r: 3.4,
      fill: "var(--inv-decoration-one)",
      opacity: 0.3,
    }),
    h("circle", { key: "elephant-eye", cx: 230, cy: 147, r: 2.6, fill: "var(--inv-ink)" }),
    h("circle", {
      key: "elephant-eye-glint",
      cx: 230.8,
      cy: 146.2,
      r: 0.7,
      fill: "var(--inv-surface)",
      opacity: 0.9,
    }),
    h("path", {
      key: "elephant-smile",
      d: "M221 157C224 160 228 160 231 157",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.5,
      strokeLinecap: "round",
      opacity: 0.85,
    }),
    h("path", {
      key: "elephant-highlight",
      d: "M222 138C228 134 236 134 242 138",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      opacity: 0.3,
    }),
    // The zebra foal, in front of the elephant's rear: legs, tail, body, ears, mane, stripes.
    h("g", { key: "zebra", transform: "translate(-14 0)" }, [
      ...cut("zebra-legs"),
      h("path", {
        key: "zebra-hooves",
        d:
          "M319.5 180L324 180L324 183.5L319.5 183.5ZM329.5 180L334 180L334 183.5L329.5 183.5Z" +
          "M340.5 180L345 180L345 183.5L340.5 183.5ZM351.5 180L356 180L356 183.5L351.5 183.5Z",
        fill: "var(--inv-ink)",
        opacity: 0.7,
      }),
      h("path", {
        key: "zebra-tail",
        d: "M318 159C313 163 312 169 314 173",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        opacity: 0.75,
      }),
      h("path", {
        key: "zebra-tail-tuft",
        d: disc(314, 175, 2.6, 1.4),
        fill: "var(--inv-ink)",
        opacity: 0.72,
      }),
      ...cut("zebra-body", "zebra-ears"),
      patterned("zebra-body-stripes", id, named("zebra-body"), "zebra-stripes"),
      h(
        "g",
        {
          key: "zebra-mane",
          fill: "none",
          stroke: "var(--inv-ink)",
          strokeWidth: 2.4,
          strokeLinecap: "round",
          opacity: 0.72,
        },
        h("path", {
          key: "zebra-mane-line",
          d: "M336 152L337 147M341 150L342 145M346 148L347 143M351 146L352 141",
        }),
      ),
      h("circle", {
        key: "zebra-muzzle",
        cx: 365,
        cy: 149,
        r: 3,
        fill: "var(--inv-ink)",
        opacity: 0.55,
      }),
      h("circle", { key: "zebra-eye", cx: 360, cy: 144, r: 1.5, fill: "var(--inv-ink)" }),
      h("circle", {
        key: "zebra-eye-glint",
        cx: 360.6,
        cy: 143.4,
        r: 0.5,
        fill: "var(--inv-surface)",
        opacity: 0.9,
      }),
      h("path", {
        key: "zebra-highlight",
        d: "M326 158C331 155 337 156 341 159",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        opacity: 0.42,
      }),
    ]),
    // The front layer: tall grass, then the fronds that frame both edges.
    h("use", {
      key: "tufts-front-tint",
      href: `#${id("tufts-front")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.9,
    }),
    ...cut("frond-left-one", "frond-left-three", "frond-left-two"),
    frondVein("frond-left-two", 94, 40),
    frondVein("frond-left-one", 88, 36),
    ...cut("frond-right-one", "frond-right-three", "frond-right-two"),
    frondVein("frond-right-two", 94, 40),
    frondVein("frond-right-one", 88, 36),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  ];
}

function divider(id: IllustrationId): ReactElement[] {
  const skyTear = tornEdge(SCENE_WIDTH, 12, 2.7, DIVIDER_HEIGHT + 8);
  const groundTear = tornEdge(SCENE_WIDTH, 36, 5.3, DIVIDER_HEIGHT + 8);
  const specs = {
    sky: { d: skyTear.sheet, fill: "var(--inv-soft)", shadow: false },
    "far-hill": { d: hill(-10, 400, 34, 46, 20), fill: "var(--inv-decoration-two)", shadow: false },
    ground: { d: groundTear.sheet, fill: "var(--inv-accent)", shadow: false },
    "sun-halo": { d: disc(320, 16, 12), fill: "var(--inv-decoration-one)", shadow: false },
    sun: { d: disc(320, 16, 7.4), fill: "var(--inv-decoration-one)" },
    "acacia-canopy": {
      d: [disc(30, 20, 13, 0.4), disc(44, 17, 15, 0.42), disc(56, 20, 10, 0.4)].join(""),
      fill: "var(--inv-accent)",
    },
    acacia: {
      d: "M36 50C37 43 38 36 38 29L42 29C42 36 43 43 44 50ZM39 32C33 29 28 27 23 25L24 23C30 25 35 27 41 30Z",
      fill: "var(--inv-accent)",
    },
    giraffe: {
      d:
        "M147 51C147 46 150 42 155 42C160 42 163 45 163 48L163 51Z" +
        "M159 46C158 41 160 36 163 32L168 34C165 38 163 42 163 47Z" +
        "M162 34C161 30 164 27 168 27C172 27 175 30 175 33C175 36 171 38 168 37C165 37 163 36 162 34Z",
      fill: "var(--inv-decoration-one)",
    },
    tufts: {
      d: [
        tuft(104, 52, 15, 2),
        tuft(124, 54, 10, -2),
        tuft(236, 52, 14, 2),
        tuft(272, 54, 10, -2),
        tuft(352, 52, 15, 2),
      ].join(""),
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
  } satisfies Record<string, SheetSpec>;
  const { all, named } = sheetSet(specs);
  const cut = (...names: (keyof typeof specs)[]): ReactElement[] =>
    cutSheets(
      id,
      names.map((name) => named(name)),
    );

  return [
    sheetDefinitions(id, all),
    ...cut("sky"),
    h("use", {
      key: "torn-line",
      href: `#${id("sky")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    sunRays(320, 16, 10, 15, 6, "var(--inv-decoration-one)", 0.36),
    h("use", {
      key: "sun-halo-fill",
      href: `#${id("sun-halo")}`,
      fill: "var(--inv-decoration-one)",
      opacity: 0.26,
    }),
    ...cut("sun", "far-hill"),
    bird("bird-one", 226, 20, 0.8, 0.4),
    bird("bird-two", 252, 14, 0.62, 0.35),
    ...cut("ground"),
    ...cut("acacia-canopy", "acacia"),
    ...cut("giraffe"),
    h("path", {
      key: "giraffe-detail",
      d: "M150 51V55M155 51V54M161 51V55M151 29V26M166 28V25",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1.6,
      strokeLinecap: "round",
    }),
    h("circle", { key: "giraffe-eye", cx: 169, cy: 31, r: 1, fill: "var(--inv-ink)" }),
    h("path", {
      key: "giraffe-knobs",
      d: disc(151, 25, 1.6) + disc(166, 24, 1.6),
      fill: "var(--inv-decoration-two)",
    }),
    h("use", {
      key: "tufts-tint",
      href: `#${id("tufts")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 1,
    }),
  ];
}

/** One cloven hoof print, a pair of small ovals, placed along the footer's trail. */
function hoofPrint(key: string, x: number, y: number, rotate: number): ReactElement {
  return h(
    "g",
    {
      key,
      transform: `translate(${x} ${y}) rotate(${rotate})`,
      fill: "var(--inv-surface)",
      opacity: 0.3,
    },
    h("ellipse", { key: "left", cx: -2, cy: 0, rx: 1.7, ry: 2.4 }),
    h("ellipse", { key: "right", cx: 2, cy: 0, rx: 1.7, ry: 2.4 }),
  );
}

function footer(id: IllustrationId): ReactElement[] {
  const skyTear = tornEdge(SCENE_WIDTH, 8, 5.6, FOOTER_HEIGHT + 8);
  const midTear = tornEdge(SCENE_WIDTH, 26, 2.1, FOOTER_HEIGHT + 8);
  const nearTear = tornEdge(SCENE_WIDTH, 40, 4.7, FOOTER_HEIGHT + 8);
  const specs = {
    sky: { d: skyTear.sheet, fill: "var(--inv-soft)", shadow: false },
    mid: { d: midTear.sheet, fill: "var(--inv-decoration-two)", shadow: false },
    near: { d: nearTear.sheet, fill: "var(--inv-accent)", shadow: false },
    "far-hill": { d: hill(-12, 402, 12, 30, 8), fill: "var(--inv-decoration-two)", shadow: false },
    "distant-acacia": {
      d: `${disc(64, 17, 9, 0.34)}${disc(74, 15, 6, 0.32)}M66 19V27H68V19Z`,
      fill: "var(--inv-accent)",
      shadow: false,
    },
    "tufts-back": {
      d: [
        tuft(60, 34, 14, 2),
        tuft(102, 36, 10, -2),
        tuft(198, 34, 13, 2),
        tuft(268, 36, 10, -2),
      ].join(""),
      fill: "var(--inv-accent)",
      shadow: false,
    },
    "tufts-front": {
      d: [
        tuft(18, 58, 26, 4),
        tuft(78, 60, 18, -3),
        tuft(168, 58, 22, 3),
        tuft(244, 60, 16, -3),
        tuft(304, 58, 22, 3),
        tuft(376, 60, 28, -4),
      ].join(""),
      fill: "var(--inv-decoration-two)",
      shadow: false,
    },
    "frond-left": {
      d: frond(70, 30),
      fill: "var(--inv-accent)",
      transform: "translate(4 66) rotate(-24)",
      shadow: false,
    },
    "frond-right": {
      d: frond(72, 30),
      fill: "var(--inv-accent)",
      transform: "translate(386 66) rotate(24)",
      shadow: false,
    },
  } satisfies Record<string, SheetSpec>;
  const { all, named } = sheetSet(specs);
  const cut = (...names: (keyof typeof specs)[]): ReactElement[] =>
    cutSheets(
      id,
      names.map((name) => named(name)),
    );

  return [
    sheetDefinitions(id, all),
    ...cut("sky"),
    h("use", {
      key: "torn-line",
      href: `#${id("sky")}`,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      opacity: 0.4,
    }),
    h("g", { key: "footer-hills", opacity: 0.5 }, ...cut("far-hill")),
    ...cut("mid"),
    h("use", {
      key: "distant-acacia-tint",
      href: `#${id("distant-acacia")}`,
      fill: "var(--inv-accent)",
      opacity: 0.55,
    }),
    h("use", {
      key: "mid-edge",
      href: `#${id("mid")}`,
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.2,
      opacity: 0.3,
    }),
    h("use", {
      key: "tufts-back-tint",
      href: `#${id("tufts-back")}`,
      fill: "var(--inv-accent)",
      opacity: 1,
    }),
    hoofPrint("hoof-one", 120, 33, -9),
    hoofPrint("hoof-two", 146, 30, 7),
    hoofPrint("hoof-three", 172, 33, -6),
    ...cut("near"),
    h("use", {
      key: "tufts-front-tint",
      href: `#${id("tufts-front")}`,
      fill: "var(--inv-decoration-two)",
      opacity: 0.95,
    }),
    ...cut("frond-left", "frond-right"),
    h("path", {
      key: "footer-veins-left",
      d: frondVeins(70, 30),
      transform: (specs["frond-left"] as SheetSpec).transform,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      opacity: 0.3,
    }),
    h("path", {
      key: "footer-veins-right",
      d: frondVeins(72, 30),
      transform: (specs["frond-right"] as SheetSpec).transform,
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.1,
      strokeLinecap: "round",
      opacity: 0.3,
    }),
    bird("footer-bird-one", 196, 14, 0.7, 0.3),
    bird("footer-bird-two", 228, 9, 0.55, 0.26),
  ];
}

/** «Safari bebé» in paper cut-out: the layered savanna header, the tiny-giraffe divider, and the grass footer. */
export const BABY_SAFARI_ILLUSTRATION: ThemeIllustration = {
  theme: "baby-safari",
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
