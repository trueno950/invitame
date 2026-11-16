import { createElement, type ReactElement, useId } from "react";

import {
  formatAgeLabel,
  formatAgeUnit,
  formatLongDate,
} from "../../../../lib/renderers/birthday-content.ts";
import {
  parseBirthdayPosterConfiguration,
  parseBirthdayPosterContent,
} from "../../../../lib/renderers/birthday-poster-01.ts";
import { BIRTHDAY_THEME } from "../../../../lib/renderers/birthday-themes.ts";
import { Motif } from "../birthday/motif.ts";
import { DISPLAY_FONT, INVITATION_ROOT, themeStyle, titleStyle } from "../birthday/theme.ts";

/*
 * The `birthday-poster-01` invitation — «Cartel de fiesta» (T6b; S2, S7, S8), following
 * `design/birthday-adventure-v2/02-cartel-fiesta.html`: an accent band with the name and the outlined age, a
 * polaroid of the celebrant overlapping it, the details as an admission ticket with a time stub, and the
 * message as a speech bubble. A server component with no client script: `.ts` + `createElement` because
 * `node --test` strips types but does not compile JSX.
 */

export interface BirthdayPosterRendererProps {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
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
}: BirthdayPosterRendererProps): ReactElement {
  const { theme: themeKey } = parseBirthdayPosterConfiguration(configuration);
  const data = parseBirthdayPosterContent(content);
  const theme = BIRTHDAY_THEME[themeKey];
  const idPrefix = useId();

  return h(
    "article",
    {
      "aria-label": `Invitación de cumpleaños de ${data.celebrantName}`,
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
      // and an overlay would put decoration behind the name.
      h(
        "div",
        {
          "aria-hidden": "true",
          "data-decoration": "",
          className: "pointer-events-none flex h-16 justify-center px-6 pt-4",
        },
        h(Motif, { motif: theme.motif, tone: "accent" }),
      ),
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
            "¡Es mi fiesta!",
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
          h(
            "p",
            {
              "aria-label": formatAgeLabel(data.age),
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
              formatAgeUnit(data.age),
              h("br"),
              "de risas",
            ),
          ),
        ),
      ),
    ),
    h(
      "figure",
      {
        className: "-mt-32 w-[15.5rem] self-center bg-(--inv-surface) px-3 pt-3 pb-3 shadow-xl",
        style: { transform: "rotate(3deg)" },
      },
      h("img", {
        src: data.mainPhoto,
        alt: `Foto de ${data.celebrantName}`,
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
        `¡${data.celebrantName}!`,
      ),
    ),
    h(
      "div",
      { className: "flex flex-col gap-8 px-5 pt-7 pb-6" },
      h(
        "section",
        { "data-section": "details", "aria-labelledby": `${idPrefix}-details` },
        h("h2", { id: `${idPrefix}-details`, className: SECTION_TITLE }, "Tu boleto de entrada"),
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
              h("dt", { className: TICKET_LABEL }, "Fecha"),
              h(
                "dd",
                { className: TICKET_VALUE },
                h("time", { dateTime: data.date }, formatLongDate(data.date)),
              ),
            ),
            h(
              "div",
              null,
              h("dt", { className: TICKET_LABEL }, "Lugar"),
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
              "aria-label": `Hora: ${data.time} h`,
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
              data.time,
            ),
            h("span", { "aria-hidden": "true", className: "text-xs font-medium" }, "horas"),
          ),
        ),
      ),
      h(
        "section",
        { "data-section": "message", "aria-labelledby": `${idPrefix}-message` },
        h("h2", { id: `${idPrefix}-message`, className: SECTION_TITLE }, "Mensaje"),
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
  );
}
