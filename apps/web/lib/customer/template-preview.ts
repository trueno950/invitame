import {
  BIRTHDAY_THEME,
  BIRTHDAY_THEMES,
  isBirthdayTheme,
  parseThemedLayoutConfiguration,
  THEMED_LAYOUT_KEYS,
  type ThemedLayoutKey,
} from "../renderers/birthday-themes.ts";
import { RendererPropsError } from "../renderers/renderer-props-error.ts";
import { type SampleInvitation, sampleInvitation } from "../renderers/samples.ts";
import type { CreatorTemplate } from "../server/invitations-api.ts";

/**
 * The cards of the «Nueva invitación» chooser (T9; S9). A themed layout is one card that groups every
 * published version of its `componentKey`, with one theme switch per version: choosing a switch changes the
 * miniature and selects that version for the form. Every other template — `birthday-adventure-01` and the
 * templates of other categories — keeps a card of its own. Nothing here reads a catalog name to decide what
 * to show: the layout comes from the version's `componentKey`, the theme from its `configuration.theme`, and
 * the label from the theme's own Spanish display name.
 *
 * What the form submits is unchanged: one radio group named `templateVersionId`, one radio per published
 * version, and its value is the version id the draft is pinned to.
 */

/** The form field every card fills; the draft is still created from the published version id (S8). */
export const TEMPLATE_FIELD_NAME = "templateVersionId";

/** Where the full sample preview of one version lives, under the signed-in customer pages. */
export const PREVIEW_PATHS = {
  preview: (versionId: string) =>
    `/cuenta/invitaciones/nueva/vista/${encodeURIComponent(versionId)}`,
} as const;

/** The full sample preview of a version, for the «Ver completa» link of its switch. */
export function previewPath(versionId: string): string {
  return PREVIEW_PATHS.preview(versionId);
}

/**
 * The Spanish title and description of each themed layout. The catalog names carry the theme as well
 * («Mapa · Dinosaurios»), so a card that holds all eight themes of one layout needs its own neutral label;
 * it is keyed by the allow-listed `componentKey`, never parsed out of a name.
 */
const LAYOUT_COPY: Readonly<Record<ThemedLayoutKey, { title: string; description: string }>> = {
  "birthday-map-01": {
    title: "Mapa",
    description: "Una ruta de aventura con paradas para la fecha, la hora y el lugar de la fiesta.",
  },
  "birthday-poster-01": {
    title: "Cartel",
    description: "Un cartel festivo con la foto y los datos del cumpleaños en primer plano.",
  },
  "birthday-story-01": {
    title: "Cuento",
    description: "Un cuento ilustrado que narra la fiesta de cumpleaños paso a paso.",
  },
};

/** One theme switch of a layout card, and the version it selects. */
export interface ThemeOptionView {
  /** The value the form submits: the published version id of that theme. */
  versionId: string;
  /** The theme's neutral Spanish display name, read from the version's own configuration. */
  label: string;
  /** The renderer props of the fixed sample, so the switch can change the miniature. */
  sample: SampleInvitation;
}

/** One card of the chooser: a themed layout with its theme switches, or a single template. */
export interface LayoutCardView {
  kind: "layout";
  /** A CSS-safe token that scopes this card's generated switch rules, unique on the page. */
  groupId: string;
  componentKey: ThemedLayoutKey;
  title: string;
  /** The category of its templates, as the list shows it on every card. */
  meta: string;
  description: string;
  options: readonly ThemeOptionView[];
}

export interface SingleTemplateCardView {
  kind: "template";
  /** The renderer identity, so the card can draw its own miniature. */
  componentKey: string;
  /** The value the form submits: the published version id. */
  versionId: string;
  title: string;
  meta: string;
  description: string | null;
  /** The renderer props of the fixed sample, or undefined when the renderer refuses it: no miniature. */
  sample?: SampleInvitation;
}

export type TemplateCardView = LayoutCardView | SingleTemplateCardView;

/** The layout a `componentKey` names, or undefined for a key without themes. Compared by equality only. */
function themedLayout(componentKey: string): ThemedLayoutKey | undefined {
  return THEMED_LAYOUT_KEYS.find((key) => key === componentKey);
}

/**
 * The theme a stored configuration selects, or undefined when it is not the exact `{componentKey, theme}`
 * shape the renderer accepts. A drifted snapshot is not a reason to drop the template: it falls back to a
 * card of its own without a miniature, and the API still owns whether the version may be pinned.
 */
function configuredTheme(
  componentKey: ThemedLayoutKey,
  configuration: unknown,
): string | undefined {
  try {
    return parseThemedLayoutConfiguration(componentKey, configuration).theme;
  } catch (error) {
    if (error instanceof RendererPropsError) {
      return undefined;
    }
    throw error;
  }
}

/** The owner's theme order, so the switches of a card read like the theme board (S8). */
function themeRank(theme: string): number {
  const index = BIRTHDAY_THEMES.indexOf(theme as (typeof BIRTHDAY_THEMES)[number]);
  return index === -1 ? BIRTHDAY_THEMES.length : index;
}

/** One themed layout being collected, with the versions that belong to it. */
interface LayoutEntry {
  kind: "layout";
  layout: ThemedLayoutKey;
  meta: string;
  members: Array<{ template: CreatorTemplate; theme: string; sample: SampleInvitation }>;
}

interface SingleEntry {
  kind: "template";
  template: CreatorTemplate;
  sample?: SampleInvitation;
}

