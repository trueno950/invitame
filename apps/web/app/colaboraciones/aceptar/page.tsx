import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { loadAccountView } from "../../../lib/customer/account.ts";
import { COLLABORATION_PATHS, isCollaborationToken } from "../../../lib/customer/collaboration.ts";
import { COLLABORATOR_COPY } from "../../../lib/customer/copy.ts";
import { getOwnProfile } from "../../../lib/server/session-api.ts";
import { CustomerShell } from "../../_components/customer-shell.tsx";
import { primaryButton, quietButton, statusNote } from "../../_components/ui.ts";
import { acceptCollaborationAction } from "./actions.ts";

/**
 * `/colaboraciones/aceptar?token=…` (F12; S2.12, L17.3): the screen the emailed link opens. The path is the API's own
 * (`COLLABORATOR_ACCEPTANCE_PATH`), so nothing here disagrees with the message that carried it.
 *
 * The page decides nothing about the acceptance: the token travels in a form's hidden field and one button submits it to
 * a server action, which calls `POST /collaborations/accept` with the session cookie. That is also why a GET never
 * accepts anything — a mail client that prefetches the link cannot join an invitation on the recipient's behalf.
 *
 * The recipient signs in first, with the product's own email code, and the sign-in hands them back here: the API compares
 * the invited address with the session's account, and every failure — another account, an expired link, a used link, a
 * revoked collaborator — answers the same neutral sentence, so this page can never say which one it was. The token is
 * never echoed: it stays in the form's field and in the address bar the email already gave the recipient.
 */

export const metadata: Metadata = {
  title: COLLABORATOR_COPY.acceptPageTitle,
  // The link is a secret: no crawler may index it.
  robots: { index: false, follow: false },
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The one code the acceptance's refusal carries; anything else in the query shows nothing at all. */
const REFUSED_CODE = "collaboration-not-found";

/** The screen of a link that can open nothing, with the way back to the product. */
function RefusedScreen({ body }: { body: string }) {
  return (
    <CustomerShell
      eyebrow={COLLABORATOR_COPY.acceptEyebrow}
      heading={COLLABORATOR_COPY.acceptHeading}
      intro={COLLABORATOR_COPY.acceptIntro}
    >
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <p className={statusNote}>{body}</p>
        <Link className={quietButton} href="/">
          InvitaMe
        </Link>
      </div>
    </CustomerShell>
  );
}

export default async function AcceptCollaborationPage({
  searchParams,
}: {
  searchParams: SearchParameters;
}) {
  // Rendered per request: the session read decides whether the visitor signs in first.
  await connection();
  const { token, error } = await searchParams;

  if (!isCollaborationToken(token)) {
    return <RefusedScreen body={COLLABORATOR_COPY.acceptRefused} />;
  }

  const view = await loadAccountView(getOwnProfile);

  if (view.kind === "signed-out") {
    // A route handler remembers the acceptance across the sign-in, because only a route handler may set the cookie.
    redirect(`${COLLABORATION_PATHS.acceptSignIn}?token=${encodeURIComponent(token)}`);
  }

  if (view.kind === "unavailable") {
    return <RefusedScreen body={COLLABORATOR_COPY.acceptUnavailable} />;
  }

  // The one refusal of an acceptance, in the one sentence it answers (L17.3): it never says which reason it was, and
  // offering the button again would only repeat it.
  if (error === REFUSED_CODE) {
    return <RefusedScreen body={COLLABORATOR_COPY.acceptRefused} />;
  }

  return (
    <CustomerShell
      eyebrow={COLLABORATOR_COPY.acceptEyebrow}
      heading={COLLABORATOR_COPY.acceptHeading}
      intro={COLLABORATOR_COPY.acceptIntro}
    >
      <div className="flex w-full max-w-md flex-col gap-5">
        <p className={statusNote}>{COLLABORATOR_COPY.acceptSignIn}</p>
        <form action={acceptCollaborationAction} className="flex flex-col gap-4">
          <input name="token" type="hidden" value={token} />
          <button className={primaryButton} type="submit">
            {COLLABORATOR_COPY.acceptSubmit}
          </button>
        </form>
      </div>
    </CustomerShell>
  );
}
