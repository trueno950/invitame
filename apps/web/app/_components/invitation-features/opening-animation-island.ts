"use client";

import { createElement, type CSSProperties, type ReactElement, useEffect, useState } from "react";

import { guestText } from "../../../lib/i18n/guest-texts.ts";
import type { Locale } from "../../../lib/i18n/locale.ts";
import {
  OPENING_ANIMATION_DURATION_MS,
  type OpeningAnimationCard,
  openingAnimationDecision,
  openingAnimationSkips,
  openingAnimationStorageKey,
} from "../../../lib/invitation-features/opening-animation.ts";
import type { InvitationTheme } from "../../../lib/renderers/theme-tokens.ts";
import { THEME_VARIABLES, themeStyle } from "../renderers/themed/theme.ts";

/**
 * The envelope of a guest invitation (F10; S2.10, L14.2), following `design/opening-animation/01-sobre-con-sello.html`
 * with the invitation's own theme: the sealed envelope waits centered, the seal fades, the flap opens upward from the
 * envelope's top edge, the card rises out of the mouth with the occasion and the celebrant's name, and the envelope
 * drops away in about three seconds.
 *
 * The envelope is one box the same size on every screen, centered on both axes, and every part is a layer of it: the
 * back, the flap, the card, and the front pocket, in that paint order. The card starts below the flap's apex, so the
 * closed flap hides it, and the front pocket covers its lower part while it rises, which is what makes it come out of
 * the envelope instead of floating over it. The flap is hinged on the envelope's top edge with the back face hidden, so
 * it lifts away behind the card; the seal is its own layer above both, because it fades before the flap moves. The back
 * and the front pocket share the drop animation, so the envelope leaves as one piece and no second body is left behind.
 *
 * It is a client-only overlay over the page the server already rendered: nothing is drawn on the server, so a guest
 * without client script reads the invitation directly, and the overlay never covers the page inside the HTML. Every
 * decision is made once, in the pure module (`lib/invitation-features/opening-animation.ts`): the switch the API answered,
 * the guest's reduced-motion preference, and the one play this browser session keeps per invitation. One tap, click,
 * Enter, Escape, or Space skips it at once, the overlay is `aria-hidden`, it holds nothing focusable, and it never
 * touches the page's own tree, so the invitation stays exactly where the guest and their screen reader found it.
 *
 * It carries no image and no request: the animation is CSS `transform` and `opacity` only, and the colors and the faces
 * are the theme's own `--inv-*` variables.
 */

/** The overlay: the viewport, above the page, in the invitation's background color. */
const OVERLAY = "fixed inset-0 z-50 overflow-hidden";
/** The stage: the envelope centered on both axes, whatever the viewport measures. */
const STAGE = "absolute inset-0 flex items-center justify-center";
/** The card: the theme's surface with the two lines of the celebration, below the front pocket. */
const CARD = "absolute inset-x-6 flex flex-col items-center justify-center gap-2 p-5";
const OCCASION = "text-[0.7rem] tracking-[0.24em] uppercase";
const NAME = "text-center text-4xl leading-tight";
/** The seal's letters: one line, no wrapping, in the theme's contrast partner. */
const SEAL = "flex size-14 items-center justify-center rounded-full text-xl";
const HINT = "absolute inset-x-0 bottom-8 text-center text-sm";

/** The theme variable each part of the envelope reads; the overlay sets them once, as the layouts do. */
const BACKGROUND = `var(${THEME_VARIABLES.background})`;
const SURFACE = `var(${THEME_VARIABLES.surface})`;
const SOFT = `var(${THEME_VARIABLES.soft})`;
const ACCENT = `var(${THEME_VARIABLES.accent})`;
const INK = `var(${THEME_VARIABLES.ink})`;
const FLAP = `var(${THEME_VARIABLES.decorationTwo})`;
const ON_ACCENT = "var(--inv-on-accent)";

/**
 * The envelope's box: the same geometry on a phone and on a laptop, so its percentages are the same everywhere and the
 * card never outgrows its mouth. `perspective` is what makes the flap's rotation read as a lid lifting away.
 */
const ENVELOPE: CSSProperties = {
  position: "relative",
  width: "min(21rem, calc(100vw - 3rem))",
  aspectRatio: "3 / 2",
  perspective: "900px",
  perspectiveOrigin: "50% 0%",
};

/**
 * Every part of the envelope that leaves with it, on the same 650 ms drop: the back, the flap, and the front pocket move
 * as one piece, so no second body is left behind (L14.2).
 */
const ENVELOPE_DROP = "inv-opening-envelope-drop 650ms ease-in 2150ms both";

/** The flap's triangle: the top 44% of the envelope, its base on the top edge and its apex at the mouth. */
const FLAP_BOX: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  left: 0,
  height: "44%",
  animation: ENVELOPE_DROP,
};

/** The front pocket's mouth: the same V the flap covers, so the card shows exactly through the open envelope. */
const FRONT_MOUTH = "polygon(0 0, 50% 42%, 100% 0, 100% 100%, 0 100%)";

export interface OpeningAnimationIslandProps {
  /** The invitation's public slug: the one session entry per invitation is keyed by it (L14.2). */
  readonly invitationSlug: string;
  /** Whether the API said the animation plays: the package grants it and the owner's switch is on (L14.4). */
  readonly plays: boolean;
  /** The two lines of the card and the letters of the seal, read from the celebration's own title. */
  readonly card: OpeningAnimationCard;
  /** The invitation's own theme, so the envelope is the design's and not the app's (L14.6). */
  readonly theme: InvitationTheme;
  /** The locale the page renders (F14; L19.2): the one line the envelope carries follows it. */
  readonly locale: Locale;
}

