import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { INVITATION_COPY, INVITATION_ERROR_COPY } from "../../../../lib/customer/copy.ts";
import { featureSettingsView } from "../../../../lib/customer/invitation-features.ts";
import {
  type MediaSectionView,
  mainPhotoUrl,
  mediaSectionView,
} from "../../../../lib/customer/invitation-media.ts";
import { rsvpSettingsView } from "../../../../lib/customer/invitation-rsvp.ts";
import {
  contentSections,
  fieldLabel,
  INVITATION_PATHS,
  invitationFieldsFor,
  invitationPageNotices,
  missingFieldsMessage,
  statusLabel,
} from "../../../../lib/customer/invitations.ts";
import { publicInvitationPath } from "../../../../lib/public/invitation-page.ts";
import type { OwnedInvitation, RsvpRead } from "../../../../lib/server/invitations-api.ts";
import { isInvitationId } from "../../../../lib/server/invitations-api.ts";
import { CustomerWorkspaceShell } from "../../../_components/customer-workspace-shell.tsx";
import {
  primaryButton,
  quietButton,
  statusNote,
  textButton,
  textField,
} from "../../../_components/ui.ts";
import { ContentForm } from "../_components/content-form.tsx";
import { ContentSummary } from "../_components/content-summary.tsx";
import { FeaturesForm, FeaturesSummary } from "../_components/features-form.tsx";
import {
  GallerySection,
  GalleryUnavailable,
  GalleryUnreadable,
} from "../_components/media-section.tsx";
import { Notices } from "../_components/notices.tsx";
import {
  RsvpSettingsForm,
  RsvpSettingsSummary,
  RsvpSettingsUnavailable,
} from "../_components/rsvp-settings.tsx";
import { StatusBadge } from "../_components/status-badge.tsx";
import { invitations } from "../_lib/api.ts";
import { attempt, type Loaded, resolveRead } from "../_lib/load.ts";
import { media } from "../_lib/media.ts";
import {
  archiveInvitationAction,
  moveGalleryPhotoAction,
  publishInvitationAction,
  removeGalleryPhotoAction,
  saveGalleryAltAction,
  saveInvitationContentAction,
  saveInvitationFeaturesAction,
  saveRsvpSettingsAction,
  unpublishInvitationAction,
  uploadGalleryPhotoAction,
  uploadMainPhotoAction,
} from "../actions.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.detailPageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The label of one block of the page, above what it holds. */
function BlockLabel({ children }: { children: string }) {
  return <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{children}</p>;
}

/** The workspace of a draft nothing can be shown for, with the way back to the list. */
function PlainShell({ heading, body, path }: { heading: string; body: string; path: string }) {
  return (
    <CustomerWorkspaceShell eyebrow={INVITATION_COPY.detailEyebrow} heading={heading} intro={body}>
      <Link className={quietButton} href={path}>
        {INVITATION_COPY.backToList}
      </Link>
    </CustomerWorkspaceShell>
  );
}

/**
 * The «Asistencia» section of the page: the form of a draft whose package includes RSVP, the read-only pair of an
 * archived one, or the note of a settings read that failed (M6 G3; S4). A missing invitation is not its own case
 * here: the page itself already answered not-found above.
 */
function RsvpSectionBlock({
  invitation,
  loaded,
}: {
  invitation: OwnedInvitation;
  loaded: Loaded<RsvpRead>;
}) {
  if (loaded.status === "not-found") {
    return null;
  }
  if (loaded.status === "unavailable") {
    return <RsvpSettingsUnavailable />;
  }

  const view = rsvpSettingsView(invitation, loaded.value.settings);

  return view.editable ? (
    <RsvpSettingsForm action={saveRsvpSettingsAction} view={view} />
  ) : (
    <RsvpSettingsSummary view={view} />
  );
}

/**
 * The «Galería» of one draft (M8 S3, S4): the section of a package that grants `GALLERY`, the note of one that does
 * not, or the note of a media read that failed. The read is the owner's own media route, so it answers only this
 * invitation's stored photos; an archived invitation shows them without any form, and a failed read never hides the
 * rest of the draft.
 */
function GallerySectionBlock({
  state,
}: {
  state: MediaSectionView | "unavailable" | "unreadable";
}) {
  if (state === "unavailable") {
    return <GalleryUnavailable />;
  }
  if (state === "unreadable") {
    return <GalleryUnreadable />;
  }

  return (
    <GallerySection
      actions={{
        upload: uploadGalleryPhotoAction,
        alt: saveGalleryAltAction,
        move: moveGalleryPhotoAction,
        remove: removeGalleryPhotoAction,
      }}
      view={state}
    />
  );
}

