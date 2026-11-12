import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";

interface OptionCardProperties {
  /** The form field the whole group submits, such as `templateVersionId`. */
  name: string;
  value: string;
  title: string;
  /** The category of a template, or the price of a package. */
  meta: string;
  description: string | null;
  defaultChecked: boolean;
}

/**
 * One choice of «Nueva invitación» as a card (M4 T8; S11): a native radio inside its label, so the card
 * is the control and no script is needed. The radio stays in the tab order but is drawn as the card's
 * own state, and the card answers `focus-within`, so a keyboard user sees where they are. The chosen
 * card is named «Elegido» as well as outlined, so its state never relies on color alone.
 */
export function OptionCard({
  name,
  value,
  title,
  meta,
  description,
  defaultChecked,
}: OptionCardProperties) {
  return (
    <label className="group flex cursor-pointer flex-col gap-1.5 rounded-panel bg-surface p-4 text-left ring-[1.5px] ring-field-border transition-colors duration-150 ease-out-soft hover:bg-rose-50 focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-primary has-[:checked]:bg-rose-50 has-[:checked]:ring-2 has-[:checked]:ring-primary">
      <input
        className="sr-only"
        defaultChecked={defaultChecked}
        name={name}
        type="radio"
        value={value}
      />
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium text-ink">{title}</span>
        <span className="hidden shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.1em] text-primary ring-1 ring-primary/40 group-has-[:checked]:inline">
          {INVITATION_COPY.chosen}
        </span>
      </span>
      <span className="text-sm font-medium text-primary">{meta}</span>
      {description === null ? null : (
        <span className="text-sm leading-6 text-muted">{description}</span>
      )}
    </label>
  );
}
