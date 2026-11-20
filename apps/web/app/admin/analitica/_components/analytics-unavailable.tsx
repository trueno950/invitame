import { ANALYTICS_COPY, ANALYTICS_PATHS } from "../../../../lib/admin/analytics/copy.ts";
import { AdminCenteredShell } from "../../_components/admin-centered-shell.tsx";
import { adminButtonOutline } from "../../_components/admin-ui.ts";

/**
 * The notice `/admin/analitica` shows instead of data when the session could not be read, the API answered an outage,
 * or the window could not be loaded (M9 T12; S2): a plain link, so it works without JavaScript, and never an empty table
 * presented as if the period had no activity.
 */
export function AnalyticsUnavailable() {
  return (
    <AdminCenteredShell
      heading={ANALYTICS_COPY.unavailableHeading}
      intro={ANALYTICS_COPY.unavailableBody}
    >
      <a className={adminButtonOutline} href={ANALYTICS_PATHS.index}>
        {ANALYTICS_COPY.retry}
      </a>
    </AdminCenteredShell>
  );
}
