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
 * «Ratón clásico» in paper cut-out (I3b, I4c; S1-S5), after the technique of `dinosaurs.ts` and the owner's
 * artboard `design/theme-illustrations/01-papel-recortado.html`. The owner asked for richer birthday scenes
 * (S5, L6), so the header is now a full vintage party table in four depth planes: a striped and spot-lit wall
 * with two pleated paper fans, a paper chain, a far and a near double festoon of polka-dot bunting, five
 * balloons on their strings, confetti in three depths, a polka-dot tablecloth with a lace hem, a three-tier
 * cake with piped icing, cherries and candles on its stand, two frosted cupcakes, two party hats with
 * pom-poms, and two stacks of wrapped gifts with ribbons and bows. Both bottom corners are framed by larger
 * foreground pieces that the drawing area cuts — a cupcake and a gift — so the table reads as a diorama.
 *
 * Original work: there is no mouse of any kind, no round-eared silhouette, no character, and no logo here — the
 * theme is a vintage party, and every shape is a generic party prop of our own. Every color is a theme variable
 * of `classic-mouse`, so the whole drawing re-colours with its palette; tints and patterns are built from theme
 * colors and `opacity` and nothing else.
 */

const h = createElement;

const SCENE_WIDTH = 390;
const SCENE_HEIGHT = 200;
const DIVIDER_HEIGHT = 56;
const FOOTER_HEIGHT = 62;

/** Where the cloth's torn top edge lies: everything above it is wall, everything below it is the table. */
const TABLE_TOP = 148;

/** One placed stamp of a reusable shape: where it sits, how far it turns, how big it is. */
interface Place {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scale: number;
}

/** A triangle flag, hung from a bunting string: the string's point is the top edge's center. */
const FLAG = "M-9 0H9L0 18Z";

/** A balloon: a hand-cut body, its knot, and the shine cut from the same sheet. */
const BALLOON =
  "M0 0C-9.5-1-14.5-9.5-12.5-18.5C-10.5-27.5 2-31.5 8.5-26.5C15-21.5 15-10 8.5-5C5.5-2.5 3 0 0 0Z";
const BALLOON_KNOT = "M0 0L-3.4 5.4H3.4Z";

/** Confetti: one stamp, placed at three depths, three sizes and every angle. */
const CONFETTI = "M-3.4-2.6L3.4-3.4L4.2 2.6L-2.6 3.4Z";

/** The three tiers of the cake, each one a sheet of its own so the shadow between them reads. */
const TIER_BOTTOM = "M156 131V105H236V131Z";
const TIER_MIDDLE = "M166 105V86H226V105Z";
const TIER_TOP = "M176 86V70H216V86Z";

/** The cake stand: the plate, the stem and the foot, each with a lit top face. */
const PLATE = "M142 137V131H248V137Z";
const PLATE_RIM = "M148 139V137H242V139Z";
const STEM = "M189 142V137H201V142Z";
const FOOT = "M172 148V142H218V148Z";

/** The candles, their wicks, and the flame that sits on each one. */
const CANDLES = "M177 70V54H182V70ZM194 70V51H199V70ZM211 70V54H216V70Z";
const WICKS = "M179.5 54V51M196.5 51V48M213.5 54V51";
const FLAME = "M0 0C-3-2.8-2.3-7 0-8.8C2.3-7 3-2.8 0 0Z";

/** A gift: the body, the lid that overhangs it, and the two bands of its ribbon. */
interface Gift {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly load: ThemePaint;
  readonly lid: ThemePaint;
  readonly ribbon: ThemePaint;
  /** A back box of a stack keeps its ribbons and loses its bow, so two bows never overlap. */
  readonly bow: boolean;
}

const GIFTS: readonly Gift[] = [
  {
    key: "gift-left-back",
    x: 30,
    y: 98,
    width: 38,
    height: 18,
    load: "var(--inv-surface)",
    lid: "var(--inv-decoration-one)",
    ribbon: "var(--inv-accent)",
    bow: false,
  },
  {
    key: "gift-left-front",
    x: 22,
    y: 116,
    width: 54,
    height: 32,
    load: "var(--inv-accent)",
    lid: "var(--inv-decoration-one)",
    ribbon: "var(--inv-surface)",
    bow: true,
  },
  {
    key: "gift-right-back",
    x: 300,
    y: 90,
    width: 36,
    height: 16,
    load: "var(--inv-surface)",
    lid: "var(--inv-accent)",
    ribbon: "var(--inv-decoration-one)",
    bow: false,
  },
  {
    key: "gift-right-front",
    x: 288,
    y: 110,
    width: 58,
    height: 38,
    load: "var(--inv-ink)",
    lid: "var(--inv-accent)",
    ribbon: "var(--inv-decoration-one)",
    bow: true,
  },
];

/** The bow that ties a gift, and the bow that gathers a festoon of bunting. */
const BOW = "M0 0C-6-7-15-6-15 1C-15 8-6 8 0 2C6 8 15 8 15 1C15-6 6-7 0 0Z" + "M-2 0L-5 9H5L2 0Z";

/** A cupcake: the pleated liner, the swirl of frosting, and the cherry on top. */
const CUP_LINER = "M-11 0H11L8-14H-8Z";
const CUP_FROSTING = "M-12-13C-14-21-6-25 0-23C7-25 13-20 11-13C9-8-9-8-12-13Z";
const CUP_SWIRL = "M-10-14C-10-19-4-21 0-19C5-21 10-18 9-14";

/** A party hat: the cone, its band, and the pom-pom that hangs off its point. */
const HAT_CONE = "M-11 0L0-34L11 0Z";
const HAT_BAND = "M-10.6-4H10.6L9.4 0H-9.4Z";
const HAT_STRIPES = "M-8.2-9.4H8.2M-5.4-18.6H5.4M-2.7-27.8H2.7";

