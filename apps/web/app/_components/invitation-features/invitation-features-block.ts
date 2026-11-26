import { createElement, type ReactElement, useId } from "react";

import { GUEST_PAGE_COPY, RSVP_FORM_COPY } from "../../../lib/customer/copy.ts";
import { calendarEventFor, googleCalendarUrl } from "../../../lib/invitation-features/calendar.ts";
import {
  GIFT_REGISTRY_ENVELOPES_LINE,
  GIFT_REGISTRY_SECTION_HINT,
  GIFT_REGISTRY_SECTION_TITLE,
  GIFT_REGISTRY_TRANSFER_TITLE,
  GIFT_REGISTRY_VIEW_STORE,
  GIFT_REGISTRY_VIEW_STORE_ARROW,
  type GiftRegistry,
  clabeGroups,
} from "../../../lib/invitation-features/gift-registry.ts";
import { countdownParts } from "../../../lib/invitation-features/countdown.ts";
import type { EventFacts, EventPlace } from "../../../lib/invitation-features/event-facts.ts";
import {
  GALLERY_SECTION_HINT,
  GALLERY_SECTION_TITLE,
  type GalleryPhoto,
  galleryPhotoAlt,
} from "../../../lib/invitation-features/gallery.ts";
import {
  type GuestPassBlockView,
  type GuestRsvpBlockView,
  hasAnyFeature,
  type InvitationFeatures,
  type RsvpBlockView,
} from "../../../lib/invitation-features/invitation-features.ts";
import {
  ITINERARY_DIRECTIONS_LABEL,
  ITINERARY_SECTION_HINT,
  ITINERARY_SECTION_TITLE,
  type ItineraryMoment,
  itineraryDirectionsUrl,
} from "../../../lib/invitation-features/itinerary.ts";
import {
  LODGING_BOOK_LABEL,
  LODGING_DIRECTIONS_LABEL,
  LODGING_GROUP_CODE_LABEL,
  LODGING_SECTION_HINT,
  LODGING_SECTION_KICKER,
  LODGING_SECTION_TITLE,
  LODGING_TRANSPORT_TITLE,
  type Lodging,
  type LodgingHotel,
  lodgingDirectionsUrl,
  lodgingHasContent,
} from "../../../lib/invitation-features/lodging.ts";
import {
  googleMapsUrl,
  type MapPlace,
  wazeUrl,
} from "../../../lib/invitation-features/map-links.ts";
import {
  MUSIC_COVER_ALT,
  MUSIC_SECTION_TITLE,
  musicButtonLabel,
} from "../../../lib/invitation-features/music.ts";
import { storedPlaceOf } from "../../../lib/invitation-features/place-point.ts";
import {
  companionChildField,
  companionNameField,
  RSVP_COMPANION_NAME_MAX_LENGTH,
  RSVP_COMPANIONS_MAX,
  RSVP_DIETARY_NOTES_MAX_LENGTH,
  type RsvpCompanionValue,
} from "../../../lib/public/rsvp-companions.ts";
import { formatRsvpDeadline } from "../../../lib/invitation-features/rsvp-deadline.ts";
import { startInstant } from "../../../lib/invitation-features/start-instant.ts";
import { whatsappUrl } from "../../../lib/invitation-features/whatsapp.ts";
import { guestPassDataUrl } from "../../../lib/server/guest-pass-qr.ts";
import { DISPLAY_FONT } from "../renderers/themed/theme.ts";
import { CompanionRowsIsland } from "./companion-rows-island.ts";
import { CopyClabeIsland } from "./copy-clabe-island.ts";
import { CountdownIsland } from "./countdown-island.ts";
import { type MapMarker, PlaceMapIsland } from "./place-map-island.ts";

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
/** The playlist cover: square, rounded like the card, and never wider than the card itself (S2). */
const MUSIC_COVER = "mt-3 aspect-square w-full max-w-[18rem] rounded-xl object-cover";
/** The playlist title the provider named, in the card's own ink (S2). */
const MUSIC_TITLE = "mt-2 text-lg leading-tight font-medium break-words text-(color:--inv-ink)";

