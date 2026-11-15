import { createElement, type ReactElement, useId } from "react";
import { birthdayMapEventFacts } from "../../../../lib/invitation-features/event-facts.ts";
import type { InvitationFeatures } from "../../../../lib/invitation-features/invitation-features.ts";
import {
  formatAgeLabel,
  formatAgeUnit,
  formatLongDate,
} from "../../../../lib/renderers/birthday-content.ts";
import {
  parseBirthdayMapConfiguration,
  parseBirthdayMapContent,
} from "../../../../lib/renderers/birthday-map-01.ts";
import { BIRTHDAY_THEME } from "../../../../lib/renderers/birthday-themes.ts";
import { InvitationFeaturesBlock } from "../../invitation-features/invitation-features-block.ts";
import { Motif } from "../birthday/motif.ts";
import { DISPLAY_FONT, INVITATION_ROOT, themeStyle, titleStyle } from "../birthday/theme.ts";
import { DecorationZone } from "../illustrations/decoration.ts";

/*
 * The `birthday-map-01` invitation — «Mapa de aventura» (T6b; S2, S7, S8), following
 * `design/birthday-adventure-v2/01-mapa-aventura.html`: a hero where the age is a compass rose and the name
 * is the destination, «La ruta de la fiesta» as numbered stops, and the message as the treasure at the end of
 * the trail. A server component with no client script: `.ts` + `createElement` because `node --test` strips
 * types but does not compile JSX. Every color comes from the theme through CSS variables on the root.
 *
 * Decoration (I3a; S4): the theme opens the page as a paper-cut diorama above the hero, cuts a torn strip
 * between the route and what follows, and closes it with a footer strip; a theme without an illustration keeps
 * the motif strip this layout drew before, in the same place.
 */

export interface BirthdayMapRendererProps {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
  /** The features the API gated for this invitation; absent when it has none, which renders nothing. */
  readonly features?: InvitationFeatures;
  /** The `.ics` download the public page owns; absent leaves the Google Calendar link alone. */
  readonly calendarHref?: string;
}

const h = createElement;

const CARD = "rounded-2xl bg-(--inv-surface) p-4 shadow-sm";
const STOP_LABEL = "text-xs font-medium uppercase tracking-[0.12em] text-(color:--inv-accent)";
const STOP_VALUE = "mt-1 text-xl font-medium leading-tight text-(color:--inv-ink)";
const SECTION_TITLE = "mb-4 text-center text-2xl font-medium text-(color:--inv-ink)";

/** The artboard's scroll rods: one rolled lip above the message and one below it. */
const SCROLL_RODS = ["-top-1.5", "-bottom-1.5"] as const;

/** The four cardinal knobs of the compass rose, lettered in Spanish (N, S, E, O). */
const COMPASS_POINTS = [
  { key: "north", letter: "N", cx: 84, cy: 17 },
  { key: "south", letter: "S", cx: 84, cy: 152 },
  { key: "east", letter: "E", cx: 151, cy: 84 },
  { key: "west", letter: "O", cx: 17, cy: 84 },
] as const;

/** The compass rose: a decorative dial with the age at its centre, and the age label for screen readers. */
function Compass({ age }: { readonly age: number }): ReactElement {
  return h(
    "div",
    { className: "relative mx-auto mt-4 size-40" },
    h(
      "svg",
      {
        "aria-hidden": "true",
        focusable: "false",
        viewBox: "0 0 168 168",
        className: "absolute inset-0 size-full",
      },
      h("circle", { cx: 84, cy: 84, r: 80, fill: "var(--inv-surface)" }),
      h("circle", {
        cx: 84,
        cy: 84,
        r: 72,
        fill: "none",
        stroke: "var(--inv-accent)",
        strokeWidth: 2,
        strokeDasharray: "4 6",
      }),
      // The cardinal knobs are the surface-colored knockouts behind the letters: they punch through the dashed
      // ring, so no letter sits on a dash (the updated artboard draws them the same way).
      h(
        "g",
        { fill: "var(--inv-surface)" },
        COMPASS_POINTS.map(({ key, cx, cy }) =>
          h("circle", { key, "data-knockout": "", cx, cy, r: 11 }),
        ),
      ),
      h(
        "g",
        {
          fill: "var(--inv-accent)",
          fontSize: 13,
          fontWeight: 700,
          textAnchor: "middle",
          dominantBaseline: "central",
        },
        COMPASS_POINTS.map(({ key, letter, cx, cy }) => h("text", { key, x: cx, y: cy }, letter)),
      ),
    ),
    h(
      "p",
      {
        "aria-label": formatAgeLabel(age),
        className: "absolute inset-0 grid place-content-center text-center",
      },
      h(
        "b",
        {
          "aria-hidden": "true",
          className: "block text-7xl leading-none text-(color:--inv-accent)",
          style: DISPLAY_FONT,
        },
        String(age),
      ),
      h(
        "small",
        {
          "aria-hidden": "true",
          className: "block text-xs font-medium uppercase tracking-[0.14em]",
        },
        formatAgeUnit(age),
      ),
    ),
  );
}

