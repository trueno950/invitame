import { createElement, type ReactElement, useId } from "react";

import { GUEST_PAGE_COPY, RSVP_FORM_COPY } from "../../../lib/customer/copy.ts";
import { calendarEventFor, googleCalendarUrl } from "../../../lib/invitation-features/calendar.ts";
import { countdownParts } from "../../../lib/invitation-features/countdown.ts";
import type { EventFacts, EventPlace } from "../../../lib/invitation-features/event-facts.ts";
import {
  type GuestPassBlockView,
  type GuestRsvpBlockView,
  hasAnyFeature,
  type InvitationFeatures,
  type RsvpBlockView,
} from "../../../lib/invitation-features/invitation-features.ts";
import { googleMapsUrl, wazeUrl } from "../../../lib/invitation-features/map-links.ts";
import { MUSIC_SECTION_TITLE, musicButtonLabel } from "../../../lib/invitation-features/music.ts";
import { formatRsvpDeadline } from "../../../lib/invitation-features/rsvp-deadline.ts";
import { startInstant } from "../../../lib/invitation-features/start-instant.ts";
import { whatsappUrl } from "../../../lib/invitation-features/whatsapp.ts";
import { guestPassDataUrl } from "../../../lib/server/guest-pass-qr.ts";
import { DISPLAY_FONT } from "../renderers/themed/theme.ts";
import { CountdownIsland } from "./countdown-island.ts";

/**
 * The features block of a guest invitation (S3, S4, S7): the countdown, «Cómo llegar», «Agregar al calendario»,
 * «Escribir por WhatsApp», and «Escucha nuestra playlist», each shown only when the API gated it for this
 * invitation. One block serves every layout, so the designs show the same behavior, and every color comes from
 * the theme through the CSS variables the layout already sets on its root — the block carries no palette of its
 * own. The gift registry is not here: each layout draws its own block, gated by `features.giftRegistry` (F7).
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

// The RSVP form (M6 G3; S4): one card of the block, its fields drawn only with the theme's variables, and its
// submit the same 44 px accent pill as every other action of the block. It needs no client script at all.
const FORM = "mt-3 flex flex-col gap-3";
const FIELD_LABEL = "block text-sm font-medium text-(color:--inv-ink)";
const FIELD =
  "mt-1.5 block w-full rounded-lg border-[1.5px] border-(--inv-accent) bg-(--inv-surface) px-3 py-2.5 text-base text-(color:--inv-ink) focus:outline-2 focus:outline-offset-2 focus:outline-(--inv-accent)";
const RADIO_LABEL = "flex min-h-11 items-center gap-2 text-base text-(color:--inv-ink)";
const RADIO = "size-4 accent-(--inv-accent)";
const TEXT_AREA = `${FIELD} min-h-24 resize-y`;
/** A field a person never fills: off the screen, out of the tab order, and never autofilled. */
const HONEYPOT = "absolute -left-[9999px] h-px w-px overflow-hidden";
const SUBMIT = `${ACTION} self-start border-0`;

/** The one sentence about the deadline: when answers close, or that they already closed (S4). */
function deadlineSentence(
  rsvp: { readonly deadline: string | null; readonly closed: boolean },
  timeZone: string,
): string | undefined {
  if (rsvp.deadline === null) {
    return undefined;
  }
  const text = formatRsvpDeadline(rsvp.deadline, timeZone);

  if (text === undefined) {
    return rsvp.closed ? RSVP_FORM_COPY.closedGeneric : undefined;
  }
  return rsvp.closed ? RSVP_FORM_COPY.closedNote(text) : RSVP_FORM_COPY.deadlineNote(text);
}

/**
 * The «Confirma tu asistencia» card of one invitation (M6 G3; S1, S4). It shows the form while the invitation
 * accepts open answers and the closing note once its deadline passed. The honeypot is the one field no person
 * sees: a bot that fills it makes the API answer success without storing anything, and the guest never learns a
 * difference. Everything here is server-rendered, so the form works with no JavaScript at all.
 */
