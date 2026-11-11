import { adminBadge, statusTone } from "./admin-ui.ts";

/**
 * The badge of a catalog status (`DRAFT`, `PUBLISHED`, `ACTIVE`…): the tone comes from
 * `statusTone`, the text is the Spanish label the caller passes, so color is never the only signal.
 */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={adminBadge(statusTone(status))}>{label}</span>;
}
