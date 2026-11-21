import { MEDIA_COPY } from "../../../../lib/customer/copy.ts";
import {
  type MediaSectionView,
  uploadMegabytes,
} from "../../../../lib/customer/invitation-media.ts";
import {
  fieldHint,
  fieldLabel,
  primaryButton,
  quietButton,
  textField,
} from "../../../_components/ui.ts";
import { GuardedForm } from "./autosave/navigation-guard.tsx";

/**
 * The media of a draft (M8 S2, S3, S4). Two server-rendered pieces, each a plain form that posts to a server action, so
 * nothing here needs JavaScript: «Subir foto» next to the template's own photo link field, and the «Galería» section of
 * a package that grants `GALLERY`. A file never leaves the browser for the API directly: the browser posts it to this
 * web server, which enforces the upload bound the API's own read answered before reading it and forwards it as
 * multipart. The browser's declared MIME type is never trusted and never forwarded; the API reads the bytes. The size
 * each hint names is that same answer (M9 T13; S5, S8 «Tamaño de foto»), so the sentence and the refusal agree.
 *
 * The photos are plain `<img>` elements, not `next/image`: they are served by the API's public origin, which is not in
 * this app's image configuration, and they already are the re-encoded WebP the API produced. The current photo and the
 * gallery thumbnails reserve the dimensions the API stored, so the section does not jump while they load.
 */

const THUMBNAIL = "mt-3 h-auto w-full max-w-56 rounded-lg ring-1 ring-gold/45";
const CURRENT_PHOTO = "h-auto w-full rounded-lg ring-1 ring-gold/45";

/**
 * The «Subir foto» form of the editor (S4). It sits inside the content form's photo field: it uploads one file with
 * `kind: main-photo`, and the server action writes the answered URL into the template's own photo field and comes back
 * with the page's notice. The link input stays above it, so a creator who already has a hosted photo keeps using it.
 */
export function MainPhotoUpload({
  invitationId,
  currentUrl,
  maxUploadBytes,
  action,
}: {
  invitationId: string;
  /** The stored photo as an absolute URL, or null when the draft has none to show yet. */
  currentUrl: string | null;
  /** The upload bound the API answered, in bytes, or null when that read failed (S5, S8). */
  maxUploadBytes: number | null;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="mt-4 rounded-field border-[1.5px] border-dashed border-field-border bg-surface p-3">
      <p className={fieldLabel}>{MEDIA_COPY.mainPhotoHeading}</p>
      {currentUrl === null ? (
        <p className={fieldHint}>{MEDIA_COPY.mainPhotoNone}</p>
      ) : (
        <figure className="mt-2">
          {/* biome-ignore lint/performance/noImgElement: the photo comes from the API's public origin (M8 S4). */}
          <img
            alt={MEDIA_COPY.mainPhotoCurrent}
            className={THUMBNAIL}
            decoding="async"
            loading="lazy"
            src={currentUrl}
          />
          <figcaption className={fieldHint}>{MEDIA_COPY.mainPhotoCurrent}</figcaption>
        </figure>
      )}
      <GuardedForm action={action} className="mt-3 flex flex-col gap-2" section="fotos">
        <input name="id" type="hidden" value={invitationId} />
        <input name="kind" type="hidden" value="main-photo" />
        <label className={fieldLabel} htmlFor="media-main-photo">
          {MEDIA_COPY.mainPhotoFileLabel}
        </label>
        <input
          accept={MEDIA_COPY.mainPhotoAccept}
          className={textField}
          id="media-main-photo"
          name="file"
          required
          type="file"
        />
        <p className={fieldHint}>{MEDIA_COPY.mainPhotoHint(uploadMegabytes(maxUploadBytes))}</p>
        <div className="flex justify-end">
          <button className={`${quietButton} sm:w-auto`} type="submit">
            {MEDIA_COPY.mainPhotoSubmit}
          </button>
        </div>
      </GuardedForm>
    </div>
  );
}

/** The three actions of the section, each a server action the forms post to. */
export interface GalleryActions {
  upload: (formData: FormData) => Promise<void>;
  alt: (formData: FormData) => Promise<void>;
  move: (formData: FormData) => Promise<void>;
  remove: (formData: FormData) => Promise<void>;
}

/**
 * The «Galería» section of a draft (S3, S4): the upload of one photo, then every stored photo with its thumbnail, its
 * alt text, the two moves of its position, and its removal. Each control is its own small form, so one submit never
 * carries another control's value; the section is shown only when the pinned package grants `GALLERY`, and an archived
 * invitation shows the photos without any form at all.
 */