function rsvpSection(rsvp: RsvpBlockView, timeZone: string, idPrefix: string): ReactElement {
  const sentence = deadlineSentence(rsvp, timeZone);

  return h(
    "div",
    { key: "rsvp", "data-feature": "rsvp", className: SURFACE_CARD },
    h("h3", { className: FEATURE_TITLE }, RSVP_FORM_COPY.title),
    // The invitation to answer only makes sense while answering is possible.
    ...(rsvp.closed ? [] : [h("p", { key: "hint", className: HINT }, RSVP_FORM_COPY.hint)]),
    ...(sentence === undefined ? [] : [h("p", { key: "deadline", className: HINT }, sentence)]),
    ...(rsvp.closed
      ? []
      : [
          h(
            "form",
            { key: "form", "data-rsvp-form": "", action: rsvp.action, className: FORM },
            h("input", { type: "hidden", name: "slug", value: rsvp.slug }),
            h(
              "div",
              { "aria-hidden": "true", className: HONEYPOT },
              h("label", { htmlFor: `${idPrefix}-rsvp-honeypot` }, RSVP_FORM_COPY.honeypotLabel),
              h("input", {
                id: `${idPrefix}-rsvp-honeypot`,
                name: "honeypot",
                type: "text",
                tabIndex: -1,
                autoComplete: "off",
                "aria-hidden": "true",
              }),
            ),
            h(
              "div",
              null,
              h(
                "label",
                { className: FIELD_LABEL, htmlFor: `${idPrefix}-rsvp-name` },
                RSVP_FORM_COPY.nameLabel,
              ),
              h("input", {
                id: `${idPrefix}-rsvp-name`,
                name: "name",
                type: "text",
                required: true,
                maxLength: 80,
                autoComplete: "name",
                placeholder: RSVP_FORM_COPY.namePlaceholder,
                className: FIELD,
              }),
            ),
            h(
              "fieldset",
              { className: "flex flex-col gap-1" },
              h("legend", { className: FIELD_LABEL }, RSVP_FORM_COPY.attendingLegend),
              h(
                "label",
                { className: RADIO_LABEL, htmlFor: `${idPrefix}-rsvp-yes` },
                h("input", {
                  id: `${idPrefix}-rsvp-yes`,
                  name: "attending",
                  type: "radio",
                  value: "si",
                  required: true,
                  className: RADIO,
                }),
                RSVP_FORM_COPY.attendingYes,
              ),
              h(
                "label",
                { className: RADIO_LABEL, htmlFor: `${idPrefix}-rsvp-no` },
                h("input", {
                  id: `${idPrefix}-rsvp-no`,
                  name: "attending",
                  type: "radio",
                  value: "no",
                  className: RADIO,
                }),
                RSVP_FORM_COPY.attendingNo,
              ),
            ),
            h(
              "div",
              null,
              h(
                "label",
                { className: FIELD_LABEL, htmlFor: `${idPrefix}-rsvp-party` },
                RSVP_FORM_COPY.partyLabel,
              ),
              h(
                "select",
                {
                  id: `${idPrefix}-rsvp-party`,
                  name: "partySize",
                  defaultValue: "1",
                  className: FIELD,
                },
                Array.from({ length: rsvp.partyLimit }, (_unused, index) =>
                  h("option", { key: index + 1, value: String(index + 1) }, String(index + 1)),
                ),
              ),
              h("p", { className: HINT }, RSVP_FORM_COPY.partyHint),
            ),
            h(
              "div",
              null,
              h(
                "label",
                { className: FIELD_LABEL, htmlFor: `${idPrefix}-rsvp-phone` },
                RSVP_FORM_COPY.phoneLabel,
              ),
              h("input", {
                id: `${idPrefix}-rsvp-phone`,
                name: "phone",
                type: "tel",
                inputMode: "tel",
                autoComplete: "tel",
                maxLength: 32,
                className: FIELD,
              }),
              h("p", { className: HINT }, RSVP_FORM_COPY.phoneHint),
            ),
            h(
              "div",
              null,
              h(
                "label",
                { className: FIELD_LABEL, htmlFor: `${idPrefix}-rsvp-message` },
                RSVP_FORM_COPY.messageLabel,
              ),
              h("textarea", {
                id: `${idPrefix}-rsvp-message`,
                name: "message",
                maxLength: 280,
                rows: 3,
                className: TEXT_AREA,
              }),
              h("p", { className: HINT }, RSVP_FORM_COPY.messageHint),
            ),
            h(
              "div",
              { className: ACTIONS },
              h("button", { type: "submit", className: SUBMIT }, RSVP_FORM_COPY.submit),
            ),
          ),
        ]),
  );
}

