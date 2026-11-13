"use server";

import { redirect } from "next/navigation";
import { saveInvitationFeatures } from "../../../lib/customer/invitation-features.ts";
import {
  archiveInvitation,
  createInvitation,
  publishInvitation,
  saveInvitationContent,
  unpublishInvitation,
} from "../../../lib/customer/invitations.ts";
import { invitations } from "./_lib/api.ts";

/**
 * The invitation server actions (M4 T5, M5 T5; S1, S6, S7, L8). CORS allows no `PUT` from a browser, so the
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

/** Saves the invitation's time zone and WhatsApp contact (F3; S3, S4). */
export async function saveInvitationFeaturesAction(formData: FormData): Promise<void> {
  redirect(await saveInvitationFeatures(invitations, formData));
}

export async function archiveInvitationAction(formData: FormData): Promise<void> {
  redirect(await archiveInvitation(invitations, formData));
}

/** Publishes a complete draft, so its `/i/<slug>` page answers (M5 T5; S7, S9). */
export async function publishInvitationAction(formData: FormData): Promise<void> {
  redirect(await publishInvitation(invitations, formData));
}

/** Returns a published invitation to draft, so its public page stops answering (M5 T5; S7). */
export async function unpublishInvitationAction(formData: FormData): Promise<void> {
  redirect(await unpublishInvitation(invitations, formData));
}
