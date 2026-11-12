import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY, INVITATION_ERROR_COPY } from "../../../../lib/customer/copy.ts";
import {
  fieldLabel,
  INVITATION_PATHS,
  invitationFieldsFor,
  invitationPageNotices,
  missingFieldsMessage,
  statusLabel,
} from "../../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../../lib/server/invitations-api.ts";
import { CustomerShell } from "../../../_components/customer-shell.tsx";
import { focusRing, quietButton, statusNote, textButton } from "../../../_components/ui.ts";
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

/** The shell of a draft nothing can be shown for, with the way back to the list. */
function PlainShell({ heading, body, path }: { heading: string; body: string; path: string }) {
  return (
    <CustomerShell eyebrow={INVITATION_COPY.detailEyebrow} heading={heading} intro={body}>
      <div className="flex flex-col items-center gap-4">
        <Link className={quietButton} href={path}>
          {INVITATION_COPY.backToList}
        </Link>
      </div>
    </CustomerShell>
  );
}

/**
 * `/cuenta/invitaciones/[id]` (M4 T5; S1, S3, S7): the draft's own page. The form has one input per
 * property of the pinned version's schema, which the creator catalog publishes with the version; the pin
 * never changes in M4 (A2), and a retired version is absent from that catalog, so its stored content is
 * shown read-only with a note instead of a guessed form. Saving and archiving post to server actions,
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
    <CustomerShell
      eyebrow={INVITATION_COPY.detailEyebrow}
      heading={
        pinned?.template.name ??
        (archived ? INVITATION_COPY.archivedHeading : INVITATION_COPY.detailHeading)
      }
      intro={archived ? INVITATION_COPY.archivedNote : INVITATION_COPY.detailIntro}
    >
      <div className="flex flex-col gap-6">
        <Notices notice={notices.notice} error={notices.error} />

        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {INVITATION_COPY.statusLabel}
            </dt>
            <dd className="mt-1">
              <StatusBadge label={statusLabel(invitation.status)} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {INVITATION_COPY.slugLabel}
            </dt>
            <dd className="mt-1 font-medium break-all text-ink">{invitation.slug}</dd>
            <dd className="mt-1 text-sm leading-6 text-muted">{INVITATION_COPY.slugHint}</dd>
          </div>
        </dl>

        {missing === null ? null : <p className={statusNote}>{missing}</p>}

        {readOnlyNote === undefined ? null : <p className={statusNote}>{readOnlyNote}</p>}

        <div className="border-t border-gold/40 pt-6">
          {editable && pinned !== undefined ? (
            <ContentForm
              action={saveInvitationContentAction}
              content={invitation.content}
              fields={pinned.fields}
              id={invitation.id}
            />
          ) : (
            <ContentSummary content={invitation.content} rows={rows} />
          )}
        </div>

        {archived ? null : (
          <form action={archiveInvitationAction} className="border-t border-gold/40 pt-6">
            <input name="id" type="hidden" value={invitation.id} />
            <button className={quietButton} type="submit">
              {INVITATION_COPY.archive}
            </button>
          </form>
        )}

        <div className="border-t border-gold/40 pt-6 text-center">
          <Link className={`${textButton} ${focusRing}`} href={INVITATION_PATHS.list}>
            {INVITATION_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerShell>
  );
}