/** The pleats of a paper fan, as the wedges a half circle is folded into. */
function fanPleats(cx: number, cy: number, radius: number, count: number): ReactElement[] {
  const start = 196;
  const end = 344;
  const step = (end - start) / count;

  return Array.from({ length: count }, (_, index) => {
    const from = ((start + step * index) * Math.PI) / 180;
    const to = ((start + step * (index + 1)) * Math.PI) / 180;
    const x0 = (cx + radius * Math.cos(from)).toFixed(1);
    const y0 = (cy + radius * Math.sin(from)).toFixed(1);
    const x1 = (cx + radius * Math.cos(to)).toFixed(1);
    const y1 = (cy + radius * Math.sin(to)).toFixed(1);

    return h("path", {
      key: `pleat-${index}`,
      d: `M${cx} ${cy}L${x0} ${y0}A${radius} ${radius} 0 0 1 ${x1} ${y1}Z`,
      fill:
        index % 3 === 0
          ? "var(--inv-accent)"
          : index % 3 === 1
            ? "var(--inv-decoration-one)"
            : "var(--inv-surface)",
      opacity: index % 2 === 0 ? 0.95 : 0.78,
    });
  });
}

/** The outline of a whole paper fan, so its shadow is one cut sheet and not one per pleat. */
function fanSilhouette(cx: number, cy: number, radius: number): string {
  const from = (196 * Math.PI) / 180;
  const to = (344 * Math.PI) / 180;
  const x0 = (cx + radius * Math.cos(from)).toFixed(1);
  const y0 = (cy + radius * Math.sin(from)).toFixed(1);
  const x1 = (cx + radius * Math.cos(to)).toFixed(1);
  const y1 = (cy + radius * Math.sin(to)).toFixed(1);

  return `M${cx} ${cy}L${x0} ${y0}A${radius} ${radius} 0 0 1 ${x1} ${y1}Z`;
}

/** One paper fan: its pleats, the disc that pins them, and the hole cut through the middle. */
function fan(key: string, cx: number, cy: number, radius: number, count: number): ReactElement {
  return h(
    "g",
    { key },
    h("path", {
      key: "shadow",
      d: fanSilhouette(cx, cy, radius),
      fill: "var(--inv-ink)",
      opacity: 0.14,
      transform: "translate(1.1 3.4)",
    }),
    ...fanPleats(cx, cy, radius, count),
    h("circle", { key: "pin", cx, cy, r: radius * 0.22, fill: "var(--inv-soft)" }),
    h("circle", { key: "pin-hole", cx, cy, r: radius * 0.09, fill: "var(--inv-accent)" }),
  );
}

/** A scalloped band: the piped icing that spills over a tier, and the lace of the cloth. */
function pipedRun(x0: number, x1: number, top: number, depth: number, radius: number): string {
  const count = Math.max(2, Math.round((x1 - x0) / (radius * 2)));
  const step = (x1 - x0) / count;
  let d = `M${x0} ${top}`;

  for (let index = 0; index < count; index += 1) {
    d += `a${(step / 2).toFixed(1)} ${radius} 0 0 0 ${step.toFixed(1)} 0`;
  }
  return `${d}L${x1} ${top + depth}L${x0} ${top + depth}Z`;
}

/** The `d` of a plain rectangle, so a sheet's outline is drawn once and reused by its shadow. */
function rectPath(x: number, y: number, width: number, height: number): string {
  return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
}

/** The wall paper: pale stripes and a dot over the soft paper, faded like a printed pattern. */
function wallPattern(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "wall-pattern" },
    h(
      "pattern",
      {
        id: id("wall-print"),
        width: 26,
        height: 26,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(-3)",
      },
      h("rect", { key: "ground", width: 26, height: 26, fill: "var(--inv-soft)" }),
      h("rect", {
        key: "stripe",
        width: 11,
        height: 26,
        fill: "var(--inv-surface)",
        opacity: 0.42,
      }),
      h("circle", { key: "dot", cx: 20, cy: 13, r: 1.5, fill: "var(--inv-accent)", opacity: 0.2 }),
    ),
  );
}

/** The tablecloth: pale dots on the linen, so it is a printed paper and not a flat band. */
function clothPattern(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "cloth-pattern" },
    h(
      "pattern",
      {
        id: id("cloth-print"),
        width: 16,
        height: 16,
        patternUnits: "userSpaceOnUse",
        patternTransform: "rotate(8)",
      },
      h("rect", { key: "ground", width: 16, height: 16, fill: "var(--inv-soft)" }),
      h("circle", { key: "dot-a", cx: 4, cy: 4, r: 1.5, fill: "var(--inv-accent)" }),
      h("circle", { key: "dot-b", cx: 12, cy: 12, r: 1.5, fill: "var(--inv-accent)" }),
    ),
  );
}

/** The balloon stamp: the body, the knot, and the shine cut from the same sheet. */
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
        rx: 2.4,
        ry: 4.2,
        transform: "rotate(-24 -4 -20)",
        fill: "var(--inv-surface)",
        opacity: 0.55,
      }),
      h("path", {
        key: "glint",
        d: "M-2-10C-3.4-8-4-6-3.8-4.4",
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.2,
        strokeLinecap: "round",
        opacity: 0.4,
      }),
    ),
  );
}

