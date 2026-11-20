import { isCatalogId } from "../../server/admin-catalog-validators.ts";
import {
  ADMIN_ACTION_NOTE_MAX_LENGTH,
  type AdminInvitationsClient,
  type AdminUnpublishCommand,
  type InvitationsResult,
  isAdminActionReason,
} from "../../server/admin-invitations-client.ts";
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
