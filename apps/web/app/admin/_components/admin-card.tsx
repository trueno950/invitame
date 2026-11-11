import type { ReactNode } from "react";

import { adminCard, adminCardDescription, adminCardHeader, adminCardTitle } from "./admin-ui.ts";

interface AdminCardProperties {
  /** The heading's id; the section is labelled by it, so it must be unique within the page. */
  id: string;
  title: string;
  /** A line under the title, such as what the card's form changes. */
  description?: ReactNode;
  /** Extra classes on the section, such as `lg:col-span-2` or `lg:sticky`. */
  className?: string | undefined;
  children: ReactNode;
}

/**
 * A titled card of the administration pages: a `<section>` labelled by its `<h2>`, the header with
 * the title and an optional description, then the card's own content (a body, a form, or a list).
 */
export function AdminCard({ id, title, description, className, children }: AdminCardProperties) {
  return (
    <section
      aria-labelledby={id}
      className={className === undefined ? adminCard : `${adminCard} ${className}`}
    >
      <div className={adminCardHeader}>
        <div>
          <h2 className={adminCardTitle} id={id}>
            {title}
          </h2>
          {description === undefined ? null : <p className={adminCardDescription}>{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** The quiet line a card shows when it has nothing to list yet. */
export function AdminCardEmpty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-4 text-sm text-admin-muted">{children}</p>;
}
