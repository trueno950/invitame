import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import {
  EDITOR_COPY,
  INVITATION_COPY,
  INVITATION_ERROR_COPY,
  PAYMENT_COPY,
} from "../../../../lib/customer/copy.ts";
import {
  attendanceTab,
  EDITOR_SECTION_PARAM,
  editorSnapshotKey,
  parseEditorSection,
} from "../../../../lib/customer/editor-sections.ts";
import { featureSettingsView } from "../../../../lib/customer/invitation-features.ts";
import {
  type MediaSectionView,
  mainPhotoUrl,
  mediaLimits,
  mediaSectionView,
} from "../../../../lib/customer/invitation-media.ts";
import { paymentPanelView } from "../../../../lib/customer/invitation-payment.ts";
import { invitationPreviewPath } from "../../../../lib/customer/invitation-preview.ts";
import { RSVP_PATHS, rsvpSettingsView } from "../../../../lib/customer/invitation-rsvp.ts";
import {
  contentSections,
  fieldLabel,
  INVITATION_PATHS,
  invitationFieldsFor,
  invitationPageNotices,
  missingFieldsMessage,
  statusLabel,
} from "../../../../lib/customer/invitations.ts";
import { publishHintFor } from "../../../../lib/customer/publish-copy.ts";
import { publicInvitationPath } from "../../../../lib/public/invitation-page.ts";
import type { OwnedInvitation, RsvpRead } from "../../../../lib/server/invitations-api.ts";
import { isInvitationId } from "../../../../lib/server/invitations-api.ts";
import type { MediaLimits } from "../../../../lib/server/media-api.ts";
import { CustomerWorkspaceShell } from "../../../_components/customer-workspace-shell.tsx";
import {
  fieldHint,
  primaryButton,
  quietButton,
  statusNote,
  textButton,
  textField,
} from "../../../_components/ui.ts";
import { ContentSummary } from "../_components/content-summary.tsx";
import { FeaturesSummary } from "../_components/features-form.tsx";
import {
  GallerySection,
  GalleryUnavailable,
  GalleryUnreadable,
  MainPhotoUpload,
} from "../_components/media-section.tsx";
import { Notices } from "../_components/notices.tsx";
import { PaymentPanel } from "../_components/payment-panel.tsx";
import { RsvpSettingsSummary, RsvpSettingsUnavailable } from "../_components/rsvp-settings.tsx";
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
  startCheckoutAction,
  unpublishInvitationAction,
  uploadGalleryPhotoAction,
  uploadMainPhotoAction,
} from "../actions.ts";
import { EditorShell } from "./_components/editor-shell.tsx";

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
 * The «Asistencia» block of a draft that cannot be edited: the read-only pair of an archived invitation, or the note of
 * a settings read that failed (M6 G3; S4). A missing invitation is not its own case here: the page itself already
 * answered not-found above.
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

  return <RsvpSettingsSummary view={rsvpSettingsView(invitation, loaded.value.settings)} />;
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
 * The media read of one draft, as the section renders it (M8 S4; M9 T15). The owner's media route answers only this
 * invitation's stored photos; a refusal or an unexpected failure becomes the section's own short note, so a storage
 * outage never hides the content the creator can still edit. `limits` is the limits read the page made once for both
 * forms and the gallery cap (M9 T13, T15; S5, S8), or null when that read failed: the section then states no cap.
 */
async function gallerySection(
  invitation: OwnedInvitation,
  limits: MediaLimits | null,
): Promise<MediaSectionView | "unreadable"> {
  try {
    const assets = await media.list(invitation.id);

    return assets.ok ? mediaSectionView(invitation, assets.value, limits) : "unreadable";
  } catch {
    return "unreadable";
  }
}

/**
 * The limits of one draft, or null when the API did not answer them (M9 T13, T15; S5, S8). A failed read is not an error
 * of the page: the upload is still offered and the gallery still shows its photos, with no size and no cap stated, and
 * the API's own checks refuse what they must.
 */
async function mediaLimitsOf(invitationId: string): Promise<MediaLimits | null> {
  try {
    return await mediaLimits(media, invitationId);
  } catch {
    return null;
  }
}

/** The count a tab shows beside its label, from the read the page already made (S4; M9 T15). */
function tabMeta(state: MediaSectionView | "unavailable" | "unreadable"): string {
  return typeof state === "object"
    ? state.photoLimit === null
      ? `${state.photos.length}`
      : `${state.photos.length} de ${state.photoLimit}`
    : "";
}

