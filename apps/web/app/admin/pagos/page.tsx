import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SIGN_IN_PATH } from "../../../lib/admin/catalog/commands.ts";
import { ADMIN_SHELL_COPY } from "../../../lib/admin/copy.ts";
import { PAYMENTS_COPY, PAYMENTS_PATHS } from "../../../lib/admin/payments/copy.ts";
import { paymentsPageNotices } from "../../../lib/admin/payments/notices.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { adminPayments } from "../../../lib/server/admin-payments-api.ts";
import type { AdminPayment } from "../../../lib/server/admin-payments-client.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { AdminCenteredShell } from "../_components/admin-centered-shell.tsx";
import { AdminShell } from "../_components/admin-shell.tsx";
import { adminButtonOutline } from "../_components/admin-ui.ts";
import { PaymentsNotices } from "./_components/payments-notices.tsx";
import { PaymentsTable } from "./_components/payments-table.tsx";
import { refundPaymentAction } from "./actions.ts";

export const metadata: Metadata = { title: PAYMENTS_COPY.pageTitle };

/**
 * `/admin/pagos`: the refund working list (M7 T3; S3). It shows the paid payments the API answered, each with its
 * invitation slug and whether the rule still refunds it, and offers the refund only where the API says it is allowed.
 *
 * The session read here only chooses the page, as on every administration page: the API answers `@AdminOnly()` on its
 * own, applies «Sin reembolso tras publicar», and changes the payment's state only from the verified Mercado Pago
 * notification — never from this request and never from a hidden button.
 */
export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("payments", view.kind);

  if (target !== null) {
    redirect(target);
  }

  if (view.kind !== "administrator") {
    return <PaymentsUnavailable />;
  }

  const notices = paymentsPageNotices(await searchParams);
  let loaded: { ok: true; value: AdminPayment[] } | { ok: false; failure: string };
  try {
    loaded = await adminPayments.list();
  } catch {
    // An unexpected failure is already logged by the server wrapper; the page never shows a body it could not read.
    return <PaymentsUnavailable />;
  }

  if (!loaded.ok) {
    if (loaded.failure === "signed-out") {
      redirect(SIGN_IN_PATH);
    }
    if (loaded.failure === "forbidden") {
      redirect("/cuenta");
    }
    return <PaymentsUnavailable />;
  }

  return (
    <AdminShell
      breadcrumbs={[
        { label: ADMIN_SHELL_COPY.panel, href: PAYMENTS_PATHS.panel },
        { label: PAYMENTS_COPY.heading },
      ]}
      current="payments"
      description={PAYMENTS_COPY.intro}
      heading={PAYMENTS_COPY.heading}
    >
      <PaymentsNotices error={notices.error?.message} notice={notices.notice} />
      <PaymentsTable action={refundPaymentAction} payments={loaded.value} />
    </AdminShell>
  );
}

/** The one notice of a read that failed, with the way back: the page never renders an empty list as if it were data. */
function PaymentsUnavailable() {
  return (
    <AdminCenteredShell
      heading={PAYMENTS_COPY.unavailableHeading}
      intro={PAYMENTS_COPY.unavailableBody}
    >
      <a className={adminButtonOutline} href={PAYMENTS_PATHS.index}>
        {PAYMENTS_COPY.retry}
      </a>
    </AdminCenteredShell>
  );
}
