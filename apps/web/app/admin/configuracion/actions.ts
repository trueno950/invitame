"use server";

import { redirect } from "next/navigation";

import { saveSettings } from "../../../lib/admin/settings/commands.ts";
import { adminSettings } from "../../../lib/server/admin-settings-api.ts";

/**
 * The settings save action (M9 T14; S5, S8). The browser cannot send the command itself and must never be the guard, so
 * it runs here, on the web server, with the session cookie, and the API answers `@AdminOnly()` and applies the bounds.
 * The action passes the submitted form to its command and redirects to the path the command answers (303 after POST), so
 * the form works without JavaScript and a reload never resubmits it. `redirect` is called outside any `try`, as Next.js
 * requires.
 */
export async function saveSettingsAction(formData: FormData): Promise<void> {
  redirect(await saveSettings(adminSettings, formData));
}
