import type { ReactNode } from "react";

/**
 * The paper-cut illustration system (I3a; S1-S4), after the style the owner chose,
 * `design/theme-illustrations/01-papel-recortado.html`. Every themed layout draws three pieces of decoration
 * — a header diorama, a strip between sections, and a bottom strip — and a theme supplies its own three
 * drawings. This module is the contract only: it names the parts, the drawing area, and the id hand-out, and
 * says nothing about the shapes of any theme.
 *
 * A drawing is code, not data: it returns React elements built with the shared primitives of
 * `primitives.ts`, so the paper-cut technique (layered flat sheets, short offset shadows, a torn edge, one
 * grain filter) is written once. Every color is a `ThemePaint` — a CSS variable of the theme — so the same
 * drawing re-colours with its theme, and tinting happens only through `opacity`.
 */

/** The three places a layout draws decoration, in document order. */
export const ILLUSTRATION_PARTS = ["scene", "divider", "footer"] as const;

export type IllustrationPart = (typeof ILLUSTRATION_PARTS)[number];

/**
 * Names an SVG id inside one drawing part. The frame answers it with an id unique to that render, so two
 * invitations on one page never share a `<filter>`, a `<clipPath>`, or a reusable sheet.
 */
export type IllustrationId = (name: string) => string;

/** One part of a theme's illustration: its drawing area and the sheets drawn inside it. */
export interface IllustrationDrawing {
  /** The drawing area in user units: `390 × 200` for a scene, `390 × 56` and `390 × 62` for the strips. */
  readonly viewBox: string;
  /**
   * `xMidYMid slice` lets the header scene fill its band at any width; `xMidYMid meet` keeps a strip's
   * shapes whole. Neither ever stretches, so a drawing is never distorted.
   */
  readonly preserveAspectRatio: "xMidYMid slice" | "xMidYMid meet";
  /** The part's shapes. Every color is a theme variable and every SVG id goes through `id`. */
  readonly draw: (id: IllustrationId) => ReactNode;
}

/**
 * The illustration of one theme (S4): a header scene for a zone about 200 px tall at 390 px wide, a divider
 * for the gap between two sections, and a footer strip for the end of the invitation.
 */
export interface ThemeIllustration {
  /** The theme key this drawing belongs to; the registry files file it under exactly this key. */
  readonly theme: string;
  readonly scene: IllustrationDrawing;
  readonly divider: IllustrationDrawing;
  readonly footer: IllustrationDrawing;
}
