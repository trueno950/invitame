import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY } from "../../../lib/customer/copy.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
  invitationRows,
} from "../../../lib/customer/invitations.ts";
import {
  CustomerWorkspaceShell,
  pageActionButton,
} from "../../_components/customer-workspace-shell.tsx";
import { errorNote, quietButton, textButton } from "../../_components/ui.ts";
import { Notices } from "./_components/notices.tsx";
import { StatusBadge } from "./_components/status-badge.tsx";
import { invitations } from "./_lib/api.ts";
import { attempt, resolveRead } from "./_lib/load.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.pageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/cuenta/invitaciones` (M4 T5, T8; S1, S7, S11): the signed-in customer's own drafts, newest first, as
 * a grid of cards in the wide workspace so a few invitations fit on one screen. Each card names the
 * status in words as well as in the badge, the public slug, when it was created, and the way to edit it.
 * The list endpoint carries no missing-field data, so "incomplete" is shown on the draft's own page only.
 * A customer without a session is sent to `/ingresar`; a failed read shows the retry notice.
 */
export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: SearchParameters;
}) {
  // Render per request: the read swallows nothing, and `proxy.ts` has just refreshed the session cookie.
  await connection();
  const notices = invitationPageNotices(await searchParams);
  const loaded = resolveRead(await attempt(() => invitations.list()));
  const rows = loaded.status === "ok" ? invitationRows(loaded.value) : [];
  const available = loaded.status === "ok";

  return (
    <CustomerWorkspaceShell
      actions={
        available ? (
          <Link className={pageActionButton} href={INVITATION_PATHS.create}>
            {INVITATION_COPY.newLink}
          </Link>
        ) : undefined
      }
      eyebrow={INVITATION_COPY.listEyebrow}
      heading={available ? INVITATION_COPY.listHeading : INVITATION_COPY.unavailableHeading}
      intro={available ? INVITATION_COPY.listIntro : INVITATION_COPY.unavailableBody}
    >
      <div className="flex flex-col gap-5">
        <Notices error={notices.error} notice={notices.notice} />

        {available && rows.length === 0 ? (
          <div className="rounded-panel bg-surface/80 px-6 py-10 text-center ring-1 ring-gold/45">
            <p className="mx-auto max-w-md leading-7 text-pretty text-muted">
              {INVITATION_COPY.listEmpty}
            </p>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <li
                className="flex flex-col gap-3 rounded-panel bg-surface/90 p-5 shadow-soft ring-1 ring-gold/45"
                key={row.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium break-all text-ink">{row.slug}</p>
                  <StatusBadge label={row.statusLabel} />
                </div>
                <p className="text-sm text-muted">{INVITATION_COPY.createdOn(row.createdOn)}</p>
                <Link className={`${textButton} mt-auto self-start`} href={row.href}>
                  {INVITATION_COPY.editLink}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {available ? null : (
          <div className="flex flex-col items-start gap-4">
            <p className={errorNote}>{INVITATION_COPY.unavailableBody}</p>
            {/* A full reload asks the API again, as the account page's retry does. */}
            <a className={quietButton} href={INVITATION_PATHS.list}>
              {INVITATION_COPY.retry}
            </a>
          </div>
        )}
      </div>
    </CustomerWorkspaceShell>
  );
}
