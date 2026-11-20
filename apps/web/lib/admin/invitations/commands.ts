import { isCatalogId } from "../../server/admin-catalog-validators.ts";
import {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  type AdminInvitationsClient,
  type AdminUnpublishCommand,
  type InvitationsResult,
  isAdminActionReason,
} from "../../server/admin-invitations-client.ts";
import type {
  AccountResult,
  AdminUserActionCommand,
  AdminUsersClient,
} from "../../server/admin-users-client.ts";
import { SIGN_IN_PATH } from "../catalog/commands.ts";
import { INVITATIONS_PATHS, invitationDetailPath } from "./copy.ts";
import { invitationsErrorTarget, invitationsNoticeTarget } from "./notices.ts";

/**
 * The logic of the support card's server actions (M9 T8; S4, S6). Each command reads the submitted form, calls the API
 * client at most once, and answers the path to redirect to — always a 303 after POST, with the outcome as a code in the
 * query (`notices.ts`). The API authorizes the action, applies the change, and writes the audit row in the same
 * transaction; nothing here decides whether an invitation may be unpublished, and nothing here changes its state.
 *
 * The only checks made here are those needed to build a request at all, all of them the API's own rules repeated so the
 * page explains a refusal before spending a round trip: the invitation id is a UUID (`isCatalogId`, the shared
 * validator), the reason is one of the closed set, and the note is at most 500 characters and is required — non-blank —
 * while the reason is «Otro» (L9). A missing, repeated, or malformed value never becomes a request. An unexpected
 * failure (already logged by the server wrapper) is reported as `unavailable` instead of pretending the action ran.
 */

/**
 * A form value as text, or undefined when the field is missing, repeated, or not text. A repeated field is refused
 * instead of read: a form that names two invitations, reasons, or notes names none, so no request is sent for a guess.
 */
function text(form: FormData, name: string): string | undefined {
  const values = form.getAll(name);
  const value = values[0];

  return values.length === 1 && typeof value === "string" ? value : undefined;
}

/**
 * The note as the API stores it: absent for an empty textarea, otherwise trimmed. Undefined means the form cannot be
 * trusted — a repeated field, a note wider than the column, or «Otro» without one — and no request is sent.
 */
function noteOf(
  form: FormData,
  reason: AdminUnpublishCommand["reason"],
): string | null | undefined {
  const values = form.getAll("note");

  if (values.length === 0) {
    return reason === "OTHER" ? undefined : null;
  }
  if (values.length > 1) {
    return undefined;
  }

  const value = values[0];
  if (typeof value !== "string") {
    return undefined;
  }

  const note = value.trim();
  if (note === "") {
    // A blank note says nothing, so it is the same as none — which «Otro» cannot do (L9).
    return reason === "OTHER" ? undefined : null;
  }
  if (note.length > ADMIN_ACTION_NOTE_MAX_LENGTH) {
    return undefined;
  }

  return note;
}

/**
 * The unpublish command: the invitation is the form's hidden id, and the administrator's own session is the actor, so
 * the body carries only the reason and the note. The answer is the invitation's detail page with the outcome as a code.
 */
export async function unpublishInvitation(
  api: AdminInvitationsClient,
  form: FormData,
): Promise<string> {
  const invitationId = text(form, "invitationId");

  if (invitationId === undefined || !isCatalogId(invitationId)) {
    return invitationsErrorTarget(INVITATIONS_PATHS.index, "invalid-form");
  }

  const detailPath = invitationDetailPath(invitationId);
  const reason = text(form, "reason");

  if (reason === undefined || !isAdminActionReason(reason)) {
    return invitationsErrorTarget(detailPath, "invalid-form");
  }

  const note = noteOf(form, reason);
  if (note === undefined) {
    return invitationsErrorTarget(detailPath, "invalid-form");
  }

  let result: InvitationsResult<unknown>;
  try {
    result = await api.unpublish(invitationId, { reason, note });
  } catch {
    return invitationsErrorTarget(detailPath, "unavailable");
  }

  if (result.ok) {
    return invitationsNoticeTarget(detailPath, "unpublished");
  }
  if (result.failure === "signed-out") {
    return SIGN_IN_PATH;
  }
  if (result.failure === "forbidden") {
    return "/cuenta";
  }

  return invitationsErrorTarget(detailPath, result.failure);
}

/**
 * The one command body the three owner account actions share (M9 T9; S4, S6, L9): the form carries the invitation the
 * card belongs to and the owner's account id, both as UUIDs, plus the same reason and note as the unpublish. It calls
 * the account client once, and answers the invitation's page with the outcome as a code. Nothing here decides whether
 * the action may run — the API authorizes it, applies the change, and writes the audit row in one transaction — and a
 * hidden button is no guard, so a refusal the page did not expect is still its own message.
 */
async function ownerAccountAction(
  api: AdminUsersClient,
  form: FormData,
  action: {
    notice: "account-disabled" | "account-reactivated" | "sign-in-code-requested";
    call: (
      api: AdminUsersClient,
      userId: string,
      command: AdminUserActionCommand,
    ) => Promise<AccountResult<unknown>>;
  },
): Promise<string> {
  const invitationId = text(form, "invitationId");
  if (invitationId === undefined || !isCatalogId(invitationId)) {
    return invitationsErrorTarget(INVITATIONS_PATHS.index, "invalid-form");
  }

  const detailPath = invitationDetailPath(invitationId);
  const userId = text(form, "userId");

  if (userId === undefined || !isCatalogId(userId)) {
    return invitationsErrorTarget(detailPath, "invalid-form");
  }

  const reason = text(form, "reason");
  if (reason === undefined || !isAdminActionReason(reason)) {
    return invitationsErrorTarget(detailPath, "invalid-form");
  }

  const note = noteOf(form, reason);
  if (note === undefined) {
    return invitationsErrorTarget(detailPath, "invalid-form");
  }

  let result: AccountResult<unknown>;
  try {
    result = await action.call(api, userId, { reason, note });
  } catch {
    return invitationsErrorTarget(detailPath, "unavailable");
  }

  if (result.ok) {
    return invitationsNoticeTarget(detailPath, action.notice);
  }
  if (result.failure === "signed-out") {
    return SIGN_IN_PATH;
  }
  if (result.failure === "forbidden") {
    return "/cuenta";
  }

  return invitationsErrorTarget(detailPath, result.failure);
}

/**
 * «Desactivar cuenta»: blocks the owner's access, revoking their sessions, with the audit row the API writes in the same
 * transaction (S4). The owner's invitations stay published (L8), so the card says so.
 */
export function disableOwnerAccount(api: AdminUsersClient, form: FormData): Promise<string> {
  return ownerAccountAction(api, form, {
    notice: "account-disabled",
    call: (client, userId, command) => client.disable(userId, command),
  });
}

/** «Reactivar cuenta»: restores the owner's access with its audit row (L9). */
export function reactivateOwnerAccount(api: AdminUsersClient, form: FormData): Promise<string> {
  return ownerAccountAction(api, form, {
    notice: "account-reactivated",
    call: (client, userId, command) => client.reactivate(userId, command),
  });
}

/**
 * «Reenviar código de acceso»: records the request and asks the API for a new sign-in code (S4). The notice says the
 * code was requested — never that it arrived, because delivery is the API's own background task and the per-email limit
 * may still drop it.
 */
export function resendOwnerSignInCode(api: AdminUsersClient, form: FormData): Promise<string> {
  return ownerAccountAction(api, form, {
    notice: "sign-in-code-requested",
    call: (client, userId, command) => client.resendSignInCode(userId, command),
  });
}
