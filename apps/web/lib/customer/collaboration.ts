import type {
  CollaboratorList,
  CollaboratorStatus,
  InvitationFailure,
  InvitationsClient,
} from "../server/invitations-api.ts";
import { COLLABORATOR_COPY, COLLABORATOR_PERMISSION_LABELS } from "./copy.ts";
import {
  collaborationAcceptPath,
  COLLABORATION_PATHS,
  isCollaborationToken,
} from "./collaboration-link.ts";
import { DEFAULT_EDITOR_SECTION, type EditorSection } from "./editor-sections.ts";
import {
  grantsInvitationPermission,
  type InvitationAccess,
  INVITATION_PERMISSIONS,
  type InvitationPermission,
  isInvitationOwner,
} from "./invitation-access.ts";
import {
  CUSTOMER_SIGN_IN_PATH,
  formatDate,
  INVITATION_PATHS,
  invitationErrorTarget,
  invitationFailureTarget,
  invitationNoticeTarget,
  sendInvitationCall,
} from "./invitations.ts";

/**
 * The co-hosts' web (F12; S2.12, L17). Two things live here, both pure:
 *
 * - what the API's `role` and `permissions` mean for the screens. The owner holds every capability and a collaborator
 *   only the three it was granted, so the editor offers the tabs and the actions the caller may use (L17.5). This is a
 *   convenience, never a boundary: the API resolves the caller and checks the route's permission on every request, and
 *   a hidden control is not a guard.
 * - what each submitted form answers. The page, the chips, and the buttons only ever post to a server action, and the
 *   action calls the API with the session cookie; every refusal comes back as one neutral Spanish notice (L17.3).
 *
 * Owner-only capabilities are not permissions at all (L17.2): paying, refunds, archiving, renaming the address, and
 * managing collaborators are absent from the vocabulary, so no request body, stored row, or catalog change can grant
 * them, and this module has no value to offer instead. The vocabulary itself lives in `invitation-access.ts`, which the
 * API client reads too.
 */

// The access vocabulary is re-exported so a page imports one module for the co-hosts' web.
export {
  grantsInvitationPermission,
  type InvitationAccess,
  INVITATION_PERMISSIONS,
  type InvitationPermission,
  INVITATION_ROLES,
  type InvitationRole,
  isInvitationOwner,
  OWNER_ACCESS,
  parseInvitationAccess,
} from "./invitation-access.ts";

/**
 * What one caller may use in the editor (L17.5). The sections are the editor's own tabs in their own order, and the
 * owner-only actions are the capabilities that are not permissions: paying, archiving, renaming the address, and
 * managing collaborators. A screen hides what a caller cannot use; the API refuses it anyway.
 */
export interface EditorAccessView {
  /** Whether the caller owns the invitation. */
  readonly owner: boolean;
  /** The editor's tabs this caller may open, at least one. */
  readonly sections: readonly EditorSection[];
  readonly canEditContent: boolean;
  readonly canViewAttendance: boolean;
  readonly canPublish: boolean;
  /** The payment panel and the checkout: the owner's alone (L17.2). */
  readonly showPayment: boolean;
  /** Archiving: the owner's alone (L17.2). */
  readonly showArchive: boolean;
  /** Renaming the public address: the owner's alone (L17.2). */
  readonly showAddress: boolean;
  /** The co-hosts screen itself: the owner's alone (L17.2, L17.5). */
  readonly showCollaborators: boolean;
  /** Moderating the guestbook is the owner's alone, so a collaborator is offered no way in. */
  readonly showGuestbook: boolean;
}

/** The tab each permission opens, in the editor's own order (L17.2, L17.5). */
const SECTION_PERMISSIONS: ReadonlyArray<readonly [EditorSection, InvitationPermission]> = [
  ["contenido", "EDIT_CONTENT"],
  ["fotos", "EDIT_CONTENT"],
  ["funciones", "EDIT_CONTENT"],
  ["asistencia", "VIEW_ATTENDANCE"],
  ["publicar", "PUBLISH"],
];