/** The flag stamp, the bow stamp, the cherry stamp, and the four-point sparkle of the paper. */
function stampDefinitions(id: IllustrationId): ReactElement {
  return h(
    "defs",
    { key: "stamp-definitions" },
    h("path", { key: "flag", id: id("flag"), d: FLAG }),
    h("path", { key: "bow", id: id("bow"), d: BOW }),
    h(
      "g",
      { key: "cherry", id: id("cherry") },
      h("circle", { key: "fruit", r: 3.4 }),
      h("circle", {
        key: "spot",
        cx: -1.1,
        cy: -1.2,
        r: 1,
        fill: "var(--inv-surface)",
        opacity: 0.6,
      }),
      h("path", {
        key: "stem",
        d: "M0-3C0.4-5.4 1.6-7 3.4-8",
        fill: "none",
        stroke: "var(--inv-decoration-two)",
        strokeWidth: 1.1,
        strokeLinecap: "round",
        opacity: 0.7,
      }),
    ),
    h("path", { key: "confetti", id: id("confetti"), d: CONFETTI }),
    h("path", {
      key: "spark",
      id: id("spark"),
      d: "M0-5L1.2-1.2L5 0L1.2 1.2L0 5L-1.2 1.2L-5 0L-1.2-1.2Z",
    }),
  );
}

/** One stamp, placed many times in one array: the keys are the array's own indexes. */
function stamps(
  key: string,
  id: IllustrationId,
  name: string,
  places: readonly Place[],
  paint: ThemePaint,
  opacity = 1,
): ReactElement {
  return h(
    "g",
    { key, fill: paint, opacity },
    places.map((item, index) =>
      h("use", {
        key: `${key}-${index}`,
        href: `#${id(name)}`,
        transform: `translate(${item.x} ${item.y}) rotate(${item.rotate}) scale(${item.scale})`,
      }),
    ),
  );
}

/** The same stamp, but each placement casts its own offset paper shadow. */
function shadowedStamps(
  key: string,
  id: IllustrationId,
  name: string,
  places: readonly Place[],
  paint: ThemePaint,
): ReactElement[] {
  return places.flatMap((item, index) => {
    const place = `translate(${item.x} ${item.y}) rotate(${item.rotate}) scale(${item.scale})`;

    return [
      h("use", {
        key: `${key}-${index}-shadow`,
        href: `#${id(name)}`,
        fill: "var(--inv-ink)",
        opacity: 0.14,
        transform: `${place} translate(1.1 3.4)`,
      }),
      h("use", {
        key: `${key}-${index}`,
        href: `#${id(name)}`,
        fill: paint,
        transform: place,
      }),
    ];
  });
}

/** One bunting string, its flags, and the three polka dots of each flag. */
function bunting(
  key: string,
  id: IllustrationId,
  d: string,
  flags: readonly Place[],
  paints: readonly ThemePaint[],
  opacity: number,
): ReactElement[] {
  return [
    h("path", {
      key: `${key}-string`,
      d,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.2,
      opacity: 0.42,
      strokeLinecap: "round",
    }),
    h(
      "g",
      { key: `${key}-flags`, opacity },
      flags.map((flag, index) =>
        h("use", {
          key: `${key}-flag-${index}`,
          href: `#${id("flag")}`,
          fill: paints[index % paints.length],
          transform: `translate(${flag.x} ${flag.y}) rotate(${flag.rotate}) scale(${flag.scale})`,
        }),
      ),
    ),
    h(
      "g",
      { key: `${key}-dots`, fill: "var(--inv-surface)", opacity: opacity * 0.85 },
      flags.flatMap((flag, index) =>
        (
          [
            [-3.4, 8.6],
            [3.4, 8.6],
          ] as const
        ).map(([dx, dy], dot) =>
          h("circle", {
            key: `${key}-dot-${index}-${dot}`,
            cx: flag.x + dx * flag.scale,
            cy: flag.y + dy * flag.scale,
            r: 1.35 * flag.scale,
          }),
        ),
      ),
    ),
  ];
}

/** One gift: the body, the lid, the ribbon bands, and a bow, with the paper shadow of every sheet. */
function gift(
  id: IllustrationId,
  box: Gift,
  collect: (sheet: CutSheet) => ReactElement[],
): ReactElement[] {
  const ribbonX = box.x + box.width / 2 - 3.4;

  return [
    ...collect({
      name: `${box.key}-body`,
      d: rectPath(box.x, box.y, box.width, box.height),
      fill: box.load,
    }),
    ...collect({
      name: `${box.key}-lid`,
      d: rectPath(box.x - 3.5, box.y - 7, box.width + 7, 8),
      fill: box.lid,
    }),
    h("path", {
      key: `${box.key}-ribbon`,
      d: rectPath(ribbonX, box.y - 7, 6.8, box.height + 7),
      fill: box.ribbon,
    }),
    h("path", {
      key: `${box.key}-band`,
      d: rectPath(box.x, box.y + box.height * 0.45, box.width, 4.4),
      fill: box.ribbon,
      opacity: 0.92,
    }),
    ...(box.bow
      ? [
          h("use", {
            key: `${box.key}-bow`,
            href: `#${id("bow")}`,
            fill: box.ribbon,
            transform: `translate(${box.x + box.width / 2} ${box.y - 8}) scale(${Math.min(1, box.width / 46)})`,
          }),
        ]
      : []),
    h("path", {
      key: `${box.key}-shine`,
      d: rectPath(box.x + 3, box.y + 4, 3, box.height - 10),
      fill: "var(--inv-surface)",
      opacity: 0.22,
    }),
  ];
}

