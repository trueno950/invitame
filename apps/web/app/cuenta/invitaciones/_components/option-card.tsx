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
  /** The included features as Spanish labels, in the catalog's order. */
  features: string[];
  /** Whether this is the recommended package, shown with a gold badge. */
  featured: boolean;
}

/**
 * One package of «Nueva invitación» as a card (M4 T8, T10b; S11, S10). Every choice of the step flow is a
 * server URL, so the card is a link carrying the package id: choosing it reloads the step with that package
 * selected, the summary follows, and the create form posts it. The chosen card is filled in wine with white
 * text and named «Elegido», so its state never relies on color alone. Each card lists what the package
 * includes, and the recommended one carries a gold badge.
 */
export function OptionCard({
  href,
  value,
  title,
  meta,
  description,
  selected,
  features,
  featured,
}: OptionCardProperties): ReactElement {
  const ink = selected ? "text-on-primary" : "text-ink";
  const accent = selected ? "text-on-primary" : "text-primary";
  const muted = selected ? "text-on-primary/80" : "text-muted";
  const divider = selected ? "border-on-primary/20" : "border-rose-100";

  return (
    <a
      aria-current={selected ? "true" : undefined}
      className={`group relative flex h-full flex-col gap-1.5 rounded-panel p-4 text-left ring-[1.5px] transition-colors duration-150 ease-out-soft focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary ${
        selected
          ? "bg-primary ring-2 ring-primary-deep"
          : "bg-surface ring-field-border hover:ring-primary/50"
      } ${featured && !selected ? "ring-gold/70 shadow-paper" : ""}`}
      data-package={value}
      href={href}
    >
      {featured ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gold px-2.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink ring-1 ring-gold/60">
          {INVITATION_COPY.mostChosen}
        </span>
      ) : null}
      <span className="flex items-start justify-between gap-2">
        <span className={`font-medium ${ink}`}>{title}</span>
        {selected ? (
          <span className="shrink-0 rounded-full bg-on-primary px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
            {INVITATION_COPY.chosen}
          </span>
        ) : null}
      </span>
      <span className={`text-sm font-medium ${accent}`}>{meta}</span>
      {description === null ? null : (
        <span className={`text-sm leading-6 ${muted}`}>{description}</span>
      )}
      {features.length > 0 ? (
        <ul className={`mt-1 flex flex-col gap-1 border-t pt-2 ${divider}`}>
          {features.map((feature) => (
            <li className={`flex items-center gap-2 text-sm ${ink}`} key={feature}>
              <span aria-hidden="true" className={accent}>
                ✓
              </span>
              {feature}
            </li>
          ))}
        </ul>
      ) : null}
    </a>
  );
}