/**
 * The editor as one caller sees it. The owner keeps every tab and every action it had; a collaborator gets the tabs of
 * the permissions it holds, in the editor's order, and no owner-only action at all — even when it holds all three.
 */
export function editorAccessView(access: InvitationAccess): EditorAccessView {
  const owner = isInvitationOwner(access);

  return {
    owner,
    sections: owner
      ? SECTION_PERMISSIONS.map(([section]) => section)
      : SECTION_PERMISSIONS.filter(([, permission]) => access.permissions.includes(permission)).map(
          ([section]) => section,
        ),
    canEditContent: grantsInvitationPermission(access, "EDIT_CONTENT"),
    canViewAttendance: grantsInvitationPermission(access, "VIEW_ATTENDANCE"),
    canPublish: grantsInvitationPermission(access, "PUBLISH"),
    showPayment: owner,
    showArchive: owner,
    showAddress: owner,
    showCollaborators: owner,
    showGuestbook: owner,
  };
}

/**
 * The tab an editor opens: the one a URL named when the caller may use it, and the first one it may use otherwise. A
 * collaborator who opens a shared link to a tab it cannot use lands on the first tab it can, never on an empty panel.
 */
export function landingSection(
  sections: readonly EditorSection[],
  asked: EditorSection,
): EditorSection {
  return sections.includes(asked) ? asked : (sections[0] ?? DEFAULT_EDITOR_SECTION);
}

/** The co-hosts screen of one invitation (F12; L17.5). It lives beside the invitation it belongs to. */
export const COLLABORATOR_PATHS = {
  page: (id: string) => `${INVITATION_PATHS.detail(id)}/coanfitriones`,
} as const;

// The acceptance's addresses and token shape have one owner, which the API client reads too.
export {
  COLLABORATION_ACCEPT_PATH,
  COLLABORATION_ACCEPT_SIGN_IN_PATH,
  collaborationAcceptPath,
  COLLABORATION_PATHS,
  COLLABORATOR_TOKEN_LENGTH,
  isCollaborationAcceptPath,
  isCollaborationToken,
} from "./collaboration-link.ts";

/** One permission chip of a row: its Spanish label and whether the stored set grants it. */
export interface CollaboratorChip {
  readonly permission: InvitationPermission;
  readonly label: string;
  readonly on: boolean;
}

/** The locked chip of the artboard: paying is the owner's alone, so it is never selectable (L17.2). */
export interface LockedCollaboratorChip {
  readonly label: string;
  readonly note: string;
  readonly selectable: false;
}

/** One collaborator as the screen renders it. */
export interface CollaboratorRow {
  readonly id: string;
  readonly email: string;
  /** The state in words, with the date of that state: «Invitación enviada el 11 nov 2026», «Aceptó el 12 nov 2026». */
  readonly state: string;
  /** Every grantable permission with its chip, so the owner reads the set and changes it in place. */
  readonly chips: readonly CollaboratorChip[];
}

/** Everything the co-hosts screen renders for one invitation. */
export interface CollaboratorScreenView {
  readonly rows: readonly CollaboratorRow[];
  /** The cap the API answered, stated in words (L17.1). */
  readonly limit: string;
  readonly limitReached: string;
  /** How many people may still be invited. */
  readonly remaining: number;
  readonly atLimit: boolean;
  /** Whether the invitation form is offered: below the cap, and always a convenience (the API refuses the sixth). */
  readonly canInvite: boolean;
  readonly empty: boolean;
  readonly lockedChip: LockedCollaboratorChip;
  readonly ownerNote: string;
}