/** One cupcake: the liner, its pleats, the frosting, the swirl and the cherry. */
function cupcake(
  id: IllustrationId,
  key: string,
  cx: number,
  base: number,
  scale: number,
  collect: (sheet: CutSheet) => ReactElement[],
): ReactElement[] {
  const place = `translate(${cx} ${base}) scale(${scale})`;

  return [
    ...collect({
      name: `${key}-liner`,
      d: CUP_LINER,
      fill: "var(--inv-soft)",
      transform: place,
    }),
    ...collect({
      name: `${key}-frosting`,
      d: CUP_FROSTING,
      fill: "var(--inv-surface)",
      transform: place,
    }),
    h("path", {
      key: `${key}-pleats`,
      d: "M-6-12V-1M-2-12V-1M2-12V-1M6-12V-1",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1,
      opacity: 0.35,
      transform: place,
    }),
    h("path", {
      key: `${key}-swirl`,
      d: CUP_SWIRL,
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1.4,
      opacity: 0.7,
      strokeLinecap: "round",
      transform: place,
    }),
    h("use", {
      key: `${key}-cherry`,
      href: `#${id("cherry")}`,
      fill: "var(--inv-accent)",
      transform: `${place} translate(0 -22)`,
    }),
  ];
}

/** One party hat: the cone, its band, the stripes, and the pom-pom at the point. */
function partyHat(
  key: string,
  cx: number,
  base: number,
  rotate: number,
  scale: number,
): ReactElement {
  const place = `translate(${cx} ${base}) rotate(${rotate}) scale(${scale})`;

  return h(
    "g",
    { key, transform: place },
    h("path", {
      key: "cone-shadow",
      d: HAT_CONE,
      transform: "translate(1.1 3.4)",
      fill: "var(--inv-ink)",
      opacity: 0.14,
    }),
    h("path", { key: "cone", d: HAT_CONE, fill: "var(--inv-accent)" }),
    h("path", { key: "band", d: HAT_BAND, fill: "var(--inv-surface)", opacity: 0.85 }),
    h("path", {
      key: "stripes",
      d: HAT_STRIPES,
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 2,
      opacity: 0.9,
    }),
    h("circle", { key: "pom", cx: 0, cy: -36, r: 4.3, fill: "var(--inv-decoration-one)" }),
    h("circle", {
      key: "pom-shine",
      cx: -1.3,
      cy: -37.4,
      r: 1.4,
      fill: "var(--inv-surface)",
      opacity: 0.6,
    }),
  );
}

