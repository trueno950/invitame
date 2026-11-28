"use client";

import { createElement, type ReactElement, useState } from "react";

import { guestText } from "../../../lib/i18n/guest-texts.ts";
import type { Locale } from "../../../lib/i18n/locale.ts";
import {
  LIVESTREAM_IFRAME_ALLOW,
  LIVESTREAM_IFRAME_SANDBOX,
  LIVESTREAM_IFRAME_TITLES,
} from "../../../lib/invitation-features/livestream.ts";

/**
 * The player of a guest invitation (F9; L12.3, L12.4): a click-to-load facade, so nothing reaches the provider until the
 * guest taps it. Before the tap the island renders an ordinary link to the stream — the same link the fallback offers —
 * and the tap only swaps it for the frame, so a guest without client script still opens the transmission in a new tab.
 *
 * The frame is built from the address the block resolved (`https://www.youtube-nocookie.com/embed/<id>`), never from a
 * value a response supplied. It carries its accessible name, the sandbox playback needs and nothing else, and the lazy
 * loading of an image: no request of any kind leaves the page before the tap.
 */

const FACADE =
  "mt-3 flex aspect-video w-full items-center justify-center rounded-xl bg-(--inv-background) ring-1 ring-inset ring-(--inv-decoration-one)";
/** The play mark: the artboard's «▶» in a circle of the theme's surface, so it never relies on colour alone. */
const FACADE_PLAY =
  "flex size-14 items-center justify-center rounded-full bg-(--inv-surface) text-2xl leading-none text-(color:--inv-accent) ring-1 ring-inset ring-(--inv-accent)";
const FRAME = "mt-3 aspect-video w-full rounded-xl border-0 bg-(--inv-background)";
const CAPTION = "mt-2 text-sm leading-6 break-words text-(color:--inv-ink)";
const FALLBACK_LINK =
  "inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-(color:--inv-accent) underline underline-offset-4";

export interface LivestreamPlayerIslandProps {
  /** The stream as the owner stored it, which the facade and the fallback open in a new tab (L12.4, L12.5). */
  readonly url: string;
  /** The only embed address this deployment frames, built from the strict video id (L12.3). */
  readonly embedUrl: string;
  /** The owner's note, shown under the player before and after the tap, or null when there is none. */
  readonly note: string | null;
  /** The locale the page renders (F14; L19.2): the facade, the frame's title, and the fallback link follow it. */
  readonly locale: Locale;
}

export function LivestreamPlayerIsland({
  url,
  embedUrl,
  note,
  locale,
}: LivestreamPlayerIslandProps): ReactElement {
  const [loaded, setLoaded] = useState(false);

  return createElement(
    "div",
    // The facade state, never the embed address: nothing about the provider reaches the page before the tap.
    { "data-livestream-player": loaded ? "loaded" : "facade" },
    loaded
      ? createElement("iframe", {
          src: embedUrl,
          title: LIVESTREAM_IFRAME_TITLES[locale],
          className: FRAME,
          sandbox: LIVESTREAM_IFRAME_SANDBOX,
          allow: LIVESTREAM_IFRAME_ALLOW,
          allowFullScreen: true,
          referrerPolicy: "strict-origin-when-cross-origin",
          loading: "lazy",
        })
      : createElement(
          "a",
          {
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            "aria-label": guestText(locale, "livestream.play"),
            className: FACADE,
            onClick: (event: { preventDefault: () => void }) => {
              event.preventDefault();
              setLoaded(true);
            },
          },
          createElement("span", { "aria-hidden": "true", className: FACADE_PLAY }, "▶"),
        ),
    note === null ? null : createElement("p", { className: CAPTION }, note),
    createElement(
      "p",
      { className: CAPTION },
      createElement(
        "a",
        { href: url, target: "_blank", rel: "noopener noreferrer", className: FALLBACK_LINK },
        guestText(locale, "livestream.fallback"),
      ),
    ),
  );
}
