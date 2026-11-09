import { type CSSProperties, createElement, type ReactElement, type ReactNode, useId } from "react";

import {
  type BirthdayAdventureContent,
  formatAgeLabel,
  formatLongDate,
  PALETTE_COLORS,
  parseBirthdayAdventureConfiguration,
  parseBirthdayAdventureContent,
  type Section,
} from "../../../../lib/renderers/birthday-adventure-01.ts";

/*
 * The `birthday-adventure-01` invitation (M3 T7; S2, S6): a server component with no client JavaScript.
 * It is a `.ts` file that calls `createElement` because `node --test` strips types but does not compile
 * JSX, and the unit tests render this component to static markup. The palette is a set of CSS variables on
 * the root element (`--inv-*`) read by Tailwind utilities, so no stylesheet has to be imported. The design
 * is original: a sun-disc badge, scalloped rounded cards, and the theme's sans font.
 */

export interface BirthdayAdventureRendererProps {
  /** The `TemplateVersion.configuration` snapshot; parsed here, so an invalid one throws. */
  readonly configuration: unknown;
  /** The invitation data that fits the version's schema; parsed here, so an invalid one throws. */
  readonly content: unknown;
}

const h = createElement;

const CARD = "rounded-[2rem] border-2 border-(--inv-accent) bg-(--inv-surface) p-6 shadow-sm";
const HEADING = "text-xl font-semibold text-(color:--inv-accent)";

interface SectionProps {
  readonly content: BirthdayAdventureContent;
  readonly headingId: string;
}

function section(name: Section, headingId: string, children: ReactNode): ReactElement {
  return h(
    "section",
    { "data-section": name, "aria-labelledby": headingId, className: CARD },
    children,
  );
}

function Hero({ content, headingId }: SectionProps): ReactElement {
  return section(
    "hero",
    headingId,
    h(
      "div",
      { className: "flex flex-col items-center gap-4 text-center" },
      h(
        "p",
        {
          className:
            "rounded-full bg-(--inv-soft) px-4 py-1 text-sm font-medium text-(color:--inv-ink)",
        },
        "Te invitamos al cumpleaños de",
      ),
      h(
        "h1",
        { id: headingId, className: "text-4xl font-bold text-(color:--inv-accent) sm:text-5xl" },
        content.celebrantName,
      ),
      h(
        "p",
        {
          className:
            "flex size-24 items-center justify-center rounded-full bg-(--inv-accent) px-3 text-center text-base font-semibold leading-tight text-(color:--inv-surface)",
        },
        formatAgeLabel(content.age),
      ),
      h("img", {
        src: content.mainPhoto,
        alt: `Foto de ${content.celebrantName}`,
        className:
          "aspect-square w-full max-w-sm rounded-[2rem] border-4 border-(--inv-soft) object-cover",
        decoding: "async",
      }),
    ),
  );
}

function Detail({
  label,
  children,
}: {
  readonly label: string;
  readonly children?: ReactNode;
}): ReactElement {
  return h(
    "div",
    { className: "rounded-2xl bg-(--inv-soft) px-4 py-3" },
    h("dt", { className: "text-sm font-semibold text-(color:--inv-accent)" }, label),
    h("dd", { className: "mt-1 text-lg text-(color:--inv-ink)" }, children),
  );
}

function Details({ content, headingId }: SectionProps): ReactElement {
  return section(
    "details",
    headingId,
    h(
      "div",
      { className: "flex flex-col gap-4" },
      h("h2", { id: headingId, className: HEADING }, "Detalles"),
      h(
        "dl",
        { className: "grid gap-3 sm:grid-cols-2" },
        h(
          Detail,
          { label: "Fecha" },
          h("time", { dateTime: content.date }, formatLongDate(content.date)),
        ),
        h(Detail, { label: "Hora" }, h("time", { dateTime: content.time }, `${content.time} h`)),
        h(Detail, { label: "Lugar" }, content.location),
        h(Detail, { label: "Dirección" }, content.address),
      ),
    ),
  );
}

function Message({ content, headingId }: SectionProps): ReactElement {
  return section(
    "message",
    headingId,
    h(
      "div",
      { className: "flex flex-col gap-3" },
      h("h2", { id: headingId, className: HEADING }, "Mensaje"),
      h("p", { className: "text-lg leading-8 text-(color:--inv-ink)" }, content.message),
    ),
  );
}

const SECTION_COMPONENTS: Readonly<Record<Section, (props: SectionProps) => ReactElement>> = {
  hero: Hero,
  details: Details,
  message: Message,
};

export function BirthdayAdventureRenderer({
  configuration,
  content,
}: BirthdayAdventureRendererProps): ReactElement {
  const { palette, sectionOrder } = parseBirthdayAdventureConfiguration(configuration);
  const data = parseBirthdayAdventureContent(content);
  const idPrefix = useId();
  const colors = PALETTE_COLORS[palette];

  return h(
    "article",
    {
      "aria-label": `Invitación de cumpleaños de ${data.celebrantName}`,
      "data-palette": palette,
      className:
        "mx-auto flex w-full max-w-2xl flex-col gap-6 bg-(--inv-background) px-4 py-8 font-sans text-(color:--inv-ink)",
      style: {
        "--inv-background": colors.background,
        "--inv-surface": colors.surface,
        "--inv-soft": colors.soft,
        "--inv-ink": colors.ink,
        "--inv-accent": colors.accent,
      } as CSSProperties,
    },
    sectionOrder.map((name) =>
      h(SECTION_COMPONENTS[name], {
        key: name,
        content: data,
        headingId: `${idPrefix}-${name}`,
      }),
    ),
  );
}