/** The header diorama: wall, fans, three garlands, balloons, the table with the cake and its presents. */
function scene(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const tear = tornEdge(SCENE_WIDTH, 10, 2.4, SCENE_HEIGHT + 8);
  const coat = tornEdge(SCENE_WIDTH, TABLE_TOP, 4.6, SCENE_HEIGHT + 8);
  const cloth = { name: "cloth", d: coat.sheet, fill: "var(--inv-soft)" } as const;

  body.push(...collect({ name: "sheet", d: tear.sheet, fill: "var(--inv-soft)", shadow: false }));

  // Plane one: the papered wall, striped and warmed, with a pale disc of light behind the cake.
  body.push(
    h("rect", {
      key: "wall",
      x: -4,
      y: 0,
      width: 398,
      height: TABLE_TOP + 2,
      style: { fill: `url(#${id("wall-print")})` },
      opacity: 0.8,
    }),
    h("rect", {
      key: "wall-shade",
      x: -4,
      y: 0,
      width: 398,
      height: TABLE_TOP,
      fill: "var(--inv-decoration-one)",
      opacity: 0.09,
    }),
    h("circle", {
      key: "glow",
      cx: 196,
      cy: 104,
      r: 76,
      fill: "var(--inv-surface)",
      opacity: 0.5,
    }),
    h("circle", {
      key: "glow-inner",
      cx: 196,
      cy: 108,
      r: 42,
      fill: "var(--inv-surface)",
      opacity: 0.4,
    }),
  );

  // Plane one: two pleated fans at the corners, a paper chain, a pale ribbon garland.
  body.push(fan("fan-left", 48, 58, 29, 6), fan("fan-right", 340, 54, 25, 5));
  body.push(
    h("path", {
      key: "ribbon-garland",
      d: "M-8 28C40 52 140 52 196 34C252 52 352 52 398 28",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 4.5,
      opacity: 0.55,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "ribbon-garland-edge",
      d: "M-8 30C40 54 140 54 196 36C252 54 352 54 398 30",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.2,
      opacity: 0.3,
      strokeLinecap: "round",
    }),
  );

  // Plane one: the front festoon of polka-dot bunting, gathered in the middle above the cake.
  body.push(
    ...bunting(
      "swag-left",
      id,
      "M-8 32C40 58 130 56 196 36",
      [
        { x: 26, y: 38, rotate: -11, scale: 0.94 },
        { x: 68, y: 47, rotate: -6, scale: 0.94 },
        { x: 110, y: 51, rotate: -1, scale: 0.94 },
        { x: 152, y: 46, rotate: 5, scale: 0.94 },
      ],
      ["var(--inv-accent)", "var(--inv-decoration-one)", "var(--inv-accent)"],
      1,
    ),
    ...bunting(
      "swag-right",
      id,
      "M196 36C262 56 352 58 398 32",
      [
        { x: 240, y: 46, rotate: -5, scale: 0.94 },
        { x: 282, y: 51, rotate: 1, scale: 0.94 },
        { x: 324, y: 47, rotate: 6, scale: 0.94 },
        { x: 366, y: 38, rotate: 11, scale: 0.94 },
      ],
      ["var(--inv-accent)", "var(--inv-decoration-one)", "var(--inv-accent)"],
      1,
    ),
    ...bunting(
      "swag-far",
      id,
      "M-8 24C60 44 150 42 196 28C246 42 330 44 398 24",
      [
        { x: 60, y: 31, rotate: -8, scale: 0.62 },
        { x: 124, y: 35, rotate: -2, scale: 0.62 },
        { x: 268, y: 35, rotate: 2, scale: 0.62 },
        { x: 332, y: 31, rotate: 8, scale: 0.62 },
      ],
      ["var(--inv-surface)", "var(--inv-accent)", "var(--inv-surface)"],
      0.42,
    ),
    h("use", {
      key: "swag-knot",
      href: `#${id("bow")}`,
      fill: "var(--inv-decoration-one)",
      transform: "translate(196 34) scale(0.82)",
    }),
  );

  // Plane two: the confetti of the far air, then the balloons that hang over the table.
  body.push(
    stamps(
      "confetti-far",
      id,
      "confetti",
      [
        { x: 66, y: 84, rotate: 14, scale: 0.9 },
        { x: 286, y: 58, rotate: 22, scale: 0.7 },
        { x: 356, y: 96, rotate: 8, scale: 0.75 },
      ],
      "var(--inv-accent)",
      0.35,
    ),
    h("path", {
      key: "balloon-strings",
      d: "M112 116C108 128 102 136 100 146M132 96C130 112 122 124 114 136C110 142 112 145 116 146M92 124C90 134 86 140 84 146M306 122C302 132 298 138 296 146M346 108C350 120 354 130 356 140",
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1,
      opacity: 0.4,
      strokeLinecap: "round",
    }),
    // The balloons: three of the accent red, one gold and one white, each with its own shine.
    ...shadowedStamps(
      "balloons-accent",
      id,
      "balloon",
      [
        { x: 112, y: 116, rotate: -9, scale: 1.12 },
        { x: 92, y: 124, rotate: -15, scale: 0.72 },
        { x: 306, y: 122, rotate: 8, scale: 1.02 },
      ],
      "var(--inv-accent)",
    ),
    ...shadowedStamps(
      "balloon-gold",
      id,
      "balloon",
      [{ x: 132, y: 96, rotate: 7, scale: 0.86 }],
      "var(--inv-decoration-one)",
    ),
    h("use", {
      key: "balloon-white-shadow",
      href: `#${id("balloon")}`,
      fill: "var(--inv-ink)",
      opacity: 0.14,
      transform: "translate(347.1 99.4) rotate(-6) scale(0.8)",
    }),
    h("use", {
      key: "balloon-white-rim",
      href: `#${id("balloon")}`,
      fill: "var(--inv-accent)",
      transform: "translate(346 96) rotate(-6) scale(0.87)",
    }),
    h("use", {
      key: "balloon-white",
      href: `#${id("balloon")}`,
      fill: "var(--inv-surface)",
      transform: "translate(346 96) rotate(-6) scale(0.8)",
    }),
    stamps(
      "confetti-mid",
      id,
      "confetti",
      [
        { x: 148, y: 112, rotate: 18, scale: 1.15 },
        { x: 274, y: 126, rotate: 36, scale: 0.9 },
        { x: 84, y: 96, rotate: -12, scale: 1 },
        { x: 352, y: 64, rotate: 24, scale: 1.1 },
      ],
      "var(--inv-decoration-one)",
      0.7,
    ),
  );

  // Plane three: the table. The cloth is torn along its top edge and printed with pale dots.
  body.push(...collect(cloth));
  body.push(
    h("use", {
      key: "cloth-dots",
      href: `#${id(cloth.name)}`,
      style: { fill: `url(#${id("cloth-print")})` },
      opacity: 0.62,
    }),
    h("path", {
      key: "cloth-lace",
      d: pipedRun(-8, 398, TABLE_TOP + 1, 3.4, 4.6),
      fill: "var(--inv-surface)",
      opacity: 0.6,
    }),
    h("path", {
      key: "cloth-hem",
      d: "M-8 186C60 182 130 190 200 186C270 182 340 190 398 186V208H-8Z",
      fill: "var(--inv-accent)",
      opacity: 0.18,
    }),
  );

  // The gifts stand on the table first, then the cake, which is the hero of the scene.
  for (const box of GIFTS) {
    body.push(...gift(id, box, collect));
  }

  body.push(
    h("ellipse", {
      key: "plate-left",
      cx: 101,
      cy: 147,
      rx: 19,
      ry: 3,
      fill: "var(--inv-surface)",
      opacity: 0.75,
    }),
    h("ellipse", {
      key: "plate-right",
      cx: 269,
      cy: 147,
      rx: 17,
      ry: 2.8,
      fill: "var(--inv-surface)",
      opacity: 0.75,
    }),
    ...collect({ name: "stand-foot", d: FOOT, fill: "var(--inv-accent)" }),
    ...collect({ name: "stand-stem", d: STEM, fill: "var(--inv-accent)" }),
    ...collect({ name: "stand-plate", d: PLATE, fill: "var(--inv-decoration-one)" }),
    ...collect({ name: "stand-rim", d: PLATE_RIM, fill: "var(--inv-accent)", shadow: false }),
    h("path", {
      key: "plate-shine",
      d: "M146 132H192V133.5H146Z",
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    ...collect({
      name: "tier-bottom",
      d: TIER_BOTTOM,
      fill: "var(--inv-decoration-one)",
      outline: true,
    }),
    ...collect({
      name: "tier-middle",
      d: TIER_MIDDLE,
      fill: "var(--inv-decoration-one)",
      outline: true,
    }),
    ...collect({ name: "tier-top", d: TIER_TOP, fill: "var(--inv-decoration-one)", outline: true }),
    h("path", {
      key: "tier-trim",
      d: "M156 128H236V131H156ZM166 102H226V105H166ZM176 83H216V86H176Z",
      fill: "var(--inv-accent)",
      opacity: 0.75,
    }),
    // The piped icing spills over each tier, and its sprinkles are cut out of the sheet.
    ...collect({
      name: "piping-bottom",
      d: pipedRun(156, 236, 105, 7, 4),
      fill: "var(--inv-accent)",
      shadow: false,
    }),
    ...collect({
      name: "piping-middle",
      d: pipedRun(166, 226, 86, 6, 3.6),
      fill: "var(--inv-surface)",
      shadow: false,
    }),
    ...collect({
      name: "piping-top",
      d: pipedRun(176, 216, 70, 5, 3.2),
      fill: "var(--inv-accent)",
      shadow: false,
    }),
    h("path", {
      key: "sprinkles",
      d:
        "M170 124H173V127H170ZM190 128H193V131H190ZM214 123H217V126H214ZM228 128H231V131H228Z" +
        "M176 100H179V103H176ZM200 102H203V105H200ZM218 99H221V102H218ZM186 80H189V83H186ZM204 79H207V82H204Z",
      fill: "var(--inv-accent)",
      opacity: 0.8,
    }),
    h("path", { key: "candles", d: CANDLES, fill: "var(--inv-accent)" }),
    h("path", {
      key: "candle-stripes",
      d: "M177 61H182M177 66H182M194 59H199M194 64H199M211 61H216M211 66H216",
      fill: "none",
      stroke: "var(--inv-surface)",
      strokeWidth: 1.2,
      opacity: 0.8,
    }),
    h("path", {
      key: "wicks",
      d: WICKS,
      fill: "none",
      stroke: "var(--inv-ink)",
      strokeWidth: 1.2,
      opacity: 0.7,
    }),
    h(
      "g",
      { key: "flames" },
      [51, 48, 51].map((y, index) =>
        h(
          "g",
          {
            key: `flame-${index}`,
            transform: `translate(${[179.5, 196.5, 213.5][index]} ${y}) scale(${index === 1 ? 1.15 : 1})`,
          },
          h("circle", {
            key: "halo",
            cx: 0,
            cy: -4,
            r: 7,
            fill: "var(--inv-decoration-one)",
            opacity: 0.25,
          }),
          h("path", { key: "outer", d: FLAME, fill: "var(--inv-decoration-one)" }),
          h("path", {
            key: "inner",
            d: "M0-1.4C-1.4-3-1-4.8 0-5.8C1-4.8 1.4-3 0-1.4Z",
            fill: "var(--inv-surface)",
            opacity: 0.9,
          }),
        ),
      ),
    ),
    ...cupcake(id, "cupcake-left", 101, 148, 1, collect),
    ...cupcake(id, "cupcake-right", 269, 148, 0.92, collect),
    partyHat("hat-left", 84, 148, -14, 1),
    partyHat("hat-right", 356, 148, 14, 1.05),
  );

  body.push(
    h("use", {
      key: "cherry-plate-left",
      href: `#${id("cherry")}`,
      fill: "var(--inv-accent)",
      transform: "translate(150 129) scale(0.85)",
    }),
    h("use", {
      key: "cherry-plate-right",
      href: `#${id("cherry")}`,
      fill: "var(--inv-accent)",
      transform: "translate(240 129) scale(0.8)",
    }),
  );

  // The near plane: a gift and a cupcake cut by the bottom corners, and two streamers across the frame.
  body.push(
    // A slice left on a plate at the foot of the table: the small story of a party already started.
    h("ellipse", {
      key: "slice-plate",
      cx: 196,
      cy: 184,
      rx: 26,
      ry: 5,
      fill: "var(--inv-surface)",
      opacity: 0.8,
    }),
    h("path", {
      key: "slice-sponge",
      d: "M180 182L196 164L212 182Z",
      fill: "var(--inv-decoration-one)",
    }),
    h("path", {
      key: "slice-icing",
      d: "M180 182L196 164L200 169L184 182Z",
      fill: "var(--inv-accent)",
    }),
    h("path", {
      key: "slice-filling",
      d: "M186 176L196 172L206 176L206 178L186 178Z",
      fill: "var(--inv-accent)",
      opacity: 0.75,
    }),
    h("use", {
      key: "slice-cherry",
      href: `#${id("cherry")}`,
      fill: "var(--inv-accent)",
      transform: "translate(200 164) scale(0.7)",
    }),
    h("path", {
      key: "streamer-left",
      d: "M-6 118C24 134 16 156 44 166C64 173 60 188 78 200",
      fill: "none",
      stroke: "var(--inv-accent)",
      strokeWidth: 3,
      opacity: 0.7,
      strokeLinecap: "round",
    }),
    h("path", {
      key: "streamer-right",
      d: "M396 124C366 138 376 158 348 166C330 171 332 186 316 200",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 3,
      opacity: 0.75,
      strokeLinecap: "round",
    }),
    ...collect({
      name: "foreground-gift",
      d: "M344 214V166H410V214ZM338 176V166H416V176Z",
      fill: "var(--inv-accent)",
    }),
    h("path", {
      key: "foreground-ribbon",
      d: "M372 166H382V214H372ZM338 186H416V194H338Z",
      fill: "var(--inv-decoration-one)",
    }),
    h("use", {
      key: "foreground-bow",
      href: `#${id("bow")}`,
      fill: "var(--inv-decoration-one)",
      transform: "translate(377 164) scale(0.95)",
    }),
    ...cupcake(id, "cupcake-foreground", 8, 214, 2, collect),
    stamps(
      "confetti-near",
      id,
      "confetti",
      [
        { x: 128, y: 168, rotate: 20, scale: 1.3 },
        { x: 238, y: 158, rotate: -28, scale: 1.15 },
        { x: 200, y: 180, rotate: 12, scale: 0.95 },
      ],
      "var(--inv-accent)",
      0.85,
    ),
    ...grain(id, SCENE_WIDTH, SCENE_HEIGHT),
  );

  return [
    sheetDefinitions(id, sheets),
    wallPattern(id),
    clothPattern(id),
    balloonDefinition(id),
    stampDefinitions(id),
    ...body,
  ];
}

/** The divider: one festoon of bunting overhead, and a torn table edge with a cake, a cup and a gift. */
function divider(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 6, 3.2, DIVIDER_HEIGHT + 8);
  const edge = tornEdge(SCENE_WIDTH, 38, 5.2, DIVIDER_HEIGHT + 8);

  sheets.push({ name: "edge", d: edge.sheet, fill: "var(--inv-accent)", shadow: false });

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    h("use", {
      key: "edge-tint",
      href: `#${id("edge")}`,
      fill: "var(--inv-accent)",
      opacity: 0.2,
    }),
    h("path", {
      key: "edge-lace",
      d: pipedRun(-8, 398, 38, 3.4, 4.6),
      fill: "var(--inv-surface)",
      opacity: 0.55,
    }),
    // The bunting hangs from the top edge, gathered in the middle above the cake.
    ...bunting(
      "divider-left",
      id,
      "M-8 10C40 34 130 34 195 16",
      [
        { x: 26, y: 16, rotate: -10, scale: 0.8 },
        { x: 74, y: 26, rotate: -4, scale: 0.8 },
        { x: 122, y: 29, rotate: 2, scale: 0.8 },
        { x: 166, y: 24, rotate: 7, scale: 0.8 },
      ],
      ["var(--inv-accent)", "var(--inv-decoration-one)", "var(--inv-accent)"],
      1,
    ),
    ...bunting(
      "divider-right",
      id,
      "M195 16C262 34 352 34 398 10",
      [
        { x: 226, y: 24, rotate: -7, scale: 0.8 },
        { x: 270, y: 29, rotate: -2, scale: 0.8 },
        { x: 318, y: 26, rotate: 4, scale: 0.8 },
        { x: 366, y: 16, rotate: 10, scale: 0.8 },
      ],
      ["var(--inv-accent)", "var(--inv-decoration-one)", "var(--inv-accent)"],
      1,
    ),
    h("use", {
      key: "divider-knot",
      href: `#${id("bow")}`,
      fill: "var(--inv-decoration-one)",
      transform: "translate(195 15) scale(0.62)",
    }),
    // A small two-tier cake on the torn edge, with its piping and a cherry on top.
    h("path", {
      key: "divider-cake",
      d: "M181 50V38H209V50ZM187 38V30H203V38Z",
      fill: "var(--inv-decoration-one)",
    }),
    h("path", {
      key: "divider-cake-piping",
      d: pipedRun(181, 209, 38, 3.6, 2.6) + pipedRun(187, 203, 30, 3, 2.2),
      fill: "var(--inv-accent)",
    }),
    h("path", {
      key: "divider-cake-stand",
      d: "M176 52V49H214V52ZM188 52V55H202V52Z",
      fill: "var(--inv-accent)",
    }),
    h("use", {
      key: "divider-cake-cherry",
      href: `#${id("cherry")}`,
      fill: "var(--inv-accent)",
      transform: "translate(195 27) scale(0.75)",
    }),
    h(
      "g",
      { key: "divider-cupcake", transform: "translate(140 54) scale(0.85)" },
      h("path", { key: "liner", d: CUP_LINER, fill: "var(--inv-surface)" }),
      h("path", { key: "frosting", d: CUP_FROSTING, fill: "var(--inv-accent)" }),
      h("path", {
        key: "swirl",
        d: CUP_SWIRL,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.3,
        opacity: 0.7,
      }),
      h("use", {
        key: "cherry",
        href: `#${id("cherry")}`,
        fill: "var(--inv-decoration-one)",
        transform: "translate(0 -24)",
      }),
    ),
    h(
      "g",
      { key: "divider-gift", transform: "translate(258 52) scale(0.64)" },
      h("path", {
        key: "shadow",
        d: "M0 0H36V8H0ZM-3-8H39V-1H-3Z",
        fill: "var(--inv-ink)",
        opacity: 0.14,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "body", d: "M0-10H36V2H0Z", fill: "var(--inv-accent)" }),
      h("path", { key: "lid", d: "M-3-16H39V-9H-3Z", fill: "var(--inv-decoration-one)" }),
      h("path", {
        key: "ribbon",
        d: "M15-16H21V2H15ZM-3-6H39V-2H-3Z",
        fill: "var(--inv-surface)",
        opacity: 0.9,
      }),
      h("use", {
        key: "bow",
        href: `#${id("bow")}`,
        fill: "var(--inv-surface)",
        transform: "translate(18 -16) scale(0.55)",
      }),
    ),
    h("use", {
      key: "divider-bow-left",
      href: `#${id("bow")}`,
      fill: "var(--inv-accent)",
      transform: "translate(56 50) scale(0.55)",
    }),
    h("use", {
      key: "divider-bow-right",
      href: `#${id("bow")}`,
      fill: "var(--inv-accent)",
      transform: "translate(334 50) scale(0.55)",
    }),
    stamps(
      "divider-confetti",
      id,
      "confetti",
      [
        { x: 80, y: 42, rotate: 16, scale: 0.8 },
        { x: 320, y: 42, rotate: -24, scale: 0.7 },
      ],
      "var(--inv-decoration-one)",
      0.8,
    ),
  );

  return [sheetDefinitions(id, sheets), stampDefinitions(id), ...body];
}

