import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { ADMIN_SIGN_IN_COPY } from "../../../lib/admin/copy.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { AdminCenteredShell } from "../_components/admin-centered-shell.tsx";
import { AdminSignInForm } from "./admin-sign-in-form.tsx";

export const metadata: Metadata = {
  title: ADMIN_SIGN_IN_COPY.pageTitle,
};

/**
 * `/admin/ingresar`: administrator sign-in with the password, then the authenticator app's code or a
 * backup code (M2 T8d; S6, S20, S22, S36). A signed-in visitor goes to its own page; when the API
 * cannot answer, the form is shown anyway.
 */
export default async function AdminSignInPage() {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("sign-in", view.kind);

  if (target !== null) {
    redirect(target);
  }

  return (
    <AdminCenteredShell heading={ADMIN_SIGN_IN_COPY.heading} intro={ADMIN_SIGN_IN_COPY.intro}>
      <AdminSignInForm />
    </AdminCenteredShell>
  );
}