/**
 * The media read of one draft, as the section renders it (M8 S4). The owner's media route answers only this
 * invitation's stored photos; a refusal or an unexpected failure becomes the section's own short note, so a storage
 * outage never hides the content the creator can still edit.
 */
async function gallerySection(
  invitation: OwnedInvitation,
): Promise<MediaSectionView | "unreadable"> {
  try {
    const assets = await media.list(invitation.id);

    return assets.ok ? mediaSectionView(invitation, assets.value) : "unreadable";
  } catch {
    return "unreadable";
  }
}

/**
 * `/cuenta/invitaciones/[id]` (M4 T5, T8; M5 T5; S1, S3, S7, S11): the invitation's own page, in the wide workspace.
 * The form takes the wide column and its fields are grouped into short sections with two columns from
 * `sm` up, so the draft is edited with little scrolling; the narrow side column holds the status, the
 * public slug as text, what is still missing, and archiving. The form has one input per property of the
 * pinned version's schema, which the creator catalog publishes with the version; the pin never changes in
 * M4 (A2), and a retired version is absent from that catalog, so its stored content is shown read-only
 * with a note instead of a guessed form, in the same layout. Saving and archiving post to server actions,
 * because the browser cannot send `PUT` to the API (L8). The side column also publishes a complete draft,
 * shows the public `/i/<slug>` link of a published one, and unpublishes it back to draft (S7): editing stays
 * available while published, because a guest reads the stored content on every request (A6).
 */
