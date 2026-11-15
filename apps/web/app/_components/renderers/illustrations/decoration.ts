import { createElement, type ReactElement, type ReactNode } from "react";

import { IllustrationVignette } from "./frame.ts";
import { themeIllustration } from "./registry.ts";
import type { IllustrationPart } from "./types.ts";

/*
 * The decoration zone (I3a; S4): the one place a layout puts decoration, and the one rule every layout
 * follows — a zone is its own block, `aria-hidden`, and marked `data-decoration`, so it can never sit inside
 * the flow of a text section. What fills the zone depends on the theme:
 *
 * - a theme with a paper-cut illustration gets the scene, the divider, or the footer, at the layout's own
 *   width (the scene fills a header band, the strips hang between sections);
 * - a theme without one keeps exactly the motif strip the layout drew before, byte for byte, because
 *   `fallback.className` and `fallback.node` are the literals the layout has always rendered.
 *
 * A layout with no fallback (the divider and the footer, which today's layouts never drew) passes none and
 * then renders nothing at all for a theme without an illustration.
 */

const h = createElement;

export interface DecorationFallback {
  /** What the layout draws when its theme has no illustration: today's motif, unchanged. */
  readonly node: ReactNode;
  /** The zone classes that motif strip has always carried, verbatim. */
  readonly className: string;
}

export interface DecorationZoneProps {
  /** The theme key of the invitation; the registry answers its illustration or `undefined`. */
  readonly theme: string;
  readonly part: IllustrationPart;
  /** The zone's own classes when the theme illustration fills it. */
  readonly illustrationClassName: string;
  readonly fallback?: DecorationFallback | undefined;
}

/**
 * One decoration zone. It renders the theme's illustration when the theme has one, the layout's motif strip
 * when it has not, and nothing when it has neither.
 */
export function DecorationZone({
  theme,
  part,
  illustrationClassName,
  fallback,
}: DecorationZoneProps): ReactElement | null {
  const illustration = themeIllustration(theme);

  if (illustration !== undefined) {
    return h(
      "div",
      { "aria-hidden": "true", "data-decoration": "", className: illustrationClassName },
      h(IllustrationVignette, { illustration, part }),
    );
  }
  if (fallback === undefined) {
    return null;
  }
  return h(
    "div",
    { "aria-hidden": "true", "data-decoration": "", className: fallback.className },
    fallback.node,
  );
}
