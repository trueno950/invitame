import type { ReactElement } from "react";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";

interface OptionCardProperties {
  /** Where choosing this option goes: its own step URL with this value in the query. */
  href: string;
  value: string;
  title: string;
  /** The price in force of a package, always shown with the name. */
  meta: string;
  description: string | null;
  selected: boolean;
}

/**
 * One package of «Nueva invitación» as a card (M4 T8, T10b; S11, S10). Every choice of the step flow is a
 * server URL, so the card is a link carrying the package id: choosing it reloads the step with that package
 * selected, the summary follows, and the create form posts it. The chosen card is outlined and named
 * «Elegido» as well as linked, so its state never relies on color alone.
 */
export function OptionCard({
  href,
  value,
  title,
  meta,
  description,
  selected,
}: OptionCardProperties): ReactElement {
  return (
    <a
      aria-current={selected ? "true" : undefined}
      className={`group relative flex flex-col gap-1.5 rounded-panel p-4 text-left ring-[1.5px] transition-colors duration-150 ease-out-soft hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary ${
        selected ? "bg-rose-50 ring-2 ring-primary" : "bg-surface ring-field-border"
      }`}
      data-package={value}
      href={href}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium text-ink">{title}</span>
        {selected ? (
          <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.1em] text-primary ring-1 ring-primary/40">
            {INVITATION_COPY.chosen}
          </span>
        ) : null}
      </span>
      <span className="text-sm font-medium text-primary">{meta}</span>
      {description === null ? null : (
        <span className="text-sm leading-6 text-muted">{description}</span>
      )}
    </a>
  );
}
