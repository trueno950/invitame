"use client";

import { type ReactElement, useEffect, useState } from "react";

import { statusNote } from "../../../_components/ui.ts";

/** How long a confirmation stays on screen before it fades away. */
const VISIBLE_MS = 5000;

/**
 * A confirmation that leaves on its own. The server renders it, so it still shows without JavaScript; once the
 * page is interactive it drops `notice` from the address bar right away (so a reload or a shared link never
 * repeats it) and hides itself after a few seconds. Errors never use this: they stay until the customer acts.
 */
export function TransientNotice({ message }: { message: string }): ReactElement | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.has("notice")) {
      url.searchParams.delete("notice");
      window.history.replaceState(window.history.state, "", url.toString());
    }

    const timer = window.setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <p className={statusNote} role="status">
      {message}
    </p>
  );
}
