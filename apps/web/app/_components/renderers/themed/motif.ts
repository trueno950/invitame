import { createElement, type ReactElement, type ReactNode } from "react";

/*
 * The frame every themed invitation's decorative motif is drawn in (T6b, T7c; S5, S8, S13). The birthday
 * themes and the celebration themes draw different original shapes, but they share the drawing area, the
 * tone pairs, and the accessibility contract: a motif is decoration, hidden from assistive technology, and
 * drawn with `xMidYMid meet` so its shapes keep their proportions in any box. A layout places it in a
 * short, fixed-height strip at an edge where no text sits (docs/design/theme.md), never under live text.
 */

const h = createElement;

export type MotifTone = "accent" | "paper";

export interface MotifPalette {
  /** The near-white (accent band) or near-ink (paper) shape. */
  readonly light: string;
  readonly one: string;
  readonly two: string;
}

export const MOTIF_PALETTES: Readonly<Record<MotifTone, MotifPalette>> = {
  accent: {
    light: "var(--inv-on-accent)",
    one: "var(--inv-decoration-one)",
    two: "var(--inv-decoration-two)",
  },
  paper: {
    light: "var(--inv-ink)",
    one: "var(--inv-accent)",
    two: "var(--inv-decoration-one)",
  },
};

export interface MotifSvgProperties {
  /** The motif key, which reaches the markup as `data-motif`. */
  readonly motif: string;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

/** One `aria-hidden` SVG on the board's 280 × 140 drawing area, holding the motif's shapes. */
export function MotifSvg({ motif, className, children }: MotifSvgProperties): ReactElement {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      focusable: "false",
      "data-motif": motif,
      viewBox: "0 0 280 140",
      preserveAspectRatio: "xMidYMid meet",
      className: className ?? "block h-full w-full",
    },
    children,
  );
}
