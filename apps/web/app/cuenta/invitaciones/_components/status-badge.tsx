const badge = `inline-flex shrink-0 items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.1em] text-ink ring-1 ring-rose-100`;

/**
 * The status of a draft as a badge (M4 T5; A3). The label is always the Spanish word, so color is never
 * the only signal; the tone is the pale rose tint the customer notes already use.
 */
export function StatusBadge({ label }: { label: string }) {
  return <span className={badge}>{label}</span>;
}
