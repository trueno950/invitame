import { createElement, type ReactElement, useId } from "react";
import { birthdayStoryEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import type { Locale } from "../../../../lib/i18n/locale.ts";
import {
  rendererAgeUnit,
  rendererClockTime,
  rendererLongDate,
  rendererTextsFor,
} from "../../../../lib/i18n/renderer-texts.ts";
import {
  parseBirthdayStoryConfiguration,
  parseBirthdayStoryContent,
} from "../../../../lib/renderers/birthday-story-01.ts";
import { BIRTHDAY_THEME } from "../../../../lib/renderers/birthday-themes.ts";
import { hiddenFieldSet } from "../../../../lib/renderers/invitation-fields.ts";
import { InvitationFeaturesBlock } from "../../invitation-features/invitation-features-block.ts";
import { Motif } from "../birthday/motif.ts";
import { DISPLAY_FONT, INVITATION_ROOT, themeStyle, titleStyle } from "../birthday/theme.ts";
import { DecorationZone } from "../illustrations/decoration.ts";

/*
 * The `birthday-story-01` invitation — «Cuento ilustrado» (T6b; S2, S7, S8), following
 * `design/birthday-adventure-v2/03-cuento-ilustrado.html`: one book page with the photo in an arch, the
 * celebrant introduced as the hero of a story, and the details and the message as numbered chapters. A
 * server component with no client script: `.ts` + `createElement` because `node --test` strips types but
 * does not compile JSX.
 *
 * Decoration (I3a; S4): the theme's paper-cut diorama opens the page sheet above the photo, a torn strip
 * separates the chapters that hold the details from the message, and a footer strip closes the sheet; a theme
 * without an illustration keeps the motif strip this layout drew before, at the foot of the sheet.
 */

export interface BirthdayStoryRendererProps {
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

const CHAPTER = "text-xs font-medium uppercase tracking-[0.16em] text-(color:--inv-accent)";
const CHAPTER_TITLE = "mt-1 text-2xl font-medium leading-tight text-(color:--inv-ink)";
const WHEN_LABEL = "block text-[0.7rem] uppercase tracking-[0.12em]";

/** The chapter marker: a hairline with a small star in the middle, hidden from assistive technology. */
function Divider(): ReactElement {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      focusable: "false",
      viewBox: "0 0 120 16",
      className: "mx-auto my-6 block w-32",
    },
    h("path", {
      d: "M2 8h44M74 8h44",
      stroke: "var(--inv-accent)",
      strokeWidth: 1.5,
      strokeLinecap: "round",
    }),
    h("path", {
      d: "M60 1l3 5 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L51 7l6-1z",
      fill: "var(--inv-accent)",
    }),
  );
}

