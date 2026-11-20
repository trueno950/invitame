import Link from "next/link";

import { ANALYTICS_COPY } from "../../../../lib/admin/analytics/copy.ts";
import {
  formatAnalyticsCount,
  funnelDayRows,
  funnelTotals,
  topInvitationRows,
  viewsDayRows,
  viewsTotals,
} from "../../../../lib/admin/analytics/rows.ts";
import type {
  AnalyticsFunnelDay,
  AnalyticsTopInvitation,
  AnalyticsViewsDay,
} from "../../../../lib/server/admin-analytics-client.ts";
import { AdminCard, AdminCardEmpty } from "../../_components/admin-card.tsx";
import {
  adminHint,
  adminTable,
  adminTableCell,
  adminTableHead,
  adminTableRow,
} from "../../_components/admin-ui.ts";

/**
 * The tables of `/admin/analitica` (M9 T12; S2, S3, S7). There is no chart and no chart library: a daily table, its
 * totals row, and the bounded top invitations, so every number is readable and copyable, and the page works with the
 * server rendering alone. The numbers all count aperturas, never people (S7, L12).
 */

/** One day of a daily table, its numbers already formatted. */
interface DayRow {
  readonly day: string;
  readonly label: string;
  readonly cells: readonly string[];
}

/**
 * The shared frame of the two daily tables: the header row, the days oldest first, the totals row of the whole window,
 * and the empty state. The totals row is a `<tfoot>` with a row header, so every number is read with its column, and it
 * is the sum of exactly the rows above it.
 */
function AnalyticsDayTable({
  caption,
  days,
  columns,
  totals,
  empty,
}: {
  caption: string;
  days: readonly DayRow[];
  columns: readonly string[];
  totals: readonly string[];
  empty: string;
}) {
  if (days.length === 0) {
    return <AdminCardEmpty>{empty}</AdminCardEmpty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={adminTable}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th className={adminTableHead} scope="col">
              {ANALYTICS_COPY.dayColumn}
            </th>
            {columns.map((column) => (
              <th className={`${adminTableHead} text-right`} key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr className={adminTableRow} key={day.day}>
              <th className={`${adminTableCell} font-normal text-admin-ink`} scope="row">
                <time dateTime={day.day}>{day.label}</time>
              </th>
              {day.cells.map((cell, index) => (
                <td
                  className={`${adminTableCell} text-right tabular-nums text-admin-ink`}
                  key={columns[index] ?? String(index)}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-admin-border bg-admin-subtle">
            <th className={`${adminTableCell} font-medium text-admin-ink`} scope="row">
              {ANALYTICS_COPY.totalsRow}
            </th>
            {totals.map((total, index) => (
              <td
                className={`${adminTableCell} text-right font-medium tabular-nums text-admin-ink`}
                key={columns[index] ?? String(index)}
              >
                {total}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** The daily aperturas of the window: público, invitados, and their total, with the totals row (S2, S7). */
export function ViewsTable({ days }: { days: readonly AnalyticsViewsDay[] }) {
  const totals = viewsTotals(days);
  const rows: readonly DayRow[] = viewsDayRows(days).map((row) => ({
    day: row.day,
    label: row.label,
    cells: [row.public, row.guest, row.total],
  }));

  return (
    <AdminCard
      description={ANALYTICS_COPY.viewsIntro}
      id="analytics-views"
      title={ANALYTICS_COPY.viewsHeading}
    >
      <p className={`${adminHint} px-5 pt-3`}>{ANALYTICS_COPY.retentionNote}</p>
      <AnalyticsDayTable
        caption={ANALYTICS_COPY.viewsTableCaption}
        columns={[
          ANALYTICS_COPY.publicColumn,
          ANALYTICS_COPY.guestColumn,
          ANALYTICS_COPY.totalColumn,
        ]}
        days={rows}
        empty={ANALYTICS_COPY.viewsEmpty}
        totals={[
          formatAnalyticsCount(totals.public),
          formatAnalyticsCount(totals.guest),
          formatAnalyticsCount(totals.total),
        ]}
      />
    </AdminCard>
  );
}

/** The daily purchase funnel of the window, four steps and a totals row (S2). */
export function FunnelTable({ days }: { days: readonly AnalyticsFunnelDay[] }) {
  const totals = funnelTotals(days);
  const rows: readonly DayRow[] = funnelDayRows(days).map((row) => ({
    day: row.day,
    label: row.label,
    cells: [row.draftsCreated, row.checkoutsStarted, row.paymentsApproved, row.firstPublications],
  }));

  return (
    <AdminCard
      description={ANALYTICS_COPY.funnelIntro}
      id="analytics-funnel"
      title={ANALYTICS_COPY.funnelHeading}
    >
      <AnalyticsDayTable
        caption={ANALYTICS_COPY.funnelTableCaption}
        columns={[
          ANALYTICS_COPY.draftsColumn,
          ANALYTICS_COPY.checkoutsColumn,
          ANALYTICS_COPY.paymentsColumn,
          ANALYTICS_COPY.publicationsColumn,
        ]}
        days={rows}
        empty={ANALYTICS_COPY.funnelEmpty}
        totals={[
          formatAnalyticsCount(totals.draftsCreated),
          formatAnalyticsCount(totals.checkoutsStarted),
          formatAnalyticsCount(totals.paymentsApproved),
          formatAnalyticsCount(totals.firstPublications),
        ]}
      />
    </AdminCard>
  );
}

/** The bounded top invitations of the window, each slug linked to its status detail (S1, S2). */
export function TopInvitationsTable({ items }: { items: readonly AnalyticsTopInvitation[] }) {
  const rows = topInvitationRows(items);

  return (
    <AdminCard
      description={ANALYTICS_COPY.topIntro}
      id="analytics-top-invitations"
      title={ANALYTICS_COPY.topHeading}
    >
      {rows.length === 0 ? (
        <AdminCardEmpty>{ANALYTICS_COPY.topEmpty}</AdminCardEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className={adminTable}>
            <caption className="sr-only">{ANALYTICS_COPY.topTableCaption}</caption>
            <thead>
              <tr>
                <th className={adminTableHead} scope="col">
                  {ANALYTICS_COPY.topSlugColumn}
                </th>
                <th className={`${adminTableHead} text-right`} scope="col">
                  {ANALYTICS_COPY.publicColumn}
                </th>
                <th className={`${adminTableHead} text-right`} scope="col">
                  {ANALYTICS_COPY.guestColumn}
                </th>
                <th className={`${adminTableHead} text-right`} scope="col">
                  {ANALYTICS_COPY.totalColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className={adminTableRow} key={row.invitationId}>
                  <td className={`${adminTableCell} font-medium`}>
                    <Link className="text-admin-ink hover:underline" href={row.href}>
                      {row.slug}
                    </Link>
                  </td>
                  <td className={`${adminTableCell} text-right tabular-nums`}>{row.public}</td>
                  <td className={`${adminTableCell} text-right tabular-nums`}>{row.guest}</td>
                  <td className={`${adminTableCell} text-right tabular-nums`}>{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}
