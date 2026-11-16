import { createElement, type ReactElement, useId } from "react";

import { calendarEventFor, googleCalendarUrl } from "../../../lib/invitation-features/calendar.ts";
import { countdownParts } from "../../../lib/invitation-features/countdown.ts";
import type { EventFacts, EventPlace } from "../../../lib/invitation-features/event-facts.ts";
import {
  hasAnyFeature,
  type InvitationFeatures,
} from "../../../lib/invitation-features/invitation-features.ts";
import { googleMapsUrl, wazeUrl } from "../../../lib/invitation-features/map-links.ts";
import { startInstant } from "../../../lib/invitation-features/start-instant.ts";
import { whatsappUrl } from "../../../lib/invitation-features/whatsapp.ts";
import { DISPLAY_FONT } from "../renderers/themed/theme.ts";
import { CountdownIsland } from "./countdown-island.ts";

/**
 * The features block of a guest invitation (S3, S4): the countdown, «Cómo llegar», «Agregar al calendario»,
 * and «Escribir por WhatsApp», each shown only when the API gated it for this invitation. One block serves
 * every layout, so the five designs show the same behavior, and every color comes from the theme through the
 * CSS variables the layout already sets on its root — the block carries no palette of its own.
 *
 * It is a server component (`.ts` + `createElement`, because `node --test` strips types but does not compile
 * JSX) and the countdown is its only client island. `now` exists for tests and for a caller that already
 * knows the request time; without it the block reads the clock once, at render time.
 */

export interface InvitationFeaturesBlockProps {
  /** The features the API decided for this invitation; all off renders nothing at all. */
  readonly features: InvitationFeatures;
  /** The celebration the features describe, read from the layout's own content. */
  readonly facts: EventFacts;
  /** The `.ics` download the public page owns; without it the block offers only the Google Calendar link. */
  readonly calendarHref?: string;
  /** The instant the countdown is read from; defaults to now, so a caller never computes one by accident. */
  readonly now?: Date;
}

const h = createElement;

const CARD = "rounded-2xl p-4 shadow-sm";
const FEATURE_TITLE =
  "text-[0.7rem] font-medium uppercase tracking-[0.16em] text-(color:--inv-accent)";
const SECTION_TITLE = "text-center text-2xl font-medium text-(color:--inv-ink)";
const HINT = "mt-1 text-sm text-(color:--inv-ink)";
const PLACE = "flex flex-col";
const PLACE_LABEL =
  "text-[0.7rem] font-medium uppercase tracking-[0.12em] text-(color:--inv-accent)";
const PLACE_NAME = "mt-1 text-lg leading-tight font-medium break-words text-(color:--inv-ink)";
const PLACE_ADDRESS = "mt-0.5 text-sm text-(color:--inv-ink)";
const ACTIONS = "mt-3 flex flex-wrap gap-2";
/** Every action is a 44 px tap target on the theme's accent surface, with its contrast partner as ink. */
const ACTION =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-(--inv-accent) px-5 text-sm font-medium text-(color:--inv-on-accent)";
/** The counters sit on the softer theme surface so they read as a highlight, not as another card. */
const COUNTDOWN_CARD = `${CARD} bg-(--inv-soft)`;
const SURFACE_CARD = `${CARD} bg-(--inv-surface)`;

/** The two «Cómo llegar» actions of one place, each with the accessible name that names its service. */
function placeLinks(place: EventPlace): ReactElement {
  return h(
    "div",
    { className: ACTIONS },
    h(
      "a",
      {
        href: googleMapsUrl(place),
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": `Cómo llegar a ${place.name} en Google Maps`,
        className: ACTION,
      },
      "Google Maps",
    ),
    h(
      "a",
      {
        href: wazeUrl(place),
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": `Cómo llegar a ${place.name} en Waze`,
        className: ACTION,
      },
      "Waze",
    ),
  );
}

export function InvitationFeaturesBlock({
  features,
  facts,
  calendarHref,
  now,
}: InvitationFeaturesBlockProps): ReactElement | null {
  // Read the id before the early return, so the hook count never depends on the feature flags.
  const idPrefix = useId();

  if (!hasAnyFeature(features)) {
    return null;
  }

  const start =
    features.countdown || features.calendar
      ? startInstant(facts.date, facts.time, features.timeZone)
      : undefined;
  const sections: ReactElement[] = [];

  if (features.countdown && start !== undefined) {
    sections.push(
      h(
        "div",
        { key: "countdown", "data-feature": "countdown", className: COUNTDOWN_CARD },
        h("h3", { className: FEATURE_TITLE }, "Cuenta regresiva"),
        h(CountdownIsland, {
          targetAt: start.toISOString(),
          timeZone: features.timeZone,
          initial: countdownParts(start, now ?? new Date(), features.timeZone),
        }),
      ),
    );
  }

  if (features.map) {
    sections.push(
      h(
        "div",
        { key: "map", "data-feature": "map", className: SURFACE_CARD },
        h("h3", { className: FEATURE_TITLE }, "Cómo llegar"),
        h(
          "ul",
          { className: "mt-3 flex flex-col gap-3" },
          facts.places.map((place) =>
            h(
              "li",
              { key: `${place.label}-${place.name}`, "data-place": place.label, className: PLACE },
              h("p", { className: PLACE_LABEL }, place.label),
              h("p", { className: PLACE_NAME, style: DISPLAY_FONT }, place.name),
              h("p", { className: PLACE_ADDRESS }, place.address),
              placeLinks(place),
            ),
          ),
        ),
      ),
    );
  }

  if (features.calendar && start !== undefined) {
    sections.push(
      h(
        "div",
        { key: "calendar", "data-feature": "calendar", className: SURFACE_CARD },
        h("h3", { className: FEATURE_TITLE }, "Agregar al calendario"),
        h("p", { className: HINT }, "Guarda la fecha para no olvidarla."),
        h(
          "div",
          { className: ACTIONS },
          h(
            "a",
            {
              href: googleCalendarUrl(calendarEventFor(facts, start)),
              target: "_blank",
              rel: "noopener noreferrer",
              className: ACTION,
            },
            "Google Calendar",
          ),
          calendarHref === undefined || calendarHref === ""
            ? null
            : h("a", { href: calendarHref, className: ACTION }, "Descargar .ics"),
        ),
      ),
    );
  }

  if (features.whatsapp !== null) {
    sections.push(
      h(
        "div",
        { key: "whatsapp", "data-feature": "whatsapp", className: SURFACE_CARD },
        h("h3", { className: FEATURE_TITLE }, "Escribir por WhatsApp"),
        h("p", { className: HINT }, "Escribe para confirmar tu asistencia."),
        h(
          "div",
          { className: ACTIONS },
          h(
            "a",
            {
              href: whatsappUrl(features.whatsapp.phone, facts.title),
              target: "_blank",
              rel: "noopener noreferrer",
              "aria-label": `Escribir por WhatsApp sobre ${facts.title}`,
              className: ACTION,
            },
            "Escribir por WhatsApp",
          ),
        ),
      ),
    );
  }

  return h(
    "section",
    {
      "data-section": "features",
      "aria-labelledby": `${idPrefix}-features`,
      className: "flex flex-col gap-4",
    },
    h(
      "h2",
      { id: `${idPrefix}-features`, className: SECTION_TITLE, style: DISPLAY_FONT },
      "Todo lo que necesitas",
    ),
    sections,
  );
}