export default async function InvitationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParameters;
}) {
  await connection();
  const [{ id }, parameters] = await Promise.all([params, searchParams]);
  const notices = invitationPageNotices(parameters);

  if (!isInvitationId(id)) {
    return (
      <PlainShell
        body={INVITATION_COPY.notFoundBody}
        heading={INVITATION_COPY.notFoundHeading}
        path={INVITATION_PATHS.list}
      />
    );
  }

  const [read, catalog, packageCatalog] = await Promise.all([
    attempt(() => invitations.get(id)),
    attempt(() => invitations.templates()),
    attempt(() => invitations.packages()),
  ]);
  const loaded = resolveRead(read);

  if (loaded.status === "not-found") {
    return (
      <PlainShell
        body={INVITATION_COPY.notFoundBody}
        heading={INVITATION_COPY.notFoundHeading}
        path={INVITATION_PATHS.list}
      />
    );
  }

  if (loaded.status === "unavailable") {
    return (
      <PlainShell
        body={INVITATION_COPY.unavailableBody}
        heading={INVITATION_COPY.unavailableHeading}
        path={INVITATION_PATHS.detail(id)}
      />
    );
  }

  const invitation = loaded.value;
  const templates = catalog === "unavailable" || !catalog.ok ? undefined : catalog.value;
  /** The creator catalog's packages, which decide whether the WhatsApp field is offered (F3; S4). */
  const packages =
    packageCatalog === "unavailable" || !packageCatalog.ok ? undefined : packageCatalog.value;
  const features = featureSettingsView(invitation, packages);
  // The «Asistencia» section is offered only when the package includes RSVP, and it is read after the catalog
  // because the package decides whether the page offers it at all (M6 G3; S4).
  const rsvp = features.showRsvp
    ? resolveRead(await attempt(() => invitations.readRsvp(invitation.id)))
    : undefined;
  // The «Galería» is offered only when the package grants `GALLERY`, and it is read after the catalog because the
  // owner read already names the gated keys (M8 S3, S4). A failed read keeps the rest of the draft editable.
  const mediaState: MediaSectionView | "unavailable" | "unreadable" =
    invitation.availableFeatures.includes("GALLERY")
      ? await gallerySection(invitation)
      : "unavailable";
  const pinned =
    templates === undefined
      ? undefined
      : invitationFieldsFor(templates, invitation.templateVersionId);
  const archived = invitation.status === "ARCHIVED";
  const published = invitation.status === "PUBLISHED";
  const publicHref = published ? publicInvitationPath(invitation.slug) : null;
  const missing = missingFieldsMessage(invitation.missingRequiredFields);
  const editable = pinned !== undefined && !archived;
  const rows =
    pinned === undefined
      ? Object.keys(invitation.content).map((name) => ({ name, label: fieldLabel(name) }))
      : pinned.fields.map((field) => ({ name: field.name, label: field.label }));
  /** Why the form is missing: the pinned version left the catalog, or the catalog read itself failed. */
  const readOnlyNote =
    pinned === undefined
      ? templates === undefined
        ? INVITATION_ERROR_COPY["content-unavailable"]
        : INVITATION_COPY.readOnlyVersionNote
      : undefined;

  return (
    <CustomerWorkspaceShell
      actions={
        <Link className={quietButton} href={INVITATION_PATHS.list}>
          {INVITATION_COPY.backToList}
        </Link>
      }
      eyebrow={INVITATION_COPY.detailEyebrow}
      heading={
        pinned?.template.name ??
        (archived ? INVITATION_COPY.archivedHeading : INVITATION_COPY.detailHeading)
      }
      intro={archived ? INVITATION_COPY.archivedNote : INVITATION_COPY.detailIntro}
    >
      <div className="flex flex-col gap-4">
        <Notices error={notices.error} issues={notices.issues} notice={notices.notice} />

        <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            {readOnlyNote === undefined ? null : <p className={statusNote}>{readOnlyNote}</p>}
            {published && editable ? (
              <p className={statusNote}>{INVITATION_COPY.publishedNote}</p>
            ) : null}

            {editable && pinned !== undefined ? (
              <ContentForm
                action={saveInvitationContentAction}
                content={invitation.content}
                id={invitation.id}
                photoUpload={{
                  id: invitation.id,
                  formId: `media-main-photo-${invitation.id}`,
                  currentUrl: mainPhotoUrl(invitation.content),
                  action: uploadMainPhotoAction,
                }}
                sections={contentSections(pinned.fields)}
              />
            ) : (
              <div className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
                <ContentSummary content={invitation.content} rows={rows} />
              </div>
            )}

            <GallerySectionBlock state={mediaState} />

            {features.editable ? (
              <FeaturesForm action={saveInvitationFeaturesAction} view={features} />
            ) : (
              <FeaturesSummary view={features} />
            )}

            {rsvp === undefined ? null : <RsvpSectionBlock invitation={invitation} loaded={rsvp} />}
          </div>

          <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
            <div className="flex flex-col gap-4 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
              <div>
                <BlockLabel>{INVITATION_COPY.statusLabel}</BlockLabel>
                <p className="mt-1.5">
                  <StatusBadge label={statusLabel(invitation.status)} />
                </p>
              </div>
              <div>
                <BlockLabel>
                  {publicHref === null
                    ? INVITATION_COPY.slugLabel
                    : INVITATION_COPY.publicLinkLabel}
                </BlockLabel>
                {publicHref === null ? (
                  <>
                    <p className="mt-1.5 font-medium break-all text-ink">{invitation.slug}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">{INVITATION_COPY.slugHint}</p>
                  </>
                ) : (
                  <div className="mt-1.5 flex flex-col gap-2">
                    <Link className={textButton} href={publicHref} rel="noreferrer" target="_blank">
                      {INVITATION_COPY.openPublic}
                    </Link>
                    {/* A read-only field is one click to select, so the link is easy to copy. */}
                    <input
                      aria-label={INVITATION_COPY.publicLinkLabel}
                      className={textField}
                      readOnly
                      value={publicHref}
                    />
                    <p className="text-sm leading-6 text-muted">{INVITATION_COPY.publicLinkHint}</p>
                  </div>
                )}
              </div>
              {missing === null ? null : <p className={statusNote}>{missing}</p>}
            </div>

            {invitation.status === "DRAFT" ? (
              <form
                action={publishInvitationAction}
                className="flex flex-col gap-3 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5"
              >
                <input name="id" type="hidden" value={invitation.id} />
                <BlockLabel>{INVITATION_COPY.publishHeading}</BlockLabel>
                <p className="text-sm leading-6 text-muted">{INVITATION_COPY.publishHint}</p>
                <button className={primaryButton} type="submit">
                  {INVITATION_COPY.publish}
                </button>
              </form>
            ) : null}

            {published ? (
              <form
                action={unpublishInvitationAction}
                className="flex flex-col gap-3 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5"
              >
                <input name="id" type="hidden" value={invitation.id} />
                <BlockLabel>{INVITATION_COPY.unpublishHeading}</BlockLabel>
                <p className="text-sm leading-6 text-muted">{INVITATION_COPY.unpublishHint}</p>
                <button className={quietButton} type="submit">
                  {INVITATION_COPY.unpublish}
                </button>
              </form>
            ) : null}

            {archived ? null : (
              <form
                action={archiveInvitationAction}
                className="flex flex-col gap-3 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5"
              >
                <input name="id" type="hidden" value={invitation.id} />
                <BlockLabel>{INVITATION_COPY.archiveHeading}</BlockLabel>
                <p className="text-sm leading-6 text-muted">{INVITATION_COPY.archiveHint}</p>
                <button className={quietButton} type="submit">
                  {INVITATION_COPY.archive}
                </button>
              </form>
            )}
          </aside>
        </div>
      </div>
    </CustomerWorkspaceShell>
  );
}