// The gift registry card (F2; L4.5): one row per store on the theme's soft surface, the link in the accent with a 44 px
// tap target, and the transfer rows on the card itself, separated by a dashed line in the theme's decoration color.
const STORE_LIST = "mt-3 flex flex-col gap-2.5";
const STORE_ROW =
  "flex items-center justify-between gap-3 rounded-xl bg-(--inv-soft) px-4 py-3.5 ring-1 ring-inset ring-(--inv-soft)";
const STORE_NAME = "text-base leading-tight font-medium break-words text-(color:--inv-ink)";
const STORE_REFERENCE = "mt-0.5 text-sm break-words text-(color:--inv-ink)";
const STORE_LINK =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center text-sm font-medium text-(color:--inv-accent) underline underline-offset-4";
const TRANSFER_BLOCK = "mt-4 border-t border-dashed border-(--inv-decoration-one) pt-4";
const TRANSFER_TITLE = "text-center text-xl font-medium text-(color:--inv-ink)";
const TRANSFER_ROW = "flex items-baseline justify-between gap-3 py-1.5 text-sm";
const TRANSFER_LABEL = "text-(color:--inv-ink)";
const TRANSFER_VALUE = "text-right font-medium break-words text-(color:--inv-ink)";
/** The CLABE reads in groups of four; the number is the value the copy button hands over. */
const TRANSFER_CLABE = "text-right font-medium break-all text-(color:--inv-ink) tabular-nums";
const NOTE = "mt-4 text-sm leading-6 break-words text-(color:--inv-ink)";

// The lodging cards (F4; L7.5): the name and its distance badge on one line, the address and price under it, the group
// code on the theme's soft surface, and the two actions as pills — the accent one for the booking link and the outlined
// one for the maps search, exactly the artboard's pair.
const HOTEL_NAME = "text-base leading-tight font-medium break-words text-(color:--inv-ink)";
/** The distance badge: the accent on the soft surface, never the only cue for anything (L7.5). */
const HOTEL_BADGE =
  "shrink-0 rounded-full bg-(--inv-soft) px-2.5 py-0.5 text-[0.7rem] font-medium text-(color:--inv-accent)";
const HOTEL_LINE = "mt-1.5 text-sm leading-6 break-words text-(color:--inv-ink)";
const HOTEL_GROUP_CODE =
  "mt-2.5 flex items-baseline justify-between gap-3 rounded-xl bg-(--inv-background) px-3 py-2 text-sm text-(color:--inv-ink)";
const HOTEL_GROUP_CODE_VALUE = "font-medium tracking-[0.06em] break-all text-(color:--inv-ink)";
const HOTEL_ACTIONS = "mt-3 flex flex-wrap gap-2";
const HOTEL_BOOK_ACTION =
  "inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-full bg-(--inv-accent) px-5 text-sm font-medium text-(color:--inv-on-accent)";
const HOTEL_DIRECTIONS_ACTION =
  "inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-full px-5 text-sm font-medium text-(color:--inv-accent) ring-2 ring-inset ring-(--inv-accent)";

// The timeline of the day (F1; L3.5): the time in the display face, the dot on the theme's accent, and the connector
// in the theme's decoration color. The grid keeps the three columns aligned on every row, so a long title wraps
// without pushing the time or the line away.
const TIMELINE = "mt-3 flex flex-col gap-4";
const TIMELINE_ROW = "grid grid-cols-[3.25rem_1rem_1fr] items-start gap-3";
const TIMELINE_TIME =
  "text-right text-lg leading-tight font-medium text-(color:--inv-ink) tabular-nums";
const TIMELINE_RAIL = "flex flex-col items-center self-stretch";
const TIMELINE_DOT = "size-3 shrink-0 rounded-full bg-(--inv-surface) ring-2 ring-(--inv-accent)";
/** The filled dot of the first moment: the timeline's start, named for a reader that cannot see the fill. */
const TIMELINE_DOT_FIRST = "size-3 shrink-0 rounded-full bg-(--inv-accent)";
const TIMELINE_LINE = "mt-1 w-px flex-1 bg-(--inv-decoration-one)";
const TIMELINE_TITLE = "text-base leading-tight font-medium break-words text-(color:--inv-ink)";
const TIMELINE_PLACE = "mt-0.5 text-sm text-(color:--inv-ink)";
/** The directions link keeps the theme's accent and a 44 px tap target, so it reads as an action, not as body text. */
const TIMELINE_LINK =
  "mt-1 inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-(color:--inv-accent) underline underline-offset-4";

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

