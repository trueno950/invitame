"use server";

import { redirect } from "next/navigation";

import { acceptCollaboration } from "../../../lib/customer/collaboration.ts";
import { invitations } from "../../cuenta/invitaciones/_lib/api.ts";

/**
 * The acceptance's one server action (F12; L17.3). The browser cannot send the `POST /collaborations/accept` itself —
 * the session cookie stays on the web server — so the submitted form comes here, the action calls the API with the
 * session cookie, and it redirects to the path the command answers: the shared invitation's editor with its notice, or
 * the acceptance page with the one neutral refusal code.
 *
 * It imports the invitation pages' API wrapper, which is the one stateless client of the invitation API for the server
 * process: the acceptance is a route of that API, and a second client would only be a second place to keep in step.
 * `redirect` is called outside any `try`, as Next.js requires.
 */
export async function acceptCollaborationAction(formData: FormData): Promise<void> {
  redirect(await acceptCollaboration(invitations, formData));
}