/**
 * Every card the chooser shows, in the order the creator catalog answers its templates: the first version of
 * a layout opens its card, and the templates without themes keep a card each. A template whose configuration
 * or sample its renderer refuses keeps a card without a miniature, so a drifted catalog never breaks the page.
 */
export function templateChoiceCards(
  templates: readonly CreatorTemplate[],
  origin: string,
): TemplateCardView[] {
  const entries: Array<LayoutEntry | SingleEntry> = [];
  const groups = new Map<ThemedLayoutKey, LayoutEntry>();

  for (const template of templates) {
    const version = template.publishedVersion;
    const sample = sampleInvitation(
      version.componentKey,
      version.configuration,
      template.category.key,
      origin,
    );
    const layout = themedLayout(version.componentKey);
    const theme = layout === undefined ? undefined : configuredTheme(layout, version.configuration);

    if (layout !== undefined && theme !== undefined && sample !== undefined) {
      let group = groups.get(layout);

      if (group === undefined) {
        group = { kind: "layout", layout, meta: template.category.name, members: [] };
        groups.set(layout, group);
        entries.push(group);
      }
      group.members.push({ template, theme, sample });
      continue;
    }

    entries.push({
      kind: "template",
      template,
      ...(sample === undefined ? {} : { sample }),
    });
  }

  return entries.map((entry, index) =>
    entry.kind === "template"
      ? {
          kind: "template",
          componentKey: entry.template.publishedVersion.componentKey,
          versionId: entry.template.publishedVersion.id,
          title: entry.template.name,
          meta: entry.template.category.name,
          description: entry.template.description,
          ...(entry.sample === undefined ? {} : { sample: entry.sample }),
        }
      : {
          kind: "layout",
          // Unique on the page, CSS-safe, and never derived from a name or a version id.
          groupId: `tema-${index}`,
          componentKey: entry.layout,
          ...LAYOUT_COPY[entry.layout],
          meta: entry.meta,
          options: [...entry.members]
            .sort((left, right) => themeRank(left.theme) - themeRank(right.theme))
            .map((member) => ({
              versionId: member.template.publishedVersion.id,
              label: isBirthdayTheme(member.theme)
                ? BIRTHDAY_THEME[member.theme].displayName
                : member.theme,
              sample: member.sample,
            })),
        },
  );
}

/** Every version id the chooser offers, in the order the cards show them. */
export function offeredVersionIds(cards: readonly TemplateCardView[]): string[] {
  return cards.flatMap((card) =>
    card.kind === "layout" ? card.options.map((option) => option.versionId) : [card.versionId],
  );
}

/**
 * The version the form has checked: the one the page was asked for (the preview page's way back), or the
 * first card's first version, which is what the chooser always preselected.
 */
export function checkedVersionId(
  cards: readonly TemplateCardView[],
  requested?: string,
): string | undefined {
  const offered = offeredVersionIds(cards);

  if (requested !== undefined && offered.some((value) => value === requested)) {
    return requested;
  }

  return offered[0];
}

/**
 * The rules that switch the miniature and the «Ver completa» link of a layout card without any client
 * script: every miniature and link is hidden, only the one whose theme radio is checked is shown, and while
 * none of the card's switches is chosen the first theme is shown, so every card has a miniature from the
 * first paint. The selectors are built from the card's own version ids, which the API publishes as canonical
 * UUIDs, and are scoped to the card's `groupId`, so two cards never switch each other.
 */
export function previewSwitchCss(card: LayoutCardView): string {
  const scope = `[data-preview-group="${card.groupId}"]`;
  const hidden = card.options
    .flatMap((option) => [
      `${scope} [data-miniature="${option.versionId}"]`,
      `${scope} [data-preview-link="${option.versionId}"]`,
    ])
    .join(",");
  const first = card.options[0];
  const fallback =
    first === undefined
      ? []
      : [
          `${scope}:not(:has([data-theme-choice]:checked)) [data-miniature="${first.versionId}"]{display:block}`,
          `${scope}:not(:has([data-theme-choice]:checked)) [data-preview-link="${first.versionId}"]{display:inline-flex}`,
        ];

  return [
    `${hidden}{display:none}`,
    ...card.options.flatMap((option) => [
      `${scope}:has([data-theme-choice="${option.versionId}"]:checked) [data-miniature="${option.versionId}"]{display:block}`,
      `${scope}:has([data-theme-choice="${option.versionId}"]:checked) [data-preview-link="${option.versionId}"]{display:inline-flex}`,
    ]),
    ...fallback,
  ].join("\n");
}

/** The template and the sample of one preview link, when the creator catalog still publishes that version. */
export interface PreviewTarget {
  template: CreatorTemplate;
  sample: SampleInvitation;
}

/**
 * The full preview of one published version, or undefined for an id the creator catalog does not publish, an
 * id that names a template rather than a version, and a snapshot the renderer refuses — all of which the
 * preview page answers with its own friendly notice instead of a renderer that throws.
 */
export function findPreviewTarget(
  templates: readonly CreatorTemplate[],
  versionId: string,
  origin: string,
): PreviewTarget | undefined {
  const template = templates.find((stored) => stored.publishedVersion.id === versionId);

  if (template === undefined) {
    return undefined;
  }

  const sample = sampleInvitation(
    template.publishedVersion.componentKey,
    template.publishedVersion.configuration,
    template.category.key,
    origin,
  );

  return sample === undefined ? undefined : { template, sample };
}