export function OpeningAnimationIsland({
  invitationSlug,
  plays,
  card,
  theme,
  locale,
}: OpeningAnimationIslandProps): ReactElement | null {
  const [playing, setPlaying] = useState(false);

  // Decided once the page is interactive, never on the server: the HTML a guest without script receives has no overlay.
  useEffect(() => {
    const key = openingAnimationStorageKey(invitationSlug);

    if (
      openingAnimationDecision({
        plays,
        reducedMotion: prefersReducedMotion(),
        playedThisSession: readPlayed(key),
      }) === "skip"
    ) {
      return;
    }

    // Marked as soon as it starts, so a reload of this browser session shows the invitation directly (L14.2).
    writePlayed(key);
    setPlaying(true);
  }, [invitationSlug, plays]);

  useEffect(() => {
    if (!playing) {
      return;
    }

    const stop = (): void => setPlaying(false);
    const timer = setTimeout(stop, OPENING_ANIMATION_DURATION_MS);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (openingAnimationSkips(event.key)) {
        stop();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [playing]);

  if (!playing) {
    return null;
  }

  const stop = (): void => setPlaying(false);
  const style: CSSProperties = {
    ...themeStyle(theme),
    backgroundColor: BACKGROUND,
    animation: "inv-opening-overlay-fade 300ms ease-out 2700ms both",
  };

  // The layers of the envelope, in paint order: the back, the flap, the card, the front pocket, the seal. The flap is
  // behind the card, and the front pocket is above it, so the card rises out of the mouth and its lower part stays
  // tucked in until the envelope drops away (L14.2).
  return createElement(
    "div",
    {
      // Decoration only: hidden from assistive technology, with nothing focusable and no focus trap (L14.2).
      "aria-hidden": "true",
      "data-opening-animation": "",
      className: OVERLAY,
      style,
      // One tap or click anywhere skips it at once (L14.2).
      onPointerDown: stop,
      onClick: stop,
    },
    createElement(
      "div",
      { key: "stage", className: STAGE },
      createElement(
        "div",
        { key: "envelope", "data-opening-animation-part": "envelope", style: ENVELOPE },
        createElement("div", {
          key: "back",
          "data-opening-animation-part": "back",
          style: {
            position: "absolute",
            inset: 0,
            borderRadius: "10px",
            backgroundColor: SOFT,
            animation: ENVELOPE_DROP,
          },
        }),
        createElement(
          "div",
          { key: "flap-box", style: FLAP_BOX },
          createElement("div", {
            key: "flap",
            "data-opening-animation-part": "flap",
            style: {
              position: "absolute",
              inset: 0,
              clipPath: "polygon(0 0, 50% 100%, 100% 0)",
              backgroundColor: FLAP,
              transformOrigin: "top center",
              backfaceVisibility: "hidden",
              animation: "inv-opening-flap-open 1000ms ease-in-out 600ms both",
            },
          }),
        ),
        createElement(
          "div",
          {
            key: "card",
            "data-opening-animation-part": "card",
            className: CARD,
            style: {
              top: "45%",
              bottom: "0.5rem",
              borderRadius: "12px",
              backgroundColor: SURFACE,
              boxShadow: `inset 0 0 0 1px ${SOFT}`,
              animation: "inv-opening-card-rise 1000ms cubic-bezier(0.23, 1, 0.32, 1) 1100ms both",
            },
          },
          createElement(
            "p",
            { key: "occasion", className: OCCASION, style: { color: ACCENT } },
            card.occasion,
          ),
          createElement(
            "b",
            {
              key: "name",
              className: NAME,
              style: { color: ACCENT, fontFamily: "var(--inv-display)", fontWeight: 400 },
            },
            card.name,
          ),
        ),
        createElement("div", {
          key: "front",
          "data-opening-animation-part": "front",
          style: {
            position: "absolute",
            inset: 0,
            borderRadius: "10px",
            backgroundColor: SOFT,
            clipPath: FRONT_MOUTH,
            animation: ENVELOPE_DROP,
          },
        }),
        createElement(
          "div",
          {
            key: "seal",
            "data-opening-animation-part": "seal",
            className: SEAL,
            style: {
              // The seal sits on the flap, just above the mouth, and fades before the flap moves: it never travels with it.
              position: "absolute",
              top: "20%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              backgroundColor: ACCENT,
              color: ON_ACCENT,
              fontFamily: "var(--inv-display)",
              animation: "inv-opening-seal-fade 300ms ease-out 250ms both",
            },
          },
          card.initials,
        ),
      ),
    ),
    createElement(
      "p",
      { key: "hint", className: HINT, style: { color: INK } },
      guestText(locale, "opening.tap"),
    ),
  );
}

/** Whether the guest asked the browser for reduced motion, which skips the animation entirely (L14.2). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Whether this browser session already played this invitation; a browser that refuses storage answers "not yet". */
function readPlayed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    // The animation is decoration: a browser with storage disabled still gets it, and nothing depends on the entry.
    return false;
  }
}

/** Remembers this invitation played in this browser session, so a reload shows the invitation directly (L14.2). */
function writePlayed(key: string): void {
  try {
    window.sessionStorage.setItem(key, "played");
  } catch {
    // Same as above: a refused write costs a second play, never the page.
  }
}