// The companion rows of F3 (L6.3): one row per extra person, the name on the theme's surface and the «Niño» mark on its
// own line, so a phone never has to fit both in one line. The rows the party does not cover are hidden and disabled by
// the island once the page is interactive; without script they all stay visible and the answer keeps the ones it needs.
const COMPANION_FIELDSET =
  "mt-1 flex flex-col gap-2 border-t border-dashed border-(--inv-decoration-one) pt-3";
const COMPANION_ROW = "grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3";
const COMPANION_CHILD = `${RADIO_LABEL} whitespace-nowrap`;
const DIETARY_AREA = `${FIELD} min-h-16 resize-y`;

/**
 * The companion rows of one RSVP card (F3; S2.3, L6.1, L6.3): the names of the people who come with the guest and, next
 * to each one, whether they are a child — which is what the creator's totals and exports count apart. The rows are
 * rendered up to the party's own limit, and every one of them is labelled, so the card is usable with no client script
 * and with a screen reader. A row keeps the answer the guest already gave when there is one.
 */
function companionRows(
  key: "rsvp" | "guest",
  covered: number,
  idPrefix: string,
  current: readonly RsvpCompanionValue[],
): ReactElement | null {
  if (covered < 1) {
    return null;
  }
  const rows = Array.from(
    { length: Math.min(covered, RSVP_COMPANIONS_MAX) },
    (_unused, index) => index + 1,
  );

  return h(
    "fieldset",
    {
      key: `${key}-companions`,
      id: `${idPrefix}-${key}-companions`,
      "data-companion-rows": "",
      className: COMPANION_FIELDSET,
    },
    h("legend", { className: FIELD_LABEL }, RSVP_FORM_COPY.companionsLegend),
    h("p", { className: HINT }, RSVP_FORM_COPY.companionsHint),
    ...rows.map((row) => {
      const nameId = `${idPrefix}-${key}-companion-${row}-name`;
      const childId = `${idPrefix}-${key}-companion-${row}-child`;

      return h(
        "div",
        { key: row, "data-companion-row": row, className: COMPANION_ROW },
        h(
          "div",
          null,
          h("label", { className: FIELD_LABEL, htmlFor: nameId }, RSVP_FORM_COPY.companionRow(row)),
          h("input", {
            id: nameId,
            name: companionNameField(row),
            type: "text",
            maxLength: RSVP_COMPANION_NAME_MAX_LENGTH,
            autoComplete: "off",
            placeholder: RSVP_FORM_COPY.companionNamePlaceholder,
            defaultValue: current[row - 1]?.name ?? "",
            className: FIELD,
          }),
        ),
        h(
          "label",
          { className: COMPANION_CHILD, htmlFor: childId },
          h("input", {
            id: childId,
            name: companionChildField(row),
            type: "checkbox",
            defaultChecked: current[row - 1]?.child === true,
            className: RADIO,
          }),
          RSVP_FORM_COPY.companionChildLabel,
        ),
      );
    }),
  );
}

/** The dietary restrictions of the party (F3; L6.1): one bounded text, prefilled with the last answer. */
function dietaryNotesField(idPrefix: string, key: "rsvp" | "guest", value: string): ReactElement {
  const id = `${idPrefix}-${key}-dietary-notes`;

  return h(
    "div",
    { key: `${key}-dietary`, className: "mt-3" },
    h("label", { className: FIELD_LABEL, htmlFor: id }, RSVP_FORM_COPY.dietaryLabel),
    h("textarea", {
      id,
      name: "dietaryNotes",
      maxLength: RSVP_DIETARY_NOTES_MAX_LENGTH,
      rows: 2,
      defaultValue: value,
      className: DIETARY_AREA,
    }),
    h("p", { className: HINT }, RSVP_FORM_COPY.dietaryHint),
  );
}