export function BirthdayStoryRenderer({
  configuration,
  content,
  features,
  calendarHref,
  hiddenFields,
  locale,
}: BirthdayStoryRendererProps): ReactElement {
  const { theme: themeKey } = parseBirthdayStoryConfiguration(configuration);
  const data = parseBirthdayStoryContent(content, hiddenFields);
  const hidden = hiddenFieldSet(hiddenFields);
  const theme = BIRTHDAY_THEME[themeKey];
  const idPrefix = useId();
  const texts = rendererTextsFor(locale);

  // Chapter 2 ends with the place, so the features follow it as the practical chapter of the story (S4).
  const featuresBlock =
    features === undefined
      ? null
      : h(InvitationFeaturesBlock, {
          features,
          facts: birthdayStoryEventFacts(data, hiddenFields),
          ...(calendarHref === undefined ? {} : { calendarHref }),
          ...(locale === undefined ? {} : { locale }),
        });

  return h(
    "article",
    {
      "aria-label": `${texts["birthday.ariaInvitation"]} ${data.celebrantName}`,
      "data-component-key": "birthday-story-01",
      "data-theme": themeKey,
      className: `${INVITATION_ROOT} px-4 py-6`,
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
        className: "relative bg-(--inv-surface) px-6 pt-10 pb-8 shadow-xl",
        style: { borderRadius: "0.375rem 0.375rem 1.75rem 1.75rem" },
      },
      // The scalloped top edge of the artboard's book page: half-circles of the page color above the sheet.
      h("div", {
        "aria-hidden": "true",
        className: "pointer-events-none absolute inset-x-0 -top-3 h-3.5",
        style: {
          background:
            "radial-gradient(circle at 12px 14px, var(--inv-surface) 12px, transparent 12.5px) 0 0 / 24px 14px repeat-x",
        },
      }),
      // The diorama opens the page inside the sheet, bled over the sheet's own padding and clipped to its
      // rounded corners, so the scene is a printed band on the paper and never a layer under the text.
      h(DecorationZone, {
        theme: themeKey,
        part: "scene",
        illustrationClassName:
          "pointer-events-none -mx-6 -mt-10 block overflow-hidden rounded-t-lg",
      }),
      h(
        "section",
        {
          "data-section": "hero",
          "aria-labelledby": `${idPrefix}-hero`,
          className: "text-center",
        },
        h(
          "div",
          { className: "relative" },
          data.mainPhoto === undefined
            ? null
            : h(
                "div",
                {
                  className:
                    "mx-auto h-64 w-52 overflow-hidden rounded-t-[6.5rem] rounded-b-lg border-[6px] border-(--inv-soft)",
                },
                h("img", {
                  src: data.mainPhoto,
                  alt: `${texts["invitation.photoAlt"]} ${data.celebrantName}`,
                  decoding: "async",
                  className: "size-full object-cover",
                }),
              ),
          h(
            "p",
            { className: "mt-5 text-lg italic text-(color:--inv-ink)" },
            texts["birthday.storyOpener"],
          ),
          h(
            "h1",
            {
              id: `${idPrefix}-hero`,
              className: "my-1 break-words text-(color:--inv-accent)",
              style: titleStyle(theme),
            },
            data.celebrantName,
          ),
          h(
            "p",
            { className: "mx-auto max-w-[30ch] text-base text-(color:--inv-ink)" },
            ...(data.age === undefined
              ? [texts["birthday.storyNoAge"]]
              : [
                  texts["birthday.storyTurns"],
                  " ",
                  h(
                    "b",
                    { key: "age", className: "text-(color:--inv-accent)" },
                    `${data.age} ${rendererAgeUnit(locale, data.age)}`,
                  ),
                  texts["birthday.storyExclaim"],
                ]),
          ),
        ),
      ),
      h(Divider),
      h(
        "section",
        { "data-section": "details", "aria-labelledby": `${idPrefix}-details` },
        h(
          "h2",
          { id: `${idPrefix}-details`, className: CHAPTER },
          texts["birthday.chapterDetails"],
        ),
        h("h3", { className: CHAPTER_TITLE, style: DISPLAY_FONT }, texts["birthday.bigDay"]),
        h(
          "div",
          { className: "mt-3 flex gap-3" },
          h(
            "div",
            { className: "flex-1 rounded-2xl bg-(--inv-soft) px-4 py-3" },
            h("small", { className: WHEN_LABEL }, texts["label.date"]),
            h(
              "b",
              { className: "text-base font-medium leading-snug" },
              h("time", { dateTime: data.date }, rendererLongDate(locale, data.date)),
            ),
          ),
          h(
            "div",
            { className: "w-28 shrink-0 rounded-2xl bg-(--inv-soft) px-4 py-3" },
            h("small", { className: WHEN_LABEL }, texts["label.time"]),
            h(
              "b",
              { className: "text-base font-medium leading-snug" },
              h("time", { dateTime: data.time }, rendererClockTime(locale, data.time)),
            ),
          ),
        ),
      ),
      h(
        "section",
        { "data-section": "place", "aria-labelledby": `${idPrefix}-place`, className: "mt-7" },
        h("h2", { id: `${idPrefix}-place`, className: CHAPTER }, texts["birthday.chapterPlace"]),
        h("h3", { className: CHAPTER_TITLE, style: DISPLAY_FONT }, data.location),
        h("p", { className: "mt-1 text-base text-(color:--inv-ink)" }, data.address),
      ),
      featuresBlock,
      h(DecorationZone, {
        theme: themeKey,
        part: "divider",
        illustrationClassName: "pointer-events-none -mx-6 block",
      }),
      hidden.has("message")
        ? null
        : h(
            "section",
            {
              "data-section": "message",
              "aria-labelledby": `${idPrefix}-message`,
              className: "mt-7",
            },
            h(
              "h2",
              { id: `${idPrefix}-message`, className: CHAPTER },
              texts["birthday.chapterMessage"],
            ),
            h(
              "p",
              {
                className:
                  "mt-2 border-l-[3px] border-(--inv-accent) pl-4 text-xl italic leading-relaxed text-(color:--inv-ink)",
              },
              data.message,
            ),
          ),
      h(
        "p",
        {
          className: "mt-8 text-center text-xl italic text-(color:--inv-ink)",
          style: DISPLAY_FONT,
        },
        texts["birthday.storyContinues"],
      ),
      // Decoration stays inside the page sheet and below every line of text.
      h(DecorationZone, {
        theme: themeKey,
        part: "footer",
        illustrationClassName: "pointer-events-none -mx-6 mt-6 block",
        fallback: {
          node: h(Motif, { motif: theme.motif, tone: "paper" }),
          className: "pointer-events-none mt-6 flex h-20 justify-center",
        },
      }),
    ),
  );
}