function stateLabel(
  status: CollaboratorStatus,
  invitedAt: string,
  acceptedAt: string | null,
): string {
  if (status === "ACTIVE") {
    const date = formatDate(acceptedAt ?? invitedAt);

    return date === "" ? COLLABORATOR_COPY.acceptedNoDate : COLLABORATOR_COPY.accepted(date);
  }
  if (status === "PENDING") {
    const date = formatDate(invitedAt);

    return date === "" ? COLLABORATOR_COPY.invitedNoDate : COLLABORATOR_COPY.invited(date);
  }
  return COLLABORATOR_COPY.revoked;
}

function chipsOf(granted: readonly InvitationPermission[]): CollaboratorChip[] {
  return INVITATION_PERMISSIONS.map((permission) => ({
    permission,
    label: COLLABORATOR_PERMISSION_LABELS[permission],
    on: granted.includes(permission),
  }));
}

/**
 * The screen's view of one read (F12; L17.1, L17.3). The rows keep the API's order — oldest invitation first — and each
 * one states its state and the date of that state in words, so nothing depends on a colour. The cap is the one the API
 * answered, and it is stated in words beside how many places are left.
 */
export function collaboratorScreenView(list: CollaboratorList): CollaboratorScreenView {
  const max = list.maxCollaborators;
  const remaining = Math.max(0, max - list.collaborators.length);

  return {
    rows: list.collaborators.map((collaborator) => ({
      id: collaborator.id,
      email: collaborator.email,
      state: stateLabel(collaborator.status, collaborator.invitedAt, collaborator.acceptedAt),
      chips: chipsOf(collaborator.permissions),
    })),
    limit: COLLABORATOR_COPY.limit(max),
    limitReached: COLLABORATOR_COPY.limitReached(max),
    remaining,
    atLimit: remaining === 0,
    canInvite: remaining > 0,
    empty: list.collaborators.length === 0,
    lockedChip: {
      label: COLLABORATOR_COPY.payChip,
      note: COLLABORATOR_COPY.payChipNote,
      selectable: false,
    },
    ownerNote: COLLABORATOR_COPY.ownerNote,
  };
}

/**
 * Every refusal the co-hosts' writes can report, as the code the page shows: the API's failures as the client classified
 * them, plus the two this module answers itself. A test proves each one has a Spanish notice.
 */
export const COLLABORATOR_FAILURES: readonly InvitationFailure[] = [
  "collaborator-invalid",
  "co-hosts-unavailable",
  "collaborator-already-invited",
  "collaborator-limit-reached",
  "collaborator-email-unavailable",
  "collaborator-not-found",
  "forbidden",
  "not-found",
  "validation",
];

/** The routes the co-hosts' writes use, so a command and its page never build a path differently. */
export type CollaboratorScreenClient = Pick<
  InvitationsClient,
  | "collaborators"
  | "inviteCollaborator"
  | "updateCollaboratorPermissions"
  | "revokeCollaborator"
  | "acceptCollaboration"
>;

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);

  return typeof value === "string" ? value : undefined;
}

/** Whether a value can name a stored row: an id that cannot be one never becomes a request path. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** The invitation id and the collaborator id one submitted row carries. */
function idsOf(form: FormData): { id: string; collaboratorId: string } {
  return { id: text(form, "id") ?? "", collaboratorId: text(form, "collaboratorId") ?? "" };
}

/**
 * The permissions the chips of one form carried, in the domain's order. A chip the form did not send is not granted, and
 * a value this deployment does not know is dropped instead of becoming a request field; an empty set is refused before
 * the request, because the API's own rule is that a collaborator always holds at least one permission.
 */
function permissionsOf(form: FormData): InvitationPermission[] {
  const sent = new Set(form.getAll("permissions").filter((value) => typeof value === "string"));

  return INVITATION_PERMISSIONS.filter((permission) => sent.has(permission));
}

/**
 * Invites one address with the marked chips (F12; L17.1, L17.3, L17.5) and comes back to the screen with its notice. A
 * blank address or an empty set is refused here, with the same notice the API's own refusal carries, so the form never
 * costs a request nobody could accept.
 */
