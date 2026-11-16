"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { saveInvitationFeatures } from "../../../lib/customer/invitation-features.ts";
import {
  createGuest,
  type GuestOutcome,
  removeGuestFromList,
  rotateGuestLink,
  updateGuestDetails,
} from "../../../lib/customer/invitation-guests.ts";
import { saveRsvpSettings } from "../../../lib/customer/invitation-rsvp.ts";
import {
  archiveInvitation,
  createInvitation,
  publishInvitation,
  saveInvitationContent,
  unpublishInvitation,
} from "../../../lib/customer/invitations.ts";
import { guestShareUrl } from "../../../lib/public/guest-pass.ts";
import { requestOrigin } from "../../../lib/server/request-origin.ts";
import { guestLinkCookie, guestLinks } from "../../../lib/server/single-use-flash.ts";
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

/** Saves the RSVP deadline and party limit of a draft or published invitation (M6 G3; S4). */
export async function saveRsvpSettingsAction(formData: FormData): Promise<void> {
  redirect(await saveRsvpSettings(invitations, formData));
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

/**
 * Finishes one guest write (M6 G4; S4). A plain outcome is a redirect; a one-time link outcome keeps the personal token
 * in this process's single-use store and hands the page only an opaque handle, in a cookie that is httpOnly,
 * `SameSite=Strict`, path-scoped to that one attendance page, and short-lived. The token never becomes part of a URL
 * and is never logged, and the page takes it out of the store as it renders it, so it is shown exactly once.
 */
async function finishGuestWrite(outcome: GuestOutcome): Promise<never> {
  if (outcome.kind === "redirect") {
    redirect(outcome.target);
  }

  const origin = requestOrigin(await headers());
  const personalUrl =
    origin === undefined ? outcome.personalPath : `${origin}${outcome.personalPath}`;
  const whatsAppUrl =
    origin === undefined ? undefined : guestShareUrl(outcome.guestName, personalUrl);
  const handle = guestLinks.put({
    invitationId: outcome.invitationId,
    guestName: outcome.guestName,
    personalUrl,
    ...(whatsAppUrl === undefined ? {} : { whatsAppUrl }),
  });

  (await cookies()).set(
    guestLinkCookie(outcome.invitationId, handle, origin?.startsWith("https://") ?? false),
  );
  redirect(outcome.target);
}

/** Adds one guest to a guest-list invitation and answers their personal link once (M6 G4; S4). */
export async function createGuestAction(formData: FormData): Promise<void> {
  await finishGuestWrite(await createGuest(invitations, formData));
}

/** Replaces one guest's name, seats, phone, and note (M6 G4; S4). */
export async function saveGuestAction(formData: FormData): Promise<void> {
  await finishGuestWrite(await updateGuestDetails(invitations, formData));
}

/** Removes one guest together with the answer they gave (M6 G4; S4). */
export async function removeGuestAction(formData: FormData): Promise<void> {
  await finishGuestWrite(await removeGuestFromList(invitations, formData));
}

/** Replaces one guest's personal link and answers the new one once (M6 G4; S4). */
export async function rotateGuestLinkAction(formData: FormData): Promise<void> {
  await finishGuestWrite(await rotateGuestLink(invitations, formData));
}
