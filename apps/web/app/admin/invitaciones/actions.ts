"use server";

import { redirect } from "next/navigation";

import {
  disableOwnerAccount,
  reactivateOwnerAccount,
  resendOwnerSignInCode,
  unpublishInvitation,
} from "../../../lib/admin/invitations/commands.ts";
import { adminInvitations } from "../../../lib/server/admin-invitations-api.ts";
import { adminUsers } from "../../../lib/server/admin-users-api.ts";

/**
 * The server actions of the invitation's support card (M9 T8, T9; S4, S6, L8, L9). The browser cannot send these
 * commands itself and must never be the guard, so they run here, on the web server, with the session cookie, and the API
 * answers `@AdminOnly()`. Each action passes the submitted form to its command and redirects to the path the command
 * answers (303 after POST), so the forms work without JavaScript and a reload never resubmits one. The API decides every
 * refusal and writes the audit row with the change in one transaction; `redirect` is called outside any `try`, as
 * Next.js requires.
 */
export async function unpublishInvitationAction(formData: FormData): Promise<void> {
  redirect(await unpublishInvitation(adminInvitations, formData));
}

/**
 * «Desactivar cuenta»: the owner's account loses access and its sessions are revoked, with the audit row the API writes
 * in the same transaction (S4). The owner's invitations stay published (L8).
 */
export async function disableOwnerAccountAction(formData: FormData): Promise<void> {
  redirect(await disableOwnerAccount(adminUsers, formData));
}

/** «Reactivar cuenta»: the owner's access is restored, with its audit row (L9). */
export async function reactivateOwnerAccountAction(formData: FormData): Promise<void> {
  redirect(await reactivateOwnerAccount(adminUsers, formData));
}

/**
 * «Reenviar código de acceso»: the API records the request and asks Better Auth's own endpoint for a code (S4). The page
 * then says the code was requested — never that it was delivered.
 */
export async function resendOwnerSignInCodeAction(formData: FormData): Promise<void> {
  redirect(await resendOwnerSignInCode(adminUsers, formData));
}
