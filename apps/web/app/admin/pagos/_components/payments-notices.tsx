import { adminErrorNote, adminStatusNote } from "../../_components/admin-ui.ts";

/**
 * The outcome of the last refund request (M7 T3; S3), read from the page's query (`lib/admin/payments/notices.ts`). It
 * renders on the server, so it shows without JavaScript: the confirmation is a status, and a refusal is an alert whose
 * text is one of the page's own fixed Spanish sentences.
 */
export function PaymentsNotices({
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
