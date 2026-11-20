import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ANALYTICS_COPY, ANALYTICS_PATHS } from "../../../lib/admin/analytics/copy.ts";
import { parseAnalyticsPeriod } from "../../../lib/admin/analytics/search.ts";
import { SIGN_IN_PATH } from "../../../lib/admin/catalog/commands.ts";
import { ADMIN_SHELL_COPY } from "../../../lib/admin/copy.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { adminAnalytics } from "../../../lib/server/admin-analytics-api.ts";
import type {
  AnalyticsFailure,
  AnalyticsFunnel,
  AnalyticsResult,
  AnalyticsViews,
} from "../../../lib/server/admin-analytics-client.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { AdminShell } from "../_components/admin-shell.tsx";
import { AnalyticsFiltersForm } from "./_components/analytics-filters.tsx";
import { FunnelTable, TopInvitationsTable, ViewsTable } from "./_components/analytics-tables.tsx";
import { AnalyticsUnavailable } from "./_components/analytics-unavailable.tsx";

export const metadata: Metadata = { title: ANALYTICS_COPY.pageTitle };

/**
 * `/admin/analitica`: the analytics of one bounded window (M9 T12; S2, S3, S7). The page asks the API for the daily
 * aperturas with the bounded top invitations and for the daily purchase funnel of the window its own query validated,
 * then shows them as tables: no chart, no chart library, and no number the API did not answer.
 *
 * An «apertura» is one served opening of an invitation link, reloads and the owner's own visit included (L12), so the
 * page never turns a count into people. The API stores no IP, user agent, referrer, or session for a view (S7), keeps
 * the rows 90 days (S3), and cuts the day in `America/Mexico_City`; a window outside its bound is never sent, because
 * the page falls back to the last 30 days first.
 *
 * The session read here only chooses the page, as on every administration page: the API answers `@AdminOnly()` on its
 * own. The page is read-only.
 */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("analytics", view.kind);

  if (target !== null) {
    redirect(target);
  }

  if (view.kind !== "administrator") {
    return <AnalyticsUnavailable />;
  }

  const period = parseAnalyticsPeriod(await searchParams);
  let views: AnalyticsResult<AnalyticsViews>;
  let funnel: AnalyticsResult<AnalyticsFunnel>;
  try {
    [views, funnel] = await Promise.all([
      adminAnalytics.views(period.from, period.to),
      adminAnalytics.funnel(period.from, period.to),
    ]);
  } catch {
    // An unexpected failure is already logged by the server wrapper; the page never shows a body it could not read.
    return <AnalyticsUnavailable />;
  }

  if (!views.ok) {
    return analyticsFailurePage(views.failure);
  }
  if (!funnel.ok) {
    return analyticsFailurePage(funnel.failure);
  }

  return (
    <AdminShell
      breadcrumbs={[
        { label: ADMIN_SHELL_COPY.panel, href: ANALYTICS_PATHS.panel },
        { label: ANALYTICS_COPY.heading },
      ]}
      current="analytics"
      description={ANALYTICS_COPY.intro}
      heading={ANALYTICS_COPY.heading}
    >
      <AnalyticsFiltersForm period={period} />
      <ViewsTable days={views.value.days} />
      <FunnelTable days={funnel.value.days} />
      <TopInvitationsTable items={views.value.topInvitations} />
    </AdminShell>
  );
}

/**
 * The page of each refusal a read can answer. A session that expired goes to the sign-in page and a customer to their
 * own; any other refusal (a window the page itself already validated, or an outage) is the retry notice, so the page
 * never renders an empty table as if the period had no activity.
 */
function analyticsFailurePage(failure: AnalyticsFailure) {
  if (failure === "signed-out") {
    redirect(SIGN_IN_PATH);
  }
  if (failure === "forbidden") {
    redirect("/cuenta");
  }

  return <AnalyticsUnavailable />;
}
