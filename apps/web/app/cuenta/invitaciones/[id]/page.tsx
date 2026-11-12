import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY, INVITATION_ERROR_COPY } from "../../../../lib/customer/copy.ts";
import {
  contentSections,
  fieldLabel,
  INVITATION_PATHS,
  invitationFieldsFor,
  invitationPageNotices,
  missingFieldsMessage,
  statusLabel,
} from "../../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../../lib/server/invitations-api.ts";
import { CustomerWorkspaceShell } from "../../../_components/customer-workspace-shell.tsx";
import { quietButton, statusNote } from "../../../_components/ui.ts";
import { archiveInvitationAction, saveInvitationContentAction } from "../actions.ts";
import { ContentForm } from "../_components/content-form.tsx";
import { ContentSummary } from "../_components/content-summary.tsx";
import { Notices } from "../_components/notices.tsx";
import { StatusBadge } from "../_components/status-badge.tsx";
import { invitations } from "../_lib/api.ts";
import { attempt, resolveRead } from "../_lib/load.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.detailPageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The label of one block of the page, above what it holds. */
function BlockLabel({ children }: { children: string }) {
  return <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{children}</p>;
}

/** The workspace of a draft nothing can be shown for, with the way back to the list. */
function PlainShell({ heading, body, path }: { heading: string; body: string; path: string }) {
  return (
    <CustomerWorkspaceShell eyebrow={INVITATION_COPY.detailEyebrow} heading={heading} intro={body}>
      <Link className={quietButton} href={path}>
        {INVITATION_COPY.backToList}
      </Link>
    </CustomerWorkspaceShell>
  );
}

/**
 * `/cuenta/invitaciones/[id]` (M4 T5, T8; S1, S3, S7, S11): the draft's own page, in the wide workspace.
 * The form takes the wide column and its fields are grouped into short sections with two columns from
 * `sm` up, so the draft is edited with little scrolling; the narrow side column holds the status, the
 * public slug as text, what is still missing, and archiving. The form has one input per property of the
 * pinned version's schema, which the creator catalog publishes with the version; the pin never changes in
 * M4 (A2), and a retired version is absent from that catalog, so its stored content is shown read-only
 * with a note instead of a guessed form, in the same layout. Saving and archiving post to server actions,
 * because the browser cannot send `PUT` to the API (L8). The public URL is text: publication is M5.
 */
export default async function InvitationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParameters;
}) {
  await connection();
  const [{ id }, parameters] = await Promise.all([params, searchParams]);
  const notices = invitationPageNotices(parameters);

  if (!isInvitationId(id)) {
    return (
      <PlainShell
        body={INVITATION_COPY.notFoundBody}
        heading={INVITATION_COPY.notFoundHeading}
        path={INVITATION_PATHS.list}
      />
    );
  }

  const [read, catalog] = await Promise.all([
    attempt(() => invitations.get(id)),
    attempt(() => invitations.templates()),
  ]);
  const loaded = resolveRead(read);

  if (loaded.status === "not-found") {
    return (
      <PlainShell
        body={INVITATION_COPY.notFoundBody}
        heading={INVITATION_COPY.notFoundHeading}
        path={INVITATION_PATHS.list}
      />
    );
  }

  if (loaded.status === "unavailable") {
    return (
      <PlainShell
        body={INVITATION_COPY.unavailableBody}
        heading={INVITATION_COPY.unavailableHeading}
        path={INVITATION_PATHS.detail(id)}
      />
    );
  }

  const invitation = loaded.value;
  const templates = catalog === "unavailable" || !catalog.ok ? undefined : catalog.value;
  const pinned =
    templates === undefined
      ? undefined
      : invitationFieldsFor(templates, invitation.templateVersionId);
  const archived = invitation.status === "ARCHIVED";
  const missing = missingFieldsMessage(invitation.missingRequiredFields);
  const editable = pinned !== undefined && !archived;
  const rows =
    pinned === undefined
      ? Object.keys(invitation.content).map((name) => ({ name, label: fieldLabel(name) }))
      : pinned.fields.map((field) => ({ name: field.name, label: field.label }));
  /** Why the form is missing: the pinned version left the catalog, or the catalog read itself failed. */
  const readOnlyNote =
    pinned === undefined
      ? templates === undefined
        ? INVITATION_ERROR_COPY["content-unavailable"]
        : INVITATION_COPY.readOnlyVersionNote
      : undefined;

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.list}>
          {INVITATION_COPY.backToList}
        </Link>
      }
      eyebrow={INVITATION_COPY.detailEyebrow}
      heading={
        pinned?.template.name ??
        (archived ? INVITATION_COPY.archivedHeading : INVITATION_COPY.detailHeading)
      }
      intro={archived ? INVITATION_COPY.archivedNote : INVITATION_COPY.detailIntro}
    >
      <div className="flex flex-col gap-4">
        <Notices error={notices.error} notice={notices.notice} />

        <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            {readOnlyNote === undefined ? null : <p className={statusNote}>{readOnlyNote}</p>}

            {editable && pinned !== undefined ? (
              <ContentForm
                action={saveInvitationContentAction}
                content={invitation.content}
                id={invitation.id}
                sections={contentSections(pinned.fields)}
              />
            ) : (
              <div className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
                <ContentSummary content={invitation.content} rows={rows} />
              </div>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
            <div className="flex flex-col gap-4 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
              <div>
                <BlockLabel>{INVITATION_COPY.statusLabel}</BlockLabel>
                <p className="mt-1.5">
                  <StatusBadge label={statusLabel(invitation.status)} />
                </p>
              </div>
              <div>
                <BlockLabel>{INVITATION_COPY.slugLabel}</BlockLabel>
                <p className="mt-1.5 font-medium break-all text-ink">{invitation.slug}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{INVITATION_COPY.slugHint}</p>
              </div>
              {missing === null ? null : <p className={statusNote}>{missing}</p>}
            </div>

            {archived ? null : (
              <form
                action={archiveInvitationAction}
                className="flex flex-col gap-3 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5"
              >
                <input name="id" type="hidden" value={invitation.id} />
                <BlockLabel>{INVITATION_COPY.archiveHeading}</BlockLabel>
                <p className="text-sm leading-6 text-muted">{INVITATION_COPY.archiveHint}</p>
                <button className={quietButton} type="submit">
                  {INVITATION_COPY.archive}
                </button>
              </form>
            )}
          </aside>
        </div>
      </div>
    </CustomerWorkspaceShell>
  );
}
