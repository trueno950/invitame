"use client";

import { useState } from "react";

import { ADMIN_PANEL_COPY } from "../../lib/admin/copy.ts";
import { ACCOUNT_COPY } from "../../lib/customer/copy.ts";
import { useInteractive } from "../../lib/customer/interactive.ts";
import { type BrowserFetch, signOut } from "../../lib/customer/sign-in.ts";
import { errorNote, fieldHint, primaryButton } from "./ui.ts";

/** Same-origin request to the `/api/auth` proxy, so the browser receives the cleared cookies. */
const browserFetch: BrowserFetch = (input, init) => fetch(input, init);

type SignInPath = "/ingresar" | "/admin/ingresar";

/** The line shown without JavaScript, in the voice of the page that holds the button. */
const NO_SCRIPT: Readonly<Record<SignInPath, string>> = {
  "/ingresar": ACCOUNT_COPY.noScript,
  "/admin/ingresar": ADMIN_PANEL_COPY.noScript,
};

interface SignOutButtonProperties {
  /** The sign-in page to load afterwards: `/ingresar` for customers, `/admin/ingresar` for administrators. */
  signInPath: SignInPath;
  label: string;
  pendingLabel: string;
  failedMessage: string;
}

/**
 * Signs out through the proxy from the browser, then loads the sign-in page (M2 T8c, shared in T8d;
 * S1, S36). A session that is already gone also ends on the sign-in page (`signOut`, L40); the
 * failure note appears only while a session is still there or the API cannot answer.
 *
 * The button stays disabled until the page is interactive (M2 T8e; S42), so a click that lands before
 * React handles it waits for the enabled button instead of doing nothing silently.
 */
export function SignOutButton({
  signInPath,
  label,
  pendingLabel,
  failedMessage,
}: SignOutButtonProperties) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const interactive = useInteractive();

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
        <button
          className={primaryButton}
          disabled={pending || !interactive}
          onClick={handleSignOut}
          type="button"
        >
          {pending ? pendingLabel : label}
        </button>
        <noscript>
          <p className={`${fieldHint} text-center`}>{NO_SCRIPT[signInPath]}</p>
        </noscript>
      </div>
      <div aria-live="assertive" role="alert">
        {failed ? <p className={errorNote}>{failedMessage}</p> : null}
      </div>
    </div>
  );
}
