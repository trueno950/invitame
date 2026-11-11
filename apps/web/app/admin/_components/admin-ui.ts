/**
 * Shared Tailwind classes of the administration pages: a neutral, dense dashboard look in the spirit
 * of shadcn/ui, independent of the customer theme in `app/_components/ui.ts`. Every color is an
 * `admin-*` token from `app/globals.css`; `lib/theme/contrast.test.ts` checks the text pairs,
 * including the colors of `adminStatusNote` and `adminErrorNote`, at 4.5:1 and the field border at
 * 3:1.
 *
 * - Buttons: `adminButton` (solid, the main action of a form), `adminButtonOutline` (secondary),
 *   `adminButtonGhost` (quiet links), and `adminButtonSmall` to shrink any of them.
 * - Fields: `adminLabel`, `adminInput`, `adminTextarea`, `adminSelect` (only through
 *   `AdminSelect`), and `adminHint`; an `aria-invalid` field turns red.
 * - Surfaces: `adminCard` with its header, title, description, and body; the `adminTable*` classes.
 * - Notes and badges: `adminStatusNote`, `adminErrorNote`, and `adminBadge(tone)`.
 */
export const adminFocus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-ink";

const buttonBase = `inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${adminFocus}`;

export const adminButton = `${buttonBase} bg-admin-primary text-admin-on-primary shadow-xs hover:bg-admin-primary-deep`;

export const adminButtonOutline = `${buttonBase} border border-admin-border bg-admin-surface text-admin-ink shadow-xs hover:bg-admin-subtle`;

export const adminButtonGhost = `${buttonBase} text-admin-ink hover:bg-admin-subtle`;

/** Appended to a button class for the compact size used inside tables and side cards. */
export const adminButtonSmall = "h-8 px-3 text-xs";

export const adminLabel = "block text-sm font-medium text-admin-ink";

const fieldControl =
  "block w-full rounded-md border border-admin-input bg-admin-surface px-3 text-sm text-admin-ink shadow-xs placeholder:text-admin-placeholder focus:border-admin-ink focus:outline-2 focus:outline-offset-1 focus:outline-admin-ink/20 aria-invalid:border-admin-danger aria-invalid:bg-admin-danger-subtle";

const fieldBase = `mt-1.5 ${fieldControl}`;

export const adminInput = `${fieldBase} h-9 py-1`;

export const adminTextarea = `${fieldBase} min-h-20 py-2 leading-6`;

/**
 * The `<select>` inside `AdminSelect`: the native arrow is hidden and the right padding leaves room for
 * the component's own chevron, so the arrow never touches the border. The wrapper carries the top
 * margin, so the chevron centers on the control.
 */
export const adminSelect = `${fieldControl} h-9 cursor-pointer appearance-none py-1 pr-9`;

export const adminHint = "mt-1 text-xs leading-5 text-admin-muted";

export const adminCard = "rounded-xl border border-admin-border bg-admin-surface shadow-xs";

export const adminCardHeader =
  "flex flex-wrap items-start justify-between gap-3 border-b border-admin-border px-5 py-4";

export const adminCardTitle = "text-sm font-semibold text-admin-ink";

export const adminCardDescription = "mt-0.5 text-xs leading-5 text-admin-muted";

export const adminCardBody = "px-5 py-4";

export const adminTable = "w-full border-collapse text-left text-sm";

export const adminTableHead =
  "h-10 border-b border-admin-border px-4 text-xs font-medium whitespace-nowrap text-admin-muted";

export const adminTableRow =
  "border-b border-admin-border transition-colors last:border-b-0 hover:bg-admin-subtle";

export const adminTableCell = "px-4 py-2.5 align-middle";

export const adminKey = "font-mono text-xs break-all text-admin-muted";

export const adminStatusNote =
  "rounded-lg border border-admin-border bg-admin-subtle px-4 py-2.5 text-sm text-admin-ink";

export const adminErrorNote =
  "rounded-lg border border-admin-danger/40 border-l-4 border-l-admin-danger bg-admin-danger-subtle px-4 py-2.5 text-sm text-admin-danger";

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

const BADGE_TONES: Readonly<Record<BadgeTone, string>> = {
  neutral: "border-admin-border bg-admin-subtle text-admin-muted",
  success: "border-admin-success/25 bg-admin-success-subtle text-admin-success",
  warning: "border-admin-warning/25 bg-admin-warning-subtle text-admin-warning",
  danger: "border-admin-danger/25 bg-admin-danger-subtle text-admin-danger",
};

/** A small rounded label; the text always names the state, so color is never the only signal. */
export function adminBadge(tone: BadgeTone): string {
  return `inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${BADGE_TONES[tone]}`;
}

/** The badge tone of a catalog status: live states are green, drafts amber, the rest neutral. */
export function statusTone(status: string): BadgeTone {
  if (status === "ACTIVE" || status === "PUBLISHED") {
    return "success";
  }
  if (status === "DRAFT") {
    return "warning";
  }
  return "neutral";
}
