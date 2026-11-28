"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { editorSectionTarget, sectionFromForm } from "../../../lib/customer/editor-sections.ts";
import {
  removeInvitationPassword,
  saveInvitationPassword,
} from "../../../lib/customer/password-protection.ts";
import { isInvitationId } from "../../../lib/server/invitations-api.ts";
import { requestOrigin } from "../../../lib/server/request-origin.ts";
import { passwordShareCookie, passwordShares } from "../../../lib/server/single-use-flash.ts";
import { invitations } from "./_lib/api.ts";

/**
 * The access code of one invitation (F13; S2.13, L18.1). The browser cannot reach the API's owner routes across origins, so
 * the «Pedir contraseña» block of the «Publicar» tab posts to these two actions instead, and each one redirects with the
 * tab the form came from (303 after POST, so a reload never resubmits and never asks for the same code twice).
 *
 * The code itself is the one secret this page ever handles, and it is handled exactly like a guest's personal link: the
 * API stores only its hash and answers whether a code is set, and the ready-to-share message that quotes the typed value
 * stays in this process's single-use store, behind an opaque handle in a cookie scoped to this invitation's own editor.
 * The message is read once, as the page renders it, and the code never becomes part of a URL or of any log.
 *
 * Nothing here is a guard: the API's password routes are owner-only and raise the stored version on every write, so a
 * collaborator's form is refused there and every older token stops opening the invitation.
 */

/** The target a navigating action redirects to, with the editor tab the submitted form carried. */
function landed(formData: FormData, target: string): string {
  return editorSectionTarget(target, sectionFromForm(formData));
}

/**
 * Sets or replaces the code the owner typed and, once, shows her the line she can paste with the invitation. The value
 * never leaves this request pair: the API receives it to hash, and the message holds it for a single render.
 */
export async function saveInvitationPasswordAction(formData: FormData): Promise<void> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const origin = requestOrigin(requestHeaders);
  const outcome = await saveInvitationPassword(invitations, formData, { origin });

  if (outcome.kind === "refused") {
    redirect(landed(formData, outcome.target));
  }

  // The message is stored for one render, behind a handle the browser carries in a cookie scoped to this invitation's
  // editor. An id that cannot be one names no editor, so nothing is stored for it.
  const invitationId = formData.get("id");

  if (outcome.message !== undefined && isInvitationId(invitationId)) {
    cookieStore.set(
      passwordShareCookie(
        invitationId,
        passwordShares.put({ invitationId, message: outcome.message }),
        origin?.startsWith("https://") ?? false,
      ),
    );
  }

  redirect(landed(formData, outcome.target));
}

/** Removes the stored code, so the invitation opens again to whoever holds its link (L18.1). */
export async function removeInvitationPasswordAction(formData: FormData): Promise<void> {
  const outcome = await removeInvitationPassword(invitations, formData);

  redirect(landed(formData, outcome.target));
}
