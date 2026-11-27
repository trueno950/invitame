import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { PUBLIC_INVITATION_COPY } from "../../../lib/customer/copy.ts";
import { guestbookNotice, publicGuestbookBlock } from "../../../lib/public/guestbook.ts";
import { publicFeatureBlock } from "../../../lib/public/invitation-features.ts";
import { invitationMetadata } from "../../../lib/public/invitation-page.ts";
import { rendererAcceptsProps } from "../../../lib/public/invitation-render.ts";
import { publicRsvpBlock, rsvpNotice } from "../../../lib/public/invitation-rsvp.ts";
import { findRenderer } from "../../../lib/renderers/registry.ts";
import { GuestInvitation } from "./_components/guest-invitation.tsx";
import { InvitationMessage } from "./_components/invitation-message.tsx";
import { GuestbookNoticeNote, RsvpNoticeNote } from "./_components/rsvp-notice.tsx";
import { loadPublicInvitation } from "./_lib/load.ts";
import { logPublicInvitation, PUBLIC_INVITATION_LOG_EVENT } from "./_lib/public-api.ts";
import { signGuestbookAction, submitRsvpAction } from "./actions.ts";

/**
 * `/i/[slug]` (M5 T5; S1, S5, A3, A5, A6, A7, A8): the guest's page of a published invitation. A server
 * component rendered per request, it reads the public projection through the anonymous client, which sends
 * no cookie, and renders it with the web renderer registry: a `componentKey` becomes code only through that
 * allow-list, and the renderer receives the pinned configuration and the stored content, never an owner, a
 * package, a price, or an id. A slug that resolves to nothing, a renderer this deployment does not have,
 * and a snapshot the renderer refuses all answer the same friendly 404; an API that cannot answer shows its
 * own short notice instead, so an outage never looks like a deleted invitation. The page carries no
 * customer navigation and asks search engines and share crawlers to stay away.
 */

interface PublicInvitationPageProperties {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

/**
 * The share metadata of A8: built only from the content already on the page, with no generated image. A
 * page with nothing to show keeps the generic title and stays out of search results (A5).
 */
export async function generateMetadata({
  params,
}: PublicInvitationPageProperties): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadPublicInvitation(slug);

  if (loaded.status === "ok") {
    return invitationMetadata(loaded.invitation.content);
  }

  return {
    title:
      loaded.status === "unavailable"
        ? PUBLIC_INVITATION_COPY.unavailableTitle
        : PUBLIC_INVITATION_COPY.notFoundTitle,
    ...NO_INDEX,
  };
}

export default async function PublicInvitationPage({
  params,
  searchParams,
}: PublicInvitationPageProperties) {
  // Rendered per request, so an owner's change is visible at once and no page is reused (A6, S7).
  await connection();
  const [{ slug }, parameters] = await Promise.all([params, searchParams]);
  const loaded = await loadPublicInvitation(slug);

  if (loaded.status === "not-found") {
    notFound();
  }
  if (loaded.status === "unavailable") {
    return (
      <InvitationMessage
        body={PUBLIC_INVITATION_COPY.unavailableBody}
        heading={PUBLIC_INVITATION_COPY.unavailableTitle}
      />
    );
  }

  const invitation = loaded.invitation;
  const Renderer = findRenderer(invitation.componentKey);

  if (Renderer === undefined) {
    logPublicInvitation(PUBLIC_INVITATION_LOG_EVENT.RENDERER_UNKNOWN, {
      componentKey: invitation.componentKey,
    });
    notFound();
  }

  const props = { configuration: invitation.configuration, content: invitation.content };

  // A snapshot the renderer refuses is an operational error, but the guest sees a missing page (A3).
  if (!rendererAcceptsProps(invitation.componentKey, props)) {
    logPublicInvitation(PUBLIC_INVITATION_LOG_EVENT.RENDERER_PROPS_REFUSED, {
      componentKey: invitation.componentKey,
    });
    notFound();
  }

  // What the API gated, mapped to the block's props (F3; S4). With nothing to show the layouts render
  // exactly the markup they rendered before the block existed. An invitation that accepts open answers adds
  // the «Confirma tu asistencia» card to that same block, so every layout shows it in the same place (G3; S4). An
  // expired invitation keeps its card and closes it, because the page stays visible read-only (S2, T5).
  const rsvp = publicRsvpBlock(
    invitation.features.rsvp,
    invitation.slug,
    submitRsvpAction,
    new Date(),
    invitation.expired,
  );
  // The wall of messages follows the same rule (F7; L10.5): the API answers it only while the package grants
  // `GUESTBOOK`, and an expired invitation keeps the wall and closes its form instead.
  const guestbook = publicGuestbookBlock(
    invitation.features.guestbook,
    invitation.slug,
    signGuestbookAction,
    invitation.expired,
  );
  const block = publicFeatureBlock(invitation, rsvp, undefined, guestbook);
  // The notices of this page's own query, rendered on the server: the answer's (G3; S4) and the signature's (F7).
  const notice = rsvpNotice(parameters);
  const signatureNotice = guestbookNotice(parameters);

  // The invitation itself is the guest view the owner's preview renders too (T2b), with the notice of this page.
  return (
    <GuestInvitation
      componentKey={invitation.componentKey}
      configuration={invitation.configuration}
      content={invitation.content}
      hiddenFields={invitation.hiddenFields}
      {...(block === undefined
        ? {}
        : { features: block.features, calendarHref: block.calendarHref })}
      {...(notice === undefined ? {} : { notice: <RsvpNoticeNote notice={notice} /> })}
      {...(signatureNotice === undefined
        ? {}
        : { signatureNotice: <GuestbookNoticeNote notice={signatureNotice} /> })}
    />
  );
}
