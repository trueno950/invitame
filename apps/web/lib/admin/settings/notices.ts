import {
  SETTINGS_ERROR_COPY,
  SETTINGS_NOTICE_COPY,
  type SettingsErrorCode,
  type SettingsNoticeCode,
} from "./copy.ts";

/**
 * How the outcome of the settings save reaches the page (M9 T14; S5, S8). The action ends with a redirect after POST
 * (303), so the form works without JavaScript and a reload never resubmits it. The result travels in the target's query
 * as `?notice=<code>` or `?error=<code>`: only a code from a fixed list (the saved notice, the generic refusals, and the
 * seven field refusals), never text, a number, or a value the API answered, and the page looks the code up in its own
 * tables, so a forged query can show only one of the fixed messages.
 */

type SearchParameters = Readonly<Record<string, string | string[] | undefined>>;

export function settingsErrorTarget(path: string, code: SettingsErrorCode): string {
  return `${path}?error=${code}`;
}

export function settingsNoticeTarget(path: string, code: SettingsNoticeCode): string {
  return `${path}?notice=${code}`;
}

function lookup<T extends string>(
  table: Readonly<Record<T, string>>,
  value: string | string[] | undefined,
): value is T {
  return typeof value === "string" && Object.hasOwn(table, value);
}

export interface SettingsPageNotices {
  notice?: string;
  /** The code names which refusal it was; the message is the Spanish text. */
  error?: { code: SettingsErrorCode; message: string };
}

/** The messages the page shows for its query, if any; an unknown or repeated value shows nothing. */
export function settingsPageNotices(parameters: SearchParameters): SettingsPageNotices {
  const { notice, error } = parameters;

  return {
    ...(lookup(SETTINGS_NOTICE_COPY, notice) ? { notice: SETTINGS_NOTICE_COPY[notice] } : {}),
    ...(lookup(SETTINGS_ERROR_COPY, error)
      ? { error: { code: error, message: SETTINGS_ERROR_COPY[error] } }
      : {}),
  };
}
