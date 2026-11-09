import { errorNote, statusNote } from "../../../_components/ui.ts";

export const ERROR_ID = "catalog-error";

interface NoticesProperties {
  notice: string | undefined;
  error: string | undefined;
}

/**
 * The outcome of the last action, from the page's query (`lib/admin/catalog/notices.ts`). It renders on
 * the server, so it shows without JavaScript; the error is an alert, the confirmation a status, and the
 * invalid fields point to the error with `aria-describedby`.
 */
export function Notices({ notice, error }: NoticesProperties) {
  return (
    <>
      {notice === undefined ? null : (
        <p className={statusNote} role="status">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <p className={errorNote} id={ERROR_ID} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
