import type { ReactElement } from "react";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import {
  type LayoutCardView,
  previewPath,
  previewSwitchCss,
  type SingleTemplateCardView,
  TEMPLATE_FIELD_NAME,
} from "../../../../lib/customer/template-preview.ts";
import { findRenderer } from "../../../../lib/renderers/registry.ts";
import type { SampleInvitation } from "../../../../lib/renderers/samples.ts";
import { textButton } from "../../../_components/ui.ts";

/*
 * The cards of «Nueva invitación» with a live miniature (T9; S9). A themed layout is one card: the
 * miniature of the theme that is chosen, a switch per theme, and one «Ver completa» link per theme, so
 * changing the theme changes the miniature and selects that version for the form without a line of client
 * script. The rules that show the chosen theme's miniature and link are generated from the card's own
 * version ids (`previewSwitchCss`) and rendered as a `<style>` element; the switches themselves are native
 * radios inside their labels.
 */

/** The layouts draw a phone-width page of 390 px, and the miniature shows the top of it, scaled down. */
const PREVIEW_WIDTH = 390;
const PREVIEW_SCALE = 0.6;
const PREVIEW_HEIGHT = 300;

const CARD =
  "group flex flex-col gap-3 rounded-panel bg-surface p-4 text-left ring-[1.5px] ring-field-border transition-colors duration-150 ease-out-soft has-[:checked]:bg-rose-50 has-[:checked]:ring-2 has-[:checked]:ring-primary";
const CHOSEN_BADGE =
  "hidden shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.1em] text-primary ring-1 ring-primary/40 group-has-[:checked]:inline";
const THEME_LABEL =
  "inline-flex min-h-9 cursor-pointer items-center rounded-full bg-rose-50 px-3 text-sm font-medium text-ink ring-1 ring-field-border transition-colors peer-checked:bg-primary peer-checked:text-on-primary peer-checked:ring-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary";
const CARD_TITLE = "font-medium text-ink";
const CARD_META = "text-sm font-medium text-primary";
const CARD_BODY = "text-sm leading-6 text-muted";

/**
 * The sample invitation as the card shows it. The renderer draws its own viewport-sized background layer
 * with `position: fixed`; the scaled wrapper makes it the containing block of that layer, and
 * `contain: paint` clips it to the frame, so a miniature never paints behind the page. The frame is
 * decoration for assistive technology: the switches carry the same information as text.
 */
function Miniature({
  componentKey,
  sample,
}: {
  componentKey: string;
  sample: SampleInvitation;
}): ReactElement | null {
  const Renderer = findRenderer(componentKey);

  if (Renderer === undefined) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative mx-auto overflow-hidden rounded-xl bg-surface ring-1 ring-gold/45"
      data-miniature-frame=""
      style={{
        width: PREVIEW_WIDTH * PREVIEW_SCALE,
        height: PREVIEW_HEIGHT,
        contain: "paint",
      }}
    >
      <div
        style={{
          width: PREVIEW_WIDTH,
          transform: `scale(${PREVIEW_SCALE})`,
          transformOrigin: "top left",
        }}
      >
        <Renderer configuration={sample.configuration} content={sample.content} />
      </div>
    </div>
  );
}

/** One theme switch: a native radio drawn as a chip, inside its label, so no script is needed. */
function ThemeSwitch({
  checked,
  label,
  versionId,
}: {
  checked: boolean;
  label: string;
  versionId: string;
}): ReactElement {
  return (
    <label className="inline-flex">
      <input
        className="peer sr-only"
        data-theme-choice={versionId}
        defaultChecked={checked}
        name={TEMPLATE_FIELD_NAME}
        type="radio"
        value={versionId}
      />
      <span className={THEME_LABEL}>{label}</span>
    </label>
  );
}

/** One card per themed layout: its miniature per theme, the theme switches, and «Ver completa». */
export function LayoutChoiceCard({
  card,
  selectedVersionId,
}: {
  card: LayoutCardView;
  selectedVersionId: string | undefined;
}): ReactElement {
  return (
    <div className={CARD} data-preview-group={card.groupId}>
      <style>{previewSwitchCss(card)}</style>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={CARD_TITLE}>{card.title}</p>
          <p className={CARD_META}>{card.meta}</p>
        </div>
        <span className={CHOSEN_BADGE}>{INVITATION_COPY.chosen}</span>
      </div>
      <p className={CARD_BODY}>{card.description}</p>

      <div className="relative" style={{ height: PREVIEW_HEIGHT }}>
        {card.options.map((option) => (
          <div
            className="absolute inset-x-0 top-0"
            data-miniature={option.versionId}
            key={option.versionId}
          >
            <Miniature componentKey={card.componentKey} sample={option.sample} />
          </div>
        ))}
      </div>

      <fieldset className="flex flex-wrap gap-2 border-0 p-0">
        <legend className="sr-only">{INVITATION_COPY.themeLabel}</legend>
        {card.options.map((option) => (
          <ThemeSwitch
            checked={option.versionId === selectedVersionId}
            key={option.versionId}
            label={option.label}
            versionId={option.versionId}
          />
        ))}
      </fieldset>

      <div className="flex justify-end">
        {card.options.map((option) => (
          <a
            className={textButton}
            data-preview-link={option.versionId}
            href={previewPath(option.versionId)}
            key={option.versionId}
          >
            {INVITATION_COPY.viewFull}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * The card of a template without themes, such as `birthday-adventure-01` or a template of another
 * category: its own miniature when its renderer takes the sample, and «Ver completa» for the same sample.
 * The radio lives in the label that holds the text, and the miniature and the link sit outside it, so
 * neither of them selects the card by accident.
 */
export function TemplateChoiceCard({
  card,
  checked,
}: {
  card: SingleTemplateCardView;
  checked: boolean;
}): ReactElement {
  const sample = card.sample;

  return (
    <div className={CARD}>
      <label className="flex cursor-pointer flex-col gap-1.5">
        <input
          className="sr-only"
          defaultChecked={checked}
          name={TEMPLATE_FIELD_NAME}
          type="radio"
          value={card.versionId}
        />
        <span className="flex items-start justify-between gap-2">
          <span className={CARD_TITLE}>{card.title}</span>
          <span className={CHOSEN_BADGE}>{INVITATION_COPY.chosen}</span>
        </span>
        <span className={CARD_META}>{card.meta}</span>
        {card.description === null ? null : <span className={CARD_BODY}>{card.description}</span>}
      </label>

      {sample === undefined ? null : <Miniature componentKey={card.componentKey} sample={sample} />}

      <div className="flex justify-end">
        <a className={textButton} href={previewPath(card.versionId)}>
          {INVITATION_COPY.viewFull}
        </a>
      </div>
    </div>
  );
}
