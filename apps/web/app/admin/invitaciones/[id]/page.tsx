import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SIGN_IN_PATH } from "../../../../lib/admin/catalog/commands.ts";
import { ADMIN_SHELL_COPY } from "../../../../lib/admin/copy.ts";
import {
  INVITATIONS_COPY,
  INVITATION_DETAIL_COPY,
  INVITATIONS_PATHS,
} from "../../../../lib/admin/invitations/copy.ts";
import { invitationDetailView } from "../../../../lib/admin/invitations/rows.ts";
import { loadAdminView, routeAdminPage } from "../../../../lib/admin/session.ts";
import { adminInvitations } from "../../../../lib/server/admin-invitations-api.ts";
import { isCatalogId } from "../../../../lib/server/admin-catalog-validators.ts";
import type {
  AdminInvitationDetail,
  InvitationsResult,
} from "../../../../lib/server/admin-invitations-client.ts";
import { getAuthSession } from "../../../../lib/server/session-api.ts";
import { AdminCard, AdminCardEmpty } from "../../_components/admin-card.tsx";
import { AdminDetailLayout } from "../../_components/admin-detail-layout.tsx";
import { AdminShell } from "../../_components/admin-shell.tsx";
import { StatusBadge } from "../../_components/status-badge.tsx";
import {
  adminButtonOutline,
  adminCardBody,
  adminTable,
  adminTableCell,
  adminTableHead,
  adminTableRow,
} from "../../_components/admin-ui.ts";
import { InvitationsNotice } from "../_components/invitations-notice.tsx";

export const metadata: Metadata = { title: INVITATION_DETAIL_COPY.pageTitle };

/**
 * `/admin/invitaciones/<id>`: one invitation's operational status (M9 T3; S1). It shows the lifecycle dates, the
 * bounded payments list, the photo counts, and — only while the invitation is published — its public link. The owner
 * appears as «solo el correo» (L3); the content, the owner's name, and the guest data are never shown, because the API
 * does not send them.
 *
 * The session read only chooses the page: the API answers `@AdminOnly()` and decides what a detail contains.
 */
