import { adminErrorNote, adminStatusNote } from "../../_components/admin-ui.ts";

/**
 * The outcome of the last save (M9 T14; S5, S8), read from the page's query (`lib/admin/settings/notices.ts`). It
 * renders on the server, so it shows without JavaScript: the confirmation is a status, and a refusal is an alert whose
 * text is one of the page's own fixed Spanish sentences, never a value or a message the API answered.
 */
export function SettingsNotices({
  notice,
  error,
}: {
  notice: string | undefined;
  error: string | undefined;
}) {
  return (
    <>
      {notice === undefined ? null : (
        <p className={adminStatusNote} role="status">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <p className={adminErrorNote} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
