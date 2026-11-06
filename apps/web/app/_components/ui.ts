/**
 * Shared Tailwind classes of the themed pages (M2 T8t; S35). Every color is a token from the
 * `@theme` block of `app/globals.css`; `lib/theme/contrast.test.ts` checks the text pairs, including
 * the colors of `statusNote` and `errorNote`, at 4.5:1 and the field border at 3:1.
 *
 * - Buttons: `primaryButton` is wine with white text for the one main action of a form;
 *   `quietButton` is a white pill with a field-border outline for secondary actions; `textButton`
 *   is an underlined wine link for small actions.
 * - Fields: `fieldLabel`, `textField` (1.5 px border at 3:1, wine border and outline on focus, a
 *   pink fill when `aria-invalid`), and `fieldHint` in muted text.
 * - Notes: `statusNote` (ink on the pale pink tint) for progress and confirmations; `errorNote`
 *   (deep wine on white with a wine edge) for failures, so an error never relies on color alone.
 * - Focus: `focusRing` draws a 2 px wine outline on `focus-visible`, so keyboard users always see
 *   it; text fields show it on every focus.
 */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary";

export const primaryButton = `inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-primary bg-linear-to-b from-primary from-55% to-primary-deep px-7 py-3 font-sans text-base font-medium tracking-[0.03em] text-on-primary shadow-button ring-1 ring-primary-deep transition-[transform,background-color] duration-150 ease-out-soft hover:from-primary-deep active:scale-[0.97] disabled:cursor-wait disabled:from-primary-deep disabled:active:scale-100 ${focusRing}`;

export const quietButton = `inline-flex min-h-11 items-center justify-center rounded-full bg-surface px-5 py-2.5 text-sm font-medium tracking-[0.02em] text-primary ring-[1.5px] ring-field-border transition-[transform,background-color] duration-150 ease-out-soft hover:bg-rose-50 active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 disabled:active:scale-100 ${focusRing}`;

export const textButton = `rounded-sm text-sm font-medium text-primary underline decoration-rose decoration-2 underline-offset-4 transition-colors hover:text-primary-deep hover:decoration-primary disabled:cursor-wait disabled:opacity-70 ${focusRing}`;

export const fieldLabel = "block text-sm font-medium text-ink";

export const textField =
  "mt-2 block min-h-13.5 w-full rounded-field border-[1.5px] border-field-border bg-surface px-4.5 py-3 text-base text-ink placeholder:text-placeholder transition-[border-color,background-color] hover:border-primary focus:border-primary focus:outline-2 focus:outline-offset-2 focus:outline-primary aria-invalid:border-primary aria-invalid:bg-rose-50";

export const fieldHint = "mt-2 text-sm leading-6 text-muted";

export const statusNote =
  "rounded-field border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-ink";

export const errorNote =
  "rounded-field border border-l-4 border-primary/40 border-l-primary bg-surface px-4 py-3 text-sm leading-6 text-primary-deep";