export function BirthdayMapRenderer({
  configuration,
  content,
  features,
  calendarHref,
}: BirthdayMapRendererProps): ReactElement {
  const { theme: themeKey } = parseBirthdayMapConfiguration(configuration);
  const data = parseBirthdayMapContent(content);
  const theme = BIRTHDAY_THEME[themeKey];
  const idPrefix = useId();

  // After the route and before the message: a guest reads where the party is, then acts on it (S4).
  const featuresBlock =
    features === undefined
      ? null
      : h(InvitationFeaturesBlock, {
          features,
          facts: birthdayMapEventFacts(data),
          ...(calendarHref === undefined ? {} : { calendarHref }),
        });

  const stops = [
    {
      label: "¿Cuándo?",
      value: h("time", { dateTime: data.date }, formatLongDate(data.date)),
    },
    {
      label: "¿A qué hora?",
      value: h("time", { dateTime: data.time }, `${data.time} h`),
    },
    {
      label: "¿Dónde?",
      value: data.location,
      extra: data.address,
    },
  ];

  return h(
    "article",
    {
      "aria-label": `Invitación de cumpleaños de ${data.celebrantName}`,
      "data-component-key": "birthday-map-01",
      "data-theme": themeKey,
      className: `${INVITATION_ROOT} gap-10 px-5 py-7`,
      style: {
        ...themeStyle(theme),
        backgroundImage:
          "radial-gradient(color-mix(in srgb, var(--inv-accent) 14%, transparent) 1.2px, transparent 1.3px)",
        backgroundSize: "22px 22px",
      },
    },
    // The theme background must paint the page, not only a centred column: the guest `<main>` is `isolate`,
    // so a viewport-sized layer at `-z-10` stays behind this invitation's content and above the site paper.
    h("div", {
      "aria-hidden": "true",
      "data-invitation-background": "",
      className: "pointer-events-none fixed inset-0 -z-10 bg-(--inv-background)",
    }),
    // The motif is decoration: it sits in its own strip above the hero, where no text can fall on it. The
    // theme illustration takes that place as a full-bleed diorama, bled over the article's own padding.
    h(DecorationZone, {
      theme: themeKey,
      part: "scene",
      illustrationClassName: "pointer-events-none -mx-5 -mt-7 block",
      fallback: {
        node: h(Motif, { motif: theme.motif, tone: "paper" }),
        className: "pointer-events-none flex h-24 justify-center",
      },
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
        { className: "relative flex flex-col items-center gap-4" },
        h(
          "p",
          {
            className:
              "rounded-full border-2 border-dashed border-(--inv-accent) bg-(--inv-surface) px-4 py-1.5 text-sm font-medium text-(color:--inv-accent)",
          },
          "¡Te invitamos a una aventura!",
        ),
        h(
          "h1",
          {
            id: `${idPrefix}-hero`,
            className: "break-words text-(color:--inv-ink)",
            style: titleStyle(theme),
          },
          data.celebrantName,
        ),
        h(Compass, { age: data.age }),
        h(
          "figure",
          {
            className:
              "relative mt-6 w-[min(100%,18rem)] rotate-[-2deg] rounded-2xl bg-(--inv-surface) p-2.5 shadow-lg",
          },
          h("img", {
            src: data.mainPhoto,
            alt: `Foto de ${data.celebrantName}`,
            decoding: "async",
            className: "aspect-square w-full rounded-lg object-cover",
          }),
          h(
            "figcaption",
            {
              className:
                "absolute -right-3 -bottom-3.5 grid size-20 rotate-[10deg] place-content-center rounded-full border-[3px] border-dashed border-(--inv-surface) bg-(--inv-accent) text-center text-[0.7rem] font-medium leading-tight text-(color:--inv-on-accent)",
            },
            "¡Gran expedición!",
          ),
        ),
      ),
    ),
    h(
      "section",
      { "data-section": "route", "aria-labelledby": `${idPrefix}-route` },
      h(
        "h2",
        { id: `${idPrefix}-route`, className: SECTION_TITLE, style: DISPLAY_FONT },
        "La ruta de la fiesta",
      ),
      h(
        "div",
        { className: "relative" },
        h("span", {
          "aria-hidden": "true",
          className:
            "pointer-events-none absolute top-6 bottom-6 left-[2.1rem] border-l-2 border-dashed border-(--inv-accent)",
        }),
        h(
          "ol",
          { className: "relative flex flex-col gap-4" },
          stops.map((stop, index) =>
            h(
              "li",
              { key: stop.label, className: `relative flex gap-4 ${CARD}` },
              h(
                "span",
                {
                  "aria-hidden": "true",
                  className:
                    "grid size-9 shrink-0 place-content-center rounded-full bg-(--inv-accent) text-sm font-medium text-(color:--inv-on-accent)",
                  style: DISPLAY_FONT,
                },
                String(index + 1),
              ),
              h(
                "div",
                { className: "min-w-0" },
                h("p", { className: STOP_LABEL }, stop.label),
                h("p", { className: STOP_VALUE }, stop.value),
                stop.extra ? h("p", { className: "mt-0.5 text-sm" }, stop.extra) : null,
              ),
            ),
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
    h(
      "section",
      { "data-section": "message", "aria-labelledby": `${idPrefix}-message` },
      h(
        "p",
        {
          "aria-hidden": "true",
          className: "text-center text-3xl leading-none text-(color:--inv-accent)",
          style: DISPLAY_FONT,
        },
        "✕",
      ),
      h(
        "h2",
        { id: `${idPrefix}-message`, className: `mt-1 ${SECTION_TITLE}`, style: DISPLAY_FONT },
        "Mensaje",
      ),
      h(
        "div",
        { className: "relative rounded-3xl bg-(--inv-soft) px-5 py-4" },
        SCROLL_RODS.map((position) =>
          h("span", {
            key: position,
            "aria-hidden": "true",
            "data-scroll-rod": "",
            className: `absolute inset-x-3.5 ${position} h-2.5 rounded-full`,
            style: {
              backgroundColor: "color-mix(in srgb, var(--inv-accent) 30%, var(--inv-soft))",
            },
          }),
        ),
        h(
          "p",
          { className: "text-center text-lg leading-relaxed text-(color:--inv-ink)" },
          data.message,
        ),
      ),
    ),
    h(DecorationZone, {
      theme: themeKey,
      part: "footer",
      illustrationClassName: "pointer-events-none -mx-5 block",
    }),
  );
}
