/**
 * Shared Tailwind classes of the customer pages, taken from the landing page (`app/page.tsx`) so the
 * pages read as one product. Focus styles use `focus-visible`, so keyboard users always see them.
 */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950";

export const primaryButton = `inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-700 sm:w-auto ${focusRing}`;

export const quietButton = `inline-flex min-h-11 items-center rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-900 transition-colors hover:border-orange-300 hover:bg-orange-50 disabled:cursor-wait disabled:opacity-60 ${focusRing}`;

export const textButton = `rounded-md text-sm font-bold text-orange-800 underline decoration-orange-300 decoration-2 underline-offset-4 transition-colors hover:text-orange-900 hover:decoration-orange-500 disabled:cursor-wait disabled:opacity-60 ${focusRing}`;

export const fieldLabel = "block text-sm font-bold text-slate-950";

export const textField =
  "mt-2 block w-full rounded-2xl border border-orange-200 bg-orange-50/40 px-4 py-3 text-base text-slate-950 placeholder:text-slate-400 transition-colors hover:border-orange-300 focus:border-orange-700 focus:bg-white focus:outline-2 focus:outline-offset-2 focus:outline-orange-700 aria-invalid:border-red-700";

export const fieldHint = "mt-2 text-sm leading-6 text-slate-600";

export const statusNote = "rounded-2xl bg-orange-50 px-4 py-3 text-sm leading-6 text-slate-800";

export const errorNote =
  "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900";
