import { createElement, type ReactElement } from "react";

/**
 * The original fine-line ornaments of the eight elegant themes (E3c; S3, S4), redrawn from the descriptions
 * on `design/elegant-line/04-tablero-temas-elegantes.html`: a rose spray, typographic rules with a diamond
 * and a monogram, an eight-point star with olive, an olive branch with a ribbon, a laurel with a fleur, a
 * lavender bunch, an arch with sage, and a double rule with volutes.
 *
 * These are our own single-stroke drawings — never paper-cut art, a logo, or a protected name. A color only
 * ever reaches a shape through the theme variables `--inv-decoration-one`, `--inv-decoration-two`, and
 * `--inv-accent`, so the same drawing serves every theme. An ornament is decoration: one `aria-hidden` SVG
 * that carries no text, drawn with `xMidYMid meet` so its proportions survive any box.
 */

const h = createElement;

export interface ElegantOrnamentProperties {
  /** The ornament key of the theme (`ELEGANT_ORNAMENTS`). */
  readonly ornament: string;
  readonly className?: string;
}

/** One leaf of the sprays, drawn as a thin rotated ellipse. */
function leaf(
  key: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotate: number,
  stroke = "var(--inv-decoration-one)",
): ReactElement {
  return h("ellipse", {
    key,
    cx,
    cy,
    rx,
    ry,
    transform: `rotate(${rotate} ${cx} ${cy})`,
    stroke,
  });
}

