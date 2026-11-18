import type { Metadata } from "next";

import { INVITATION_PREVIEW_COPY } from "../../../../../lib/customer/invitation-preview.ts";
import { PreviewNote } from "./_components/preview-note.tsx";

/**
 * The friendly 404 behind `notFound()` under the preview (T2b; S4): an id that is not an invitation id, another
 * owner's invitation, an archived one, and a session the API no longer accepts all land here with a 404 status and
 * no hint about what exists. It says so in the same short note the rest of the page uses, and stays out of search
 * results.
 */
export const metadata: Metadata = {
  title: INVITATION_PREVIEW_COPY.notFoundTitle,
  robots: { index: false, follow: false },
};

export default function InvitationPreviewNotFound() {
  return (
    <PreviewNote
      body={INVITATION_PREVIEW_COPY.notFoundBody}
      heading={INVITATION_PREVIEW_COPY.notFoundTitle}
    />
  );
}
