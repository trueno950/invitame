import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ENROLLMENT_COPY } from "../../../lib/admin/enrollment-copy.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { CustomerShell } from "../../_components/customer-shell.tsx";
import { quietButton } from "../../_components/ui.ts";
import { EnrollmentFlow } from "./enrollment-flow.tsx";

export const metadata: Metadata = {
  title: ENROLLMENT_COPY.pageTitle,
};

/**
 * `/admin/activar`: enrollment of the authenticator app for a pending administrator (M2 T8d; S6,
 * S21, S36). The page only chooses who sees it; the API decides whether enrollment is allowed. The
 * TOTP URI, the setup key, and the backup codes exist only in the client flow's memory.
 */
export default async function EnrollmentPage() {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("enrollment", view.kind);

  if (target !== null) {
    redirect(target);
  }

  const unavailable = view.kind === "unavailable";

  return (
    <CustomerShell
      eyebrow={ENROLLMENT_COPY.eyebrow}
      heading={unavailable ? ENROLLMENT_COPY.unavailableHeading : ENROLLMENT_COPY.heading}
      intro={unavailable ? ENROLLMENT_COPY.unavailableBody : ENROLLMENT_COPY.intro}
    >
      {unavailable ? (
        <div className="flex justify-center">
          <a className={quietButton} href="/admin/activar">
            {ENROLLMENT_COPY.retry}
          </a>
        </div>
      ) : (
        <EnrollmentFlow />
      )}
    </CustomerShell>
  );
}
