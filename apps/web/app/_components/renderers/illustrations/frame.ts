import { createElement, type ReactElement, useId } from "react";

import type { IllustrationPart, ThemeIllustration } from "./types.ts";

/*
 * The frame one part of a theme illustration is drawn in (I3a; S4). It owns what every part shares and no
 * drawing may decide for itself: the `aria-hidden` accessibility contract, the drawing area of its part, and
 * the id prefix that makes a drawing's filter, clip, and reusable sheets unique to this render. Two
 * invitations on one page therefore never collide, which a shared literal id would.
 *
 * A layout never renders this directly: it renders a `DecorationZone`, which answers the illustration when the
 * theme has one and the layout's motif strip when it does not.
 */

const h = createElement;

export interface IllustrationVignetteProps {
  readonly illustration: ThemeIllustration;
  readonly part: IllustrationPart;
}

/**
 * One `aria-hidden`, `focusable="false"` SVG of the part's drawing area. `slice` fills a header band and
 * `meet` keeps a strip's shapes whole; neither stretches the shapes.
 */
export function IllustrationVignette({
  illustration,
  part,
}: IllustrationVignetteProps): ReactElement {
  // `useId` is the one React guarantee of a document-unique, hydration-stable id; it is narrowed to
  // characters an SVG `url(#…)` reference takes without escaping.
  const prefix = `inv-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const drawing = illustration[part];

  return h(
    "svg",
    {
      "aria-hidden": "true",
      focusable: "false",
      "data-illustration": part,
      viewBox: drawing.viewBox,
      preserveAspectRatio: drawing.preserveAspectRatio,
      className: "block h-auto w-full",
    },
    drawing.draw((name) => `${prefix}-${name}`),
  );
}
