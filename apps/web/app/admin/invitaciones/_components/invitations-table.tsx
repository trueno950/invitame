import Link from "next/link";

import { INVITATIONS_COPY } from "../../../../lib/admin/invitations/copy.ts";
import { invitationRowView } from "../../../../lib/admin/invitations/rows.ts";
import type { AdminInvitationSummary } from "../../../../lib/server/admin-invitations-client.ts";
import { StatusBadge } from "../../_components/status-badge.tsx";
import {
  adminButtonOutline,
  adminCard,
  adminTable,
  adminTableCell,
  adminTableHead,
  adminTableRow,
} from "../../_components/admin-ui.ts";

/**
 * The invitation search's table (M9 T3; S1): the slug, its state, the owner's email, the payment, the photos, and the
 * created date. Every slug links to the invitation's status page. The owner is «solo el correo» (L3): no name, no
 * content, no guest data, and the API does not send any of them.
 */
export function InvitationsTable({
  items,
  empty,
  nextHref,
}: {
  items: readonly AdminInvitationSummary[];
  /** The empty state's sentence, which says whether a filter or the whole list is empty. */
  empty: string;
  /** The next page's link, or undefined on the last page. */
  nextHref: string | undefined;
}) {
  return (
    <>
      <div className={adminCard}>
        <p className="border-b border-admin-border px-4 py-2.5 text-xs text-admin-muted">
          {INVITATIONS_COPY.count(items.length)}
        </p>
        {items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-admin-muted">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={adminTable}>
              <caption className="sr-only">{INVITATIONS_COPY.tableCaption}</caption>
              <thead>
                <tr>
                  <th className={adminTableHead} scope="col">
                    {INVITATIONS_COPY.slugColumn}
                  </th>
                  <th className={adminTableHead} scope="col">
                    {INVITATIONS_COPY.statusColumn}
                  </th>
                  <th className={adminTableHead} scope="col">
                    {INVITATIONS_COPY.ownerColumn}
                  </th>
                  <th className={adminTableHead} scope="col">
                    {INVITATIONS_COPY.paymentColumn}
                  </th>
                  <th className={adminTableHead} scope="col">
                    {INVITATIONS_COPY.photosColumn}
                  </th>
                  <th className={`${adminTableHead} whitespace-nowrap`} scope="col">
                    {INVITATIONS_COPY.createdAtColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const row = invitationRowView(item);

                  return (
                    <tr className={adminTableRow} key={row.invitationId}>
                      <td className={`${adminTableCell} font-medium`}>
                        <Link className="text-admin-ink hover:underline" href={row.href}>
                          {row.slug}
                        </Link>
                      </td>
                      <td className={adminTableCell}>
                        <StatusBadge label={row.statusLabel} status={item.status} />
                      </td>
                      <td className={`${adminTableCell} text-admin-muted`}>{row.ownerEmail}</td>
                      <td className={adminTableCell}>{row.payment}</td>
                      <td className={`${adminTableCell} text-admin-muted`}>{row.photos}</td>
                      <td className={`${adminTableCell} whitespace-nowrap text-admin-muted`}>
                        <time dateTime={item.createdAt}>{row.created}</time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {nextHref === undefined ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-admin-muted">{INVITATIONS_COPY.nextPageHint}</p>
          <Link className={adminButtonOutline} href={nextHref}>
            {INVITATIONS_COPY.nextPage}
          </Link>
        </div>
      )}
    </>
  );
}