/**
 * The one sentence about the deadline: when answers close, or that they already closed (S4). A card closed without a
 * deadline — an expired invitation, whose own deadline may still be ahead — still says the answers closed (S2, T5).
 */
function deadlineSentence(
  rsvp: { readonly deadline: string | null; readonly closed: boolean },
  timeZone: string,
): string | undefined {
  if (rsvp.deadline === null) {
    return rsvp.closed ? RSVP_FORM_COPY.closedGeneric : undefined;
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
            h("p", { className: HINT }, RSVP_FORM_COPY.partyLimitNote(rsvp.partyLimit)),
            companionRows("rsvp", rsvp.partyLimit - 1, idPrefix, []),
            dietaryNotesField(idPrefix, "rsvp", ""),
            h(CompanionRowsIsland, {
              selectId: `${idPrefix}-rsvp-party`,
              rowsId: `${idPrefix}-rsvp-companions`,
            }),
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
            h("p", { className: HINT }, RSVP_FORM_COPY.partyLimitNote(rsvp.seats)),
            companionRows("guest", rsvp.seats - 1, idPrefix, rsvp.companions),
            dietaryNotesField(idPrefix, "guest", rsvp.dietaryNotes),
            h(CompanionRowsIsland, {
              selectId: `${idPrefix}-guest-party`,
              rowsId: `${idPrefix}-guest-companions`,
            }),
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
 * The gallery of one invitation (M8 S3, S4): a responsive grid — two columns on a phone, three from the small
 * breakpoint up — of the photos the API answered, in the creator's order. Every image reserves the dimensions the API
 * stored, so the page does not jump while the photos load, and it loads lazily and decodes off the main thread. Each
 * photo links to its full image in a new tab without handing the opener to the other document, and there is no client
 * script at all: the grid is plain markup over the theme's own variables.
 */
function gallerySection(photos: readonly GalleryPhoto[]): ReactElement {
  return h(
    "div",
    { key: "gallery", "data-feature": "gallery", className: SURFACE_CARD },
    h("h3", { className: FEATURE_TITLE }, GALLERY_SECTION_TITLE),
    h("p", { className: HINT }, GALLERY_SECTION_HINT),
    h(
      "div",
      {
        "data-gallery-grid": "",
        className: "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3",
      },
      photos.map((photo) =>
        h(
          "a",
          {
            key: photo.url,
            href: photo.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "block overflow-hidden rounded-lg ring-1 ring-(--inv-soft)",
          },
          h("img", {
            src: photo.url,
            alt: galleryPhotoAlt(photo.alt),
            width: photo.width,
            height: photo.height,
            loading: "lazy",
            decoding: "async",
            className: "h-auto w-full",
          }),
        ),
      ),
    ),
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

/**
 * The lodging and transport (F4; L7.5): one card per hotel, in the order the owner stored, with the distance as a badge,
 * the address and the price line, the group code on its own row, and the two actions — «Reservar» opens the booking link
 * in a new tab without handing the opener over, and «Cómo llegar» searches the address in Google Maps. Then the
 * transport card, which a transport line alone still shows. Every text is React's own text node, so the owner's words
 * are escaped and nothing they typed can become markup.
 */
function lodgingSection(lodging: Lodging): ReactElement {
  const hotelCards = lodging.hotels.map((hotel, index) => lodgingHotelCard(hotel, index));

  return h(
    "div",
    { key: "lodging", "data-feature": "lodging", className: SURFACE_CARD },
    h("p", { className: FEATURE_TITLE }, LODGING_SECTION_KICKER),
    h(
      "h3",
      { className: "mt-1 text-center text-2xl font-medium text-(color:--inv-ink)" },
      LODGING_SECTION_TITLE,
    ),
    h("p", { className: HINT }, LODGING_SECTION_HINT),
    hotelCards.length === 0
      ? null
      : h("div", { className: "mt-3 flex flex-col gap-2.5" }, hotelCards),
    lodging.transport === null
      ? null
      : h(
          "div",
          {
            key: "lodging-transport",
            "data-feature": "lodging-transport",
            className: "mt-2.5 rounded-2xl bg-(--inv-surface) p-4",
          },
          h(
            "h4",
            { className: "text-xl font-medium text-(color:--inv-ink)" },
            LODGING_TRANSPORT_TITLE,
          ),
          h("p", { className: HINT }, lodging.transport),
        ),
  );
}

/** One hotel card of the lodging section: the badge, the address and price line, the code, and the two actions. */
function lodgingHotelCard(hotel: LodgingHotel, index: number): ReactElement {
  const addressAndPrice = [hotel.address, hotel.price].filter(
    (text): text is string => text !== undefined,
  );
  const actions: ReactElement[] = [];

  if (hotel.bookingUrl !== undefined) {
    actions.push(
      h(
        "a",
        {
          key: "book",
          href: hotel.bookingUrl,
          target: "_blank",
          rel: "noopener noreferrer",
          "aria-label": `${LODGING_BOOK_LABEL} en ${hotel.name} en una pestaña nueva`,
          className: HOTEL_BOOK_ACTION,
        },
        LODGING_BOOK_LABEL,
      ),
    );
  }
  if (hotel.address !== undefined) {
    actions.push(
      h(
        "a",
        {
          key: "directions",
          href: lodgingDirectionsUrl(hotel.address),
          target: "_blank",
          rel: "noopener noreferrer",
          "aria-label": `${LODGING_DIRECTIONS_LABEL} a ${hotel.name} en Google Maps`,
          className: HOTEL_DIRECTIONS_ACTION,
        },
        LODGING_DIRECTIONS_LABEL,
      ),
    );
  }

  return h(
    "div",
    {
      key: `${index}-${hotel.name}`,
      "data-hotel": hotel.name,
      className: "rounded-2xl bg-(--inv-soft) p-4",
    },
    h(
      "div",
      { className: "flex items-baseline justify-between gap-3" },
      h("p", { className: HOTEL_NAME }, hotel.name),
      hotel.distance === undefined ? null : h("span", { className: HOTEL_BADGE }, hotel.distance),
    ),
    addressAndPrice.length === 0
      ? null
      : h("p", { className: HOTEL_LINE }, addressAndPrice.join(" · ")),
    hotel.groupCode === undefined
      ? null
      : h(
          "div",
          { className: HOTEL_GROUP_CODE, "data-hotel-group-code": hotel.groupCode },
          h("span", null, LODGING_GROUP_CODE_LABEL),
          h("span", { className: HOTEL_GROUP_CODE_VALUE }, hotel.groupCode),
        ),
    actions.length === 0 ? null : h("div", { className: HOTEL_ACTIONS }, actions),
  );
}

/**
 * The plan of the day (F1; L3.5): one row per moment, in the order the owner stored, with the first moment's dot filled
 * so the timeline has a start. A moment with an address offers «Cómo llegar» as a Google Maps search of that address;
 * a moment without one offers no link, because a title is not a destination anyone can navigate to.
 */
function itinerarySection(moments: readonly ItineraryMoment[]): ReactElement {
  return h(
    "div",
    { key: "itinerary", "data-feature": "itinerary", className: SURFACE_CARD },
    h("h3", { className: FEATURE_TITLE }, ITINERARY_SECTION_TITLE),
    h("p", { className: HINT }, ITINERARY_SECTION_HINT),
    h(
      "ol",
      { className: TIMELINE },
      moments.map((moment, index) =>
        h(
          "li",
          { key: `${index}-${moment.time}`, "data-moment": moment.time, className: TIMELINE_ROW },
          h("time", { className: TIMELINE_TIME, dateTime: moment.time }, moment.time),
          h(
            "span",
            { className: TIMELINE_RAIL },
            index === 0
              ? h("span", {
                  "aria-label": "Primer momento",
                  role: "img",
                  className: TIMELINE_DOT_FIRST,
                })
              : h("span", { "aria-hidden": "true", className: TIMELINE_DOT }),
            // The last row ends the line: nothing follows it, so the connector stops at the last dot.
            index === moments.length - 1
              ? null
              : h("span", { "aria-hidden": "true", className: TIMELINE_LINE }),
          ),
          h(
            "div",
            { className: "flex flex-col" },
            h("p", { className: TIMELINE_TITLE }, moment.title),
            moment.place === undefined ? null : h("p", { className: TIMELINE_PLACE }, moment.place),
            moment.address === undefined
              ? null
              : h("p", { className: TIMELINE_PLACE }, moment.address),
            moment.address === undefined
              ? null
              : h(
                  "a",
                  {
                    href: itineraryDirectionsUrl(moment.address),
                    target: "_blank",
                    rel: "noopener noreferrer",
                    "aria-label": `${ITINERARY_DIRECTIONS_LABEL} a ${moment.title} en Google Maps`,
                    className: TIMELINE_LINK,
                  },
                  ITINERARY_DIRECTIONS_LABEL,
                ),
          ),
        ),
      ),
    ),
  );
}

/**
 * The gift registry (F2; L4.5): one row per store, in the order the owner stored, with its reference and the «Ver mesa →»
 * link that opens it in a new tab without handing the opener over; then the transfer block with the bank, the holder,
 * and the CLABE grouped for reading next to its «Copiar CLABE» button; the envelopes line when the owner switched it
 * on; and the note. Every text is React's own text node, so the owner's words are escaped and nothing they typed can
 * become markup.
 */
function giftRegistrySection(registry: GiftRegistry, idPrefix: string): ReactElement {
  const transfer = registry.transfer;
  const clabeId = `${idPrefix}-gift-clabe`;
  const stores =
    registry.stores.length === 0
      ? null
      : h(
          "ul",
          { "data-gift-stores": "", className: STORE_LIST },
          registry.stores.map((store, index) =>
            h(
              "li",
              { key: `${index}-${store.url}`, "data-gift-store": store.name, className: STORE_ROW },
              h(
                "div",
                { className: "flex min-w-0 flex-col" },
                h("p", { className: STORE_NAME }, store.name),
                store.reference === undefined
                  ? null
                  : h("p", { className: STORE_REFERENCE }, store.reference),
              ),
              h(
                "a",
                {
                  href: store.url,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  "aria-label": `${GIFT_REGISTRY_VIEW_STORE} de ${store.name} en una pestaña nueva`,
                  className: STORE_LINK,
                },
                `${GIFT_REGISTRY_VIEW_STORE} ${GIFT_REGISTRY_VIEW_STORE_ARROW}`,
              ),
            ),
          ),
        );

  return h(
    "div",
    { key: "gift-registry", "data-feature": "gift-registry", className: SURFACE_CARD },
    h("h3", { className: FEATURE_TITLE }, GIFT_REGISTRY_SECTION_TITLE),
    h("p", { className: HINT }, GIFT_REGISTRY_SECTION_HINT),
    stores,
    transfer === null
      ? null
      : h(
          "div",
          { "data-gift-transfer": "", className: TRANSFER_BLOCK },
          h("h4", { className: TRANSFER_TITLE }, GIFT_REGISTRY_TRANSFER_TITLE),
          h(
            "dl",
            { className: "mt-1" },
            h(
              "div",
              { className: TRANSFER_ROW },
              h("dt", { className: TRANSFER_LABEL }, "Banco"),
              h("dd", { className: TRANSFER_VALUE }, transfer.bank),
            ),
            h(
              "div",
              { className: TRANSFER_ROW },
              h("dt", { className: TRANSFER_LABEL }, "Titular"),
              h("dd", { className: TRANSFER_VALUE }, transfer.holder),
            ),
            h(
              "div",
              { className: TRANSFER_ROW },
              h("dt", { className: TRANSFER_LABEL }, "CLABE"),
              h(
                "dd",
                {
                  id: clabeId,
                  className: TRANSFER_CLABE,
                  // The compact digits the copy button hands over, which the row above shows grouped for reading.
                  "data-clabe": transfer.clabe,
                },
                clabeGroups(transfer.clabe),
              ),
            ),
          ),
          // The island takes the compact digits and the id of the element it selects, so both travel as plain strings.
          h(CopyClabeIsland, { clabe: transfer.clabe, clabeId }),
        ),
    registry.envelopes ? h("p", { className: NOTE }, GIFT_REGISTRY_ENVELOPES_LINE) : null,
    registry.note === null ? null : h("p", { className: NOTE }, registry.note),
  );
}

/**
 * The place as the links and the map read it: the layout's words plus the point the owner confirmed for that address
 * field, when there is one (S1, S2). A place whose field stored no point keeps exactly the text links it had.
 */
function mapPlace(place: EventPlace, places: InvitationFeatures["places"]): MapPlace {
  const point = storedPlaceOf(places, place.field);

  return point === undefined
    ? place
    : { name: place.name, address: place.address, lat: point.lat, lng: point.lng };
}

/** The two «Cómo llegar» actions of one place, each with the accessible name that names its service. */
function placeLinks(place: MapPlace): ReactElement {
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

  // The plan of the day comes right after the countdown: what is left to wait for, and then what happens when it starts.
  if (features.itinerary !== undefined && features.itinerary.length > 0) {
    sections.push(itinerarySection(features.itinerary));
  }

  // The gift registry follows the plan: where to look once a guest knows when the celebration starts (F2; L4.5).
  if (features.giftRegistryDetails !== undefined) {
    sections.push(giftRegistrySection(features.giftRegistryDetails, idPrefix));
  }

  // The lodging follows the gifts: where to sleep and how to move, once a guest knows the day and the presents (F4).
  if (features.lodging !== undefined && lodgingHasContent(features.lodging)) {
    sections.push(lodgingSection(features.lodging));
  }

  if (features.map) {
    const places = facts.places.map((place) => mapPlace(place, features.places));
    // One marker per place that has a confirmed point. A package without a point renders no map at all, and the links
    // stay the only way to the place, exactly as before this slice (S1, S2).
    const markers: MapMarker[] = facts.places.flatMap((place, index) => {
      const point = places[index];

      return point?.lat === undefined || point.lng === undefined
        ? []
        : [{ label: place.label, name: place.name, lat: point.lat, lng: point.lng }];
    });

    sections.push(
      h(
        "div",
        { key: "map", "data-feature": "map", className: SURFACE_CARD },
        h("h3", { className: FEATURE_TITLE }, "Cómo llegar"),
        h(
          "ul",
          { className: "mt-3 flex flex-col gap-3" },
          facts.places.map((place, index) =>
            h(
              "li",
              { key: `${place.label}-${place.name}`, "data-place": place.label, className: PLACE },
              h("p", { className: PLACE_LABEL }, place.label),
              h("p", { className: PLACE_NAME, style: DISPLAY_FONT }, place.name),
              h("p", { className: PLACE_ADDRESS }, place.address),
              placeLinks(places[index] ?? place),
            ),
          ),
        ),
        markers.length === 0 ? null : h(PlaceMapIsland, { places: markers }),
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
    // script and the playlists a guest already owns keep their own session (S7). The cover the API stored is a plain
    // image the browser loads lazily from the provider's CDN, with no referrer (`referrerPolicy`), and no
    // cover renders today's card unchanged (S2).
    const cover = features.music.coverUrl;
    const title = features.music.title;

    sections.push(
      h(
        "div",
        { key: "music", "data-feature": "music", className: SURFACE_CARD },
        h("h3", { className: FEATURE_TITLE }, MUSIC_SECTION_TITLE),
        cover === undefined
          ? null
          : h("img", {
              src: cover,
              // The dimensions a provider cover has, so the card reserves its space before the image arrives.
              width: 300,
              height: 300,
              loading: "lazy",
              alt: title ?? MUSIC_COVER_ALT,
              // React's camel-case property for the `referrerpolicy` attribute: the CDN learns nothing about where
              // the guest came from (S2).
              referrerPolicy: "no-referrer",
              className: MUSIC_COVER,
            }),
        title === undefined ? null : h("p", { className: MUSIC_TITLE }, title),
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

  // The creator's own photos, before the guest's own cards: nothing to decide, so they never push an action away.
  if (features.gallery !== undefined && features.gallery.length > 0) {
    sections.push(gallerySection(features.gallery));
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
