import { createElement, type ReactElement } from "react";

import { MOTIF_PALETTES, type MotifPalette, MotifSvg, type MotifTone } from "./motif.ts";

/*
 * The original decorative motifs of the baby shower and themed baptism themes (T7c; S5, S13), redrawn from
 * `design/celebration-themes/`. These are our own geometric shapes — a honeycomb, clouds, leaves, balloons,
 * arcs, a moon, pines, ears, a dove, wings, a sun, flowers, wool, and light — never character artwork, a
 * logo, or a protected name. They carry no meaning: every motif is one decorative SVG hidden from assistive
 * technology, and every key among its siblings is unique so React reconciles the right node.
 */

const h = createElement;

/** A five-pointed star of radius `radius` at `x`, `y`, as the birthday motifs draw theirs. */
function star(x: number, y: number, radius: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const reach = index % 2 === 0 ? radius : radius * 0.42;
    const angle = (Math.PI / 5) * index - Math.PI / 2;

    return `${(x + reach * Math.cos(angle)).toFixed(1)} ${(y + reach * Math.sin(angle)).toFixed(1)}`;
  });

  return `M${points.join("L")}z`;
}

/** A honeycomb cell of radius `radius` around `x`, `y`. */
function hexagon(x: number, y: number, radius: number): string {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index - Math.PI / 2;

    return `${(x + radius * Math.cos(angle)).toFixed(1)} ${(y + radius * Math.sin(angle)).toFixed(1)}`;
  });

  return `M${points.join("L")}z`;
}

/** The balloon of the «Globos aerostáticos» theme: an envelope, its basket, and two ropes. */
function balloon(
  x: number,
  y: number,
  radius: number,
  palette: MotifPalette,
  name: string,
): ReactElement[] {
  return [
    h("path", {
      key: `${name}-envelope`,
      d: `M${x - radius} ${y}a${radius} ${radius * 1.15} 0 0 1 ${radius * 2} 0c0 ${radius * 0.9} -${radius} ${radius * 1.7} -${radius} ${radius * 1.7}s-${radius} -${radius * 0.8} -${radius} -${radius * 1.7}z`,
      fill: palette.one,
    }),
    h("path", {
      key: `${name}-ropes`,
      d: `M${x - radius * 0.6} ${y + radius * 1.7}l${radius * 0.2} ${radius * 0.5}M${x + radius * 0.6} ${y + radius * 1.7}l-${radius * 0.2} ${radius * 0.5}`,
      stroke: palette.light,
      strokeWidth: 1.6,
      strokeLinecap: "round",
      fill: "none",
    }),
    h("rect", {
      key: `${name}-basket`,
      x: x - radius * 0.35,
      y: y + radius * 2.2,
      width: radius * 0.7,
      height: radius * 0.55,
      rx: 3,
      fill: palette.two,
    }),
  ];
}

/** One flower of five round petals around a lighter centre. */
function flower(
  x: number,
  y: number,
  radius: number,
  petal: string,
  centre: string,
  name: string,
): ReactElement[] {
  return [
    ...Array.from({ length: 5 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;

      return h("circle", {
        key: `${name}-petal-${index}`,
        cx: Number((x + radius * Math.cos(angle)).toFixed(1)),
        cy: Number((y + radius * Math.sin(angle)).toFixed(1)),
        r: radius * 0.62,
        fill: petal,
      });
    }),
    h("circle", { key: `${name}-centre`, cx: x, cy: y, r: radius * 0.36, fill: centre }),
  ];
}

