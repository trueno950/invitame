import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SIGN_IN_PATH } from "../../../../lib/admin/catalog/commands.ts";
import { ADMIN_SHELL_COPY } from "../../../../lib/admin/copy.ts";
import {
  PAYMENT_DETAIL_COPY,
  PAYMENTS_COPY,
  PAYMENTS_PATHS,
} from "../../../../lib/admin/payments/copy.ts";
import {
  paymentDetailNoticeLinks,
  paymentDetailView,
} from "../../../../lib/admin/payments/detail.ts";
import { loadAdminView, routeAdminPage } from "../../../../lib/admin/session.ts";
import { isCatalogId } from "../../../../lib/server/admin-catalog-validators.ts";
import { adminPayments } from "../../../../lib/server/admin-payments-api.ts";
import type {
  AdminPaymentDetail,
  PaymentsResult,
} from "../../../../lib/server/admin-payments-client.ts";
import { getAuthSession } from "../../../../lib/server/session-api.ts";
import { AdminCard, AdminCardEmpty } from "../../_components/admin-card.tsx";
import { AdminCenteredShell } from "../../_components/admin-centered-shell.tsx";
import { AdminDetailLayout } from "../../_components/admin-detail-layout.tsx";
import { AdminShell } from "../../_components/admin-shell.tsx";
import {
  adminButtonOutline,
  adminCardBody,
  adminKey,
  adminTable,
  adminTableCell,
  adminTableHead,
  adminTableRow,
} from "../../_components/admin-ui.ts";
import { StatusBadge } from "../../_components/status-badge.tsx";

export const metadata: Metadata = { title: PAYMENT_DETAIL_COPY.pageTitle };

/**
 * `/admin/pagos/<id>`: one payment's support read (M9 T7; S4, S6). It shows the payment's state, its amount, when it
 * was created and paid, and the events the verified intake stored for it, newest first. It shows no card and no payer
 * datum, because the API sends none, and it offers no action: viewing a payment is read-only and not audited (L9).
 * The invitation is one link away, at `/admin/invitaciones/<id>`.
 *
 * The session read only chooses the page: the API answers `@AdminOnly()` and decides what a detail contains.
 */
