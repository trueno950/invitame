import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import {
  COLLABORATOR_COPY,
  COLLABORATOR_PERMISSION_LABELS,
  INVITATION_COPY,
} from "../../../../../lib/customer/copy.ts";
import {
  type CollaboratorRow,
  type CollaboratorScreenView,
  collaboratorScreenView,
  editorAccessView,
  INVITATION_PERMISSIONS,
  type InvitationPermission,
} from "../../../../../lib/customer/collaboration.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
} from "../../../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../../../lib/server/invitations-api.ts";
import { CustomerWorkspaceShell } from "../../../../_components/customer-workspace-shell.tsx";
import {
  fieldHint,
  fieldLabel,
  primaryButton,
  quietButton,
  statusNote,
  textButton,
  textField,
} from "../../../../_components/ui.ts";
import { Notices } from "../../_components/notices.tsx";
import { invitations } from "../../_lib/api.ts";
import { attempt, resolveRead } from "../../_lib/load.ts";
import {
  inviteCollaboratorAction,
  revokeCollaboratorAction,
  saveCollaboratorPermissionsAction,
} from "../../actions.ts";

/**
 * `/cuenta/invitaciones/[id]/coanfitriones` (F12; S2.12, L17.2, L17.3, L17.5): the owner's co-hosts screen, the artboard
 * `design/co-hosts/02-con-permisos.html` built with the app's own tokens. The owner invites one address with the chips
 * of the three grantable permissions, sees who accepted and when in words, changes a set in place, and revokes access.
 * The «Pagar» chip is drawn locked and labelled «Solo el dueño», because paying is not a permission at all (L17.2).
 *
 * The page decides nothing: it reads the API with the session cookie, and the API answers the module's 404 for another
 * customer's invitation and 403 `INVITATION_FORBIDDEN` for a collaborator, whose every route here is owner-only. A full
 * server render with plain forms means every action works without client script, and a hidden control is never the
 * guard — the API checks each write again.
 */

export const metadata: Metadata = {
  title: COLLABORATOR_COPY.pageTitle,
  // Co-hosts are people's addresses, so no crawler may index the screen.
  robots: { index: false, follow: false },
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The shell of a screen this caller cannot see, with the way back to the invitation it names. */
function RefusedShell({
  body,
  heading,
  invitationId,
}: {
  body: string;
  heading: string;
  invitationId?: string;
}) {
  return (
    <CustomerWorkspaceShell back eyebrow={COLLABORATOR_COPY.eyebrow} heading={heading} intro={body}>
      {invitationId === undefined ? null : (
        <Link className={quietButton} href={INVITATION_PATHS.detail(invitationId)}>
          {COLLABORATOR_COPY.backToInvitation}
        </Link>
      )}
    </CustomerWorkspaceShell>
  );
}

/**
 * One permission chip: a real checkbox, so it works without client script and the browser's own keyboard and screen
 * reader behavior applies. The chip reads as pressed in words and in tone — filled with the accent when it is on — so
 * nothing here depends on a color alone.
 */
function PermissionChip({
  checked,
  permission,
}: {
  checked: boolean;
  permission: InvitationPermission;
}) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-surface px-4 text-sm font-medium text-ink ring-[1.5px] ring-field-border transition-colors has-[:checked]:bg-primary has-[:checked]:text-on-primary has-[:checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
      <input
        className="sr-only"
        defaultChecked={checked}
        name="permissions"
        type="checkbox"
        value={permission}
      />
      {COLLABORATOR_PERMISSION_LABELS[permission]}
    </label>
  );
}

