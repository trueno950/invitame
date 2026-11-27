import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { GUESTBOOK_OWNER_COPY, INVITATION_COPY } from "../../../../../lib/customer/copy.ts";
import {
  GUESTBOOK_OWNER_PATHS,
  GUESTBOOK_TAB_PARAM,
  type GuestbookModerationView,
  type GuestbookRow,
  guestbookModerationView,
} from "../../../../../lib/customer/guestbook.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
} from "../../../../../lib/customer/invitations.ts";
import { isInvitationId } from "../../../../../lib/server/invitations-api.ts";
import { CustomerWorkspaceShell } from "../../../../_components/customer-workspace-shell.tsx";
import { quietButton, statusNote } from "../../../../_components/ui.ts";
import { Notices } from "../../_components/notices.tsx";
import { invitations } from "../../_lib/api.ts";
import { attempt, resolveRead } from "../../_lib/load.ts";
import { hideGuestbookEntryAction, showGuestbookEntryAction } from "../../actions.ts";

/**
 * `/cuenta/invitaciones/[id]/libro-de-firmas` (F7; S2.7, L10.6): the owner's moderation screen of one invitation's
 * guestbook, the artboard `design/guestbook/03-moderacion-anfitrion.html` built with the app's own tokens — the two
 * pills are the screen's tabs, each message is a surface card, and the one action of each row is the outlined pill of
 * the invitation pages.
 *
 * Everything the page shows is the API's answer: the entries with their state and the two counts. The page never
 * decides who may moderate — it reads the owner route with the session cookie, and the API answers 404 for an
 * invitation this customer does not own (A4). Every action is a server action posting without client script, so a phone
 * with JavaScript off still hides and shows a message; nothing is ever deleted, and hiding one entry is always
 * reversible (L10.6).
 */

export const metadata: Metadata = {
  title: GUESTBOOK_OWNER_COPY.pageTitle,
  // Signed messages are personal data, so no crawler may index the screen.
  robots: { index: false, follow: false },
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** One tab of the screen: a link that carries the tab in the query, and its count (F7; L10.6). */
function TabLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-medium text-on-primary"
          : "inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink ring-[1.5px] ring-field-border"
      }
      href={href}
    >
      {label}
    </Link>
  );
}

/**
 * One message of the screen: the guest's words as text, the signature and its relative date under them, and the one
 * action of the row. The message is React's own text node, so nothing a guest typed becomes markup, and the action
 * names its message, so a reader that cannot see the card still knows what it hides (L10.3, L10.6).
 */
function MessageCard({
  action,
  invitationId,
  row,
  hidden,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  row: GuestbookRow;
  hidden: boolean;
}) {
  return (
    <div className="flex items-start gap-4 rounded-panel bg-surface/85 p-4 ring-1 ring-rose-100">
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-6 whitespace-pre-line break-words text-ink">{row.message}</p>
        <p className="mt-1 font-display text-lg leading-tight text-primary">
          {row.authorName}
          <span className="font-sans text-xs font-normal text-muted"> · {row.signedAt}</span>
        </p>
      </div>
      <form action={action}>
        <input name="id" type="hidden" value={invitationId} />
        <input name="entryId" type="hidden" value={row.id} />
        <button
          aria-label={`${hidden ? GUESTBOOK_OWNER_COPY.showActions : GUESTBOOK_OWNER_COPY.hideAction} el mensaje de ${row.authorName}`}
          className={quietButton}
          type="submit"
        >
          {hidden ? GUESTBOOK_OWNER_COPY.showActions : GUESTBOOK_OWNER_COPY.hideAction}
        </button>
      </form>
    </div>
  );
}

/** The messages of the open tab, or the screen's own note when it has none (F7; L10.6). */
function MessageList({
  action,
  invitationId,
  rows,
  emptyNote,
  hidden,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  rows: readonly GuestbookRow[];
  emptyNote: string;
  hidden: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm leading-6 text-muted">{emptyNote}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <MessageCard
          action={action}
          hidden={hidden}
          invitationId={invitationId}
          key={row.id}
          row={row}
        />
      ))}
    </div>
  );
}

export default async function GuestbookModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParameters;
}) {
  await connection();
  const [{ id }, parameters] = await Promise.all([params, searchParams]);

  if (!isInvitationId(id)) {
    return (
      <CustomerWorkspaceShell
        back
        eyebrow={GUESTBOOK_OWNER_COPY.eyebrow}
        heading={INVITATION_COPY.notFoundHeading}
        intro={INVITATION_COPY.notFoundBody}
      />
    );
  }

  const [invitationRead, guestbookRead] = await Promise.all([
    attempt(() => invitations.get(id)),
    attempt(() => invitations.guestbook(id)),
  ]);
  const invitation = resolveRead(invitationRead);
  const guestbook = resolveRead(guestbookRead);

  if (invitation.status === "not-found" || guestbook.status === "not-found") {
    return (
      <CustomerWorkspaceShell
        back
        eyebrow={GUESTBOOK_OWNER_COPY.eyebrow}
        heading={INVITATION_COPY.notFoundHeading}
        intro={INVITATION_COPY.notFoundBody}
      />
    );
  }

  if (invitation.status === "unavailable" || guestbook.status === "unavailable") {
    return (
      <CustomerWorkspaceShell
        back
        eyebrow={GUESTBOOK_OWNER_COPY.eyebrow}
        heading={GUESTBOOK_OWNER_COPY.heading}
        intro={GUESTBOOK_OWNER_COPY.unavailable}
      >
        <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
          {GUESTBOOK_OWNER_COPY.backToInvitation}
        </Link>
      </CustomerWorkspaceShell>
    );
  }

  const view: GuestbookModerationView = guestbookModerationView(
    guestbook.value,
    parameters,
    new Date(),
  );
  const notices = invitationPageNotices(parameters);
  const visible = view.tab === "visibles";

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
          {GUESTBOOK_OWNER_COPY.backToInvitation}
        </Link>
      }
      back
      eyebrow={GUESTBOOK_OWNER_COPY.eyebrow}
      heading={GUESTBOOK_OWNER_COPY.heading}
      intro={GUESTBOOK_OWNER_COPY.intro}
    >
      <div className="flex max-w-3xl flex-col gap-4">
        <Notices error={notices.error} issues={notices.issues} notice={notices.notice} />
        <nav aria-label={GUESTBOOK_OWNER_COPY.tabLabel} className="flex gap-2">
          <TabLink active={visible} href={GUESTBOOK_OWNER_PATHS.page(id)} label={view.visibleTab} />
          <TabLink
            active={!visible}
            href={`${GUESTBOOK_OWNER_PATHS.page(id)}?${GUESTBOOK_TAB_PARAM}=ocultos`}
            label={view.hiddenTab}
          />
        </nav>
        <MessageList
          action={visible ? hideGuestbookEntryAction : showGuestbookEntryAction}
          emptyNote={visible ? GUESTBOOK_OWNER_COPY.emptyVisible : GUESTBOOK_OWNER_COPY.emptyHidden}
          hidden={!visible}
          invitationId={id}
          rows={visible ? view.visible : view.hidden}
        />
        <p className={statusNote}>{GUESTBOOK_OWNER_COPY.note}</p>
      </div>
    </CustomerWorkspaceShell>
  );
}