function artwork(motif: string, palette: MotifPalette): ReactElement[] {
  switch (motif) {
    case "honey-bear":
      return [
        h(
          "g",
          {
            key: "comb",
            fill: "none",
            stroke: palette.light,
            strokeOpacity: 0.35,
            strokeWidth: 1.6,
          },
          [
            h("path", { key: "a", d: hexagon(44, 40, 15) }),
            h("path", { key: "b", d: hexagon(72, 56, 15) }),
            h("path", { key: "c", d: hexagon(44, 72, 15) }),
            h("path", { key: "d", d: hexagon(100, 40, 15) }),
          ],
        ),
        h("g", { key: "bear", fill: palette.one }, [
          h("circle", { key: "ear-left", cx: 190, cy: 44, r: 14 }),
          h("circle", { key: "ear-right", cx: 240, cy: 44, r: 14 }),
          h("circle", { key: "head", cx: 215, cy: 82, r: 36 }),
        ]),
        h("g", { key: "face", fill: palette.light }, [
          h("ellipse", { key: "muzzle", cx: 215, cy: 92, rx: 18, ry: 13, fillOpacity: 0.7 }),
          h("circle", { key: "eye-left", cx: 202, cy: 72, r: 3.4 }),
          h("circle", { key: "eye-right", cx: 228, cy: 72, r: 3.4 }),
          h("circle", { key: "nose", cx: 215, cy: 88, r: 4 }),
        ]),
      ];
    case "clouds":
      return [
        h("g", { key: "clouds", fill: palette.light, opacity: 0.45 }, [
          h("ellipse", { key: "a", cx: 64, cy: 78, rx: 44, ry: 21 }),
          h("ellipse", { key: "b", cx: 98, cy: 58, rx: 27, ry: 16 }),
          h("ellipse", { key: "c", cx: 214, cy: 92, rx: 36, ry: 17 }),
        ]),
        h("g", { key: "stars", fill: palette.one }, [
          h("path", { key: "a", d: star(196, 44, 15) }),
          h("path", { key: "b", d: star(248, 62, 9) }),
          h("path", { key: "c", d: star(38, 34, 8) }),
        ]),
      ];
    case "safari":
      return [
        h("g", { key: "leaves", fill: palette.one, opacity: 0.85 }, [
          h("ellipse", {
            key: "a",
            cx: 62,
            cy: 76,
            rx: 40,
            ry: 14,
            transform: "rotate(-32 62 76)",
          }),
          h("ellipse", {
            key: "b",
            cx: 108,
            cy: 100,
            rx: 27,
            ry: 11,
            transform: "rotate(-18 108 100)",
          }),
        ]),
        h("g", { key: "second-leaf", fill: palette.two, opacity: 0.7 }, [
          h("ellipse", {
            key: "a",
            cx: 210,
            cy: 62,
            rx: 32,
            ry: 13,
            transform: "rotate(28 210 62)",
          }),
        ]),
        h(
          "g",
          {
            key: "grass",
            fill: "none",
            stroke: palette.light,
            strokeWidth: 2,
            strokeLinecap: "round",
            opacity: 0.45,
          },
          [
            h("path", { key: "a", d: "M26 128q22-42 62-72" }),
            h("path", { key: "b", d: "M120 128q10-30 32-46" }),
            h("path", { key: "c", d: "M196 128q16-28 40-38" }),
          ],
        ),
      ];
    case "balloons":
      return [
        ...balloon(84, 48, 30, palette, "large"),
        ...balloon(196, 70, 20, palette, "small"),
        h(
          "g",
          {
            key: "clouds",
            fill: palette.light,
            opacity: 0.4,
          },
          [
            h("ellipse", { key: "a", cx: 64, cy: 112, rx: 30, ry: 11 }),
            h("ellipse", { key: "b", cx: 230, cy: 118, rx: 26, ry: 10 }),
          ],
        ),
      ];
    case "rainbow":
      return [
        h("g", { key: "arcs", fill: "none", strokeLinecap: "round" }, [
          h("path", {
            key: "outer",
            d: "M26 128a68 68 0 0 1 136 0",
            stroke: palette.one,
            strokeWidth: 12,
          }),
          h("path", {
            key: "middle",
            d: "M46 128a48 48 0 0 1 96 0",
            stroke: palette.light,
            strokeOpacity: 0.45,
            strokeWidth: 9,
          }),
          h("path", {
            key: "inner",
            d: "M66 128a28 28 0 0 1 56 0",
            stroke: palette.two,
            strokeWidth: 8,
          }),
        ]),
        h(
          "g",
          {
            key: "sun",
            fill: "none",
            stroke: palette.two,
            strokeWidth: 2.4,
            strokeLinecap: "round",
          },
          [
            h("circle", { key: "disc", cx: 222, cy: 52, r: 17 }),
            h("path", { key: "rays", d: "M222 24v8M222 72v8M194 52h8M242 52h8" }),
          ],
        ),
      ];
    case "moon":
      return [
        h("path", {
          key: "crescent",
          d: "M150 24a52 52 0 1 0 38 88 62 62 0 0 1-38-88z",
          fill: palette.one,
        }),
        h("g", { key: "stars", fill: palette.two }, [
          h("path", { key: "a", d: star(72, 52, 13) }),
          h("path", { key: "b", d: star(54, 96, 8) }),
          h("path", { key: "c", d: star(210, 104, 10) }),
        ]),
        h(
          "g",
          { key: "dots", fill: "none", stroke: palette.light, strokeWidth: 1.6, opacity: 0.6 },
          [
            h("circle", { key: "a", cx: 236, cy: 40, r: 7 }),
            h("circle", { key: "b", cx: 254, cy: 74, r: 4 }),
          ],
        ),
      ];
    case "woodland":
      return [
        h("g", { key: "pines", fill: palette.one, opacity: 0.9 }, [
          h("path", { key: "a", d: "M74 116l28-58 28 58z" }),
          h("path", { key: "b", d: "M30 116l20-40 20 40z" }),
          h("path", { key: "c", d: "M196 116l24-48 24 48z" }),
        ]),
        h(
          "g",
          {
            key: "ferns",
            fill: "none",
            stroke: palette.light,
            strokeWidth: 2,
            strokeLinecap: "round",
            opacity: 0.45,
          },
          [
            h("path", { key: "a", d: "M130 128q20-34 14-62" }),
            h("path", { key: "b", d: "M138 86q-18-6-24-22M142 68q18-8 24-24" }),
          ],
        ),
        h("g", { key: "trunks", fill: palette.two, opacity: 0.8 }, [
          h("rect", { key: "a", x: 71, y: 112, width: 6, height: 14 }),
          h("rect", { key: "b", x: 193, y: 112, width: 6, height: 14 }),
        ]),
      ];
    case "bunny":
      return [
        h("g", { key: "ears", fill: palette.light, opacity: 0.55 }, [
          h("ellipse", {
            key: "left",
            cx: 108,
            cy: 42,
            rx: 14,
            ry: 34,
            transform: "rotate(-14 108 42)",
          }),
          h("ellipse", {
            key: "right",
            cx: 142,
            cy: 42,
            rx: 14,
            ry: 34,
            transform: "rotate(14 142 42)",
          }),
        ]),
        h("g", { key: "head", fill: palette.one }, [
          h("circle", { key: "face", cx: 125, cy: 96, r: 36 }),
          h("path", {
            key: "heart",
            d: "M224 58q-11-11-22-2 0 12 22 26 22-14 22-26-11-9-22 2z",
            fill: palette.two,
          }),
        ]),
        h("g", { key: "details", fill: palette.light }, [
          h("circle", { key: "eye-left", cx: 114, cy: 92, r: 3.6 }),
          h("circle", { key: "eye-right", cx: 136, cy: 92, r: 3.6 }),
          h("circle", { key: "nose", cx: 125, cy: 106, r: 4 }),
        ]),
      ];
    case "dove":
      return [
        h("g", { key: "bird", fill: palette.one }, [
          h("ellipse", {
            key: "wing-near",
            cx: 104,
            cy: 64,
            rx: 34,
            ry: 12,
            transform: "rotate(-30 104 64)",
          }),
          h("ellipse", {
            key: "wing-far",
            cx: 132,
            cy: 48,
            rx: 30,
            ry: 11,
            transform: "rotate(30 132 48)",
          }),
          h("ellipse", { key: "body", cx: 120, cy: 92, rx: 38, ry: 18 }),
          h("circle", { key: "head", cx: 82, cy: 80, r: 13 }),
        ]),
        h(
          "g",
          {
            key: "branch",
            fill: "none",
            stroke: palette.light,
            strokeWidth: 2.2,
            strokeLinecap: "round",
          },
          [h("path", { key: "stem", d: "M170 112q34-16 68-6" })],
        ),
        h("g", { key: "olives", fill: palette.two }, [
          h("ellipse", {
            key: "a",
            cx: 196,
            cy: 100,
            rx: 12,
            ry: 5,
            transform: "rotate(-24 196 100)",
          }),
          h("ellipse", {
            key: "b",
            cx: 224,
            cy: 98,
            rx: 11,
            ry: 5,
            transform: "rotate(-12 224 98)",
          }),
        ]),
      ];
    case "wings":
      return [
        h(
          "g",
          {
            key: "wings",
            fill: "none",
            stroke: palette.one,
            strokeWidth: 3,
            strokeLinecap: "round",
          },
          [
            h("path", { key: "left", d: "M132 92q-58-38-94-4 30 40 94 18" }),
            h("path", { key: "right", d: "M148 92q58-38 94-4-30 40-94 18" }),
          ],
        ),
        h("g", { key: "halo", fill: "none", stroke: palette.light, strokeWidth: 3 }, [
          h("circle", { key: "ring", cx: 140, cy: 42, r: 17 }),
        ]),
        h("g", { key: "sparks", fill: palette.two }, [
          h("path", { key: "a", d: star(198, 104, 12) }),
          h("path", { key: "b", d: star(80, 108, 9) }),
        ]),
      ];
    case "sky":
      return [
        h("g", { key: "clouds", fill: palette.light, opacity: 0.5 }, [
          h("ellipse", { key: "a", cx: 78, cy: 88, rx: 46, ry: 20 }),
          h("ellipse", { key: "b", cx: 112, cy: 68, rx: 28, ry: 15 }),
        ]),
        h(
          "g",
          {
            key: "sun",
            fill: "none",
            stroke: palette.one,
            strokeWidth: 3,
            strokeLinecap: "round",
          },
          [
            h("circle", { key: "disc", cx: 204, cy: 66, r: 25 }),
            h("path", {
              key: "rays",
              d: "M204 28v10M204 94v10M166 66h10M232 66h10M177 39l7 7M224 86l7 7M177 93l7-7M224 46l7-7",
            }),
          ],
        ),
        h("g", { key: "rays-soft", fill: palette.two, opacity: 0.7 }, [
          h("rect", { key: "a", x: 196, y: 124, width: 16, height: 4, rx: 2 }),
        ]),
      ];
    case "floral":
      return [
        ...flower(84, 66, 20, palette.one, palette.light, "large"),
        ...flower(196, 88, 14, palette.two, palette.light, "small"),
        h(
          "g",
          {
            key: "stems",
            fill: "none",
            stroke: palette.light,
            strokeWidth: 2,
            strokeLinecap: "round",
            opacity: 0.5,
          },
          [
            h("path", { key: "a", d: "M84 90q4 22 0 34" }),
            h("path", { key: "b", d: "M196 104q-6 12-4 24" }),
            h("path", { key: "c", d: "M226 118q14-2 24-10" }),
          ],
        ),
      ];
    case "lamb":
      return [
        h(
          "g",
          {
            key: "wool",
            fill: "none",
            stroke: palette.one,
            strokeWidth: 3,
            strokeLinecap: "round",
          },
          [
            h("circle", { key: "a", cx: 104, cy: 64, r: 19 }),
            h("circle", { key: "b", cx: 136, cy: 54, r: 19 }),
            h("circle", { key: "c", cx: 166, cy: 66, r: 17 }),
            h("circle", { key: "d", cx: 136, cy: 84, r: 18 }),
            h("circle", { key: "e", cx: 106, cy: 88, r: 15 }),
          ],
        ),
        h("g", { key: "shell", fill: "none", stroke: palette.light, strokeWidth: 2.4 }, [
          h("path", { key: "arc", d: "M198 108a30 30 0 0 1 60 0" }),
        ]),
        h("g", { key: "dots", fill: palette.two }, [
          h("circle", { key: "a", cx: 210, cy: 116, r: 4 }),
          h("circle", { key: "b", cx: 228, cy: 118, r: 3 }),
          h("circle", { key: "c", cx: 246, cy: 116, r: 4 }),
          h("circle", { key: "d", cx: 62, cy: 116, r: 4 }),
        ]),
      ];
    case "star":
      return [
        h("path", {
          key: "eight-point",
          d: "M140 18l14 42 42 14-42 14-14 42-14-42-42-14 42-14z",
          fill: palette.one,
        }),
        h("path", {
          key: "eight-point-turned",
          d: "M140 46l10 22 22 10-22 10-10 22-10-22-22-10 22-10z",
          fill: palette.two,
        }),
        h("g", { key: "rays", stroke: palette.light, strokeWidth: 2, strokeLinecap: "round" }, [
          h("path", { key: "a", d: "M140 6v8M58 74h8M214 74h8M140 134v-6" }),
        ]),
        h("g", { key: "sparks", fill: palette.light }, [
          h("path", { key: "a", d: star(224, 36, 9) }),
          h("path", { key: "b", d: star(60, 104, 7) }),
        ]),
      ];
    default:
      return [];
  }
}

export interface CelebrationMotifProperties {
  /** The motif key of the theme (`BABY_SHOWER_MOTIFS` or `BAPTISM_MOTIFS`). */
  readonly motif: string;
  /** `accent` for the accent band (on-accent decoration), `paper` for the light surfaces. */
  readonly tone?: MotifTone;
  readonly className?: string;
}

/** The decorative motif of one theme, as one `aria-hidden` SVG on the shared motif frame. */
export function CelebrationMotif({
  motif,
  tone = "paper",
  className,
}: CelebrationMotifProperties): ReactElement {
  return MotifSvg({ motif, className, children: artwork(motif, MOTIF_PALETTES[tone]) });
}
