import Link from "next/link";
import type { ReactNode } from "react";

import { Ornament } from "./ornament.tsx";
import { focusRing } from "./ui.ts";
import { Wordmark } from "./wordmark.tsx";

interface CustomerShellProperties {
  eyebrow: string;
  heading: string;
  intro: string;
  /** Optional supporting text, shown under the card. */
  aside?: ReactNode;
  /** The page's main panel: a form or the account details. */
  children: ReactNode;
}

/**
 * The frame of the customer pages (M2 T8c, restyled in T8t; S35): the pink paper wash with
 * fine-line flowers in two corners, a header with the wordmark, and one framed white card with the
 * eyebrow, a gold flourish, the heading, and the intro above the page's panel. Centered on every
 * screen size, as in the approved sign-in concept.
 */
export function CustomerShell({
  eyebrow,
  heading,
  intro,
  aside,
  children,
}: CustomerShellProperties) {
  return (
    <main className="paper-wash relative isolate min-h-screen overflow-hidden px-4 pb-44 pt-4 text-ink sm:px-10 sm:pb-28 sm:pt-6">
      <Ornament
        className="pointer-events-none absolute -right-24 top-16 -z-10 w-56 -scale-100 sm:-right-16 sm:top-24 sm:w-96 lg:w-[30rem]"
        name="corner"
      />
      <Ornament
        className="pointer-events-none absolute -bottom-10 -left-20 -z-10 w-56 sm:-left-16 sm:w-96 lg:w-[30rem]"
        name="corner"
      />

      <header className="mx-auto max-w-6xl">
        <nav
          aria-label="Principal"
          className="flex items-center rounded-full bg-surface/80 px-6 py-2.5 shadow-soft ring-1 ring-gold/35 backdrop-blur-md sm:px-7"
        >
          <Link className={`rounded-lg ${focusRing}`} href="/">
            <Wordmark />
          </Link>
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-[30rem] flex-col items-center pt-12 sm:pt-16 lg:pt-20">
        <div className="w-full rounded-card bg-surface/55 p-2 shadow-paper ring-1 ring-gold/45">
          <div className="rounded-panel bg-surface px-6 pb-6 pt-9 ring-1 ring-rose/50 sm:px-10 sm:pb-7 sm:pt-11">
            <div className="text-center">
              <p className="inline-flex items-center gap-2.5 rounded-full bg-surface/75 py-1.5 pl-3 pr-4 text-xs font-medium uppercase tracking-[0.18em] text-primary ring-1 ring-gold/55">
                <Ornament className="size-4.5" name="bud" />
                {eyebrow}
              </p>
              <Ornament className="mx-auto mt-3 h-auto w-48" name="divider" />
              <h1 className="mt-1 font-display text-[2rem] font-semibold leading-[1.1] text-balance text-ink sm:text-[2.375rem]">
                {heading}
              </h1>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty text-muted">
                {intro}
              </p>
            </div>
            <div className="mt-7">{children}</div>
          </div>
        </div>
        {aside}
      </div>
    </main>
  );
}