/**
 * `/cuenta/invitaciones/[id]` (M4 T5, T8; M5 T5; M6 G3; M7 T2; M8 S2-S4; T2c: S1-S4): the owner's editor of one
 * invitation.
 *
 * An editable draft opens in the tabbed editor of `design/editor-redesign/03-pestanas-y-vista-previa.html`: five tabs
 * (Contenido, Fotos, Funciones, Asistencia, Publicar), the fields in the middle, and the invitation itself rendered
 * live at phone width beside them. Every field saves on its own, one sticky status line says whether the work is on
 * its way, and the tab is mirrored into `?seccion=` so an upload, a checkout, a publish, an archive, or a guest write
 * lands back on the tab it came from.
 *
 * The page keeps the reads and the decisions: the API is asked for the invitation, the creator catalog, the packages,
 * the media, and the payment state, and each answer only decides what renders. An archived invitation, and one whose
 * pinned version left the catalog, keep the read-only summaries they had: no autosave, no tabs, and no way to write.
 * The browser never sends `PUT` (L8), so the writes are server actions; the editor calls them from the browser through
 * its client island, and the server actions still answer a redirect for every action that navigates.
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
  const section = parseEditorSection(parameters[EDITOR_SECTION_PARAM]);

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
  // The «Asistencia» tab is offered only when the package includes RSVP, and it is read after the catalog because the
  // package decides whether the page offers it at all (M6 G3; S4).
  const rsvp = features.showRsvp
    ? resolveRead(await attempt(() => invitations.readRsvp(invitation.id)))
    : undefined;
  // The limits the two media forms refuse and state, and the gallery cap the section states (M9 T13, T15; S5, S8): read
  // once, from the owner's own route, so the configured size and cap reach the page without a deploy. An archived
  // invitation offers no form, so it asks nothing.
  const limits = invitation.status === "ARCHIVED" ? null : await mediaLimitsOf(invitation.id);
  // The «Galería» is offered only when the package grants `GALLERY`, and it is read after the catalog because the
  // owner read already names the gated keys (M8 S3, S4). A failed read keeps the rest of the draft editable.
  const mediaState: MediaSectionView | "unavailable" | "unreadable" =
    invitation.availableFeatures.includes("GALLERY")
      ? await gallerySection(invitation, limits)
      : "unavailable";
  // The payment state the panel renders is the API's (M7 T2; S1, S4). A read that fails leaves the page as it was,
  // because the API's own payment gate is what refuses a publication that still owes money: the panel and the
  // disabled button are a convenience, never the guard.
  const paymentState = await attempt(() => invitations.payment(invitation.id));
  const payment =
    paymentState === "unavailable" || !paymentState.ok ? undefined : paymentState.value;
  const paymentPanel = payment === undefined ? undefined : paymentPanelView(payment);
  /** Whether the gate still asks for a payment, so publishing cannot succeed yet. */
  const paymentPending =
    paymentPanel !== undefined &&
    (paymentPanel.kind === "pay" ||
      paymentPanel.kind === "retry" ||
      paymentPanel.kind === "amount-unavailable");
  /**
   * What the publish block says about the price (T3; S3): «Publicar no tiene costo.» only for a free package or a
   * deployment in free mode, so the promise never reaches a package that costs money.
   */
  const publishHint = publishHintFor(payment);
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
  const attendance = attendanceTab(invitation.availableFeatures);
  const rsvpView =
    rsvp?.status === "ok" ? rsvpSettingsView(invitation, rsvp.value.settings) : undefined;

  /**
   * The identity of the stored draft the editor starts from. A navigation that answered a different stored draft (the
   * photo an upload wrote into the content, for one) remounts the fields with the fresh values; a save on its way
   * never does, so nothing the owner is typing is reset.
   */
  const editorKey = editorSnapshotKey([
    invitation.content,
    invitation.timeZone,
    invitation.featureSettings,
    invitation.status,
    rsvp?.status === "ok" ? rsvp.value.settings : null,
    pinned?.template.publishedVersion.id ?? null,
  ]);

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

        {!archived ? (
          <EditorShell
            actions={{
              publish: publishInvitationAction,
              unpublish: unpublishInvitationAction,
              archive: archiveInvitationAction,
            }}
            attendance={attendance}
            content={invitation.content}
            featureView={features}
            gallery={<GallerySectionBlock state={mediaState} />}
            guestListHref={RSVP_PATHS.responses(invitation.id)}
            initialSection={section}
            invitationId={invitation.id}
            places={invitation.places}
            key={editorKey}
            mainPhoto={
              <MainPhotoUpload
                action={uploadMainPhotoAction}
                currentUrl={mainPhotoUrl(invitation.content)}
                invitationId={invitation.id}
                maxUploadBytes={limits?.maxUploadBytes ?? null}
              />
            }
            payment={
              paymentPanel === undefined ? null : (
                <PaymentPanel
                  action={startCheckoutAction}
                  invitationId={invitation.id}
                  view={paymentPanel}
                />
              )
            }
            paymentPending={paymentPending}
            publishHint={publishHint}
            previewSrc={invitationPreviewPath(invitation.id)}
            publicHref={publicHref}
            rsvpView={rsvpView}
            readOnlyContent={
              pinned === undefined ? (
                <div className="flex flex-col gap-3">
                  {readOnlyNote === undefined ? null : <p className={statusNote}>{readOnlyNote}</p>}
                  <ContentSummary content={invitation.content} rows={rows} />
                </div>
              ) : undefined
            }
            sections={pinned === undefined ? [] : contentSections(pinned.fields)}
            slug={invitation.slug}
            status={invitation.status}
            statusLabel={statusLabel(invitation.status)}
            tabMeta={{
              fotos: tabMeta(mediaState),
              funciones: String(features.automaticFeatures.length),
              asistencia: rsvpView === undefined ? "" : `máx. ${rsvpView.partyLimit}`,
              publicar:
                invitation.status === "PUBLISHED"
                  ? EDITOR_COPY.publishMeta.published
                  : paymentPending
                    ? EDITOR_COPY.publishMeta.unpaid
                    : "",
            }}
          />
        ) : (
          /* The read-only draft of an archived invitation (A3; S7). A retired pinned version keeps the editor (R3-001). */
          <div className="grid items-start gap-4 lg:grid-cols-3 lg:gap-6">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
              {readOnlyNote === undefined ? null : <p className={statusNote}>{readOnlyNote}</p>}
              {published && editable ? (
                <p className={statusNote}>{INVITATION_COPY.publishedNote}</p>
              ) : null}

              <div className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
                <ContentSummary content={invitation.content} rows={rows} />
              </div>

              <GallerySectionBlock state={mediaState} />

              <FeaturesSummary view={features} />

              {rsvp === undefined ? null : (
                <RsvpSectionBlock invitation={invitation} loaded={rsvp} />
              )}
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
                      <p className="mt-1 text-sm leading-6 text-muted">
                        {INVITATION_COPY.slugHint}
                      </p>
                    </>
                  ) : (
                    <div className="mt-1.5 flex flex-col gap-2">
                      <Link
                        className={textButton}
                        href={publicHref}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {INVITATION_COPY.openPublic}
                      </Link>
                      {/* A read-only field is one click to select, so the link is easy to copy. */}
                      <input
                        aria-label={INVITATION_COPY.publicLinkLabel}
                        className={textField}
                        readOnly
                        value={publicHref}
                      />
                      <p className="text-sm leading-6 text-muted">
                        {INVITATION_COPY.publicLinkHint}
                      </p>
                    </div>
                  )}
                </div>
                {missing === null ? null : <p className={statusNote}>{missing}</p>}
              </div>

              {paymentPanel === undefined || archived ? null : (
                <PaymentPanel
                  action={startCheckoutAction}
                  invitationId={invitation.id}
                  view={paymentPanel}
                />
              )}

              {invitation.status === "DRAFT" ? (
                <form
                  action={publishInvitationAction}
                  className="flex flex-col gap-3 rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5"
                >
                  <input name="id" type="hidden" value={invitation.id} />
                  <BlockLabel>{INVITATION_COPY.publishHeading}</BlockLabel>
                  <p className="text-sm leading-6 text-muted">{publishHint}</p>
                  {paymentPending ? (
                    <p className={fieldHint}>{PAYMENT_COPY.publishBlockedHint}</p>
                  ) : null}
                  <button className={primaryButton} disabled={paymentPending} type="submit">
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
        )}
      </div>
    </CustomerWorkspaceShell>
  );
}
