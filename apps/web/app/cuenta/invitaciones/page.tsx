import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY } from "../../../lib/customer/copy.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
  invitationRows,
} from "../../../lib/customer/invitations.ts";
import { CustomerShell } from "../../_components/customer-shell.tsx";
import { errorNote, focusRing, quietButton } from "../../_components/ui.ts";
import { Notices } from "./_components/notices.tsx";
import { StatusBadge } from "./_components/status-badge.tsx";
import { invitations } from "./_lib/api.ts";
import { attempt, resolveRead } from "./_lib/load.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.pageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/**
 * `/cuenta/invitaciones` (M4 T5; S1, S7): the signed-in customer's own drafts, newest first. The list
 * endpoint carries no missing-field data, so "incomplete" is shown on the draft's own page only. A
 * customer without a session is sent to `/ingresar`; a failed read shows the retry notice.
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
    <CustomerShell
      eyebrow={INVITATION_COPY.listEyebrow}
      heading={available ? INVITATION_COPY.listHeading : INVITATION_COPY.unavailableHeading}
      intro={available ? INVITATION_COPY.listIntro : INVITATION_COPY.unavailableBody}
    >
      <div className="flex flex-col gap-6">
        <Notices notice={notices.notice} error={notices.error} />

        <div className="flex justify-center">
          <Link className={quietButton} href={INVITATION_PATHS.create}>
            {INVITATION_COPY.newLink}
          </Link>
        </div>

        {available && rows.length === 0 ? (
          <p className="text-center leading-7 text-pretty text-muted">
            {INVITATION_COPY.listEmpty}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  className={`flex flex-col gap-1.5 rounded-field bg-surface px-4 py-3 ring-[1.5px] ring-gold/45 transition-colors hover:bg-rose-50 ${focusRing}`}
                  href={row.href}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium break-all text-ink">{row.slug}</span>
                    <StatusBadge label={row.statusLabel} />
                  </span>
                  <span className="text-sm text-muted">
                    {INVITATION_COPY.createdOn(row.createdOn)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {available ? null : (
          <div className="flex flex-col items-center gap-4">
            <p className={errorNote}>{INVITATION_COPY.unavailableBody}</p>
            {/* A full reload asks the API again, as the account page's retry does. */}
            <a className={quietButton} href={INVITATION_PATHS.list}>
              {INVITATION_COPY.retry}
            </a>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
