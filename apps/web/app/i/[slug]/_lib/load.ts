import { cache } from "react";

import type { PublicInvitation } from "../../../../lib/server/public-invitations-api.ts";
import { readPublicInvitation } from "./public-api.ts";

/**
 * What the guest's page renders for a slug (M5 T5; A3). The page and its metadata builder both read it,
 * and `cache` makes that one API call per request instead of two; nothing is cached across requests, so the
 * page stays rendered per request (A6) and a change made by the owner is visible at once (S7).
 *
 * A third state since F13 (S2.13, L18.2): an invitation that stores an access code answers 423 and the page draws its lock
 * screen with the one display name the answer carries. The read forwards the token of this device's own cookie, so an
 * invitation this guest already unlocked is `ok` and never shows the lock again. A locked answer also carries the current
 * address when the guest arrived through a previous one (L18.2), so the page moves there before drawing the screen.
 */
export type PublicPageLoad =
  | { status: "ok"; invitation: PublicInvitation }
  | { status: "locked"; displayName: string | null; redirectTo: string | null }
  | { status: "not-found" }
  | { status: "unavailable" };

export const loadPublicInvitation = cache(async (slug: string): Promise<PublicPageLoad> => {
  try {
    const result = await readPublicInvitation(slug);

    if (result.ok) {
      return { status: "ok", invitation: result.value };
    }

    return result.failure === "locked"
      ? { status: "locked", displayName: result.displayName, redirectTo: result.redirectTo }
      : { status: "not-found" };
  } catch {
    // Already logged by the server wrapper; an outage is not a missing invitation.
    return { status: "unavailable" };
  }
});
