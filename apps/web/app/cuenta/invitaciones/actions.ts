"use server";

import { redirect } from "next/navigation";

import {
  archiveInvitation,
  createInvitation,
  saveInvitationContent,
} from "../../../lib/customer/invitations.ts";
import { invitations } from "./_lib/api.ts";

/**
 * The invitation server actions (M4 T5; S1, S6, S7, L8). CORS allows no `PUT` from a browser, so the
 * content write runs here, on the web server, with the session cookie. Each action passes the submitted
 * form to its command and redirects to the path the command answers (303 after POST), so a form works
 * without JavaScript and a reload never resubmits it. The API authorizes and validates every write;
 * `redirect` is called outside any `try`, as Next.js requires.
 */

export async function createInvitationAction(formData: FormData): Promise<void> {
  redirect(await createInvitation(invitations, formData));
}

export async function saveInvitationContentAction(formData: FormData): Promise<void> {
  redirect(await saveInvitationContent(invitations, formData));
}

export async function archiveInvitationAction(formData: FormData): Promise<void> {
  redirect(await archiveInvitation(invitations, formData));
}
