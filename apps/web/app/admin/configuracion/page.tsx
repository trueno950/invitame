import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SIGN_IN_PATH } from "../../../lib/admin/catalog/commands.ts";
import { ADMIN_SHELL_COPY } from "../../../lib/admin/copy.ts";
import { SETTINGS_COPY, SETTINGS_PATHS } from "../../../lib/admin/settings/copy.ts";
import { settingsPageNotices } from "../../../lib/admin/settings/notices.ts";
import { settingsPageView } from "../../../lib/admin/settings/view.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { adminSettings } from "../../../lib/server/admin-settings-api.ts";
import type { SettingsReadResult } from "../../../lib/server/admin-settings-client.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { AdminCard } from "../_components/admin-card.tsx";
import { AdminCenteredShell } from "../_components/admin-centered-shell.tsx";
import { AdminShell } from "../_components/admin-shell.tsx";
import { adminButtonOutline } from "../_components/admin-ui.ts";
import { saveSettingsAction } from "./actions.ts";
import { SettingsForm } from "./_components/settings-form.tsx";
import { SettingsHub } from "./_components/settings-hub.tsx";
import { SettingsNotices } from "./_components/settings-notices.tsx";

export const metadata: Metadata = { title: SETTINGS_COPY.pageTitle };

/**
 * `/admin/configuracion`: the operational settings and the catalog hub (M9 T14; S5, S8, L15). The page reads the seven
 * settings with the bounds the API holds and the last update instant, shows one form grouped as the owner decided, and
 * links the four catalog sections. Every value and every range comes from the API: the page never carries a copy of a
 * limit, so widening a bound in the settings row changes the form without a deploy.
 *
 * The page is server-first and holds no client component: the form posts to its own server action and the outcome
 * arrives as a code in the query (`lib/admin/settings/notices.ts`), so it works without JavaScript.
 *
 * The session read here only chooses the page, as on every administration page: the API answers `@AdminOnly()` and
 * applies the bounds and the cross-field rules, and it writes the audit row in the same transaction as the change (S5).
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("settings", view.kind);

  if (target !== null) {
    redirect(target);
  }

  if (view.kind !== "administrator") {
    return <SettingsUnavailable />;
  }

  const notices = settingsPageNotices(await searchParams);
  let loaded: SettingsReadResult;
  try {
    loaded = await adminSettings.read();
  } catch {
    // An unexpected failure is already logged by the server wrapper; the page never shows a body it could not read.
    return <SettingsUnavailable />;
  }

  if (!loaded.ok) {
    if (loaded.failure === "signed-out") {
      redirect(SIGN_IN_PATH);
    }
    if (loaded.failure === "forbidden") {
      redirect("/cuenta");
    }
    return <SettingsUnavailable />;
  }

  return (
    <AdminShell
      breadcrumbs={[
        { label: ADMIN_SHELL_COPY.panel, href: SETTINGS_PATHS.panel },
        { label: SETTINGS_COPY.heading },
      ]}
      current="settings"
      description={SETTINGS_COPY.intro}
      heading={SETTINGS_COPY.heading}
      width="form"
    >
      <SettingsNotices error={notices.error?.message} notice={notices.notice} />
      <AdminCard
        description={SETTINGS_COPY.formIntro}
        id="settings-limits"
        title={SETTINGS_COPY.formHeading}
      >
        <SettingsForm action={saveSettingsAction} page={settingsPageView(loaded.value)} />
      </AdminCard>
      <AdminCard
        description={SETTINGS_COPY.hubIntro}
        id="settings-hub"
        title={SETTINGS_COPY.hubHeading}
      >
        <SettingsHub />
      </AdminCard>
    </AdminShell>
  );
}

/** The one notice of a read that failed, with the way back: the page never renders a form it could not load. */
function SettingsUnavailable() {
  return (
    <AdminCenteredShell
      heading={SETTINGS_COPY.unavailableHeading}
      intro={SETTINGS_COPY.unavailableBody}
    >
      <a className={adminButtonOutline} href={SETTINGS_PATHS.index}>
        {SETTINGS_COPY.retry}
      </a>
    </AdminCenteredShell>
  );
}
