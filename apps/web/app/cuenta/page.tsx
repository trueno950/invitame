import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { loadAccountView } from "../../lib/customer/account.ts";
import { ACCOUNT_COPY } from "../../lib/customer/copy.ts";
import { getOwnProfile } from "../../lib/server/session-api.ts";
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
