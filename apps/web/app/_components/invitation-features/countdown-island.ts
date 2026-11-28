"use client";

import { createElement, type ReactElement, useEffect, useState } from "react";

import type { Locale } from "../../../lib/i18n/locale.ts";
import { type CountdownParts, countdownParts } from "../../../lib/invitation-features/countdown.ts";
import { countdownMarkup } from "./countdown-markup.ts";

/**
 * The countdown island (S3, S4): the only client component of a guest invitation. It receives the parts the
 * server already computed, so the block reads its value before any JavaScript runs, and it recomputes them
 * every half minute from the same pure function. There is no animation and no live region: the numbers
 * change quietly, and a guest with a screen reader is not interrupted every thirty seconds.
 *
 * The target instant travels as an ISO string and the parts as plain numbers, so everything crossing the
 * server/client boundary is serializable.
 */

const TICK_MS = 30_000;

export interface CountdownIslandProps {
  /** The start instant, as an ISO string. */
  readonly targetAt: string;
  /** The invitation's IANA time zone, which decides whether the celebration is today. */
  readonly timeZone: string;
  /** The parts the server computed for this request: the value shown before hydration. */
  readonly initial: CountdownParts;
  /** The locale the page renders (F14; L19.2): the units and the accessible name follow it, the numbers do not. */
  readonly locale: Locale;
}

export function CountdownIsland({
  targetAt,
  timeZone,
  initial,
  locale,
}: CountdownIslandProps): ReactElement {
  const [parts, setParts] = useState<CountdownParts>(initial);

  useEffect(() => {
    const target = new Date(targetAt);
    const tick = (): void => setParts(countdownParts(target, new Date(), timeZone));

    // The server answer can be a page-cached minute or two old, so correct it now and then keep it fresh.
    tick();
    const timer = setInterval(tick, TICK_MS);

    return () => clearInterval(timer);
  }, [targetAt, timeZone]);

  return createElement(
    "div",
    { "data-countdown-target": targetAt, "data-countdown-zone": timeZone },
    countdownMarkup(parts, locale),
  );
}
