import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";

/** One row of the read-only view: a property of the stored content, and its Spanish label. */
export interface SummaryRow {
  name: string;
  label: string;
}

interface ContentSummaryProperties {
  rows: readonly SummaryRow[];
  content: Record<string, unknown>;
}

/**
 * The stored content as text, used when the draft cannot be edited: it is archived (A3, S7), or its
 * pinned version is no longer in the creator catalog and the form cannot know its fields. Publication is
 * Milestone 5, so the slug is shown as text and never linked.
 */
export function ContentSummary({ rows, content }: ContentSummaryProperties) {
  return (
    <dl className="grid gap-4">
      {rows.map((row) => {
        const value = Object.hasOwn(content, row.name) ? content[row.name] : undefined;
        const shown = value === undefined || value === null ? "" : String(value);

        return (
          <div key={row.name}>
            <dt className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {row.label}
            </dt>
            <dd className={`mt-1 break-words ${shown === "" ? "text-muted" : "text-ink"}`}>
              {shown === "" ? INVITATION_COPY.valueEmpty : shown}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
