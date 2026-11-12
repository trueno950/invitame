import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import { errorNote, statusNote } from "../../../_components/ui.ts";

interface NoticesProperties {
  notice: string | undefined;
  error: string | undefined;
  /** The Spanish sentences of a refused publication, when the page read them from its query (S7). */
  issues?: readonly string[] | undefined;
}

/**
 * The outcome of the last action, from the page's query (`lib/customer/invitations.ts`). It renders on
 * the server, so it shows without JavaScript; the error is an alert and the confirmation a status. A
 * refused publication lists each issue under its error, so the customer sees what still has to be done.
 */
export function Notices({ notice, error, issues }: NoticesProperties) {
  const details = issues ?? [];

  return (
    <>
      {notice === undefined ? null : (
        <p className={statusNote} role="status">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <div className={errorNote} role="alert">
          <p>{error}</p>
          {details.length === 0 ? null : (
            <>
              <p className="mt-2 font-medium">{INVITATION_COPY.publishIssuesHeading}</p>
              <ul className="mt-1 list-disc pl-5">
                {details.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
