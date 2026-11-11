import Link from "next/link";
import type { ReactNode } from "react";

import { CATALOG_TABLE_COPY } from "../../../../lib/admin/catalog/copy.ts";
import {
  adminButtonGhost,
  adminButtonSmall,
  adminCard,
  adminTable,
  adminTableCell,
  adminTableHead,
} from "../../_components/admin-ui.ts";

export interface CatalogColumn {
  label: string;
  align?: "right";
  /** Read by screen readers only, as for the actions column. */
  hidden?: boolean;
}

interface CatalogTableProperties {
  /** Names the table for screen readers; usually the page heading. */
  caption: string;
  columns: readonly CatalogColumn[];
  total: number;
  /** Shown instead of the table when there are no rows. */
  empty: string;
  children: ReactNode;
}

/** A catalog list as a dense table in a card, with the number of records above it. */
export function CatalogTable({ caption, columns, total, empty, children }: CatalogTableProperties) {
  return (
    <div className={adminCard}>
      <p className="border-b border-admin-border px-4 py-2.5 text-xs text-admin-muted">
        {CATALOG_TABLE_COPY.count(total)}
      </p>
      {total === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-admin-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={adminTable}>
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    className={`${adminTableHead} ${column.align === "right" ? "text-right" : ""}`}
                    key={column.label}
                    scope="col"
                  >
                    {column.hidden ? <span className="sr-only">{column.label}</span> : column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The first cell of a row: the record's name, linked to its edit page, and its key. */
export function NameCell({
  href,
  name,
  recordKey,
}: {
  href: string;
  name: string;
  recordKey: string;
}) {
  return (
    <td className={adminTableCell}>
      <Link className="font-medium text-admin-ink hover:underline" href={href}>
        {name}
      </Link>
      <span className="mt-0.5 block font-mono text-xs break-all text-admin-muted">{recordKey}</span>
    </td>
  );
}

/** The last cell of a row: the edit link, named after the record for screen readers. */
export function EditCell({ href, name }: { href: string; name: string }) {
  return (
    <td className={`${adminTableCell} text-right`}>
      <Link className={`${adminButtonGhost} ${adminButtonSmall}`} href={href}>
        {CATALOG_TABLE_COPY.edit}
        <span className="sr-only"> {name}</span>
      </Link>
    </td>
  );
}
