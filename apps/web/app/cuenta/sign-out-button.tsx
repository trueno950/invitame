"use client";

import { useState } from "react";

import { ACCOUNT_COPY } from "../../lib/customer/copy.ts";
import { type BrowserFetch, signOut } from "../../lib/customer/sign-in.ts";
import { errorNote, primaryButton } from "../_components/ui.ts";

/** Same-origin request to the `/api/auth` proxy, so the browser receives the cleared cookies. */
const browserFetch: BrowserFetch = (input, init) => fetch(input, init);

/** Signs out through the proxy from the browser, then loads `/ingresar` (M2 T8c; S1). */
export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    if (pending) {
      return;
    }

    setPending(true);
    setFailed(false);

    if (await signOut(browserFetch)) {
      window.location.assign("/ingresar");
      return;
    }

    setPending(false);
    setFailed(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button className={primaryButton} disabled={pending} onClick={handleSignOut} type="button">
          {pending ? ACCOUNT_COPY.signingOut : ACCOUNT_COPY.signOut}
        </button>
      </div>
      <div aria-live="assertive" role="alert">
        {failed ? <p className={errorNote}>{ACCOUNT_COPY.signOutFailed}</p> : null}
      </div>
    </div>
  );
}
