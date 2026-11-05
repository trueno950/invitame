import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { loadAccountView } from "../../lib/customer/account.ts";
import { SIGN_IN_COPY } from "../../lib/customer/copy.ts";
import { getOwnProfile } from "../../lib/server/session-api.ts";
import { CustomerShell } from "../_components/customer-shell.tsx";
import { SignInForm } from "./sign-in-form.tsx";

export const metadata: Metadata = {
  title: SIGN_IN_COPY.pageTitle,
};

/**
 * `/ingresar`: customer sign-in by email code (M2 T8c; S6, L39). A visitor who is already signed in
 * goes to `/cuenta`; when the API cannot answer, the form is shown anyway.
 */
export default async function SignInPage() {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAccountView(getOwnProfile);

  if (view.kind === "customer" || view.kind === "not-customer") {
    redirect("/cuenta");
  }

  return (
    <CustomerShell
      aside={
        <div className="mt-10 max-w-lg border-t border-orange-200 pt-6">
          <h2 className="text-base font-black text-slate-950">{SIGN_IN_COPY.asideHeading}</h2>
          <p className="mt-2 leading-7 text-slate-700">{SIGN_IN_COPY.asideBody}</p>
        </div>
      }
      eyebrow={SIGN_IN_COPY.eyebrow}
      heading={SIGN_IN_COPY.heading}
      intro={SIGN_IN_COPY.intro}
    >
      <SignInForm />
    </CustomerShell>
  );
}
