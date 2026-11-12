import { errorNote, statusNote } from "../../../_components/ui.ts";

interface NoticesProperties {
  notice: string | undefined;
  error: string | undefined;
}

/**
 * The outcome of the last action, from the page's query (`lib/customer/invitations.ts`). It renders on
 * the server, so it shows without JavaScript; the error is an alert and the confirmation a status.
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
        <p className={errorNote} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
