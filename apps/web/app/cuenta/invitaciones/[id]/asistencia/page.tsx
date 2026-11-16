import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";

import { GUEST_COPY, INVITATION_COPY, RSVP_COPY } from "../../../../../lib/customer/copy.ts";
import { guestListView, guestSelection } from "../../../../../lib/customer/invitation-guests.ts";
import {
  type RsvpResponseRow,
  rsvpResponsesView,
  rsvpSettingsView,
} from "../../../../../lib/customer/invitation-rsvp.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
} from "../../../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../../../lib/server/invitations-api.ts";
import { GUEST_LINK_COOKIE, guestLinks } from "../../../../../lib/server/single-use-flash.ts";
import { CustomerWorkspaceShell } from "../../../../_components/customer-workspace-shell.tsx";
import { quietButton, statusNote } from "../../../../_components/ui.ts";
import {
  AddGuestForm,
  EditGuestForm,
  GuestLinkReveal,
  GuestListFooter,
  GuestTable,
  GuestTotals,
  RemoveGuestPanel,
} from "../../_components/guest-list.tsx";
import { Notices } from "../../_components/notices.tsx";
import { invitations } from "../../_lib/api.ts";
import { attempt, resolveRead } from "../../_lib/load.ts";
import {
  createGuestAction,
  removeGuestAction,
  rotateGuestLinkAction,
  saveGuestAction,
} from "../../actions.ts";

/**
 * `/cuenta/invitaciones/[id]/asistencia` (M6 G3, G4; S1, S4): who answered, and who is coming. The page has two modes,
 * and the API decides which one an invitation has:
 *
 * - the guest list, when the pinned package grants `GUEST_LIST`: every guest with their seats, their answer, their
 *   party, and their check-in state, the totals of the list, and the writes that add, edit, remove, and reissue a
 *   personal link. A personal link is shown once, right after it is created or rotated, and never again (S4).
 * - the open responses, otherwise: the answers the invitation received, newest first, with the totals of the page and
 *   the CSV download of the same rows in the same order.
 *
 * Owner-only in both modes: the page never checks ownership itself, it reads the RSVP and guest routes with the
 * session cookie, and the API answers 404 for an invitation this customer does not own. A guest never reaches this
 * page and never sees another guest's data.
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

/**
 * The guest-list mode of one invitation (M6 G4; S1, S4). The personal link of the guest the last action created or
 * rotated is taken out of the one-time store here, as the page renders, so it is shown exactly once; every other
 * visit renders the list without it.
 */
function GuestListMode({
  id,
  slug,
  invitation,
  list,
  parameters,
  settings,
  flash,
}: {
  id: string;
  slug: string;
  invitation: Parameters<typeof guestListView>[0];
  list: Parameters<typeof guestListView>[1];
  parameters: Record<string, string | string[] | undefined>;
  settings: { readonly deadlineText: string; readonly partyLimit: number } | undefined;
  flash: Parameters<typeof GuestLinkReveal>[0]["flash"] | undefined;
}) {
  const view = guestListView(invitation, list);
  const selection = guestSelection(list, parameters);
  const backHref = `/cuenta/invitaciones/${id}/asistencia`;
  const notices = invitationPageNotices(parameters);

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
          {GUEST_COPY.backToInvitation}
        </Link>
      }
      eyebrow={GUEST_COPY.responsesEyebrow}
      heading={GUEST_COPY.responsesHeading}
      intro={GUEST_COPY.responsesIntro}
    >
      <div className="flex flex-col gap-4">
        <Notices error={notices.error} issues={notices.issues} notice={notices.notice} />
        {flash === undefined ? null : <GuestLinkReveal flash={flash} />}
        <GuestTotals totals={view.totals} />
        {settings === undefined ? (
          <p className={statusNote}>{RSVP_COPY.unavailable}</p>
        ) : (
          <GuestListFooter
            csvHref={view.csvHref}
            deadline={settings.deadlineText === "" ? RSVP_COPY.deadlineNone : settings.deadlineText}
            partyLimit={settings.partyLimit}
          />
        )}
        {selection.removing === null ? null : (
          <RemoveGuestPanel
            action={removeGuestAction}
            backHref={backHref}
            guest={selection.removing}
            invitationId={id}
          />
        )}
        {selection.editing === null ? null : (
          <EditGuestForm
            action={saveGuestAction}
            backHref={backHref}
            invitationId={id}
            values={selection.editing}
          />
        )}
        <AddGuestForm
          action={createGuestAction}
          editable={view.editable}
          invitationId={id}
          slug={slug}
        />
        {/* The note about the personal links sits above the table, so the page's closing element is the table card and
            the decorative corner never overlaps running text. */}
        <p className="text-sm leading-6 text-muted">{view.note}</p>
        <GuestTable
          action={rotateGuestLinkAction}
          backHref={backHref}
          invitationId={id}
          slug={slug}
          view={view}
        />
      </div>
    </CustomerWorkspaceShell>
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
  const [{ id }, parameters, cookieStore] = await Promise.all([params, searchParams, cookies()]);

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

  const settings =
    rsvp.status === "ok" ? rsvpSettingsView(invitation.value, rsvp.value.settings) : undefined;
  // The API decides the mode from the pinned package's catalog keys; the guest list replaces the open answers here
  // exactly like it replaces the open form on the public page (S3, S4).
  const guestMode = invitation.value.availableFeatures.includes("GUEST_LIST");

  if (guestMode) {
    const guests = resolveRead(await attempt(() => invitations.guests(id)));

    if (guests.status === "unavailable") {
      return (
        <CustomerWorkspaceShell
          eyebrow={GUEST_COPY.responsesEyebrow}
          heading={GUEST_COPY.unavailableHeading}
          intro={GUEST_COPY.unavailableBody}
        >
          <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
            {GUEST_COPY.backToInvitation}
          </Link>
        </CustomerWorkspaceShell>
      );
    }
    if (guests.status === "not-found") {
      return (
        <CustomerWorkspaceShell
          eyebrow={GUEST_COPY.responsesEyebrow}
          heading={INVITATION_COPY.notFoundHeading}
          intro={INVITATION_COPY.notFoundBody}
        >
          <Link className={quietButton} href={INVITATION_PATHS.list}>
            {INVITATION_COPY.backToList}
          </Link>
        </CustomerWorkspaceShell>
      );
    }

    // Read once, here, as the page renders: the store deletes the value, so a reload cannot show the link again.
    const handle = cookieStore.get(GUEST_LINK_COOKIE)?.value;
    const flash =
      handle === undefined
        ? undefined
        : guestLinks.take(handle, (entry) => entry.invitationId === id);

    return (
      <GuestListMode
        flash={flash}
        id={id}
        invitation={invitation.value}
        list={guests.value}
        parameters={parameters}
        settings={settings}
        slug={invitation.value.slug}
      />
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
