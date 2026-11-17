"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { submitGuestRsvpForm } from "../../../../../lib/public/invitation-guest-page.ts";
import { clientAddressFor } from "../../../../../lib/server/client-address.ts";
import { getWebServerConfig } from "../../../../../lib/server/config.ts";
import { submitPublicGuestRsvp } from "../../_lib/public-api.ts";

/**
 * One guest's answer through their personal link (M6 G4; S1, S4). CORS allows no cross-origin write from the
 * invitation page, so the card posts here, on the web server, without any client script, and the action redirects back
 * to the guest's own page with one notice the page renders on the server (303 after POST, so a reload never
 * resubmits).
 *
 * The guest's address is read from the incoming request's headers — never from the form — and forwarded in the header
 * the API's rate limit reads, so an answer over the cap is refused on the API side. Nothing here logs: the message is
 * personal data, and the only place it travels is the request the API authorizes.
 */
export async function submitGuestRsvpAction(formData: FormData): Promise<void> {
  const requestHeaders = await headers();
  const target = await submitGuestRsvpForm({ submitGuestRsvp: submitPublicGuestRsvp }, formData, {
    clientAddress: clientAddressFor(requestHeaders, getWebServerConfig()),
  });

  redirect(target);
}
