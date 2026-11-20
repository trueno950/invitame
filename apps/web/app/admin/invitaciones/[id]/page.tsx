import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SIGN_IN_PATH } from "../../../../lib/admin/catalog/commands.ts";
import { ADMIN_SHELL_COPY } from "../../../../lib/admin/copy.ts";
import {
  INVITATIONS_COPY,
  INVITATION_DETAIL_COPY,
  INVITATIONS_PATHS,
  INVITATION_SUPPORT_COPY,
} from "../../../../lib/admin/invitations/copy.ts";
import { invitationPageNotices } from "../../../../lib/admin/invitations/notices.ts";
import { invitationDetailView } from "../../../../lib/admin/invitations/rows.ts";
import { invitationSupportView } from "../../../../lib/admin/invitations/support.ts";
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
import { AdminSelect } from "../../_components/admin-select.tsx";
import { AdminShell } from "../../_components/admin-shell.tsx";
import { StatusBadge } from "../../_components/status-badge.tsx";
import {
  adminButton,
  adminButtonOutline,
  adminCardBody,
  adminErrorNote,
  adminHint,
  adminLabel,
  adminStatusNote,
  adminTable,
  adminTableCell,
  adminTableHead,
  adminTableRow,
  adminTextarea,
} from "../../_components/admin-ui.ts";
import { InvitationsNotice } from "../_components/invitations-notice.tsx";
import {
  disableOwnerAccountAction,
  reactivateOwnerAccountAction,
  resendOwnerSignInCodeAction,
  unpublishInvitationAction,
} from "../actions.ts";

export const metadata: Metadata = { title: INVITATION_DETAIL_COPY.pageTitle };

/**
 * `/admin/invitaciones/<id>`: one invitation's operational status (M9 T3, T8; S1, S4, S6). It shows the lifecycle
 * dates, the bounded payments list linked to each payment's own detail, the photo counts, and — only while the
 * invitation is published — its public link. The owner appears as «solo el correo» (L3); the content, the owner's name,
 * and the guest data are never shown, because the API does not send them.
 *
 * The «Acciones de soporte» card offers the administrator's unpublish while the invitation is published, and the owner
 * account's actions (T9; S4, L8, L9): «Desactivar cuenta» while the owner is active, «Reactivar cuenta» while the account
 * is disabled, and «Reenviar código de acceso» while the owner may sign in by code. Each is one server action form with
 * the same reason select and note, so every form works without JavaScript. A form is a convenience, never a guard — the
 * API authorizes the call, applies the change, and writes the audit row in the same transaction — and the card never
 * promises the resend was delivered: it says the code was requested.
 *
 * The session read only chooses the page: the API answers `@AdminOnly()` and decides what a detail contains.
 */
