import { createElement, type ReactElement, useId } from "react";
import { birthdayPosterEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import type { Locale } from "../../../../lib/i18n/locale.ts";
import {
  rendererAgeLabel,
  rendererAgeUnit,
  rendererClockTime,
  rendererLongDate,
  rendererTextsFor,
  rendererWallClock,
} from "../../../../lib/i18n/renderer-texts.ts";
import {
  parseBirthdayPosterConfiguration,
  parseBirthdayPosterContent,
} from "../../../../lib/renderers/birthday-poster-01.ts";
import { BIRTHDAY_THEME } from "../../../../lib/renderers/birthday-themes.ts";
import { hiddenFieldSet } from "../../../../lib/renderers/invitation-fields.ts";
import { InvitationFeaturesBlock } from "../../invitation-features/invitation-features-block.ts";
import { Motif } from "../birthday/motif.ts";
import { DISPLAY_FONT, INVITATION_ROOT, themeStyle, titleStyle } from "../birthday/theme.ts";
import { DecorationZone } from "../illustrations/decoration.ts";

/*
 * The `birthday-poster-01` invitation — «Cartel de fiesta» (T6b; S2, S7, S8), following
 * `design/birthday-adventure-v2/02-cartel-fiesta.html`: an accent band with the name and the outlined age, a
 * polaroid of the celebrant overlapping it, the details as an admission ticket with a time stub, and the
 * message as a speech bubble. A server component with no client script: `.ts` + `createElement` because
 * `node --test` strips types but does not compile JSX.
 *
 * Decoration (I3a; S4): the accent band opens with the theme's paper-cut diorama, a torn strip separates the
 * message from what precedes it, and a footer strip closes the page; a theme without an illustration keeps the
 * motif strip this layout drew before, in the band's empty top row.
 */

export interface BirthdayPosterRendererProps {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
  /** The features the API gated for this invitation; absent when it has none, which renders nothing. */
  readonly features?: InvitationFeatures;
  /** The `.ics` download the public page owns; absent leaves the Google Calendar link alone. */
  readonly calendarHref?: string;
  /** The content fields of the sections this customer switched off (S8.3); absent hides nothing. */
  readonly hiddenFields?: readonly string[];
  /** The locale the guest page renders (F14; L19.2); absent reads as Spanish. */
  readonly locale?: Locale;
}

const h = createElement;

const SECTION_TITLE =
  "text-center text-xs font-medium uppercase tracking-[0.16em] text-(color:--inv-accent)";
const TICKET_LABEL =
  "text-[0.7rem] font-medium uppercase tracking-[0.14em] text-(color:--inv-accent)";

const TICKET_VALUE = "text-lg font-medium leading-tight text-(color:--inv-ink)";

/** The ticket notches of the artboard, centered on the perforation at the stub's top and bottom edges. */
const TICKET_NOTCHES = ["-top-2", "-bottom-2"] as const;

export function BirthdayPosterRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
  locale,
}: BirthdayPosterRendererProps): ReactElement {
  const { theme: themeKey } = parseBirthdayPosterConfiguration(configuration);
  const data = parseBirthdayPosterContent(content, hiddenFields);
  const hidden = hiddenFieldSet(hiddenFields);
  const theme = BIRTHDAY_THEME[themeKey];
  const idPrefix = useId();
  const texts = rendererTextsFor(locale);

  // After the admission ticket and before the message: the details, then what a guest can act on (S4).
  const featuresBlock =
    features === undefined
      ? null
      : h(InvitationFeaturesBlock, {
          features,
          facts: birthdayPosterEventFacts(data, hiddenFields, locale),
          ...(calendarHref === undefined ? {} : { calendarHref }),
          ...(locale === undefined ? {} : { locale }),
        });

  return h(
    "article",
    {
      "aria-label": `${texts["birthday.ariaInvitation"]} ${data.celebrantName}`,
      "data-component-key": "birthday-poster-01",
      "data-theme": themeKey,
      className: INVITATION_ROOT,
      style: themeStyle(theme),
    },
    // The theme background must paint the page, not only a centred column: the guest `<main>` is `isolate`,
    // so a viewport-sized layer at `-z-10` stays behind this invitation's content and above the site paper.
    h("div", {
      "aria-hidden": "true",
      "data-invitation-background": "",
      className: "pointer-events-none fixed inset-0 -z-10 bg-(--inv-background)",
    }),
    h(
      "div",
      {
        className: "relative overflow-hidden bg-(--inv-accent) text-(color:--inv-on-accent)",
        style: { borderRadius: "0 0 50% 50% / 0 0 2.25rem 2.25rem" },
      },
      // The band's motif is its own row above the hero text: the band's bottom is covered by the polaroid,
      // and an overlay would put decoration behind the name. The theme illustration takes that row as a
      // full-width diorama on the band's accent, exactly as the artboard draws it.
      h(DecorationZone, {
        theme: themeKey,
        part: "scene",
        illustrationClassName: "pointer-events-none block",
        fallback: {
          node: h(Motif, { motif: theme.motif, tone: "accent" }),
          className: "pointer-events-none flex h-16 justify-center px-6 pt-4",
        },
      }),
      h(
        "section",
        {
          "data-section": "hero",
          "aria-labelledby": `${idPrefix}-hero`,
          className: "relative px-6 pt-2 pb-32 text-center",
        },
        h(
          "div",
          { className: "relative flex flex-col items-center" },
          h(
            "p",
            { className: "text-sm font-medium uppercase tracking-[0.18em]" },
            texts["birthday.posterKicker"],
          ),
          h(
            "h1",
            {
              id: `${idPrefix}-hero`,
              className: "mt-2 break-words",
              style: titleStyle(theme),
            },
            data.celebrantName,
          ),
          data.age === undefined
            ? null
            : h(
                "p",
                {
                  "aria-label": rendererAgeLabel(locale, data.age),
                  className: "mt-1 flex items-center justify-center gap-3",
                },
                h(
                  "b",
                  {
                    "aria-hidden": "true",
                    className: "text-7xl leading-none",
                    style: {
                      ...DISPLAY_FONT,
                      color: "transparent",
                      WebkitTextStroke: "3px var(--inv-on-accent)",
                    },
                  },
                  String(data.age),
                ),
                h(
                  "span",
                  {
                    "aria-hidden": "true",
                    className: "text-left text-lg font-medium leading-tight",
                  },
                  rendererAgeUnit(locale, data.age),
                  h("br"),
                  texts["birthday.posterLaughs"],
                ),
              ),
        ),
      ),
    ),
    data.mainPhoto === undefined
      ? null
      : h(
          "figure",
          {
            className: "-mt-32 w-[15.5rem] self-center bg-(--inv-surface) px-3 pt-3 pb-3 shadow-xl",
            style: { transform: "rotate(3deg)" },
          },
          h("img", {
            src: data.mainPhoto,
            alt: `${texts["invitation.photoAlt"]} ${data.celebrantName}`,
            decoding: "async",
            className: "block aspect-square w-full object-cover",
          }),
          // In flow under the photo: a long name wraps and grows the polaroid instead of covering the picture.
          h(
            "figcaption",
            {
              className:
                "mt-2 break-words px-1 text-center text-base font-medium text-(color:--inv-accent)",
            },
            texts["birthday.posterNameCheer"].replace("{name}", data.celebrantName),
          ),
        ),
    h(
      "div",
      { className: "flex flex-col gap-8 px-5 pt-7 pb-6" },
      h(
        "section",
        { "data-section": "details", "aria-labelledby": `${idPrefix}-details` },
        h(
          "h2",
          { id: `${idPrefix}-details`, className: SECTION_TITLE },
          texts["birthday.ticketTitle"],
        ),
        h(
          "div",
          {
            className: "mt-3 grid grid-cols-[1fr_auto] rounded-2xl bg-(--inv-surface) shadow-sm",
          },
          h(
            "dl",
            { className: "flex flex-col gap-3 p-4" },
            h(
              "div",
              null,
              h("dt", { className: TICKET_LABEL }, texts["label.date"]),
              h(
                "dd",
                { className: TICKET_VALUE },
                h("time", { dateTime: data.date }, rendererLongDate(locale, data.date)),
              ),
            ),
            h(
              "div",
              null,
              h("dt", { className: TICKET_LABEL }, texts["label.place"]),
              h(
                "dd",
                { className: TICKET_VALUE },
                data.location,
                h("small", { className: "mt-0.5 block text-sm font-normal" }, data.address),
              ),
            ),
          ),
          h(
            "div",
            {
              "aria-label": `${texts["label.time"]}: ${rendererClockTime(locale, data.time)}`,
              "data-time-stub": "",
              className:
                "relative grid shrink-0 place-content-center rounded-r-2xl whitespace-nowrap border-l-4 border-dotted border-(color:--inv-ink)/35 bg-(--inv-soft) px-3 py-3 text-center",
            },
            // The admission-ticket notches ride on the perforation, so they follow the stub's own width.
            TICKET_NOTCHES.map((position) =>
              h("span", {
                key: position,
                "aria-hidden": "true",
                "data-ticket-notch": "",
                className: `absolute -left-2 ${position} size-4 rounded-full bg-(--inv-background)`,
              }),
            ),
            h(
              "b",
              {
                "aria-hidden": "true",
                className: "whitespace-nowrap text-base leading-none text-(color:--inv-accent)",
                style: DISPLAY_FONT,
              },
              rendererWallClock(locale, data.time),
            ),
            h(
              "span",
              { "aria-hidden": "true", className: "text-xs font-medium" },
              texts["birthday.ticketHours"],
            ),
          ),
        ),
      ),
      featuresBlock,
      h(DecorationZone, {
        theme: themeKey,
        part: "divider",
        illustrationClassName: "pointer-events-none -mx-5 block",
      }),
      hidden.has("message")
        ? null
        : h(
            "section",
            { "data-section": "message", "aria-labelledby": `${idPrefix}-message` },
            h(
              "h2",
              { id: `${idPrefix}-message`, className: SECTION_TITLE },
              texts["invitation.message"],
            ),
            h(
              "div",
              {
                className:
                  "relative mt-3 rounded-3xl bg-(--inv-soft) px-5 py-4 text-lg leading-relaxed text-(color:--inv-ink)",
              },
              h("span", {
                "aria-hidden": "true",
                "data-bubble-tail": "",
                className: "absolute -bottom-3 left-10 size-7",
                style: {
                  backgroundColor: "var(--inv-soft)",
                  clipPath: "polygon(0 0, 100% 0, 0 100%)",
                },
              }),
              h("p", null, data.message),
            ),
            h(
              "p",
              {
                className: "mt-3 text-lg font-medium text-(color:--inv-ink)",
                style: DISPLAY_FONT,
              },
              `— ${data.celebrantName}`,
            ),
          ),
    ),
    h(DecorationZone, {
      theme: themeKey,
      part: "footer",
      illustrationClassName: "pointer-events-none block",
    }),
  );
}
