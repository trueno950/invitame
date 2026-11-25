import type { SampleInvitation } from "../renderers/samples.ts";
import { INVITATION_COPY } from "./copy.ts";
import {
  type ChoiceCard,
  DESIGN_PARAM,
  INVITATION_PATHS,
  OCCASION_PARAM,
  PACKAGE_PARAM,
  STEP_PARAM,
  THEME_PARAM,
} from "./invitations.ts";
import type { TemplateCardView } from "./template-preview.ts";

/**
 * The «Paso a paso» template chooser (T10b; S9, S10), following
 * `design/template-chooser-v2/02-paso-a-paso-escritorio.html` and its narrow-screen artboard. The chooser
 * is three steps, each one a server URL with no client script:
 *
 * 1. the occasion's designs, grouped by the version's `componentKey`, in a row with their miniatures;
 * 2. the chosen design rendered in each of its themes as comparable miniatures beside the large sample of
 *    the chosen theme;
 * 3. the packages, and the create form that posts the published version id.
 *
 * The design, the theme, and the package travel in the query. Every value is validated against the creator
 * catalog, and an unknown or stale one never renders an error page: it falls back to the nearest step that
 * still holds. Nothing here reads a catalog name to decide what to show — a design comes from its
 * `componentKey`, a theme from its `configuration.theme`, and an occasion from its category. The parameter
 * names live with the create page's paths (`lib/customer/invitations.ts`), because a refused create rebuilds
 * this query to come back to step 3 with the selection (S12).
 */

// Re-exported so a page and a test can name the parameters from the module that owns the chooser.
export { DESIGN_PARAM, OCCASION_PARAM, PACKAGE_PARAM, STEP_PARAM, THEME_PARAM };

/** How many steps the chooser shows, and what the summary counts («Paso 2 de 3»). */
export const CHOOSER_STEP_COUNT = 3;

/** The steps of the chooser, in order. */
export const CHOOSER_STEPS = [1, 2, 3] as const;

export type ChooserStep = (typeof CHOOSER_STEPS)[number];

/** One style of one design: a published version, its own label, and the sample it renders. */
export interface StyleChoice {
  /** The value the create form posts: the published version id (S8). */
  readonly versionId: string;
  /** The theme's neutral Spanish display name, or the single style's label. */
  readonly label: string;
  /** The props of the fixed sample, or undefined when a renderer refuses it: no miniature. */
  readonly sample?: SampleInvitation;
}

/** One design of an occasion: a themed layout with its themes, or a template with one style. */
export interface DesignChoice {
  /** The allow-listed renderer identity every style of this design shares. */
  readonly componentKey: string;
  readonly title: string;
  readonly description: string | null;
  readonly styles: readonly StyleChoice[];
}

/** One occasion of the chooser: a catalog category that has published templates. */
export interface OccasionChoice {
  readonly key: string;
  readonly name: string;
  readonly designs: readonly DesignChoice[];
}

/** A page's search parameters, as Next.js answers them. */
export interface ChooserQuery {
  readonly [parameter: string]: string | string[] | undefined;
}

/** What the chooser holds after reading its query: every selection a later step may keep. */
export interface ChooserSelection {
  readonly occasion?: OccasionChoice | undefined;
  readonly design?: DesignChoice | undefined;
  readonly style?: StyleChoice | undefined;
  readonly package?: ChoiceCard | undefined;
}

/** The selection and the step it resolves to. */
export interface ChooserState extends ChooserSelection {
  readonly step: ChooserStep;
}

/** The first value of one query parameter, or nothing; a repeated parameter names no choice. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** One design, from a card of the catalog grouping (`lib/customer/template-preview.ts`). */
function designOf(card: TemplateCardView): DesignChoice {
  return card.kind === "layout"
    ? {
        componentKey: card.componentKey,
        title: card.title,
        description: card.description,
        styles: card.options.map((option) => ({
          versionId: option.versionId,
          label: option.label,
          sample: option.sample,
        })),
      }
    : {
        componentKey: card.componentKey,
        title: card.title,
        description: card.description,
        styles: [
          {
            versionId: card.versionId,
            label: INVITATION_COPY.singleStyle,
            ...(card.sample === undefined ? {} : { sample: card.sample }),
          },
        ],
      };
}

