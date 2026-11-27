import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { GUEST_PAGE_COPY, PUBLIC_INVITATION_COPY } from "../../../../../lib/customer/copy.ts";
import type { GuestPageBlockView } from "../../../../../lib/invitation-features/invitation-features.ts";
import { checkInUrl } from "../../../../../lib/public/guest-pass.ts";
import { guestbookNotice, publicGuestbookBlock } from "../../../../../lib/public/guestbook.ts";
import { publicFeatureBlock } from "../../../../../lib/public/invitation-features.ts";
import {
  guestGreeting,
  guestPassView,
  guestRsvpView,
  guestSeatsSentence,
} from "../../../../../lib/public/invitation-guest-page.ts";
import { rendererAcceptsProps } from "../../../../../lib/public/invitation-render.ts";
import { rsvpNotice } from "../../../../../lib/public/invitation-rsvp.ts";
import { findRenderer } from "../../../../../lib/renderers/registry.ts";
import { requestOrigin } from "../../../../../lib/server/request-origin.ts";
import { textButton } from "../../../../_components/ui.ts";
import { InvitationMessage } from "../../_components/invitation-message.tsx";
import { GuestbookNoticeNote, RsvpNoticeNote } from "../../_components/rsvp-notice.tsx";
import { logPublicInvitation, PUBLIC_INVITATION_LOG_EVENT } from "../../_lib/public-api.ts";
import { loadGuestInvitation } from "./_lib/load.ts";
import { signGuestbookAction } from "../../actions.ts";
import { submitGuestRsvpAction } from "./actions.ts";

/**
 * `/i/[slug]/g/[token]` (M6 G4; S1, S4): one guest's personal page. It renders the same published invitation and the
 * same layouts as the public page, greets the guest by name, shows the seats they were given, and ends with their own
 * answer card and, once they confirmed, their access pass.
 *
 * The slug and the opaque token are the only inputs, and both are the ones the guest's own link carries; the API
 * answers the same friendly 404 for an unknown slug, a revoked token, or a token of another invitation, so this page
 * never confirms that a guest exists. The page is rendered per request (no cache holds a personal page), asks search
 * engines and share crawlers to stay away, and carries no customer navigation and no owner data.
 */

/** Nothing about a personal page is indexable, and nothing of it is kept by any cache (S4). */
const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: GUEST_PAGE_COPY.pageTitle,
  ...NO_INDEX,
};

interface GuestInvitationPageProperties {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GuestInvitationPage({
  params,
  searchParams,
}: GuestInvitationPageProperties) {
  // Rendered per request, so an owner's change and the guest's own answer are visible at once (S4).
  await connection();
  const [{ slug, token }, parameters] = await Promise.all([params, searchParams]);
  const loaded = await loadGuestInvitation(slug, token);

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

  const props = {
    configuration: invitation.configuration,
    content: invitation.content,
    hiddenFields: invitation.hiddenFields,
  };

  // A snapshot the renderer refuses is an operational error, but the guest sees a missing page (A3).
  if (!rendererAcceptsProps(invitation.componentKey, props)) {
    logPublicInvitation(PUBLIC_INVITATION_LOG_EVENT.RENDERER_PROPS_REFUSED, {
      componentKey: invitation.componentKey,
    });
    notFound();
  }

  // The guest's own block: the greeting, the seats, their answer card, and their pass (S4). The pass is offered only
  // while the API says so — a confirmed guest of a package that grants `QR_PASS` — and its QR encodes the owner's
  // check-in address built from this very request's origin, so no extra setting is needed to deploy it.
  const origin = requestOrigin(await headers());
  const passUrl =
    origin === undefined || invitation.guest.qrPass !== true
      ? undefined
      : checkInUrl(origin, invitation.slug, token);
  const rsvp = guestRsvpView({
    slug: invitation.slug,
    token,
    guest: invitation.guest,
    rsvp: invitation.features.rsvp,
    action: submitGuestRsvpAction,
    // An expired invitation is still rendered here, and its personal card closes instead of asking (S2, T5).
    expired: invitation.expired,
  });
  // The pass is the artboard's ticket: the QR, the table the owner assigned, and the confirmed people (F5; L8.4).
  const pass =
    passUrl === undefined
      ? undefined
      : guestPassView({ checkInUrl: passUrl, guest: invitation.guest });
  const guest: GuestPageBlockView = {
    greeting: guestGreeting(invitation.guest.name),
    seats: guestSeatsSentence(invitation.guest.seats),
    ...(rsvp === undefined ? {} : { rsvp }),
    ...(pass === undefined ? {} : { pass }),
  };

  // The wall of messages is the same card of the public page (F7; L10.5): the personal page shows it too, so a guest
  // who arrived through their own link signs the same book.
  const guestbook = publicGuestbookBlock(
    invitation.features.guestbook,
    invitation.slug,
    signGuestbookAction,
    invitation.expired,
  );
  const block = publicFeatureBlock(invitation, undefined, guest, guestbook);
  const rendererProps =
    block === undefined
      ? props
      : { ...props, features: block.features, calendarHref: block.calendarHref };
  // The notices of this page's own query, rendered on the server: the answer's (S4) and the signature's (F7).
  const notice = rsvpNotice(parameters);
  const signatureNotice = guestbookNotice(parameters);

  return (
    <main className="paper-wash relative isolate min-h-screen px-4 py-6 text-ink sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {notice === undefined ? null : <RsvpNoticeNote notice={notice} />}
        {signatureNotice === undefined ? null : <GuestbookNoticeNote notice={signatureNotice} />}
        <Renderer {...rendererProps} />
        <footer className="flex justify-center">
          <Link className={textButton} href="/">
            {PUBLIC_INVITATION_COPY.madeWith}
          </Link>
        </footer>
      </div>
    </main>
  );
}
