import { createElement, type ReactElement } from "react";

import {
  type CountdownParts,
  countdownGroups,
  countdownLabel,
} from "../../../lib/invitation-features/countdown.ts";
import { DISPLAY_FONT } from "../renderers/themed/theme.ts";

/**
 * The countdown as markup (S3, S4), drawn once for the server render and again for every tick of the island.
 * Sharing the markup is what keeps the two in agreement: hydration replaces nothing, and a guest without
 * JavaScript reads exactly the numbers the server computed.
 *
 * The group carries the readable sentence as its accessible name and hides the numbers it repeats, so a
 * screen reader hears «Faltan 4 días, 4 horas y 30 minutos» and not a stream of digits.
 */
export function countdownMarkup(parts: CountdownParts): ReactElement {
  const groups = countdownGroups(parts);
  const note =
    parts.status === "today"
      ? "¡Hoy es el día!"
      : parts.status === "passed"
        ? "La celebración ya pasó"
        : null;

  return createElement(
    "div",
    {
      role: "group",
      "aria-label": countdownLabel(parts),
      "data-countdown": parts.status,
      className: "mt-3 flex flex-col items-center gap-2",
    },
    note === null
      ? null
      : createElement(
          "p",
          {
            "data-countdown-note": "",
            className: "text-sm font-medium text-(color:--inv-ink)",
          },
          note,
        ),
    groups.length === 0
      ? null
      : createElement(
          "div",
          { className: "flex flex-wrap items-end justify-center gap-3" },
          groups.map((group) =>
            createElement(
              "span",
              {
                key: group.key,
                "aria-hidden": "true",
                "data-countdown-part": group.key,
                className: "flex min-w-11 flex-col items-center",
              },
              createElement(
                "b",
                {
                  className: "text-2xl leading-none font-medium text-(color:--inv-accent)",
                  style: DISPLAY_FONT,
                },
                String(group.value),
              ),
              createElement(
                "small",
                {
                  className:
                    "mt-1 text-[0.7rem] tracking-[0.12em] uppercase text-(color:--inv-ink)",
                },
                group.unit,
              ),
            ),
          ),
        ),
  );
}
