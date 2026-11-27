"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { submitPublicGuestbookForm } from "../../../lib/public/guestbook.ts";
import { submitPublicRsvpForm } from "../../../lib/public/invitation-rsvp.ts";
import { clientAddressFor } from "../../../lib/server/client-address.ts";
import { getWebServerConfig } from "../../../lib/server/config.ts";
import { submitPublicGuestbook, submitPublicRsvp } from "./_lib/public-api.ts";

/**
 * The guest's open RSVP answer (M6 G3; S1, S4). CORS allows no cross-origin write from the invitation page, so the
 * form posts here, on the web server, without any client script, and the action redirects back to the invitation
 * with one notice the page renders on the server (303 after POST, so a reload never resubmits).
 *
 * The guest's address is read from the incoming request's headers — never from the form — and forwarded in the
 * header the API's rate limit reads. Nothing here logs: the name, the phone, and the message are personal data and
 * the only place they travel is the request the API authorizes.
 */
export async function submitRsvpAction(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  const target = await submitPublicRsvpForm({ submitRsvp: submitPublicRsvp }, formData, {
    clientAddress: clientAddressFor(requestHeaders, getWebServerConfig()),
  });

  redirect(target);
}

/**
 * The guest's signature on the invitation's wall (F7; S2.7, L10.3). The same shape as the answer above: the form posts
 * to this server action with no client script, the guest's address is read from the request headers and forwarded in
 * the header the API's rate limit counts, and the action redirects back to the invitation with one notice the page
 * renders on the server (303 after POST, so a reload never resubmits).
 */
export async function signGuestbookAction(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  const target = await submitPublicGuestbookForm(
    { submitGuestbook: submitPublicGuestbook },
    formData,
    { clientAddress: clientAddressFor(requestHeaders, getWebServerConfig()) },
  );

  redirect(target);
}
