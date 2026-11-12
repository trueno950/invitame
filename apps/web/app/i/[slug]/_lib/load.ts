import { cache } from "react";

import type { PublicInvitation } from "../../../../lib/server/public-invitations-api.ts";
import { readPublicInvitation } from "./public-api.ts";

/**
 * What the guest's page renders for a slug (M5 T5; A3). The page and its metadata builder both read it,
 * and `cache` makes that one API call per request instead of two; nothing is cached across requests, so the
 * page stays rendered per request (A6) and a change made by the owner is visible at once (S7).
 */
export type PublicPageLoad =
  | { status: "ok"; invitation: PublicInvitation }
  | { status: "not-found" }
  | { status: "unavailable" };

export const loadPublicInvitation = cache(async (slug: string): Promise<PublicPageLoad> => {
  try {
    const result = await readPublicInvitation(slug);
    return result.ok ? { status: "ok", invitation: result.value } : { status: "not-found" };
  } catch {
    // Already logged by the server wrapper; an outage is not a missing invitation.
    return { status: "unavailable" };
  }
});
