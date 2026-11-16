import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY, RSVP_COPY } from "../../../../../lib/customer/copy.ts";
import {
  type RsvpResponseRow,
  rsvpResponsesView,
} from "../../../../../lib/customer/invitation-rsvp.ts";
import { INVITATION_PATHS } from "../../../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../../../lib/server/invitations-api.ts";
import { CustomerWorkspaceShell } from "../../../../_components/customer-workspace-shell.tsx";
import { quietButton, statusNote } from "../../../../_components/ui.ts";
import { invitations } from "../../_lib/api.ts";
import { attempt, resolveRead } from "../../_lib/load.ts";

/**
 * `/cuenta/invitaciones/[id]/asistencia` (M6 G3; S1, S4): the answers one invitation received, newest first, with
 * the totals of the page and the CSV download of the same rows in the same order. Owner-only: the page never
 * checks ownership itself, it reads the RSVP route with the session cookie and the API answers 404 for an
 * invitation this customer does not own. A guest never reaches this page and never sees another guest's data.
 */

export const metadata: Metadata = {
  title: RSVP_COPY.responsesTitle,
  // Answers carry personal data, so no crawler may index the page (S4).
  robots: { index: false, follow: false },
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** One block of a total: its number and what it counts. */
function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

/** The one table of answers; a guest who left a field empty shows a dash instead of a blank cell. */
function ResponsesTable({ rows }: { rows: readonly RsvpResponseRow[] }) {
  return (
    <div className="overflow-x-auto rounded-panel bg-surface/80 ring-1 ring-gold/45">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead>
          <tr className="border-b border-rose-100">
            {[
              RSVP_COPY.columnName,
              RSVP_COPY.columnAnswer,
              RSVP_COPY.columnParty,
              RSVP_COPY.columnPhone,
              RSVP_COPY.columnMessage,
              RSVP_COPY.columnAnsweredAt,
            ].map((heading) => (
              <th
                className="px-4 py-3 text-xs font-medium uppercase tracking-[0.14em] text-primary"
                key={heading}
                scope="col"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b border-rose-100 align-top last:border-b-0" key={row.id}>
              <th className="px-4 py-3 font-medium text-ink" scope="row">
                {row.name}
                {row.updated ? (
                  <span className="mt-1 block text-xs font-normal text-muted">
                    {RSVP_COPY.updatedNote}
                  </span>
                ) : null}
              </th>
              <td className="px-4 py-3 text-ink">
                {row.attending ? RSVP_COPY.attendingYes : RSVP_COPY.attendingNo}
              </td>
              <td className="px-4 py-3 text-ink">{row.partySize}</td>
              <td className="px-4 py-3 text-ink">{row.phone === "" ? "—" : row.phone}</td>
              <td className="max-w-sm px-4 py-3 break-words text-ink">
                {row.message === "" ? "—" : row.message}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-muted">{row.answeredAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function RsvpResponsesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParameters;
}) {
  await connection();
  const [{ id }] = await Promise.all([params, searchParams]);

  if (!isInvitationId(id)) {
    return (
      <CustomerWorkspaceShell
        eyebrow={RSVP_COPY.responsesEyebrow}
        heading={RSVP_COPY.responsesHeading}
        intro={RSVP_COPY.emptyNote}
      >
        <Link className={quietButton} href={INVITATION_PATHS.list}>
          {INVITATION_COPY.backToList}
        </Link>
      </CustomerWorkspaceShell>
    );
  }

  const [invitationRead, rsvpRead] = await Promise.all([
    attempt(() => invitations.get(id)),
    attempt(() => invitations.readRsvp(id)),
  ]);
  const invitation = resolveRead(invitationRead);
  const rsvp = resolveRead(rsvpRead);

  if (invitation.status === "not-found" || rsvp.status === "not-found") {
    return (
      <CustomerWorkspaceShell
        eyebrow={RSVP_COPY.responsesEyebrow}
        heading={INVITATION_COPY.notFoundHeading}
        intro={INVITATION_COPY.notFoundBody}
      >
        <Link className={quietButton} href={INVITATION_PATHS.list}>
          {INVITATION_COPY.backToList}
        </Link>
      </CustomerWorkspaceShell>
    );
  }

  if (invitation.status === "unavailable" || rsvp.status === "unavailable") {
    return (
      <CustomerWorkspaceShell
        eyebrow={RSVP_COPY.responsesEyebrow}
        heading={INVITATION_COPY.unavailableHeading}
        intro={INVITATION_COPY.unavailableBody}
      >
        <Link className={quietButton} href={INVITATION_PATHS.list}>
          {INVITATION_COPY.backToList}
        </Link>
      </CustomerWorkspaceShell>
    );
  }

  const view = rsvpResponsesView(invitation.value, rsvp.value);
  const deadline =
    view.settings.deadlineText === "" ? RSVP_COPY.deadlineNone : view.settings.deadlineText;

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
          {RSVP_COPY.backToInvitation}
        </Link>
      }
      eyebrow={RSVP_COPY.responsesEyebrow}
      heading={RSVP_COPY.responsesHeading}
      intro={RSVP_COPY.responsesIntro}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Total label={RSVP_COPY.totalAttending} value={view.totals.attendingPeople} />
          <Total label={RSVP_COPY.totalDeclined} value={view.totals.declinedCount} />
          <Total label={RSVP_COPY.totalResponses} value={view.totals.responses} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`${statusNote} sm:flex-1`}>
            {RSVP_COPY.deadlineLabel}: {deadline} · {RSVP_COPY.partyLimitLabel}:{" "}
            {view.settings.partyLimit}
          </p>
          {/* Inside the page's content, clear of the header decoration, and one click to the file (S4). */}
          <a className={quietButton} download href={view.csvHref}>
            {RSVP_COPY.download}
          </a>
        </div>

        {view.rows.length === 0 ? (
          <p className="text-sm leading-6 text-muted">{RSVP_COPY.emptyNote}</p>
        ) : (
          <ResponsesTable rows={view.rows} />
        )}
      </div>
    </CustomerWorkspaceShell>
  );
}
