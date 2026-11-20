"use server";

import { redirect } from "next/navigation";

import { unpublishInvitation } from "../../../lib/admin/invitations/commands.ts";
import { adminInvitations } from "../../../lib/server/admin-invitations-api.ts";

/**
 * The unpublish server action of the invitation's support card (M9 T8; S4, S6). The browser cannot send the command
 * itself and must never be the guard, so it runs here, on the web server, with the session cookie, and the API answers
 * `@AdminOnly()`. The action passes the submitted form to its command and redirects to the path the command answers (303
 * after POST), so the form works without JavaScript and a reload never resubmits it. The API decides every refusal and
 * writes the audit row with the change in one transaction; `redirect` is called outside any `try`, as Next.js requires.
 */
export async function unpublishInvitationAction(formData: FormData): Promise<void> {
  redirect(await unpublishInvitation(adminInvitations, formData));
}
