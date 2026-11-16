import { cache } from "react";

import type { PublicGuestInvitation } from "../../../../../../lib/server/public-invitations-api.ts";
import { readPublicGuestInvitation } from "../../../_lib/public-api.ts";

/**
 * What one guest's personal page renders (M6 G4; S1, S4). The page reads it once per request through React's
 * `cache`, and nothing is cached across requests: the guest's answer and the owner's changes are visible at once,
 * and no copy of a personal page can be served to anyone else.
 */
export type GuestPageLoad =
  | { status: "ok"; invitation: PublicGuestInvitation }
  | { status: "not-found" }
  | { status: "unavailable" };

export const loadGuestInvitation = cache(
  async (slug: string, token: string): Promise<GuestPageLoad> => {
    try {
      const result = await readPublicGuestInvitation(slug, token);

      return result.ok ? { status: "ok", invitation: result.value } : { status: "not-found" };
    } catch {
      // Already logged by the server wrapper; an outage is not a missing invitation.
      return { status: "unavailable" };
    }
  },
);
