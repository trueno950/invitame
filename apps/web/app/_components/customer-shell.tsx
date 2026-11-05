import Link from "next/link";
import type { ReactNode } from "react";

import { focusRing } from "./ui.ts";

interface CustomerShellProperties {
  eyebrow: string;
  heading: string;
  intro: string;
  /** Optional supporting text under the intro, on the left on wide screens. */
  aside?: ReactNode;
  /** The page's main panel: a form or the account details. */
  children: ReactNode;
}

/**
 * The frame of the customer pages (M2 T8c; L39): the landing page's warm band, wordmark, and type,
 * with the heading on the left and one white panel on the right; stacked on small screens.
 */
export function CustomerShell({
  eyebrow,
  heading,
  intro,
  aside,
  children,
}: CustomerShellProperties) {
  return (
    <main className="min-h-screen overflow-hidden bg-orange-50 text-slate-900">
      <div className="relative isolate px-6 pb-20 pt-6 sm:px-10 lg:px-16">
        <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-amber-100" aria-hidden="true" />
        <nav className="mx-auto flex max-w-6xl items-center justify-between" aria-label="Principal">
          <Link
            className={`rounded-md text-xl font-black tracking-tight text-orange-700 ${focusRing}`}
            href="/"
          >
            InvitaMe
          </Link>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-10 pt-12 sm:pt-16 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-start lg:gap-16 lg:pt-24">
          <div className="lg:pt-6">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">
              {eyebrow}
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-black tracking-tight text-balance text-slate-950 sm:text-5xl">
              {heading}
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-pretty text-slate-700">{intro}</p>
            {aside}
          </div>

          <div className="w-full rounded-[2rem] border border-orange-200 bg-white p-6 shadow-xl shadow-orange-200/50 sm:p-8">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
