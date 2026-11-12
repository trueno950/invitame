import type { Metadata } from "next";

import { PUBLIC_INVITATION_COPY } from "../../../lib/customer/copy.ts";
import { InvitationMessage } from "./_components/invitation-message.tsx";

/**
 * The friendly page behind `notFound()` under `/i` (M5 T5; S5, A3): an unknown slug, a draft, an archived
 * or expired invitation, a renderer this deployment does not have, and a snapshot the renderer refuses all
 * land here, with a 404 status and no hint that an invitation exists but is not visible. It stays out of
 * search results (A5).
 */
export const metadata: Metadata = {
  title: PUBLIC_INVITATION_COPY.notFoundTitle,
  robots: { index: false, follow: false },
};

export default function PublicInvitationNotFound() {
  return (
    <InvitationMessage
      body={PUBLIC_INVITATION_COPY.notFoundBody}
      heading={PUBLIC_INVITATION_COPY.notFoundTitle}
    />
  );
}