export default async function AdminInvitationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const session = await loadAdminView(getAuthSession);
  const target = routeAdminPage("invitations", session.kind);

  if (target !== null) {
    redirect(target);
  }

  const { id } = await params;
  const notices = invitationPageNotices(await searchParams);

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
  const support = invitationSupportView(detail);
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
      {notices.notice === undefined ? null : (
        <p className={adminStatusNote} role="status">
          {notices.notice}
        </p>
      )}
      {notices.error === undefined ? null : (
        <p className={adminErrorNote} role="alert">
          {notices.error.message}
        </p>
      )}
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
                          <td className={adminTableCell}>
                            <a
                              className="font-medium text-admin-ink underline decoration-admin-border underline-offset-2 hover:decoration-admin-ink"
                              href={payment.href}
                            >
                              {payment.statusLabel}
                            </a>
                          </td>
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
            <AdminCard
              description={INVITATION_SUPPORT_COPY.intro}
              id="invitation-support"
              title={INVITATION_SUPPORT_COPY.heading}
            >
              <div className={`${adminCardBody} flex flex-col gap-4`}>
                <div>
                  <h3 className="text-sm font-medium text-admin-ink">
                    {INVITATION_SUPPORT_COPY.unpublishHeading}
                  </h3>
                  <p className={adminHint}>
                    {support.unpublishHint ?? INVITATION_SUPPORT_COPY.unpublishHint}
                  </p>
                </div>
                {support.canUnpublish ? (
                  <form
                    action={unpublishInvitationAction}
                    className="flex flex-col gap-4 border-t border-admin-border pt-4"
                  >
                    <input name="invitationId" type="hidden" value={detail.invitationId} />
                    <div>
                      <label className={adminLabel} htmlFor="invitation-unpublish-reason">
                        {INVITATION_SUPPORT_COPY.reasonLabel}
                      </label>
                      <AdminSelect defaultValue="" id="invitation-unpublish-reason" name="reason">
                        <option value="">{INVITATION_SUPPORT_COPY.reasonPlaceholder}</option>
                        {support.reasons.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </AdminSelect>
                    </div>
                    <div>
                      <label className={adminLabel} htmlFor="invitation-unpublish-note">
                        {INVITATION_SUPPORT_COPY.noteLabel}
                      </label>
                      <textarea
                        className={adminTextarea}
                        id="invitation-unpublish-note"
                        maxLength={support.noteMaxLength}
                        name="note"
                        rows={3}
                      />
                      <p className={adminHint}>{INVITATION_SUPPORT_COPY.noteHint}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs leading-5 text-admin-muted">{support.noRefund}</p>
                      <button className={adminButton} type="submit">
                        {INVITATION_SUPPORT_COPY.unpublish}
                      </button>
                    </div>
                  </form>
                ) : null}
                <div className="flex flex-col gap-4 border-t border-admin-border pt-4">
                  <div>
                    <h3 className="text-sm font-medium text-admin-ink">
                      {INVITATION_SUPPORT_COPY.ownerHeading}
                    </h3>
                    <p className="mt-1 text-sm text-admin-ink">
                      {INVITATION_SUPPORT_COPY.ownerStatusLabel}:{" "}
                      <span className="font-medium">{support.owner.statusLabel}</span>
                    </p>
                    {support.owner.hint === undefined ? null : (
                      <p className={adminHint}>{support.owner.hint}</p>
                    )}
                  </div>
                  {support.owner.canDisable ? (
                    <form
                      action={disableOwnerAccountAction}
                      className="flex flex-col gap-4 border-t border-admin-border pt-4"
                    >
                      <input name="invitationId" type="hidden" value={detail.invitationId} />
                      <input name="userId" type="hidden" value={detail.ownerId} />
                      <div>
                        <h4 className="text-sm font-medium text-admin-ink">
                          {INVITATION_SUPPORT_COPY.disableHeading}
                        </h4>
                        <p className={adminHint}>{INVITATION_SUPPORT_COPY.disableHint}</p>
                      </div>
                      <div>
                        <label className={adminLabel} htmlFor="owner-disable-reason">
                          {INVITATION_SUPPORT_COPY.reasonLabel}
                        </label>
                        <AdminSelect defaultValue="" id="owner-disable-reason" name="reason">
                          <option value="">{INVITATION_SUPPORT_COPY.reasonPlaceholder}</option>
                          {support.reasons.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </AdminSelect>
                      </div>
                      <div>
                        <label className={adminLabel} htmlFor="owner-disable-note">
                          {INVITATION_SUPPORT_COPY.noteLabel}
                        </label>
                        <textarea
                          className={adminTextarea}
                          id="owner-disable-note"
                          maxLength={support.noteMaxLength}
                          name="note"
                          rows={3}
                        />
                        <p className={adminHint}>{INVITATION_SUPPORT_COPY.noteHint}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-admin-muted">
                          {INVITATION_SUPPORT_COPY.invitationsStayPublished}
                        </p>
                        <button className={adminButton} type="submit">
                          {INVITATION_SUPPORT_COPY.disable}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {support.owner.canReactivate ? (
                    <form
                      action={reactivateOwnerAccountAction}
                      className="flex flex-col gap-4 border-t border-admin-border pt-4"
                    >
                      <input name="invitationId" type="hidden" value={detail.invitationId} />
                      <input name="userId" type="hidden" value={detail.ownerId} />
                      <div>
                        <h4 className="text-sm font-medium text-admin-ink">
                          {INVITATION_SUPPORT_COPY.reactivateHeading}
                        </h4>
                        <p className={adminHint}>{INVITATION_SUPPORT_COPY.reactivateHint}</p>
                      </div>
                      <div>
                        <label className={adminLabel} htmlFor="owner-reactivate-reason">
                          {INVITATION_SUPPORT_COPY.reasonLabel}
                        </label>
                        <AdminSelect defaultValue="" id="owner-reactivate-reason" name="reason">
                          <option value="">{INVITATION_SUPPORT_COPY.reasonPlaceholder}</option>
                          {support.reasons.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </AdminSelect>
                      </div>
                      <div>
                        <label className={adminLabel} htmlFor="owner-reactivate-note">
                          {INVITATION_SUPPORT_COPY.noteLabel}
                        </label>
                        <textarea
                          className={adminTextarea}
                          id="owner-reactivate-note"
                          maxLength={support.noteMaxLength}
                          name="note"
                          rows={3}
                        />
                        <p className={adminHint}>{INVITATION_SUPPORT_COPY.noteHint}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <button className={adminButton} type="submit">
                          {INVITATION_SUPPORT_COPY.reactivate}
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {support.owner.canResendSignInCode ? (
                    <form
                      action={resendOwnerSignInCodeAction}
                      className="flex flex-col gap-4 border-t border-admin-border pt-4"
                    >
                      <input name="invitationId" type="hidden" value={detail.invitationId} />
                      <input name="userId" type="hidden" value={detail.ownerId} />
                      <div>
                        <h4 className="text-sm font-medium text-admin-ink">
                          {INVITATION_SUPPORT_COPY.resendHeading}
                        </h4>
                        <p className={adminHint}>{INVITATION_SUPPORT_COPY.resendHint}</p>
                      </div>
                      <div>
                        <label className={adminLabel} htmlFor="owner-resend-reason">
                          {INVITATION_SUPPORT_COPY.reasonLabel}
                        </label>
                        <AdminSelect defaultValue="" id="owner-resend-reason" name="reason">
                          <option value="">{INVITATION_SUPPORT_COPY.reasonPlaceholder}</option>
                          {support.reasons.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </AdminSelect>
                      </div>
                      <div>
                        <label className={adminLabel} htmlFor="owner-resend-note">
                          {INVITATION_SUPPORT_COPY.noteLabel}
                        </label>
                        <textarea
                          className={adminTextarea}
                          id="owner-resend-note"
                          maxLength={support.noteMaxLength}
                          name="note"
                          rows={3}
                        />
                        <p className={adminHint}>{INVITATION_SUPPORT_COPY.noteHint}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-admin-muted">
                          {INVITATION_SUPPORT_COPY.resendNoticeHint}
                        </p>
                        <button className={adminButton} type="submit">
                          {INVITATION_SUPPORT_COPY.resend}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
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