/** The answer the guest last gave, as one sentence above their card (G4; S4). */
function guestAnswerSentence(rsvp: GuestRsvpBlockView): string {
  if (rsvp.answer === null) {
    return GUEST_PAGE_COPY.answerPending;
  }
  return rsvp.answer.attending
    ? GUEST_PAGE_COPY.answerCurrentYes(rsvp.answer.partySize)
    : GUEST_PAGE_COPY.answerCurrentNo;
}

/**
 * The attendance card of one guest's personal page (M6 G4; S1, S4). It is the open form's card with two differences
 * that matter: it never asks for a name or a phone — the guest record already holds them and the API ignores them in
 * the body — and the party it offers stops at the guest's own seats. There is no honeypot here either: the API counts
 * this answer against the guest's own link, so there is nothing for a bot to fill. Once the deadline passed, the card
 * keeps its place and shows the closing note instead of the form, with the answer the guest already gave.
 */
function guestRsvpSection(
  rsvp: GuestRsvpBlockView,
  timeZone: string,
  idPrefix: string,
): ReactElement {
  const sentence = deadlineSentence(rsvp, timeZone);

  return h(
    "div",
    { key: "guest-rsvp", "data-feature": "guest-rsvp", className: SURFACE_CARD },
    h("h3", { className: FEATURE_TITLE }, GUEST_PAGE_COPY.answerTitle),
    h("p", { key: "current", className: HINT }, guestAnswerSentence(rsvp)),
    ...(rsvp.closed ? [] : [h("p", { key: "hint", className: HINT }, GUEST_PAGE_COPY.answerHint)]),
    ...(sentence === undefined ? [] : [h("p", { key: "deadline", className: HINT }, sentence)]),
    ...(rsvp.closed
      ? []
      : [
          h(
            "form",
            { key: "form", "data-guest-rsvp-form": "", action: rsvp.action, className: FORM },
            h("input", { type: "hidden", name: "slug", value: rsvp.slug }),
            h("input", { type: "hidden", name: "token", value: rsvp.token }),
            h(
              "fieldset",
              { className: "flex flex-col gap-1" },
              h("legend", { className: FIELD_LABEL }, RSVP_FORM_COPY.attendingLegend),
              h(
                "label",
                { className: RADIO_LABEL, htmlFor: `${idPrefix}-guest-yes` },
                h("input", {
                  id: `${idPrefix}-guest-yes`,
                  name: "attending",
                  type: "radio",
                  value: "si",
                  required: true,
                  defaultChecked: rsvp.answer?.attending === true,
                  className: RADIO,
                }),
                RSVP_FORM_COPY.attendingYes,
              ),
              h(
                "label",
                { className: RADIO_LABEL, htmlFor: `${idPrefix}-guest-no` },
                h("input", {
                  id: `${idPrefix}-guest-no`,
                  name: "attending",
                  type: "radio",
                  value: "no",
                  defaultChecked: rsvp.answer?.attending === false,
                  className: RADIO,
                }),
                RSVP_FORM_COPY.attendingNo,
              ),
            ),
            h(
              "div",
              null,
              h(
                "label",
                { className: FIELD_LABEL, htmlFor: `${idPrefix}-guest-party` },
                GUEST_PAGE_COPY.partyLabel,
              ),
              h(
                "select",
                {
                  id: `${idPrefix}-guest-party`,
                  name: "partySize",
                  defaultValue:
                    rsvp.answer?.attending === true ? String(rsvp.answer.partySize) : "1",
                  className: FIELD,
                },
                rsvp.partySizes.map((party) =>
                  h("option", { key: party, value: String(party) }, String(party)),
                ),
              ),
            ),
            h(
              "div",
              null,
              h(
                "label",
                { className: FIELD_LABEL, htmlFor: `${idPrefix}-guest-message` },
                GUEST_PAGE_COPY.messageLabel,
              ),
              h("textarea", {
                id: `${idPrefix}-guest-message`,
                name: "message",
                maxLength: 280,
                rows: 3,
                defaultValue: rsvp.message,
                className: TEXT_AREA,
              }),
              h("p", { className: HINT }, GUEST_PAGE_COPY.messageHint),
            ),
            h(
              "div",
              { className: ACTIONS },
              h("button", { type: "submit", className: SUBMIT }, GUEST_PAGE_COPY.submit),
            ),
          ),
        ]),
  );
}

