import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";

import {
  EDITOR_COPY,
  INVITATION_COPY,
  INVITATION_ERROR_COPY,
  PAYMENT_COPY,
} from "../../../../lib/customer/copy.ts";
import { addressPrefix } from "../../../../lib/customer/address.ts";
import {
  EDITOR_FIELD_PARAM,
  invitationHeading,
  parseEditorField,
} from "../../../../lib/customer/editor-progress.ts";
import {
  attendanceTab,
  EDITOR_SECTION_PARAM,
  editorSnapshotKey,
  parseEditorSection,
} from "../../../../lib/customer/editor-sections.ts";
import { GUEST_ALBUM_OWNER_PATHS } from "../../../../lib/customer/guest-album.ts";
import { GUESTBOOK_OWNER_PATHS } from "../../../../lib/customer/guestbook.ts";
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
import { absolutePublicUrl } from "../../../../lib/customer/invitation-share.ts";
import {
  contentSections,
  fieldLabel,
  INVITATION_PATHS,
  invitationFieldsFor,
  invitationPageNotices,
  missingFieldsMessage,
  statusLabel,
} from "../../../../lib/customer/invitations.ts";
import {
  COLLABORATOR_PATHS,
  editorAccessView,
  landingSection,
} from "../../../../lib/customer/collaboration.ts";
import {
  NO_OMITTABLE_SECTIONS,
  OMITTED_SECTIONS_PROPERTY,
  omittableSectionsOf,
} from "../../../../lib/customer/omittable-sections.ts";
import { passwordProtectionView } from "../../../../lib/customer/password-protection.ts";
import { publishHintFor } from "../../../../lib/customer/publish-copy.ts";
import { publicInvitationPath } from "../../../../lib/public/invitation-page.ts";
import type { OwnedInvitation, RsvpRead } from "../../../../lib/server/invitations-api.ts";
import { isInvitationId } from "../../../../lib/server/invitations-api.ts";
import type { MediaLimits } from "../../../../lib/server/media-api.ts";
import { requestOrigin } from "../../../../lib/server/request-origin.ts";
import { PASSWORD_SHARE_COOKIE, passwordShares } from "../../../../lib/server/single-use-flash.ts";
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
import {
  deadlineDateOf,
  REMINDERS_PREVIEW_GUEST,
  reminderPreviewMessage,
} from "../../../../lib/customer/reminders.ts";
import {
  removeInvitationPasswordAction,
  saveInvitationPasswordAction,
} from "../password-actions.ts";
import { getWebServerConfig } from "../../../../lib/server/config.ts";
import { EditorShell } from "./_components/editor-shell.tsx";
import { AddressField } from "./_components/address-field.tsx";
import { PasswordField } from "./_components/password-field.tsx";

