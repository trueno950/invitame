import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { SIGN_IN_PATH } from "../../../lib/admin/catalog/commands.ts";
import { ADMIN_SHELL_COPY } from "../../../lib/admin/copy.ts";
import { INVITATIONS_COPY, INVITATIONS_PATHS } from "../../../lib/admin/invitations/copy.ts";
import {
  hasInvitationFilters,
  invitationListQuery,
  nextPageHref,
  parseInvitationFilters,
} from "../../../lib/admin/invitations/search.ts";
import { loadAdminView, routeAdminPage } from "../../../lib/admin/session.ts";
import { adminInvitations } from "../../../lib/server/admin-invitations-api.ts";
import type {
  AdminInvitationPage,
  InvitationsResult,
} from "../../../lib/server/admin-invitations-client.ts";
import { getAuthSession } from "../../../lib/server/session-api.ts";
import { AdminShell } from "../_components/admin-shell.tsx";
import { InvitationFiltersForm } from "./_components/invitations-filters.tsx";
import { InvitationsNotice } from "./_components/invitations-notice.tsx";
import { InvitationsTable } from "./_components/invitations-table.tsx";

export const metadata: Metadata = { title: INVITATIONS_COPY.pageTitle };

/**
 * `/admin/invitaciones`: the operational status search (M9 T3; S1). The page asks the API for one bounded page of
 * invitations with the filters its own query validated, shows the slug, the state, the owner's email, the payment, the
 * photos, and the created date, and offers «Siguiente página» with the cursor the API answered.
 *
 * The session read here only chooses the page, as on every administration page: the API answers `@AdminOnly()` on its
 * own. Nothing on this page changes an invitation; it is read-only by design.
 */
export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Render per request: the session read below swallows errors, including Next.js's prerender bailout.
  await connection();
  const view = await loadAdminView(getAuthSession);
  const target = routeAdminPage("invitations", view.kind);

  if (target !== null) {
    redirect(target);
  }

  if (view.kind !== "administrator") {
    return <InvitationsUnavailable />;
  }

  const filters = parseInvitationFilters(await searchParams);
  let loaded: InvitationsResult<AdminInvitationPage>;
  try {
    loaded = await adminInvitations.list(invitationListQuery(filters));
  } catch {
    // An unexpected failure is already logged by the server wrapper; the page never shows a body it could not read.
    return <InvitationsUnavailable />;
  }

  if (!loaded.ok) {
    if (loaded.failure === "signed-out") {
      redirect(SIGN_IN_PATH);
    }
    if (loaded.failure === "forbidden") {
      redirect("/cuenta");
    }
    // A malformed query cannot come from this page, which validates its filters first; an outage can.
    return <InvitationsUnavailable />;
  }

  const { items, nextCursor } = loaded.value;
  const nextHref = nextCursor === null ? undefined : nextPageHref(filters, nextCursor);

  return (
    <AdminShell
      breadcrumbs={[
        { label: ADMIN_SHELL_COPY.panel, href: INVITATIONS_PATHS.panel },
        { label: INVITATIONS_COPY.heading },
      ]}
      current="invitations"
      description={INVITATIONS_COPY.intro}
      heading={INVITATIONS_COPY.heading}
    >
      <InvitationFiltersForm filters={filters} />
      <InvitationsTable
        empty={
          hasInvitationFilters(filters) ? INVITATIONS_COPY.emptyFiltered : INVITATIONS_COPY.empty
        }
        items={items}
        nextHref={nextHref}
      />
    </AdminShell>
  );
}

/** The one notice of a read that failed, with the way back: the page never renders an empty list as if it were data. */
function InvitationsUnavailable() {
  return (
    <InvitationsNotice
      body={INVITATIONS_COPY.unavailableBody}
      heading={INVITATIONS_COPY.unavailableHeading}
      href={INVITATIONS_PATHS.index}
      linkLabel={INVITATIONS_COPY.retry}
    />
  );
}
