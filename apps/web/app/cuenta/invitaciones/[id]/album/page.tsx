import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { GUEST_ALBUM_OWNER_COPY, INVITATION_COPY } from "../../../../../lib/customer/copy.ts";
import {
  GUEST_ALBUM_OWNER_PATHS,
  GUEST_ALBUM_TAB_PARAM,
  type GuestAlbumModerationView,
  type GuestAlbumRow,
  guestAlbumModerationView,
} from "../../../../../lib/customer/guest-album.ts";
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
import {
  hideGuestPhotoAction,
  publishGuestPhotoAction,
  showGuestPhotoAction,
} from "../../actions.ts";

/**
 * `/cuenta/invitaciones/[id]/album` (F8; S2.8, L11.6): the owner's moderation screen of the photos their guests uploaded,
 * the artboard `design/guest-album/03-aprobacion-anfitrion.html` built with the app's own tokens — the three pills are the
 * screen's tabs, each photo is a surface card of the grid, and its one action is the outlined pill of the invitation
 * pages. Every photo a guest uploads is PENDING until the owner publishes it, so this screen is what decides what the
 * invitation shows.
 *
 * Everything the page shows is the API's answer: the photos with their state and one count per state. The page never
 * decides who may moderate — it reads the owner route with the session cookie, and the API answers 404 for an invitation
 * this customer does not own (A4). Every action is a server action posting without client script, so a phone with
 * JavaScript off still publishes and hides; nothing is ever deleted, and hiding a photo is always reversible. The note
 * under the grid states the retention the media cleanup enforces: hidden and never published photos are removed 30 days
 * after they arrived or were taken down.
 */

export const metadata: Metadata = {
  title: GUEST_ALBUM_OWNER_COPY.pageTitle,
  // The photos are personal data of the guests, so no crawler may index the screen.
  robots: { index: false, follow: false },
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** One tab of the screen: a link that carries the tab in the query, and its count (F8; L11.6). */
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
 * One photo of the screen: the image the API serves, the name its uploader typed as plain text, when it arrived, and the
 * one action of the tab. The button names its photo, so a reader that cannot see the grid still knows which one it
 * publishes, hides, or shows again (L11.6).
 */
function PhotoCard({
  action,
  invitationId,
  label,
  row,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  label: string;
  row: GuestAlbumRow;
}) {
  return (
    <div className="overflow-hidden rounded-panel bg-surface ring-1 ring-rose-100">
      {/* biome-ignore lint/performance/noImgElement: the photo comes from the API's public origin (F8; L11.6). */}
      <img
        alt={row.alt}
        className="aspect-square w-full object-cover"
        decoding="async"
        loading="lazy"
        src={row.url}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="min-w-0 text-xs leading-5 break-words text-muted">
          <span className="font-medium text-ink">{row.uploaderName}</span> · {row.receivedAt}
        </p>
        <form action={action}>
          <input name="id" type="hidden" value={invitationId} />
          <input name="photoId" type="hidden" value={row.id} />
          <button aria-label={`${label}: ${row.alt}`} className={quietButton} type="submit">
            {label}
          </button>
        </form>
      </div>
    </div>
  );
}

/** The photos of the open tab, or the screen's own note when it has none (F8; L11.6). */
function PhotoGrid({
  action,
  invitationId,
  label,
  rows,
  emptyNote,
}: {
  action: (formData: FormData) => Promise<void>;
  invitationId: string;
  label: string;
  rows: readonly GuestAlbumRow[];
  emptyNote: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm leading-6 text-muted">{emptyNote}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((row) => (
        <PhotoCard
          action={action}
          invitationId={invitationId}
          key={row.id}
          label={label}
          row={row}
        />
      ))}
    </div>
  );
}

/** The server action one tab's rows post to, which is the one write that tab offers. */
const TAB_ACTIONS = {
  publish: publishGuestPhotoAction,
  hide: hideGuestPhotoAction,
  show: showGuestPhotoAction,
} as const;

/** The query that opens each tab, so a tab link and a redirect name the same screen. */
const TAB_PARAMS = {
  "por-revisar": GUEST_ALBUM_OWNER_PATHS.page as (id: string) => string,
  publicadas: (id: string) =>
    `${GUEST_ALBUM_OWNER_PATHS.page(id)}?${GUEST_ALBUM_TAB_PARAM}=publicadas`,
  ocultas: (id: string) => `${GUEST_ALBUM_OWNER_PATHS.page(id)}?${GUEST_ALBUM_TAB_PARAM}=ocultas`,
} as const;

export default async function GuestAlbumPage({
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
        eyebrow={GUEST_ALBUM_OWNER_COPY.eyebrow}
        heading={INVITATION_COPY.notFoundHeading}
        intro={INVITATION_COPY.notFoundBody}
      />
    );
  }

  const [invitationRead, albumRead] = await Promise.all([
    attempt(() => invitations.get(id)),
    attempt(() => invitations.album(id)),
  ]);
  const invitation = resolveRead(invitationRead);
  const album = resolveRead(albumRead);

  if (invitation.status === "not-found" || album.status === "not-found") {
    return (
      <CustomerWorkspaceShell
        back
        eyebrow={GUEST_ALBUM_OWNER_COPY.eyebrow}
        heading={INVITATION_COPY.notFoundHeading}
        intro={INVITATION_COPY.notFoundBody}
      />
    );
  }

  if (invitation.status === "unavailable" || album.status === "unavailable") {
    return (
      <CustomerWorkspaceShell
        back
        eyebrow={GUEST_ALBUM_OWNER_COPY.eyebrow}
        heading={GUEST_ALBUM_OWNER_COPY.heading}
        intro={GUEST_ALBUM_OWNER_COPY.unavailable}
      >
        <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
          {GUEST_ALBUM_OWNER_COPY.backToInvitation}
        </Link>
      </CustomerWorkspaceShell>
    );
  }

  const view: GuestAlbumModerationView = guestAlbumModerationView(
    album.value,
    parameters,
    new Date(),
  );
  const notices = invitationPageNotices(parameters);

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.detail(id)}>
          {GUEST_ALBUM_OWNER_COPY.backToInvitation}
        </Link>
      }
      back
      eyebrow={GUEST_ALBUM_OWNER_COPY.eyebrow}
      heading={GUEST_ALBUM_OWNER_COPY.heading}
      intro={GUEST_ALBUM_OWNER_COPY.intro}
    >
      <div className="flex max-w-5xl flex-col gap-4">
        <Notices error={notices.error} issues={notices.issues} notice={notices.notice} />
        <nav aria-label={GUEST_ALBUM_OWNER_COPY.tabLabel} className="flex flex-wrap gap-2">
          <TabLink
            active={view.tab === "por-revisar"}
            href={TAB_PARAMS["por-revisar"](id)}
            label={view.reviewTab}
          />
          <TabLink
            active={view.tab === "publicadas"}
            href={TAB_PARAMS.publicadas(id)}
            label={view.publishedTab}
          />
          <TabLink
            active={view.tab === "ocultas"}
            href={TAB_PARAMS.ocultas(id)}
            label={view.hiddenTab}
          />
        </nav>
        <PhotoGrid
          action={TAB_ACTIONS[view.action.kind]}
          emptyNote={view.emptyNote}
          invitationId={id}
          label={view.action.label}
          rows={view.rows}
        />
        <p className={statusNote}>{view.retentionNote}</p>
      </div>
    </CustomerWorkspaceShell>
  );
}