export const metadata: Metadata = {
  title: INVITATION_COPY.detailPageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The label of one block of the page, above what it holds. */
function BlockLabel({ children }: { children: string }) {
  return <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{children}</p>;
}

/**
 * The workspace of a draft nothing can be shown for, with the shared way back to the list (S2.3) and, when the read
 * only failed for now, a retry of this same page.
 */
function PlainShell({ heading, body, retry }: { heading: string; body: string; retry?: string }) {
  return (
    <CustomerWorkspaceShell
      back
      eyebrow={INVITATION_COPY.detailEyebrow}
      heading={heading}
      intro={body}
    >
      {retry === undefined ? null : (
        <Link className={quietButton} href={retry}>
          {INVITATION_COPY.retry}
        </Link>
      )}
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
  const [{ id }, parameters, origin] = await Promise.all([
    params,
    searchParams,
    headers().then(requestOrigin),
  ]);
  const notices = invitationPageNotices(parameters);
  const section = parseEditorSection(parameters[EDITOR_SECTION_PARAM]);
  /** The field a missing-field link named, which the editor opens and focuses (T1; S2.4). */
  const focusField = parseEditorField(parameters[EDITOR_FIELD_PARAM]);

  if (!isInvitationId(id)) {
    return (
      <PlainShell body={INVITATION_COPY.notFoundBody} heading={INVITATION_COPY.notFoundHeading} />
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
      <PlainShell body={INVITATION_COPY.notFoundBody} heading={INVITATION_COPY.notFoundHeading} />
    );
  }

  if (loaded.status === "unavailable") {
    return (
      <PlainShell
        body={INVITATION_COPY.unavailableBody}
        heading={INVITATION_COPY.unavailableHeading}
        retry={INVITATION_PATHS.detail(id)}
      />
    );
  }

  const invitation = loaded.value;
  /**
   * What this caller may use on the invitation (F12; L17.4, L17.5): it owns every capability, and a collaborator holds
   * only the permissions the API answered. The editor offers the tabs and the actions of this view, and the API checks
   * every route again — hiding is a convenience, never a guard.
   */
  const access = editorAccessView(invitation.access);
  const templates = catalog === "unavailable" || !catalog.ok ? undefined : catalog.value;
  /** The creator catalog's packages, which decide whether the WhatsApp field is offered (F3; S4). */
  const packages =
    packageCatalog === "unavailable" || !packageCatalog.ok ? undefined : packageCatalog.value;
  const features = featureSettingsView(invitation, packages);
  // The «Asistencia» tab is offered only when the package includes RSVP and the caller may see who answered, and it is
  // read after the catalog because the package decides whether the page offers it at all (M6 G3; S4, F12).
  const rsvp =
    features.showRsvp && access.canViewAttendance
      ? resolveRead(await attempt(() => invitations.readRsvp(invitation.id)))
      : undefined;
  // The limits the two media forms refuse and state, and the gallery cap the section states (M9 T13, T15; S5, S8): read
  // once, from the owner's own route, so the configured size and cap reach the page without a deploy. An archived
  // invitation offers no form, so it asks nothing.
  const limits =
    invitation.status === "ARCHIVED" || !access.canEditContent
      ? null
      : await mediaLimitsOf(invitation.id);
  // The «Galería» is offered only when the package grants `GALLERY` and the caller may edit the content, and it is read
  // after the catalog because the owner read already names the gated keys (M8 S3, S4; F12). A failed read keeps the rest
  // of the draft editable.
  const mediaState: MediaSectionView | "unavailable" | "unreadable" =
    invitation.availableFeatures.includes("GALLERY") && access.canEditContent
      ? await gallerySection(invitation, limits)
      : "unavailable";
  // The payment state the panel renders is the API's (M7 T2; S1, S4), and paying is the owner's alone (F12; L17.2), so
  // a collaborator asks nothing here. A read that fails leaves the page as it was, because the API's own payment gate is
  // what refuses a publication that still owes money: the panel and the disabled button are a convenience, never the
  // guard.
  const paymentState = access.showPayment
    ? await attempt(() => invitations.payment(invitation.id))
    : "unavailable";
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
  /**
   * The sections this invitation may switch off, read from its own pinned version (T4; S8.1). A version that declares
   * no extension answers none, and the «Contenido» tab then behaves exactly as it did before.
   */
  const omittable =
    pinned === undefined
      ? NO_OMITTABLE_SECTIONS
      : omittableSectionsOf(pinned.template.publishedVersion.schema);
  const archived = invitation.status === "ARCHIVED";
  const published = invitation.status === "PUBLISHED";
  const publicHref = published ? publicInvitationPath(invitation.slug) : null;
  /**
   * The heading names the customer's own invitation (T1; S2.1): the celebrant, the baby, the couple, or the hosts the
   * content announces, and «Tu invitación de <ocasión>» while it names nobody. The template's name is secondary text
   * above it, so the owner never sees only the catalog name of a template.
   */
  const heading = invitationHeading(
    invitation.content,
    pinned?.template.category.name,
    archived ? INVITATION_COPY.archivedHeading : INVITATION_COPY.detailHeading,
  );
  /** The photos the draft already holds: the main photo counted together with the stored gallery (T1; S2.1). */
  const photoCount =
    (typeof mediaState === "object" ? mediaState.photos.length : 0) +
    (mainPhotoUrl(invitation.content) === null ? 0 : 1);
  /** The absolute address the share panel copies and shares, from the origin this request resolved (T1; S2.2). */
  const publicUrl = publicHref === null ? "" : absolutePublicUrl(origin, publicHref);
  /**
   * The prefix the address block shows, from the deployment's own public origin when it is configured and from this
   * request's origin otherwise, so the owner reads the real address and the product hard-codes no host (F11; L15.4).
   */
  const addressOrigin = getWebServerConfig().publicWebOrigin ?? origin;
  /**
   * The access code's block (F13; S2.13, L18.1): offered only to the invitation's owner, and only while the pinned package
   * grants `PASSWORD_PROTECTION` or a code is already stored — a stored code stays removable even after the catalog
   * withdrew the key, because a lock that vanished with a link would publish an invitation its owner closed (L18.5).
   */
  const passwordView = passwordProtectionView(invitation);
  const showPassword = access.owner && (passwordView.show || passwordView.protected);
  /**
   * The ready-to-share message of the code that was just saved: read once, as the page renders, so the store deletes it and
   * a reload cannot show the code again. Nothing else on this page ever holds the value (L18.1).
   */
  const passwordShareHandle = showPassword
    ? (await cookies()).get(PASSWORD_SHARE_COOKIE)?.value
    : undefined;
  const passwordShare =
    passwordShareHandle === undefined
      ? undefined
      : passwordShares.take(passwordShareHandle, (entry) => entry.invitationId === invitation.id);
  const missing = missingFieldsMessage(invitation.missingRequiredFields);
  const editable = pinned !== undefined && !archived;
  const rows =
    pinned === undefined
      ? Object.keys(invitation.content)
          // The stored list of omitted sections is not a data field of any template, so the read-only summary of a
          // version this deployment lost never shows it as one (T4; S8.2).
          .filter((name) => name !== OMITTED_SECTIONS_PROPERTY)
          .map((name) => ({ name, label: fieldLabel(name) }))
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
   * The message the reminder block previews (F6; L9.6): the pending-RSVP reminder the command would send, in the words
   * of the API's own template, greeting a stand-in guest by name and naming the occasion, the deadline the owner set,
   * and this invitation's own public address. A draft has no absolute address yet, so its preview shows the path the
   * invitation will live at instead of a host nobody chose. Without a catalog read there is no occasion to name, so the
   * block offers its switches and no preview instead of inventing one.
   */
  const occasion = pinned?.template.category.name;
  const reminderPreview =
    occasion === undefined
      ? undefined
      : reminderPreviewMessage({
          guestName: REMINDERS_PREVIEW_GUEST,
          occasion,
          deadline: deadlineDateOf(rsvpView?.deadlineValue),
          link: publicUrl === "" ? publicInvitationPath(invitation.slug) : publicUrl,
        });

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
    invitation.access,
    rsvp?.status === "ok" ? rsvp.value.settings : null,
    pinned?.template.publishedVersion.id ?? null,
  ]);

  return (
    <CustomerWorkspaceShell
      back
      eyebrow={pinned === undefined ? INVITATION_COPY.detailEyebrow : pinned.template.name}
      heading={heading}
      intro={archived ? INVITATION_COPY.archivedNote : INVITATION_COPY.detailIntro}
    >
      <div className="flex flex-col gap-4">
        <Notices error={notices.error} issues={notices.issues} notice={notices.notice} />

        {!archived ? (
          <EditorShell
            access={access}
            allowedSections={access.sections}
            actions={{
              publish: publishInvitationAction,
              unpublish: unpublishInvitationAction,
              archive: archiveInvitationAction,
            }}
            address={
              access.showAddress ? (
                <AddressField
                  invitationId={invitation.id}
                  prefix={addressPrefix(addressOrigin)}
                  renamesRemaining={invitation.slugRenamesRemaining}
                  slug={invitation.slug}
                />
              ) : null
            }
            attendance={attendance}
            collaboratorsHref={
              access.showCollaborators && invitation.availableFeatures.includes("CO_HOSTS")
                ? COLLABORATOR_PATHS.page(invitation.id)
                : undefined
            }
            content={invitation.content}
            featureView={features}
            gallery={<GallerySectionBlock state={mediaState} />}
            guestListHref={RSVP_PATHS.responses(invitation.id)}
            guestbookHref={
              features.showGuestbook && access.showGuestbook
                ? GUESTBOOK_OWNER_PATHS.page(invitation.id)
                : undefined
            }
            guestAlbumHref={
              features.showGuestAlbum && access.canEditContent
                ? GUEST_ALBUM_OWNER_PATHS.page(invitation.id)
                : undefined
            }
            initialSection={landingSection(access.sections, section)}
            initialField={focusField}
            invitationId={invitation.id}
            omittable={omittable}
            password={
              showPassword ? (
                <PasswordField
                  invitationId={invitation.id}
                  removeAction={removeInvitationPasswordAction}
                  saveAction={saveInvitationPasswordAction}
                  {...(passwordShare === undefined ? {} : { shareMessage: passwordShare.message })}
                  view={passwordView}
                />
              ) : null
            }
            places={invitation.places}
            detailPath={INVITATION_PATHS.detail(invitation.id)}
            photoCount={photoCount}
            publicUrl={publicUrl}
            reminderPreview={reminderPreview}
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
              paymentPanel === undefined || !access.showPayment ? null : (
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
