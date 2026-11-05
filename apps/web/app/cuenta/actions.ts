"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { type DisplayNameFormState, saveDisplayName } from "../../lib/customer/account.ts";
import { updateOwnProfile } from "../../lib/server/session-api.ts";

/**
 * Changes or clears the signed-in user's display name through `PATCH /me` (M2 T8c; L29). The browser
 * cannot send `PATCH` to the API, so this server action does, with the session cookie. The API
 * authorizes the call and validates the name; an ended session goes to `/ingresar`.
 */
export async function updateDisplayName(
  _previous: DisplayNameFormState,
  formData: FormData,
): Promise<DisplayNameFormState> {
  const result = await saveDisplayName(updateOwnProfile, formData.get("displayName"));

  if (result.status === "signed-out") {
    redirect("/ingresar");
  }

  if (result.status === "saved") {
    refresh();
  }

  return result;
}