/**
 * The occasions the chooser offers, from the catalog data: one per category that publishes at least one
 * template, in the order the creator catalog answers them, with each category's designs. A category no
 * template uses is never offered, and no name is written here.
 */
export function chooserOccasions(cards: readonly TemplateCardView[]): OccasionChoice[] {
  const occasions: OccasionChoice[] = [];
  const designs = new Map<string, DesignChoice[]>();

  for (const card of cards) {
    const category = card.category;
    let designsOfOccasion = designs.get(category.key);

    if (designsOfOccasion === undefined) {
      designsOfOccasion = [];
      designs.set(category.key, designsOfOccasion);
      occasions.push({ key: category.key, name: category.name, designs: designsOfOccasion });
    }
    designsOfOccasion.push(designOf(card));
  }

  return occasions;
}

/** One row of a design index entry: the style and the design it belongs to, inside its occasion. */
interface StyleEntry {
  occasion: OccasionChoice;
  design: DesignChoice;
  style: StyleChoice;
}

/** The style a published version id names, with its design and occasion, or nothing. */
function styleEntry(
  occasions: readonly OccasionChoice[],
  versionId: string | undefined,
): StyleEntry | undefined {
  if (versionId === undefined) {
    return undefined;
  }

  for (const occasion of occasions) {
    for (const design of occasion.designs) {
      const style = design.styles.find((candidate) => candidate.versionId === versionId);

      if (style !== undefined) {
        return { occasion, design, style };
      }
    }
  }
  return undefined;
}

/** A step number the query names, or nothing for a value that is not one of the three steps. */
function requestedStep(value: string | undefined): ChooserStep | undefined {
  return CHOOSER_STEPS.find((step) => String(step) === value);
}

/**
 * Where the query lands. The published version in the query wins over the design it belongs to, and the
 * design wins over the occasion, so a finer selection always decides the coarser ones; a value that
 * contradicts the finer one is dropped instead of the finer one. The step is the one the query names,
 * clamped to what the current selection allows: steps 2 and 3 need a design, so a step past the selection
 * falls back to the step that is still missing.
 */
export function resolveChooserStep(
  occasions: readonly OccasionChoice[],
  packages: readonly ChoiceCard[],
  query: ChooserQuery,
): ChooserState {
  const themed = styleEntry(occasions, firstValue(query[THEME_PARAM]));
  const party = firstValue(query[OCCASION_PARAM]);
  const namedOccasion = occasions.find((occasion) => occasion.key === party);
  const namedDesign = firstValue(query[DESIGN_PARAM]);

  const occasion =
    themed !== undefined && (namedOccasion === undefined || namedOccasion === themed.occasion)
      ? themed.occasion
      : (namedOccasion ?? occasions[0]);
  // The query's own design wins over the one its version belongs to, so a hand-edited or stale pair keeps
  // the design it names and only loses the version: a finer value never overrides the one already chosen.
  const design =
    (occasion === undefined
      ? undefined
      : occasion.designs.find((candidate) => candidate.componentKey === namedDesign)) ??
    (themed !== undefined && occasion === themed.occasion ? themed.design : undefined);
  const style =
    design === undefined ? undefined : design === themed?.design ? themed.style : design.styles[0];
  const chosenPackage =
    packages.find((candidate) => candidate.value === firstValue(query[PACKAGE_PARAM])) ??
    packages[0];

  // Step 3 is the package and the create form, so it needs the theme the customer confirmed; a step past
  // what the selection allows falls back to the step that is still missing.
  const highest: ChooserStep = design === undefined ? 1 : design === themed?.design ? 3 : 2;
  const fallback: ChooserStep = design === undefined ? 1 : 2;
  const asked = requestedStep(firstValue(query[STEP_PARAM]));
  const step = asked === undefined ? fallback : (Math.min(asked, highest) as ChooserStep);

  return {
    step,
    ...(occasion === undefined ? {} : { occasion }),
    ...(design === undefined ? {} : { design }),
    ...(style === undefined ? {} : { style }),
    ...(chosenPackage === undefined ? {} : { package: chosenPackage }),
  };
}

