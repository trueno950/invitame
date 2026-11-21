import Link from "next/link";

import { ANALYTICS_COPY, ANALYTICS_PATHS } from "../../../../lib/admin/analytics/copy.ts";
import { formatAnalyticsDay } from "../../../../lib/admin/analytics/rows.ts";
import type { AnalyticsPeriod } from "../../../../lib/admin/analytics/search.ts";
import {
  adminButton,
  adminButtonOutline,
  adminHint,
  adminInput,
  adminLabel,
} from "../../_components/admin-ui.ts";

/**
 * The period of `/admin/analitica` (M9 T12; S2, S3, S7): a plain GET form, so it works without JavaScript and the window
 * lives in the query, where a reload and a bookmark keep it. The two fields are native date inputs, so the browser offers
 * a calendar and always writes `YYYY-MM-DD`; the page still validates them on its own, so a hand-written query is read
 * the same way.
 *
 * The form offers no window of its own: the client bounds the window and the page falls back to the default one, so a
 * value the page cannot use never reaches the API.
 */
export function AnalyticsFiltersForm({ period }: { period: AnalyticsPeriod }) {
  return (
    <form
      action={ANALYTICS_PATHS.index}
      aria-label={ANALYTICS_COPY.filtersCaption}
      className="rounded-xl border border-admin-border bg-admin-surface px-5 py-4 shadow-xs"
      method="get"
    >
      <div className="grid gap-4 sm:grid-cols-[12rem_12rem_auto] sm:items-end">
        <div>
          <label className={adminLabel} htmlFor="analytics-from">
            {ANALYTICS_COPY.fromLabel}
          </label>
          <input
            className={adminInput}
            defaultValue={period.from}
            id="analytics-from"
            name="desde"
            type="date"
          />
        </div>
        <div>
          <label className={adminLabel} htmlFor="analytics-to">
            {ANALYTICS_COPY.toLabel}
          </label>
          <input
            className={adminInput}
            defaultValue={period.to}
            id="analytics-to"
            name="hasta"
            type="date"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={adminButton} type="submit">
            {ANALYTICS_COPY.apply}
          </button>
          {period.isDefault ? null : (
            <Link className={adminButtonOutline} href={ANALYTICS_PATHS.index}>
              {ANALYTICS_COPY.reset}
            </Link>
          )}
        </div>
      </div>
      <p className={adminHint}>
        {ANALYTICS_COPY.windowNote(formatAnalyticsDay(period.from), formatAnalyticsDay(period.to))}
        {period.isDefault ? ` ${ANALYTICS_COPY.defaultWindowNote}` : ""}
      </p>
    </form>
  );
}