export default async function AdminInvitationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const session = await loadAdminView(getAuthSession);
  const target = routeAdminPage("invitations", session.kind);

  if (target !== null) {
    redirect(target);
  }

  const { id } = await params;

  if (session.kind !== "administrator") {
    return <InvitationsUnavailable />;
  }

  // An id that is not a UUID names nothing, so no request is sent for it.
  if (!isCatalogId(id)) {
    return <InvitationNotFound />;
  }

  let loaded: InvitationsResult<AdminInvitationDetail>;
  try {
    loaded = await adminInvitations.detail(id);
  } catch {
    // An unexpected failure is already logged by the server wrapper; the page never shows a body it could not read.
    return <InvitationsUnavailable />;
  }

  if (!loaded.ok) {
    if (loaded.failure === "signed-out") {
      redirect(SIGN_IN_PATH);
    }
    if (loaded.failure === "forbidden") {
      redirect("/cuenta");
    }
    return loaded.failure === "not-found" ? <InvitationNotFound /> : <InvitationsUnavailable />;
  }

  const detail = loaded.value;
  const view = invitationDetailView(detail);
  const copy = INVITATION_DETAIL_COPY;

  return (
    <AdminShell
      actions={<StatusBadge label={view.statusLabel} status={detail.status} />}
      breadcrumbs={[
        { label: ADMIN_SHELL_COPY.panel, href: INVITATIONS_PATHS.panel },
        { label: INVITATIONS_COPY.heading, href: INVITATIONS_PATHS.index },
        { label: view.slug },
      ]}
      current="invitations"
      description={copy.intro}
      heading={copy.heading}
    >
      <AdminDetailLayout
        aside={
          <>
            <AdminCard id="invitation-photos" title={copy.photosHeading}>
              <dl className={`${adminCardBody} flex flex-col gap-3 text-sm`}>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-admin-muted">{copy.mainPhotoLabel}</dt>
                  <dd className="font-medium text-admin-ink">{view.photos.main}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-admin-muted">{copy.galleryLabel}</dt>
                  <dd className="text-right text-admin-ink">{view.photos.gallery}</dd>
                </div>
              </dl>
            </AdminCard>
            <AdminCard
              description={view.publicHref === undefined ? copy.notPublished : copy.publicHint}
              id="invitation-public-link"
              title={copy.publicHeading}
            >
              {view.publicHref === undefined ? null : (
                <div className={adminCardBody}>
                  <a
                    className={adminButtonOutline}
                    href={view.publicHref}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {copy.publicOpen}
                  </a>
                  <p className="mt-2 font-mono text-xs break-all text-admin-muted">
                    {view.publicHref}
                  </p>
                </div>
              )}
            </AdminCard>
          </>
        }
        main={
          <>
            <AdminCard id="invitation-summary" title={copy.summaryHeading}>
              <dl className={`${adminCardBody} grid gap-4 text-sm sm:grid-cols-2`}>
                <div>
                  <dt className="text-admin-muted">{copy.ownerLabel}</dt>
                  <dd className="mt-0.5 break-all text-admin-ink">{view.ownerEmail}</dd>
                </div>
                <div>
                  <dt className="text-admin-muted">{copy.statusLabel}</dt>
                  <dd className="mt-1">
                    <StatusBadge label={view.statusLabel} status={detail.status} />
                  </dd>
                </div>
              </dl>
            </AdminCard>
            <AdminCard id="invitation-dates" title={copy.datesHeading}>
              <dl className="divide-y divide-admin-border">
                {view.dates.map((date) => (
                  <div
                    className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-2.5 text-sm"
                    key={date.label}
                  >
                    <dt className="text-admin-muted">{date.label}</dt>
                    <dd className="text-admin-ink">
                      {date.at === undefined ? (
                        date.value
                      ) : (
                        <time dateTime={date.at}>{date.value}</time>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </AdminCard>
            <AdminCard
              description={view.payments.length === 0 ? undefined : copy.paymentsHint}
              id="invitation-payments"
              title={copy.paymentsHeading}
            >
              {view.payments.length === 0 ? (
                <AdminCardEmpty>{copy.paymentsEmpty}</AdminCardEmpty>
              ) : (
                <div className="overflow-x-auto">
                  <table className={adminTable}>
                    <caption className="sr-only">{copy.paymentsHeading}</caption>
                    <thead>
                      <tr>
                        <th className={adminTableHead} scope="col">
                          {copy.paymentStatusColumn}
                        </th>
                        <th className={`${adminTableHead} text-right`} scope="col">
                          {copy.paymentAmountColumn}
                        </th>
                        <th className={adminTableHead} scope="col">
                          {copy.paymentCreatedColumn}
                        </th>
                        <th className={adminTableHead} scope="col">
                          {copy.paymentPaidColumn}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.payments.map((payment) => (
                        <tr className={adminTableRow} key={payment.paymentId}>
                          <td className={adminTableCell}>{payment.statusLabel}</td>
                          <td className={`${adminTableCell} text-right tabular-nums`}>
                            {payment.amount}
                          </td>
                          <td className={`${adminTableCell} whitespace-nowrap text-admin-muted`}>
                            {payment.created}
                          </td>
                          <td className={`${adminTableCell} whitespace-nowrap text-admin-muted`}>
                            {payment.paid === "" ? copy.noPaymentDate : payment.paid}
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

/** The notice of a read that failed: the page never renders an empty detail as if it were the invitation. */
function InvitationsUnavailable() {
  return (
    <InvitationsNotice
      body={INVITATION_DETAIL_COPY.unavailableBody}
      heading={INVITATION_DETAIL_COPY.unavailableHeading}
      href={INVITATIONS_PATHS.index}
      linkLabel={INVITATION_DETAIL_COPY.retry}
    />
  );
}

/** The invitation the API answered 404 for, or an id no invitation could have; the way back is the list. */
function InvitationNotFound() {
  return (
    <InvitationsNotice
      body={INVITATION_DETAIL_COPY.notFoundBody}
      heading={INVITATION_DETAIL_COPY.notFoundHeading}
      href={INVITATIONS_PATHS.index}
      linkLabel={INVITATION_DETAIL_COPY.backToList}
    />
  );
}
