import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { loadAccountView } from "../../lib/customer/account.ts";
import { isCollaborationAcceptPath } from "../../lib/customer/collaboration.ts";
import { ACCOUNT_COPY } from "../../lib/customer/copy.ts";
import { isCheckInPath } from "../../lib/public/guest-pass.ts";
import { getOwnProfile } from "../../lib/server/session-api.ts";
import { AFTER_SIGN_IN_COOKIE, afterSignIn } from "../../lib/server/single-use-flash.ts";
import { CustomerShell } from "../_components/customer-shell.tsx";
import { quietButton } from "../_components/ui.ts";
import { DisplayNameForm } from "./display-name-form.tsx";
import { SignOutButton } from "./sign-out-button.tsx";

export const metadata: Metadata = {
  title: ACCOUNT_COPY.pageTitle,
};

/**
 * `/cuenta`: the signed-in customer's own profile (M2 T8c; S1, L29, L39). `proxy.ts` refreshes the
 * browser's session cookie before this render (L34); the profile comes from `GET /me` on the web
 * server. An administrator sees a notice that links to the panel at `/admin` (T8d; S36).
 */
export default async function AccountPage() {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAccountView(getOwnProfile);

  if (view.kind === "signed-out") {
    redirect("/ingresar");
  }

  // A visitor who opened a guest's access pass, or a co-host's acceptance, before signing in comes back to it (M6 G4;
  // S4, F12; L17.3). The one-time store answers a bare path it validated — a check-in page or the acceptance with one
  // well-formed token — never an absolute or arbitrary target, and reading it deletes it, so a later visit here is a
  // plain account page.
  const handle = (await cookies()).get(AFTER_SIGN_IN_COOKIE)?.value;
  const pending =
    handle === undefined
      ? undefined
      : afterSignIn.take(
          handle,
          (path): path is string => isCheckInPath(path) || isCollaborationAcceptPath(path),
        );

  if (pending !== undefined) {
    redirect(pending);
  }

  return (
    <CustomerShell
      eyebrow={ACCOUNT_COPY.eyebrow}
      heading={view.kind === "unavailable" ? ACCOUNT_COPY.unavailableHeading : ACCOUNT_COPY.heading}
      intro={view.kind === "unavailable" ? ACCOUNT_COPY.unavailableBody : ACCOUNT_COPY.intro}
    >
      {view.kind === "customer" ? (
        <div className="flex flex-col gap-8">
          <dl className="grid gap-5">
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                {ACCOUNT_COPY.emailLabel}
              </dt>
              <dd className="mt-1 text-lg font-medium break-all text-ink">{view.profile.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                {ACCOUNT_COPY.nameLabel}
              </dt>
              <dd className="mt-1 text-lg break-words text-ink">
                {view.profile.displayName ?? (
                  <span className="text-muted">{ACCOUNT_COPY.nameEmpty}</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="border-t border-gold/40 pt-8">
            <DisplayNameForm displayName={view.profile.displayName} />
          </div>

          <div className="border-t border-gold/40 pt-8">
            <SignOutButton />
          </div>
        </div>
      ) : null}

      {view.kind === "not-customer" ? (
        <div className="flex flex-col gap-8">
          <p className="text-center leading-7 text-muted">{ACCOUNT_COPY.notCustomer}</p>
          <div className="flex justify-center">
            <Link className={quietButton} href="/admin">
              {ACCOUNT_COPY.adminPanel}
            </Link>
          </div>
          <SignOutButton />
        </div>
      ) : null}

      {view.kind === "unavailable" ? (
        <div className="flex flex-wrap justify-center gap-3">
          <a className={quietButton} href="/cuenta">
            {ACCOUNT_COPY.retry}
          </a>
          <Link className={quietButton} href="/">
            {ACCOUNT_COPY.home}
          </Link>
        </div>
      ) : null}
    </CustomerShell>
  );
}
