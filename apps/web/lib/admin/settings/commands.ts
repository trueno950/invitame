import type {
  AdminSettingsClient,
  SettingsSaveResult,
} from "../../server/admin-settings-client.ts";
import { SIGN_IN_PATH } from "../catalog/commands.ts";
import { SETTINGS_FIELD_ERROR_CODE, SETTINGS_PATHS } from "./copy.ts";
import { parseSettingsForm } from "./form.ts";
import { settingsErrorTarget, settingsNoticeTarget } from "./notices.ts";

/**
 * The logic of the settings server action (M9 T14; S5, S8, L15). It reads the submitted form, calls the API client at
 * most once, and answers the path to redirect to — always a 303 after POST, with the outcome as a code in the query
 * (`notices.ts`). The API applies the bounds and the cross-field rules, writes the audit row, and is the only guard;
 * nothing here decides whether a limit is acceptable and nothing here changes a stored value.
 *
 * The only checks made here are those needed to build a request at all (`form.ts`): the seven integers and a note of at
 * most 200 characters. A form it cannot read redirects with `invalid-form` and never calls the API.
 *
 * A refusal that names fields is shown as the notice of the first one: the API's `issues` arrive in the order it
 * validates them, and the form shows every field's range, so one named field is enough to correct the save. A refusal
 * that names none is the generic notice. An unexpected failure (already logged by the server wrapper) is reported as
 * `unavailable` instead of pretending the settings were saved.
 */
export async function saveSettings(api: AdminSettingsClient, form: FormData): Promise<string> {
  const values = parseSettingsForm(form);

  if (values === undefined) {
    return settingsErrorTarget(SETTINGS_PATHS.index, "invalid-form");
  }

  let result: SettingsSaveResult;
  try {
    result = await api.update(values.settings, values.note);
  } catch {
    return settingsErrorTarget(SETTINGS_PATHS.index, "unavailable");
  }

  if (result.ok) {
    return settingsNoticeTarget(SETTINGS_PATHS.index, "saved");
  }
  if (result.failure === "signed-out") {
    return SIGN_IN_PATH;
  }
  if (result.failure === "forbidden") {
    return "/cuenta";
  }
  if (result.failure === "validation") {
    const [issue] = result.issues;

    return settingsErrorTarget(
      SETTINGS_PATHS.index,
      issue === undefined ? "invalid-settings" : SETTINGS_FIELD_ERROR_CODE[issue.field],
    );
  }

  return settingsErrorTarget(SETTINGS_PATHS.index, result.failure);
}
