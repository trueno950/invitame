import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  INVITATION_PREVIEW_COPY,
  invitationPreviewView,
  previewRsvpMode,
} from "../../../../../lib/customer/invitation-preview.ts";
import { isInvitationId, type RsvpSettings } from "../../../../../lib/server/invitations-api.ts";
import type { MediaAsset } from "../../../../../lib/server/media-api.ts";
import { requestOrigin } from "../../../../../lib/server/request-origin.ts";
import { GuestInvitation } from "../../../../i/[slug]/_components/guest-invitation.tsx";
import { invitations } from "../../_lib/api.ts";
import { attempt, resolveRead } from "../../_lib/load.ts";
import { media } from "../../_lib/media.ts";
import { PreviewNote } from "./_components/preview-note.tsx";

export const metadata: Metadata = {
  title: INVITATION_PREVIEW_COPY.pageTitle,
  // An owner's own draft preview: nothing to index and nothing to share.
  robots: { index: false, follow: false },
};

/** The owner's stored photos, or undefined when the read failed: a gallery that cannot be read shows no photos. */
async function storedMedia(id: string): Promise<readonly MediaAsset[] | undefined> {
  try {
    const assets = await media.list(id);

    return assets.ok ? assets.value : undefined;
  } catch {
    // Already logged by the media wrapper; a failed read never hides the rest of the preview.
    return undefined;
  }
}

/** The RSVP settings of an invitation that takes open answers, or undefined when they cannot be read. */
async function rsvpSettings(id: string): Promise<RsvpSettings | undefined> {
  const read = await attempt(() => invitations.readRsvp(id));

  return read === "unavailable" || !read.ok ? undefined : read.value.settings;
}

/**
 * `/cuenta/invitaciones/[id]/vista-previa` (T2b; S3, S4): the invitation as its guests will see it, rendered from
 * the stored draft through the same renderer registry and the same features block as `/i/<slug>`. The editor shows
 * it in a phone-width frame and reloads it after each successful save, so the owner never has to open the
 * invitation to review it.
 *
 * The page is a plain invitation: no customer navigation, no control of its own, and not one client script beyond
 * the countdown the guest page already ships. The API authorizes every read — a signed-out visitor is sent to sign
 * in like every page under `/cuenta`, and another owner's id answers 404 without saying an invitation exists — so
 * nothing here is a guard. It renders per request, and asks search engines to stay away.
 */
export default async function InvitationPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Rendered per request, so the frame the editor reloads after a save always shows what the API stored.
  await connection();
  const [{ id }, origin] = await Promise.all([params, headers().then(requestOrigin)]);

  if (!isInvitationId(id)) {
    notFound();
  }

  const loaded = resolveRead(await attempt(() => invitations.get(id)));

  if (loaded.status === "not-found") {
    notFound();
  }
  if (loaded.status === "unavailable") {
    return (
      <PreviewNote
        body={INVITATION_PREVIEW_COPY.unavailableBody}
        heading={INVITATION_PREVIEW_COPY.unavailableTitle}
      />
    );
  }

  const invitation = loaded.value;
  // The creator catalog names the pinned version's renderer and carries its configuration snapshot; without it
  // there is no honest preview, only a guess.
  const catalog = await attempt(() => invitations.templates());
  const templates = catalog === "unavailable" || !catalog.ok ? undefined : catalog.value;
  const needsGallery = invitation.availableFeatures.includes("GALLERY");
  const needsRsvp = previewRsvpMode(invitation.availableFeatures) === "open";
  const [photos, settings] = await Promise.all([
    needsGallery ? storedMedia(invitation.id) : Promise.resolve(undefined),
    needsRsvp ? rsvpSettings(invitation.id) : Promise.resolve(undefined),
  ]);
  const view = invitationPreviewView({
    invitation,
    templates,
    media: photos,
    rsvp: settings,
    origin,
  });

  // An archived invitation has no preview, and one with nothing to render shows the note instead of a guess.
  if (view.status === "archived") {
    notFound();
  }
  if (view.status === "unavailable") {
    return (
      <PreviewNote
        body={INVITATION_PREVIEW_COPY.unavailableBody}
        heading={INVITATION_PREVIEW_COPY.unavailableTitle}
      />
    );
  }

  return (
    <GuestInvitation
      componentKey={view.componentKey}
      configuration={view.configuration}
      content={view.content}
      hiddenFields={view.hiddenFields}
      {...(view.features === undefined ? {} : { features: view.features })}
    />
  );
}