/** The footer: a polka-dot tablecloth with a lace hem, and the last presents of the page on it. */
function footer(id: IllustrationId): ReactElement[] {
  const sheets: CutSheet[] = [];
  const body: ReactElement[] = [];
  const collect = (sheet: CutSheet): ReactElement[] => {
    sheets.push(sheet);
    return cutSheets(id, [sheet]);
  };

  const top = tornEdge(SCENE_WIDTH, 6, 6.8, FOOTER_HEIGHT + 8);
  const coat = tornEdge(SCENE_WIDTH, 30, 2.4, FOOTER_HEIGHT + 8);

  body.push(
    ...collect({ name: "strip", d: top.sheet, fill: "var(--inv-soft)", shadow: false }),
    stamps(
      "footer-confetti",
      id,
      "confetti",
      [
        { x: 30, y: 14, rotate: 16, scale: 0.7 },
        { x: 74, y: 22, rotate: -28, scale: 0.55 },
        { x: 316, y: 20, rotate: -14, scale: 0.7 },
        { x: 360, y: 12, rotate: 32, scale: 0.6 },
      ],
      "var(--inv-accent)",
      0.55,
    ),
    stamps(
      "footer-sparkles",
      id,
      "spark",
      [
        { x: 54, y: 12, rotate: 10, scale: 0.6 },
        { x: 200, y: 12, rotate: -12, scale: 0.55 },
      ],
      "var(--inv-decoration-one)",
      0.75,
    ),
    ...collect({ name: "cloth", d: coat.sheet, fill: "var(--inv-soft)" }),
    h("use", {
      key: "footer-cloth-dots",
      href: `#${id("cloth")}`,
      style: { fill: `url(#${id("cloth-print")})` },
      opacity: 0.62,
    }),
    h("path", {
      key: "footer-lace",
      d: pipedRun(-8, 398, 30, 3.4, 4.6),
      fill: "var(--inv-surface)",
      opacity: 0.6,
    }),
    // The table at the foot of the page: a cake, a gift, a cup, a hat and two balloons.
    h("path", {
      key: "footer-cake",
      d: "M181 52V40H209V52ZM187 40V32H203V40Z",
      fill: "var(--inv-decoration-one)",
    }),
    h("path", {
      key: "footer-cake-piping",
      d: pipedRun(181, 209, 40, 3.6, 2.6) + pipedRun(187, 203, 32, 3, 2.2),
      fill: "var(--inv-accent)",
    }),
    h("use", {
      key: "footer-cake-cherry",
      href: `#${id("cherry")}`,
      fill: "var(--inv-accent)",
      transform: "translate(195 29) scale(0.75)",
    }),
    h(
      "g",
      { key: "footer-gift", transform: "translate(78 54)" },
      h("path", {
        key: "shadow",
        d: "M0 0H38V8H0ZM-3-8H41V-1H-3Z",
        fill: "var(--inv-ink)",
        opacity: 0.14,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "body", d: "M0-10H38V2H0Z", fill: "var(--inv-accent)" }),
      h("path", { key: "lid", d: "M-3-16H41V-9H-3Z", fill: "var(--inv-decoration-one)" }),
      h("path", {
        key: "ribbon",
        d: "M16-16H22V2H16ZM-3-6H41V-2H-3Z",
        fill: "var(--inv-surface)",
        opacity: 0.9,
      }),
      h("use", {
        key: "bow",
        href: `#${id("bow")}`,
        fill: "var(--inv-surface)",
        transform: "translate(19 -16) scale(0.55)",
      }),
    ),
    h(
      "g",
      { key: "footer-cupcake", transform: "translate(136 54) scale(0.85)" },
      h("path", {
        key: "liner-shadow",
        d: CUP_LINER,
        fill: "var(--inv-ink)",
        opacity: 0.14,
        transform: "translate(1.1 3.4)",
      }),
      h("path", { key: "liner", d: CUP_LINER, fill: "var(--inv-surface)" }),
      h("path", { key: "frosting", d: CUP_FROSTING, fill: "var(--inv-accent)" }),
      h("path", {
        key: "swirl",
        d: CUP_SWIRL,
        fill: "none",
        stroke: "var(--inv-surface)",
        strokeWidth: 1.3,
        opacity: 0.7,
      }),
      h("use", {
        key: "cherry",
        href: `#${id("cherry")}`,
        fill: "var(--inv-decoration-one)",
        transform: "translate(0 -24)",
      }),
    ),
    h(
      "g",
      { key: "footer-hat", transform: "translate(250 54) scale(0.85)" },
      h("path", { key: "cone", d: HAT_CONE, fill: "var(--inv-accent)" }),
      h("path", { key: "band", d: HAT_BAND, fill: "var(--inv-surface)", opacity: 0.85 }),
      h("path", {
        key: "stripes",
        d: HAT_STRIPES,
        fill: "none",
        stroke: "var(--inv-decoration-one)",
        strokeWidth: 2,
        opacity: 0.9,
      }),
      h("circle", { key: "pom", cx: 0, cy: -36, r: 4.3, fill: "var(--inv-decoration-one)" }),
    ),
    h("use", {
      key: "footer-bow-left",
      href: `#${id("bow")}`,
      fill: "var(--inv-accent)",
      transform: "translate(40 50) scale(0.5)",
    }),
    h("use", {
      key: "footer-bow-right",
      href: `#${id("bow")}`,
      fill: "var(--inv-accent)",
      transform: "translate(288 50) scale(0.5)",
    }),
    h(
      "g",
      { key: "footer-balloon-left", transform: "translate(318 52) scale(0.6)" },
      h("path", {
        key: "string",
        d: "M0 6C-2 12 -5 16 -5 22",
        fill: "none",
        stroke: "var(--inv-ink)",
        strokeWidth: 1.4,
        opacity: 0.4,
      }),
      h("use", { key: "one", href: `#${id("balloon")}`, fill: "var(--inv-accent)" }),
    ),
    h(
      "g",
      { key: "footer-balloon-right", transform: "translate(356 46) scale(0.5)" },
      h("use", { key: "one", href: `#${id("balloon")}`, fill: "var(--inv-decoration-one)" }),
    ),
  );

  return [
    sheetDefinitions(id, sheets),
    stampDefinitions(id),
    clothPattern(id),
    balloonDefinition(id),
    ...body,
  ];
}

/** «Ratón clásico» in paper cut-out: the vintage party table, the fan divider, and the cloth footer. */
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