/**
 * The access pass of a confirmed guest (M6 G4; S4): the SVG QR drawn on the server, handed to an `<img>` as a data
 * URL, so the page injects no markup and the image document cannot run script. A pass whose URL cannot be drawn is
 * not shown at all, instead of breaking the guest's page.
 */
function guestPassSection(pass: GuestPassBlockView): ReactElement | null {
  let source: string;

  try {
    source = guestPassDataUrl(pass.checkInUrl);
  } catch {
    return null;
  }

  return h(
    "div",
    { key: "pass", "data-feature": "pass", className: SURFACE_CARD },
    h("h3", { className: FEATURE_TITLE }, GUEST_PAGE_COPY.passTitle),
    h("p", { className: HINT }, GUEST_PAGE_COPY.passHint),
    h("img", {
      src: source,
      alt: GUEST_PAGE_COPY.passAlt,
      width: 224,
      height: 224,
      className: "mt-3 h-auto w-full max-w-56 rounded-lg",
    }),
  );
}

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

  if (features.music !== null) {
    // One external link that names the service, never an embedded player: the guest page loads no third-party
    // script and the playlists a guest already owns keep their own session (S7).
    sections.push(
      h(
        "div",
        { key: "music", "data-feature": "music", className: SURFACE_CARD },
        h("h3", { className: FEATURE_TITLE }, MUSIC_SECTION_TITLE),
        h("p", { className: HINT }, "La música que elegimos para esta celebración."),
        h(
          "div",
          { className: ACTIONS },
          h(
            "a",
            {
              href: features.music.url,
              target: "_blank",
              rel: "noopener noreferrer",
              className: ACTION,
            },
            musicButtonLabel(features.music.provider),
          ),
        ),
      ),
    );
  }

  // The guest's own block first: their greeting and their seats, before anything else the invitation shows (G4).
  if (features.guest !== undefined) {
    sections.push(
      h(
        "div",
        { key: "guest", "data-feature": "guest", className: SURFACE_CARD },
        h("p", { className: HINT }, features.guest.seats),
      ),
    );
  }

  // Last, after everything a guest might need to decide: the one action of the page (M6 G3; S4).
  if (features.rsvp !== undefined) {
    sections.push(rsvpSection(features.rsvp, features.timeZone, idPrefix));
  }
  if (features.guest?.rsvp !== undefined) {
    sections.push(guestRsvpSection(features.guest.rsvp, features.timeZone, idPrefix));
  }
  if (features.guest?.pass !== undefined) {
    const pass = guestPassSection(features.guest.pass);

    if (pass !== null) {
      sections.push(pass);
    }
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
      features.guest?.greeting ?? "Todo lo que necesitas",
    ),
    sections,
  );
}