/** The page section id each step's heading carries; the step URL's hash lands the browser there. */
const STEP_SECTIONS: Readonly<Record<ChooserStep, string>> = {
  1: "paso-diseno",
  2: "paso-tema",
  3: "paso-paquete",
};

/**
 * One step's URL with the whole selection kept, so going back never loses what was already chosen. The
 * parameters are written in a fixed order and the values are the ones the catalog published: a
 * `componentKey`, a version id, a category key, and a package id. The fragment scrolls to the target step's
 * heading, so a server navigation never lands back at the top of the page.
 */
export function stepHref(selection: ChooserSelection, step: ChooserStep): string {
  const parameters = new URLSearchParams();

  parameters.set(STEP_PARAM, String(step));
  if (selection.occasion !== undefined) {
    parameters.set(OCCASION_PARAM, selection.occasion.key);
  }
  if (selection.design !== undefined) {
    parameters.set(DESIGN_PARAM, selection.design.componentKey);
  }
  if (selection.style !== undefined) {
    parameters.set(THEME_PARAM, selection.style.versionId);
  }
  if (selection.package !== undefined) {
    parameters.set(PACKAGE_PARAM, selection.package.value);
  }
  return `${INVITATION_PATHS.create}?${parameters.toString()}#${STEP_SECTIONS[step]}`;
}

/** The theme step of one published version, which is the way back from the full sample preview (S9). */
export function themeStepPath(versionId: string): string {
  const parameters = new URLSearchParams([
    [STEP_PARAM, "2"],
    [THEME_PARAM, versionId],
  ]);

  return `${INVITATION_PATHS.create}?${parameters.toString()}#${STEP_SECTIONS[2]}`;
}

/**
 * Where the step's primary action goes, with one choice made if the query still names none: each step is a
 * server URL, so the first design and its first style are what «Continuar» on step 1 opens. Step 3 is the
 * create form's own submit, so it has no link.
 */
export function continueHref(state: ChooserState): string | undefined {
  if (state.step === 3) {
    return undefined;
  }
  if (state.step === 2) {
    return state.design === undefined ? undefined : stepHref(state, 3);
  }

  const design = state.design ?? state.occasion?.designs[0];

  if (design === undefined) {
    return undefined;
  }
  return stepHref({ ...state, design, style: state.style ?? design.styles[0] }, 2);
}

/** The previous step with the whole selection kept; step 1 has no earlier step to go back to. */
export function backHref(state: ChooserState): string | undefined {
  if (state.step === 1) {
    return undefined;
  }
  return stepHref(state, state.step === 3 ? 2 : 1);
}

/** The two values the create form posts: the published version id, and the chosen package (S8). */
export interface DraftChoice {
  readonly templateVersionId: string;
  readonly packageId: string;
}

/** What the create form submits, or nothing while the selection is still missing a style or a package. */
export function draftChoice(state: ChooserState): DraftChoice | undefined {
  if (state.style === undefined || state.package === undefined) {
    return undefined;
  }
  return { templateVersionId: state.style.versionId, packageId: state.package.value };
}

/** The short summary of the current selection, as the artboard's footer bar writes it (S10). */
export function selectionSummary(state: ChooserState): string | undefined {
  const parts = [
    state.design?.title,
    state.step > 1 ? state.style?.label : undefined,
    state.step === 3 ? state.package?.name : undefined,
  ].filter((part): part is string => part !== undefined && part.length > 0);

  return parts.length === 0 ? undefined : parts.join(" · ");
}
