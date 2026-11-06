"use client";

import { useState } from "react";

import { type BrowserFetch, signOut } from "../../lib/customer/sign-in.ts";
import { errorNote, primaryButton } from "./ui.ts";

/** Same-origin request to the `/api/auth` proxy, so the browser receives the cleared cookies. */
const browserFetch: BrowserFetch = (input, init) => fetch(input, init);

interface SignOutButtonProperties {
  /** The sign-in page to load afterwards: `/ingresar` for customers, `/admin/ingresar` for administrators. */
  signInPath: "/ingresar" | "/admin/ingresar";
  label: string;
  pendingLabel: string;
  failedMessage: string;
}

/**
 * Signs out through the proxy from the browser, then loads the sign-in page (M2 T8c, shared in T8d;
 * S1, S36). A session that is already gone also ends on the sign-in page (`signOut`, L40); the
 * failure note appears only while a session is still there or the API cannot answer.
 */
export function SignOutButton({
  signInPath,
  label,
  pendingLabel,
  failedMessage,
}: SignOutButtonProperties) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    if (pending) {
      return;
    }

    setPending(true);
    setFailed(false);

    if (await signOut(browserFetch)) {
      window.location.assign(signInPath);
      return;
    }

    setPending(false);
    setFailed(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button className={primaryButton} disabled={pending} onClick={handleSignOut} type="button">
          {pending ? pendingLabel : label}
        </button>
      </div>
      <div aria-live="assertive" role="alert">
        {failed ? <p className={errorNote}>{failedMessage}</p> : null}
      </div>
    </div>
  );
}