export default async function AdminPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const session = await loadAdminView(getAuthSession);
  const target = routeAdminPage("payments", session.kind);

  if (target !== null) {
    redirect(target);
  }

  const { id } = await params;

  // An id that is not a UUID names nothing, so no request is sent for it, whichever session read the page.
  if (!isCatalogId(id)) {
    return <PaymentNotFound />;
  }

  if (session.kind !== "administrator") {
    return <PaymentsUnavailable id={id} />;
  }

  let loaded: PaymentsResult<AdminPaymentDetail>;
  try {
    loaded = await adminPayments.detail(id);
  } catch {
    // An unexpected failure is already logged by the server wrapper; the page never shows a body it could not read.
    return <PaymentsUnavailable id={id} />;
  }

  if (!loaded.ok) {
    if (loaded.failure === "signed-out") {
      redirect(SIGN_IN_PATH);
    }
    if (loaded.failure === "forbidden") {
      redirect("/cuenta");
    }
    return loaded.failure === "not-found" ? <PaymentNotFound /> : <PaymentsUnavailable id={id} />;
  }

  const detail = loaded.value;
  const view = paymentDetailView(detail);
  const copy = PAYMENT_DETAIL_COPY;

  return (
    <AdminShell
      actions={<StatusBadge label={view.statusLabel} status={detail.status} />}
      breadcrumbs={[
        { label: ADMIN_SHELL_COPY.panel, href: PAYMENTS_PATHS.panel },
        { label: PAYMENTS_COPY.heading, href: PAYMENTS_PATHS.index },
        { label: view.slug },
      ]}
      current="payments"
      description={copy.intro}
      heading={copy.heading}
    >
      <AdminDetailLayout
        aside={
          <AdminCard
            description={copy.invitationHint}
            id="payment-invitation"
            title={copy.invitationHeading}
          >
            <div className={adminCardBody}>
              <a className={adminButtonOutline} href={view.invitationHref}>
                {copy.openInvitation}
              </a>
              <p className="mt-2 font-mono text-xs break-all text-admin-muted">{view.slug}</p>
            </div>
          </AdminCard>
        }
        main={
          <>
            <AdminCard id="payment-summary" title={copy.summaryHeading}>
              <dl className={`${adminCardBody} grid gap-4 text-sm sm:grid-cols-2`}>
                <div>
                  <dt className="text-admin-muted">{copy.statusLabel}</dt>
                  <dd className="mt-1">
                    <StatusBadge label={view.statusLabel} status={detail.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-muted">{copy.amountLabel}</dt>
                  <dd className="mt-0.5 tabular-nums text-admin-ink">
                    {view.amount === "" ? copy.noAmount : view.amount}
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-muted">{copy.providerLabel}</dt>
                  <dd className="mt-0.5">
                    <span className={adminKey}>{view.provider}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-muted">{copy.paymentIdLabel}</dt>
                  <dd className="mt-0.5">
                    <span className={adminKey}>{view.paymentId}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-muted">{copy.createdAtLabel}</dt>
                  <dd className="mt-0.5 text-admin-ink">
                    <time dateTime={detail.createdAt}>{view.created}</time>
                  </dd>
                </div>
                <div>
                  <dt className="text-admin-muted">{copy.paidAtLabel}</dt>
                  <dd className="mt-0.5 text-admin-ink">
                    {detail.paidAt === null ? (
                      copy.noPaymentDate
                    ) : (
                      <time dateTime={detail.paidAt}>{view.paid}</time>
                    )}
                  </dd>
                </div>
              </dl>
            </AdminCard>
            <AdminCard
              description={view.events.length === 0 ? undefined : copy.eventsHint}
              id="payment-events"
              title={copy.eventsHeading}
            >
              {view.events.length === 0 ? (
                <AdminCardEmpty>{copy.eventsEmpty}</AdminCardEmpty>
              ) : (
                <div className="overflow-x-auto">
                  <table className={adminTable}>
                    <caption className="sr-only">{copy.eventsHeading}</caption>
                    <thead>
                      <tr>
                        <th className={adminTableHead} scope="col">
                          {copy.eventTypeColumn}
                        </th>
                        <th className={adminTableHead} scope="col">
                          {copy.eventOutcomeColumn}
                        </th>
                        <th className={adminTableHead} scope="col">
                          {copy.eventReceivedColumn}
                        </th>
                        <th className={adminTableHead} scope="col">
                          {copy.eventProcessedColumn}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.events.map((event) => (
                        <tr className={adminTableRow} key={event.key}>
                          <td className={`${adminTableCell} text-admin-ink`}>{event.typeLabel}</td>
                          <td className={`${adminTableCell} text-admin-muted`}>
                            {event.outcomeLabel}
                          </td>
                          <td className={`${adminTableCell} whitespace-nowrap text-admin-muted`}>
                            <time dateTime={event.receivedAt}>{event.received}</time>
                          </td>
                          <td className={`${adminTableCell} whitespace-nowrap text-admin-muted`}>
                            {event.processedAt === undefined ? (
                              event.processed
                            ) : (
                              <time dateTime={event.processedAt}>{event.processed}</time>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdminCard>
          </>
        }
      />
    </AdminShell>
  );
}

/**
 * The notice of a read that failed: the page never renders an empty payment as if it were the stored one, and its
 * «Volver a intentar» reloads this same detail (M9 T10; R3-001) — the list stays a separate link.
 */
function PaymentsUnavailable({ id }: { id: string }) {
  const links = paymentDetailNoticeLinks(id);

  return (
    <PaymentsNotice
      body={PAYMENT_DETAIL_COPY.unavailableBody}
      heading={PAYMENT_DETAIL_COPY.unavailableHeading}
      links={[
        { href: links.retryHref, label: PAYMENT_DETAIL_COPY.retry },
        { href: links.listHref, label: PAYMENT_DETAIL_COPY.backToList },
      ]}
    />
  );
}

/** The payment the API answered 404 for, or an id no payment could have; the way back is the list. */
function PaymentNotFound() {
  return (
    <PaymentsNotice
      body={PAYMENT_DETAIL_COPY.notFoundBody}
      heading={PAYMENT_DETAIL_COPY.notFoundHeading}
      links={[{ href: PAYMENTS_PATHS.index, label: PAYMENT_DETAIL_COPY.backToList }]}
    />
  );
}

function PaymentsNotice({
  body,
  heading,
  links,
}: {
  body: string;
  heading: string;
  /** The retry reloads the page that failed; the other link is the way back to the list. */
  links: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <AdminCenteredShell heading={heading} intro={body}>
      <div className="flex flex-wrap gap-3">
        {links.map((link) => (
          <a className={adminButtonOutline} href={link.href} key={link.href}>
            {link.label}
          </a>
        ))}
      </div>
    </AdminCenteredShell>
  );
}