/** The three chips of one form, with the locked «Pagar» chip after them (L17.2). */
function PermissionChips({ checked }: { checked: readonly InvitationPermission[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={fieldLabel}>{COLLABORATOR_COPY.chipsLabel}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {INVITATION_PERMISSIONS.map((permission) => (
          <PermissionChip
            checked={checked.includes(permission)}
            key={permission}
            permission={permission}
          />
        ))}
        {/* Paying, refunds, archiving, and managing co-hosts are the owner's alone, so the chip never selects (L17.2). */}
        <span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose-50 px-4 text-sm font-medium text-muted ring-[1.5px] ring-rose-100">
          {COLLABORATOR_COPY.payChip}
          <span className="text-xs font-normal text-muted">{COLLABORATOR_COPY.payChipNote}</span>
        </span>
      </div>
      <p className={fieldHint}>{COLLABORATOR_COPY.chipsHint}</p>
    </fieldset>
  );
}

/** The invitation of one address: the field, the chips, and the one action (L17.1, L17.3). */
function InviteForm({ invitationId }: { invitationId: string }) {
  return (
    <form
      action={inviteCollaboratorAction}
      className="flex flex-col gap-4 rounded-panel bg-surface/90 p-4 ring-1 ring-gold/45 sm:p-5"
    >
      <input name="id" type="hidden" value={invitationId} />
      <h2 className="font-display text-xl font-semibold text-ink">
        {COLLABORATOR_COPY.inviteHeading}
      </h2>
      <div>
        <label className={fieldLabel} htmlFor="colaborador-email">
          {COLLABORATOR_COPY.emailLabel}
        </label>
        <input
          autoComplete="email"
          className={textField}
          id="colaborador-email"
          inputMode="email"
          name="email"
          required
          type="email"
        />
        <p className={fieldHint}>{COLLABORATOR_COPY.emailHint}</p>
      </div>
      <PermissionChips checked={[]} />
      <div>
        <button className={primaryButton} type="submit">
          {COLLABORATOR_COPY.inviteSubmit}
        </button>
      </div>
    </form>
  );
}

/**
 * One collaborator: the address, its state and date in words, the chips of its set, and the two writes of the row —
 * replacing the permissions and revoking the access (L17.3). Each row is its own form, so a change is one deliberate
 * submit and nothing of the other rows travels with it.
 */
function CollaboratorCard({ invitationId, row }: { invitationId: string; row: CollaboratorRow }) {
  const checked = row.chips.filter((chip) => chip.on).map((chip) => chip.permission);

  return (
    <li className="flex flex-col gap-3 rounded-panel bg-surface/90 p-4 ring-1 ring-gold/45 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium break-all text-ink">{row.email}</p>
          <p className="text-sm text-muted">{row.state}</p>
        </div>
        <form action={revokeCollaboratorAction}>
          <input name="id" type="hidden" value={invitationId} />
          <input name="collaboratorId" type="hidden" value={row.id} />
          <button
            aria-label={COLLABORATOR_COPY.revokeNamed(row.email)}
            className={textButton}
            type="submit"
          >
            {COLLABORATOR_COPY.revoke}
          </button>
        </form>
      </div>

      <form action={saveCollaboratorPermissionsAction} className="flex flex-col gap-3">
        <input name="id" type="hidden" value={invitationId} />
        <input name="collaboratorId" type="hidden" value={row.id} />
        <PermissionChips checked={checked} />
        <div>
          <button className={quietButton} type="submit">
            {COLLABORATOR_COPY.savePermissions}
          </button>
        </div>
      </form>
    </li>
  );
}

/** The list of the standing collaborators, or the screen's own note when nobody is one yet (L17.3). */
function CollaboratorList({
  invitationId,
  view,
}: {
  invitationId: string;
  view: CollaboratorScreenView;
}) {
  if (view.empty) {
    return <p className={statusNote}>{COLLABORATOR_COPY.empty}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {view.rows.map((row) => (
        <CollaboratorCard invitationId={invitationId} key={row.id} row={row} />
      ))}
    </ul>
  );
}

export default async function CollaboratorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParameters;
}) {
  await connection();
  const [{ id }, parameters] = await Promise.all([params, searchParams]);

  if (!isInvitationId(id)) {
    return (
      <RefusedShell body={INVITATION_COPY.notFoundBody} heading={INVITATION_COPY.notFoundHeading} />
    );
  }

  const [invitationRead, listRead] = await Promise.all([
    attempt(() => invitations.get(id)),
    attempt(() => invitations.collaborators(id)),
  ]);
  const invitation = resolveRead(invitationRead);
  const list = resolveRead(listRead);

  if (invitation.status === "not-found" || list.status === "not-found") {
    return (
      <RefusedShell body={INVITATION_COPY.notFoundBody} heading={INVITATION_COPY.notFoundHeading} />
    );
  }

  if (invitation.status === "unavailable" || list.status === "unavailable") {
    return (
      <RefusedShell
        body={COLLABORATOR_COPY.unavailable}
        heading={COLLABORATOR_COPY.heading}
        invitationId={id}
      />
    );
  }

  // Owner-only, and the API already refused anybody else; the note is what a caller who cannot be told apart sees.
  if (!editorAccessView(invitation.value.access).showCollaborators) {
    return (
      <RefusedShell
        body={COLLABORATOR_COPY.ownerOnly}
        heading={COLLABORATOR_COPY.heading}
        invitationId={id}
      />
    );
  }

  // The package grants the capability the invite route checks, so a withdrawn one never offers a form that would fail.
  if (!invitation.value.availableFeatures.includes("CO_HOSTS")) {
    return (
      <RefusedShell
        body={COLLABORATOR_COPY.notAvailable}
        heading={COLLABORATOR_COPY.heading}
        invitationId={id}
      />
    );
  }

  const view = collaboratorScreenView(list.value);
  const notices = invitationPageNotices(parameters);

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
          {COLLABORATOR_COPY.backToInvitation}
        </Link>
      }
      back
      eyebrow={COLLABORATOR_COPY.eyebrow}
      heading={COLLABORATOR_COPY.heading}
      intro={COLLABORATOR_COPY.intro}
    >
      <div className="flex max-w-3xl flex-col gap-4">
        <Notices error={notices.error} issues={notices.issues} notice={notices.notice} />

        <p className={statusNote}>
          {view.canInvite
            ? `${view.limit} ${COLLABORATOR_COPY.remaining(view.remaining)}`
            : view.limitReached}
        </p>

        {view.canInvite ? <InviteForm invitationId={id} /> : null}

        <section aria-label={COLLABORATOR_COPY.listHeading} className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold text-ink">
            {COLLABORATOR_COPY.listHeading}
          </h2>
          <CollaboratorList invitationId={id} view={view} />
        </section>

        <p className={statusNote}>{view.ownerNote}</p>
      </div>
    </CustomerWorkspaceShell>
  );
}
