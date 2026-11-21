"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { editorSectionTarget, sectionFromForm } from "../../../lib/customer/editor-sections.ts";
import {
  createGuest,
  type GuestOutcome,
  removeGuestFromList,
  rotateGuestLink,
  updateGuestDetails,
} from "../../../lib/customer/invitation-guests.ts";
import {
  type MediaActionsApi,
  moveGalleryPhoto,
  removeGalleryPhoto,
  saveGalleryAlt,
  uploadGalleryPhoto,
  uploadMainPhoto,
} from "../../../lib/customer/invitation-media.ts";
import { emitSimulatedPayment, startCheckout } from "../../../lib/customer/invitation-payment.ts";
import {
  archiveInvitation,
  createInvitation,
  publishInvitation,
  unpublishInvitation,
} from "../../../lib/customer/invitations.ts";
import { guestShareUrl } from "../../../lib/public/guest-pass.ts";
import { requestOrigin } from "../../../lib/server/request-origin.ts";
import { guestLinkCookie, guestLinks } from "../../../lib/server/single-use-flash.ts";
import { invitations } from "./_lib/api.ts";
import { media } from "./_lib/media.ts";

/**
 * The invitation server actions (M4 T5, M5 T5; S1, S6, S7, L8). CORS allows no `PUT` from a browser, so the
 * content write runs here, on the web server, with the session cookie. Each action passes the submitted
 * form to its command and redirects to the path the command answers (303 after POST), so a form works
 * without JavaScript and a reload never resubmits it. The API authorizes and validates every write;
 * `redirect` is called outside any `try`, as Next.js requires.
 */

/**
 * The target a navigating action redirects to, with the editor tab the submitted form carried (T2c; S4). The editor
 * mirrors its tab into `?seccion=`, and every form inside it submits that tab as a hidden field, so an upload, a
 * checkout, a publish, an unpublish, or an archive comes back to the tab it came from instead of to the first one. A
 * form outside the editor carries no tab, and its target is returned exactly as its command wrote it.
 */
function landed(formData: FormData, target: string): string {
  return editorSectionTarget(target, sectionFromForm(formData));
}

/**
 * The media actions of the draft (M8 S2, S3, S4). Each one needs the media routes and the content path the editor
 * already saves with, because the main photo's URL is written into the template's own photo field. Every call is
 * logged once by its own module when it fails unexpectedly, with no alt text, file name, or id.
 */
function mediaApi(): MediaActionsApi {
  return {
    list: (id) => media.list(id),
    limits: (id) => media.limits(id),
    upload: (id, upload) => media.upload(id, upload),
    update: (id, assetId, patch) => media.update(id, assetId, patch),
    remove: (id, assetId) => media.remove(id, assetId),
    get: (id) => invitations.get(id),
    replaceContent: (id, content) => invitations.replaceContent(id, content),
  };
}

/** Uploads the invitation's main photo and writes its URL into the template's photo field (M8 S4). */
export async function uploadMainPhotoAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await uploadMainPhoto(mediaApi(), formData)));
}

/** Uploads one gallery photo of a package that grants `GALLERY` (M8 S3, S4). */
export async function uploadGalleryPhotoAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await uploadGalleryPhoto(mediaApi(), formData)));
}

/** Replaces the alt text of one gallery photo (M8 S4). */
export async function saveGalleryAltAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await saveGalleryAlt(mediaApi(), formData)));
}

/** Moves one gallery photo one place up or down (M8 S4). */
export async function moveGalleryPhotoAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await moveGalleryPhoto(mediaApi(), formData)));
}

/** Removes one gallery photo (M8 S4). */
export async function removeGalleryPhotoAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await removeGalleryPhoto(mediaApi(), formData)));
}

export async function createInvitationAction(formData: FormData): Promise<void> {
  redirect(await createInvitation(invitations, formData));
}

export async function archiveInvitationAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await archiveInvitation(invitations, formData)));
}

/** Publishes a complete draft, so its `/i/<slug>` page answers (M5 T5; S7, S9). */
export async function publishInvitationAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await publishInvitation(invitations, formData)));
}

/** Returns a published invitation to draft, so its public page stops answering (M5 T5; S7). */
export async function unpublishInvitationAction(formData: FormData): Promise<void> {
  redirect(landed(formData, await unpublishInvitation(invitations, formData)));
}

/**
 * Starts or resumes the checkout of one invitation (M7 T2; S4). The redirect the API answered is followed only when
 * it points at this invitation's own payment page on this request's origin, so the command needs the origin the page
 * itself was served from; a refused answer comes back to the invitation as an error notice instead of leaving.
 */
export async function startCheckoutAction(formData: FormData): Promise<void> {
  const target = await startCheckout(invitations, formData, requestOrigin(await headers()));
  // Only a refusal that comes back to the editor carries the tab; the payment page is followed exactly as answered.
  redirect(target.includes("/pago/") ? target : landed(formData, target));
}

/**
 * Emits one simulated payment outcome (M7 T2; S4). Development and test only: the API refuses it unless the
 * deployment runs the simulated provider, and the emit passes through the same signed intake a provider would use.
 */
export async function emitSimulatedPaymentAction(formData: FormData): Promise<void> {
  redirect(await emitSimulatedPayment(invitations, formData));
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
