import type { ReactNode } from "react";

import { Ornament } from "./ornament.tsx";
import { CustomerPageFrame } from "./customer-shell.tsx";

/**
 * The wine button of a page header (M4 T8; S11, S12): `primaryButton` at its own width instead of the
 * full width a form's one main action takes. Same tokens, radius, shadow, and focus ring.
 */
export const pageActionButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary bg-linear-to-b from-primary from-55% to-primary-deep px-6 py-2.5 font-sans text-sm font-medium tracking-[0.03em] text-on-primary shadow-button ring-1 ring-primary-deep transition-[transform,background-color] duration-150 ease-out-soft hover:from-primary-deep active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary";

interface CustomerWorkspaceShellProperties {
  eyebrow: string;
  heading: string;
  intro: string;
  /** The page's main action, at the right of the header. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The wide frame of the invitation pages (M4 T8; S11, S12). The owner tried the centered card of
 * `CustomerShell` and found the pages scrolled too much, as with the administration pages, so this keeps
 * the customer theme (`paper-wash`, the corner flowers, the header with the wordmark, the eyebrow with
 * its bud, the display serif) and replaces the card with a compact page header and up to `max-w-[100rem]`
 * of content, so the working pages use a wide screen; the header widens with it, so the menu stays aligned
 * with the page. `/cuenta` and the sign-in pages keep the centered card.
 */
export function CustomerWorkspaceShell({
  eyebrow,
  heading,
  intro,
  actions,
  children,
}: CustomerWorkspaceShellProperties) {
  const widthClass = "max-w-[100rem]";

  return (
    <CustomerPageFrame className="pb-16 sm:pb-20" widthClass={widthClass}>
      <div className={`mx-auto w-full ${widthClass} pt-8 sm:pt-10`}>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0 max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-surface/75 py-1 pl-2.5 pr-3.5 text-xs font-medium uppercase tracking-[0.18em] text-primary ring-1 ring-gold/55">
              <Ornament className="size-4" name="bud" />
              {eyebrow}
            </p>
            <h1 className="mt-2.5 font-display text-[2rem] font-semibold leading-[1.1] text-balance text-ink sm:text-[2.5rem]">
              {heading}
            </h1>
            <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-pretty text-muted">
              {intro}
            </p>
          </div>
          {actions === undefined ? null : (
            <div className="flex flex-wrap items-center gap-3">{actions}</div>
          )}
        </div>

        <div className="mt-6 sm:mt-7">{children}</div>
      </div>
    </CustomerPageFrame>
  );
}