export function GallerySection({
  view,
  actions,
}: {
  view: MediaSectionView;
  actions: GalleryActions;
}) {
  return (
    <section className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
        {MEDIA_COPY.galleryTitle}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">{MEDIA_COPY.galleryHint}</p>

      <p className="mt-3 text-sm font-medium text-ink">
        {MEDIA_COPY.galleryCount(view.photos.length, view.photoLimit)}
      </p>
      {view.limitReached ? (
        <p className="mt-1 text-sm leading-6 text-muted">
          {MEDIA_COPY.galleryLimitNote(view.photoLimit)}
        </p>
      ) : null}

      {view.editable && !view.limitReached ? (
        <GuardedForm action={actions.upload} className="mt-4 flex flex-col gap-2" section="fotos">
          <input name="id" type="hidden" value={view.id} />
          <input name="kind" type="hidden" value="gallery" />
          <p className={fieldLabel}>{MEDIA_COPY.galleryUploadHeading}</p>
          <label className={fieldLabel} htmlFor="media-gallery-file">
            {MEDIA_COPY.mainPhotoFileLabel}
          </label>
          <input
            accept={MEDIA_COPY.mainPhotoAccept}
            className={textField}
            id="media-gallery-file"
            name="file"
            required
            type="file"
          />
          <label className={fieldLabel} htmlFor="media-gallery-alt">
            {MEDIA_COPY.galleryAltLabel}
          </label>
          <input
            className={textField}
            id="media-gallery-alt"
            maxLength={view.altMaxLength}
            name="alt"
            type="text"
          />
          <p className={fieldHint}>
            {MEDIA_COPY.galleryUploadHint(uploadMegabytes(view.maxUploadBytes))}
          </p>
          <div className="flex justify-end">
            <button className={`${primaryButton} sm:w-auto sm:px-8`} type="submit">
              {MEDIA_COPY.galleryUploadSubmit}
            </button>
          </div>
        </GuardedForm>
      ) : null}

      {view.photos.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-muted">{MEDIA_COPY.galleryEmpty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {view.photos.map((photo) => (
            <li
              className="grid gap-3 rounded-field bg-surface p-3 ring-1 ring-gold/45 sm:grid-cols-[9rem_1fr]"
              data-media-photo={photo.id}
              key={photo.id}
            >
              <a href={photo.url} rel="noopener noreferrer" target="_blank">
                {/* biome-ignore lint/performance/noImgElement: the photo comes from the API's public origin (M8 S4). */}
                <img
                  alt={photo.alt === "" ? MEDIA_COPY.galleryTitle : photo.alt}
                  className={CURRENT_PHOTO}
                  decoding="async"
                  height={photo.height}
                  loading="lazy"
                  src={photo.url}
                  width={photo.width}
                />
              </a>
              {view.editable ? (
                <div className="flex min-w-0 flex-col gap-2">
                  <GuardedForm action={actions.alt} className="flex flex-col gap-1" section="fotos">
                    <input name="id" type="hidden" value={view.id} />
                    <input name="assetId" type="hidden" value={photo.id} />
                    <label className={fieldLabel} htmlFor={`media-alt-${photo.id}`}>
                      {MEDIA_COPY.galleryAltLabel}
                    </label>
                    <input
                      className={textField}
                      defaultValue={photo.alt}
                      id={`media-alt-${photo.id}`}
                      maxLength={view.altMaxLength}
                      name="alt"
                      type="text"
                    />
                    <p className={fieldHint}>{MEDIA_COPY.galleryAltHint}</p>
                    <div className="flex flex-wrap gap-2">
                      <button className={quietButton} type="submit">
                        {MEDIA_COPY.galleryAltSave}
                      </button>
                    </div>
                  </GuardedForm>
                  <div className="flex flex-wrap gap-2">
                    <GuardedForm action={actions.move} section="fotos">
                      <input name="id" type="hidden" value={view.id} />
                      <input name="assetId" type="hidden" value={photo.id} />
                      <input name="direction" type="hidden" value="up" />
                      <button className={quietButton} disabled={!photo.canMoveUp} type="submit">
                        {MEDIA_COPY.galleryMoveUp}
                      </button>
                    </GuardedForm>
                    <GuardedForm action={actions.move} section="fotos">
                      <input name="id" type="hidden" value={view.id} />
                      <input name="assetId" type="hidden" value={photo.id} />
                      <input name="direction" type="hidden" value="down" />
                      <button className={quietButton} disabled={!photo.canMoveDown} type="submit">
                        {MEDIA_COPY.galleryMoveDown}
                      </button>
                    </GuardedForm>
                    <GuardedForm action={actions.remove} section="fotos">
                      <input name="id" type="hidden" value={view.id} />
                      <input name="assetId" type="hidden" value={photo.id} />
                      <button className={quietButton} type="submit">
                        {MEDIA_COPY.galleryRemove}
                      </button>
                    </GuardedForm>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-6 text-muted">
                  {photo.alt === "" ? MEDIA_COPY.galleryTitle : photo.alt}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {view.editable ? null : (
        <p className="mt-4 text-sm leading-6 text-muted">{MEDIA_COPY.archiveNote}</p>
      )}
    </section>
  );
}

/** The note of a gallery this invitation's package does not grant (S3). */
export function GalleryUnavailable() {
  return (
    <section className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
        {MEDIA_COPY.galleryTitle}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">{MEDIA_COPY.galleryUnavailable}</p>
    </section>
  );
}

/** The note of a gallery read that failed: the rest of the draft stays editable (S4). */
export function GalleryUnreadable() {
  return (
    <section className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
        {MEDIA_COPY.galleryTitle}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">{MEDIA_COPY.galleryUnavailableRead}</p>
    </section>
  );
}
