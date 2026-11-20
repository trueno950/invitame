import { AdminCenteredShell } from "../../_components/admin-centered-shell.tsx";
import { adminButtonOutline } from "../../_components/admin-ui.ts";

/**
 * The notice both invitation status pages show instead of data (M9 T3; S1): the session could not be read, the API
 * answered an outage, or the invitation does not exist. It is a plain link, so it works without JavaScript, and it
 * never renders a partial or an empty list as if it were the answer.
 */
export function InvitationsNotice({
  heading,
  body,
  href,
  linkLabel,
}: {
  heading: string;
  body: string;
  /** The page to try again, or the list to go back to. */
  href: string;
  linkLabel: string;
}) {
  return (
    <AdminCenteredShell heading={heading} intro={body}>
      <div className="flex">
        <a className={adminButtonOutline} href={href}>
          {linkLabel}
        </a>
      </div>
    </AdminCenteredShell>
  );
}
