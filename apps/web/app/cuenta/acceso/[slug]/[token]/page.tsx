import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { CHECK_IN_COPY, INVITATION_COPY } from "../../../../../lib/customer/copy.ts";
import { checkInView } from "../../../../../lib/customer/guest-checkin.ts";
import { INVITATION_PATHS } from "../../../../../lib/customer/invitations.ts";
import { afterSignInPath, checkInPath } from "../../../../../lib/public/guest-pass.ts";
import { CustomerWorkspaceShell } from "../../../../_components/customer-workspace-shell.tsx";
import { quietButton, statusNote } from "../../../../_components/ui.ts";
import { invitations } from "../../../invitaciones/_lib/api.ts";
import { attempt, resolveRead } from "../../../invitaciones/_lib/load.ts";

/**
 * `/cuenta/acceso/<slug>/<token>` (M6 G4; S1, S4): the owner's check-in page of one guest's pass. The pass encodes
 * the invitation's public slug and the guest's opaque token — the API's public read carries no invitation id — so this
 * page resolves the id from the owner's own invitations list and calls the check-in route with it. The API requires
 * the session and the owned, non-archived invitation, and keeps the first check-in instant, so showing the same pass
 * twice is idempotent and never records a second arrival.
 *
 * Opening the page performs the check-in: a QR is opened by a scanner or a camera, so there is no form to submit. The
 * page is `noindex` and rendered per request, and it never logs the token, the guest, or the API's answer.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: CHECK_IN_COPY.pageTitle,
  robots: { index: false, follow: false },
};

/** The one way back of a refused or invalid pass. */
function PlainShell({ heading, body, path }: { heading: string; body: string; path: string }) {
  return (
    <CustomerWorkspaceShell
      eyebrow={CHECK_IN_COPY.eyebrow}
      heading={heading}
      intro={CHECK_IN_COPY.intro}
    >
      <div className="flex flex-col gap-4">
        <p className={statusNote}>{body}</p>
        <div className="flex flex-wrap gap-3">
          <Link className={quietButton} href={path}>
            {CHECK_IN_COPY.backToInvitation}
          </Link>
          <Link className={quietButton} href={INVITATION_PATHS.list}>
            {CHECK_IN_COPY.backToList}
          </Link>
        </div>
      </div>
    </CustomerWorkspaceShell>
  );
}

export default async function GuestCheckInPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  await connection();
  const { slug, token } = await params;
  const path = checkInPath(slug, token);

  if (path === undefined) {
    return (
      <PlainShell
        body={CHECK_IN_COPY.invalidLink}
        heading={CHECK_IN_COPY.heading}
        path={INVITATION_PATHS.list}
      />
    );
  }

  const listed = await attempt(() => invitations.list());
  const signIn = afterSignInPath(slug, token);

  if (listed === "unavailable") {
    return (
      <PlainShell body={CHECK_IN_COPY.unavailable} heading={CHECK_IN_COPY.heading} path={path} />
    );
  }
  if (!listed.ok) {
    if (listed.failure === "signed-out") {
      // The page cannot set a cookie itself, so the return path goes through a route handler first (S4).
      redirect(signIn === undefined ? "/ingresar" : signIn);
    }
    return (
      <PlainShell
        body={
          listed.failure === "not-found"
            ? CHECK_IN_COPY.invitationNotFound
            : CHECK_IN_COPY.unavailable
        }
        heading={CHECK_IN_COPY.heading}
        path={INVITATION_PATHS.list}
      />
    );
  }

  // The invitation is resolved on the owner's side, from their own list: the public read never carries an id, and a
  // pass of an invitation this customer does not own finds nothing here.
  const summary = listed.value.find((invitation) => invitation.slug === slug);

  if (summary === undefined) {
    return (
      <PlainShell
        body={CHECK_IN_COPY.invitationNotFound}
        heading={CHECK_IN_COPY.heading}
        path={INVITATION_PATHS.list}
      />
    );
  }

  const [invitationRead, checkInRead] = await Promise.all([
    attempt(() => invitations.get(summary.id)),
    attempt(() => invitations.checkInGuest(summary.id, token)),
  ]);
  const invitation = resolveRead(invitationRead);

  if (checkInRead === "unavailable") {
    return (
      <PlainShell body={CHECK_IN_COPY.unavailable} heading={CHECK_IN_COPY.heading} path={path} />
    );
  }
  if (!checkInRead.ok && checkInRead.failure === "signed-out") {
    redirect(signIn === undefined ? "/ingresar" : signIn);
  }

  const view = checkInView(
    checkInRead,
    invitation.status === "ok" ? invitation.value.timeZone : "",
  );

  if (view.status === "sign-in") {
    redirect(signIn === undefined ? "/ingresar" : signIn);
  }

  if (view.status === "failed") {
    return <PlainShell body={view.body} heading={view.heading} path={path} />;
  }

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.detail(summary.id)}>
          {CHECK_IN_COPY.backToInvitation}
        </Link>
      }
      eyebrow={CHECK_IN_COPY.eyebrow}
      heading={view.heading}
      intro={CHECK_IN_COPY.intro}
    >
      <div className="flex flex-col gap-4">
        <p className={statusNote} role="status">
          {view.body}
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          {view.details.map((detail) => (
            <div className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45" key={detail.label}>
              <dt className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                {detail.label}
              </dt>
              <dd className="mt-1 font-display text-2xl font-semibold break-words text-ink">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </CustomerWorkspaceShell>
  );
}
