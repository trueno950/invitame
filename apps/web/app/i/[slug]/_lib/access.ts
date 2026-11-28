import "server-only";

import { cookies } from "next/headers";

import {
  INVITATION_ACCESS_COOKIE,
  invitationAccessTokenOf,
} from "../../../../lib/server/invitation-access-cookie.ts";

/**
 * The access token of the invitation the current request is about (F13; S2.13, L18.2).
 *
 * The value lives in the cookie the unlock action set, which is `HttpOnly`, `SameSite=Lax`, and scoped to `/i/<slug>`,
 * so the browser sends it only to that invitation's own pages and no script can read it. This module reads it and
 * forwards it as the `X-Invitation-Access` header of every public request of the guest's page — the read, the RSVP, the
 * guestbook, the photo upload, and the calendar file — so the API's gate sees the same token in all of them.
 *
 * It never logs, never returns a token that is not one this deployment could have stored, and has no client-script
 * counterpart: a guest's device holds the token and nothing else does.
 */
export async function invitationAccessToken(): Promise<string | undefined> {
  const store = await cookies();

  return invitationAccessTokenOf(store.get(INVITATION_ACCESS_COOKIE)?.value);
}