/** The eight-point star of the «Azul medianoche y oro» theme. */
function eightPointStar(cx: number, cy: number, reach: number): string {
  const points = Array.from({ length: 16 }, (_, index) => {
    const radius = index % 2 === 0 ? reach : reach * 0.42;
    const angle = (Math.PI / 8) * index - Math.PI / 2;

    return `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  });

  return `M${points.join("L")}z`;
}

function artwork(ornament: string): ReactElement[] | undefined {
  switch (ornament) {
    case "rose":
      return [
        h("g", { key: "rose" }, [
          h("path", { key: "outer-petal", d: "M34 44c-4-8 0-16 8-16s12 8 8 16-12 8-16 0z" }),
          h("path", { key: "inner-petal", d: "M40 44c-2-4 0-8 4-8s6 4 4 8-6 4-8 0z" }),
          h("path", { key: "heart", d: "M44 40c2 0 3 1 3 3" }),
          h("path", { key: "side-petal", d: "M34 44c-7-3-12 2-11 8 5 2 10 0 12-4" }),
          h("path", { key: "side-petal-two", d: "M54 44c7-3 12 2 11 8-5 2-10 0-12-4" }),
          h("path", { key: "stem", d: "M48 56c-2 16 0 34 4 48" }),
          leaf("leaf-one", 55, 74, 10, 3.6, -32),
          leaf("leaf-two", 46, 90, 9, 3.2, 24),
          leaf("leaf-three", 58, 104, 7, 2.6, -18),
          h("circle", { key: "dot", cx: 62, cy: 60, r: 1.6 }),
        ]),
      ];
    case "rules":
      return [
        h("g", { key: "rules" }, [
          h("path", { key: "rule-one", d: "M12 44h96" }),
          h("path", { key: "rule-two", d: "M12 50h96" }),
          h("path", { key: "diamond", d: "M60 22l10 10-10 10-10-10z" }),
          h("path", { key: "diamond-inner", d: "M60 27l5 5-5 5-5-5z" }),
          h("path", { key: "monogram", d: "M48 84V70h9l3 5 3-5h9v14" }),
          h("path", { key: "rule-three", d: "M26 92h68" }),
          h("circle", { key: "dot", cx: 60, cy: 92, r: 1.6 }),
          h("path", { key: "caps", d: "M12 38h6M102 38h6M12 56h6M102 56h6" }),
        ]),
      ];
    case "star":
      return [
        h("g", { key: "star" }, [
          h("path", { key: "eight-point", d: eightPointStar(60, 44, 22) }),
          h("path", { key: "eight-point-inner", d: eightPointStar(60, 44, 11) }),
          h("path", { key: "rule-one", d: "M14 92h92" }),
          h("path", { key: "rule-two", d: "M22 98h76" }),
          h("path", { key: "olive-left", d: "M14 84c10-8 16-18 18-30" }),
          leaf("leaf-left-one", 24, 70, 8, 3, -58),
          leaf("leaf-left-two", 32, 56, 7, 2.6, -48),
          h("path", { key: "olive-right", d: "M106 84c-10-8-16-18-18-30" }),
          leaf("leaf-right-one", 96, 70, 8, 3, 58),
          leaf("leaf-right-two", 88, 56, 7, 2.6, 48),
          h("path", { key: "rule-three", d: "M38 24h44" }),
        ]),
      ];
    case "olive":
      return [
        h("g", { key: "olive" }, [
          h("path", { key: "branch", d: "M16 104C34 78 58 58 88 42" }),
          leaf("leaf-one", 34, 82, 10, 3.6, -46),
          leaf("leaf-two", 48, 68, 10, 3.6, -42),
          leaf("leaf-three", 64, 56, 9, 3.2, -38),
          leaf("leaf-four", 78, 48, 8, 2.8, -34),
          h("circle", { key: "olive-one", cx: 44, cy: 88, r: 4.5 }),
          h("circle", { key: "olive-two", cx: 66, cy: 74, r: 4 }),
          h("path", { key: "ribbon-one", d: "M26 62c14-6 30-4 42 4" }),
          h("path", { key: "ribbon-two", d: "M26 70c14 6 30 4 42-4" }),
          h("path", { key: "ribbon-tail", d: "M26 62l-8 6M26 70l-8-6" }),
          h("circle", { key: "dot", cx: 92, cy: 36, r: 1.6 }),
        ]),
      ];
    case "laurel":
      return [
        h("g", { key: "laurel" }, [
          h("path", { key: "laurel-left", d: "M28 100c-12-20-12-46 0-64" }),
          h("path", { key: "laurel-right", d: "M92 100c12-20 12-46 0-64" }),
          leaf("leaf-left-one", 24, 88, 9, 3.2, 64),
          leaf("leaf-left-two", 20, 72, 9, 3.2, 74),
          leaf("leaf-left-three", 24, 56, 8, 2.8, 84),
          leaf("leaf-right-one", 96, 88, 9, 3.2, -64),
          leaf("leaf-right-two", 100, 72, 9, 3.2, -74),
          leaf("leaf-right-three", 96, 56, 8, 2.8, -84),
          h("path", { key: "fleur", d: "M60 46c-4-6-4-13 0-18 4 5 4 12 0 18z" }),
          h("path", { key: "fleur-left", d: "M60 46c-8-2-13-8-13-15 7 2 11 7 13 11" }),
          h("path", { key: "fleur-right", d: "M60 46c8-2 13-8 13-15-7 2-11 7-13 11" }),
          h("path", { key: "fleur-stem", d: "M60 46v10" }),
          h("path", { key: "rule", d: "M44 62h32" }),
        ]),
      ];
    case "lavender":
      return [
        h("g", { key: "lavender" }, [
          h("path", { key: "stem", d: "M60 108V44" }),
          h("path", { key: "stem-left", d: "M60 92c-6-8-8-16-8-24" }),
          h("path", { key: "stem-right", d: "M60 84c6-8 8-16 8-24" }),
          leaf("bud-one", 54, 36, 5, 2.4, 28),
          leaf("bud-two", 66, 36, 5, 2.4, -28),
          leaf("bud-three", 53, 46, 5, 2.4, 30),
          leaf("bud-four", 67, 46, 5, 2.4, -30),
          leaf("bud-five", 54, 56, 5, 2.4, 26),
          leaf("bud-six", 66, 56, 5, 2.4, -26),
          leaf("bud-seven", 55, 66, 5, 2.4, 22),
          leaf("bud-eight", 65, 66, 5, 2.4, -22),
          h("circle", { key: "bud-top", cx: 60, cy: 28, r: 3 }),
          h("path", { key: "ribbon-left", d: "M60 84c-6-5-13-4-15 2 4 5 11 4 15 0z" }),
          h("path", { key: "ribbon-right", d: "M60 84c6-5 13-4 15 2-4 5-11 4-15 0z" }),
          h("path", { key: "ribbon-tails", d: "M60 92l-6 10M60 92l6 10" }),
        ]),
      ];
    case "arch":
      return [
        h("g", { key: "arch" }, [
          h("path", { key: "arch-outer", d: "M30 100V58a30 30 0 0 1 60 0v42" }),
          h("path", { key: "arch-inner", d: "M38 100V58a22 22 0 0 1 44 0v42" }),
          h("path", { key: "base", d: "M22 104h76" }),
          h("circle", { key: "sun", cx: 60, cy: 36, r: 7 }),
          h("path", {
            key: "sun-rays",
            d: "M60 24v-5M60 53v-5M44 36h-5M81 36h-5M49 25l-4-4M75 51l-4-4",
          }),
          leaf("sage-one", 25, 76, 9, 3.2, 68),
          leaf("sage-two", 23, 62, 9, 3.2, 78),
          leaf("sage-three", 95, 76, 9, 3.2, -68),
          leaf("sage-four", 97, 62, 9, 3.2, -78),
          h("path", { key: "floor", d: "M48 100v-6M60 100v-6M72 100v-6" }),
        ]),
      ];
    case "volutes":
      return [
        h("g", { key: "volutes" }, [
          h("path", { key: "rule-top-one", d: "M22 42h76" }),
          h("path", { key: "rule-top-two", d: "M22 48h76" }),
          h("path", { key: "rule-bottom-one", d: "M22 78h76" }),
          h("path", { key: "rule-bottom-two", d: "M22 84h76" }),
          h("path", {
            key: "volute-left-top",
            d: "M22 42c-8 0-8 12 0 12 5 0 5-7 0-7-2 0-2 3 0 3",
          }),
          h("path", {
            key: "volute-right-top",
            d: "M98 42c8 0 8 12 0 12-5 0-5-7 0-7 2 0 2 3 0 3",
          }),
          h("path", {
            key: "volute-left-bottom",
            d: "M22 84c-8 0-8-12 0-12 5 0 5 7 0 7-2 0-2-3 0-3",
          }),
          h("path", {
            key: "volute-right-bottom",
            d: "M98 84c8 0 8-12 0-12-5 0-5 7 0 7 2 0 2-3 0-3",
          }),
          h("path", { key: "diamond", d: "M60 54l7 7-7 7-7-7z" }),
          h("path", { key: "diamond-inner", d: "M60 58l3 3-3 3-3-3z" }),
        ]),
      ];
    default:
      return undefined;
  }
}

/** The decorative ornament of one theme, as one `aria-hidden` SVG drawn in the theme's own colors. */
export function ElegantOrnament({ ornament, className }: ElegantOrnamentProperties): ReactElement {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      focusable: "false",
      "data-ornament": ornament,
      viewBox: "0 0 120 120",
      preserveAspectRatio: "xMidYMid meet",
      fill: "none",
      stroke: "var(--inv-decoration-one)",
      strokeWidth: 1,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className: className ?? "block h-full w-full",
    },
    artwork(ornament) ?? [],
  );
}