export async function inviteCollaborator(
  api: CollaboratorScreenClient,
  form: FormData,
): Promise<string> {
  const id = text(form, "id") ?? "";

  if (!isUuid(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const page = COLLABORATOR_PATHS.page(id);
  const email = (text(form, "email") ?? "").trim();
  const permissions = permissionsOf(form);

  if (email === "" || permissions.length === 0) {
    return invitationErrorTarget(page, "collaborator-invalid");
  }

  const written = await sendInvitationCall(() => api.inviteCollaborator(id, email, permissions));

  return written.ok
    ? invitationNoticeTarget(page, "collaborator-invited")
    : invitationFailureTarget(page, written.failure);
}

/** Replaces what one collaborator may do (F12; L17.3) and comes back to the screen with its notice. */
export async function saveCollaboratorPermissions(
  api: CollaboratorScreenClient,
  form: FormData,
): Promise<string> {
  const { id, collaboratorId } = idsOf(form);

  if (!isUuid(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const page = COLLABORATOR_PATHS.page(id);

  if (!isUuid(collaboratorId)) {
    return invitationErrorTarget(page, "collaborator-not-found");
  }

  const permissions = permissionsOf(form);

  if (permissions.length === 0) {
    return invitationErrorTarget(page, "collaborator-invalid");
  }

  const written = await sendInvitationCall(() =>
    api.updateCollaboratorPermissions(id, collaboratorId, permissions),
  );

  return written.ok
    ? invitationNoticeTarget(page, "collaborator-saved")
    : invitationFailureTarget(page, written.failure);
}

/**
 * Revokes one collaborator, pending or accepted (F12; L17.3), and comes back to the screen. A collaborator the API no
 * longer knows answers the same notice as a revocation, because the state the owner asked for — that person has no
 * access — already holds: the access ended on an earlier click, on the other tab, or by another owner action.
 */
export async function revokeCollaboratorAccess(
  api: CollaboratorScreenClient,
  form: FormData,
): Promise<string> {
  const { id, collaboratorId } = idsOf(form);

  if (!isUuid(id)) {
    return invitationErrorTarget(INVITATION_PATHS.list, "not-found");
  }

  const page = COLLABORATOR_PATHS.page(id);

  if (!isUuid(collaboratorId)) {
    return invitationErrorTarget(page, "collaborator-not-found");
  }

  const written = await sendInvitationCall(() => api.revokeCollaborator(id, collaboratorId));

  if (written.ok || written.failure === "collaborator-not-found") {
    return invitationNoticeTarget(page, "collaborator-revoked");
  }
  return invitationFailureTarget(page, written.failure);
}

/**
 * The refusal target of an acceptance: the same page and the same one code, whatever went wrong (L17.3). The page may
 * already carry the token, so the code is appended to the parameters it holds instead of opening a second one.
 */
function acceptRefused(target: string): string {
  const separator = target.includes("?") ? "&" : "?";

  return `${target}${separator}error=collaboration-not-found`;
}

/**
 * Accepts the emailed collaboration (F12; L17.3) and goes to the shared invitation's editor with its notice. A token
 * that cannot be one names nothing and costs no request; every refusal — a wrong account, an expired link, a used link,
 * a revoked collaborator — answers the same page with the same neutral code, so the page cannot tell them apart either.
 */
export async function acceptCollaboration(
  api: CollaboratorScreenClient,
  form: FormData,
): Promise<string> {
  const token = text(form, "token") ?? "";

  if (!isCollaborationToken(token)) {
    return acceptRefused(COLLABORATION_PATHS.accept);
  }

  const page = collaborationAcceptPath(token);
  const accepted = await sendInvitationCall(() => api.acceptCollaboration(token));

  if (accepted.ok) {
    return invitationNoticeTarget(
      INVITATION_PATHS.detail(accepted.value.invitationId),
      "collaboration-accepted",
    );
  }
  return accepted.failure === "signed-out" ? CUSTOMER_SIGN_IN_PATH : acceptRefused(page);
}
