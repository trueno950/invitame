import { INVITATION_COPY, MEDIA_COPY } from "../../../../lib/customer/copy.ts";
import {
  type ContentField,
  type ContentSection,
  fieldValue,
} from "../../../../lib/customer/invitations.ts";
import {
  fieldHint,
  fieldLabel,
  primaryButton,
  quietButton,
  textField,
} from "../../../_components/ui.ts";

const checkbox = `size-5 rounded-sm border-[1.5px] border-field-border text-primary focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary`;

const multilineField = `${textField} resize-y leading-6`;

function inputId(field: ContentField): string {
  return `content-${field.name}`;
}

/**
 * The native control of one field (M4 T8; S11), from the schema's own property: a date picker, a
 * 24-hour time, a URL field, a bounded number (`min`/`max`, so the browser refuses a negative age), a
 * multi-line message above 200 characters, or a single-line text field with its `maxLength`. No field is
 * HTML-`required`, because a draft may stay partial (S7): the fields publication needs are marked in
 * their label instead, and `parseContentForm` refuses a malformed or out-of-range value on the server.
 */
function FieldControl({
  field,
  content,
}: {
  field: ContentField;
  content: Record<string, unknown>;
}) {
  const id = inputId(field);
  const value = fieldValue(field, content);
  const { input } = field;

  switch (input.kind) {
    case "checkbox":
      return (
        <input
          className={checkbox}
          defaultChecked={content[field.name] === true}
          id={id}
          name={field.name}
          type="checkbox"
          value="true"
        />
      );
    case "textarea":
      return (
        <textarea
          className={multilineField}
          defaultValue={value}
          id={id}
          maxLength={input.maxLength}
          name={field.name}
          rows={input.rows}
        />
      );
    case "number":
      return (
        <input
          className={textField}
          defaultValue={value}
          id={id}
          inputMode={input.step === "1" ? "numeric" : "decimal"}
          max={input.max}
          min={input.min}
          name={field.name}
          step={input.step}
          type="number"
        />
      );
    case "date":
      return (
        <input className={textField} defaultValue={value} id={id} name={field.name} type="date" />
      );
    case "time":
      return (
        <input className={textField} defaultValue={value} id={id} name={field.name} type="time" />
      );
    case "url":
      return (
        <input
          autoComplete="url"
          className={textField}
          defaultValue={value}
          id={id}
          inputMode="url"
          maxLength={input.maxLength}
          name={field.name}
          placeholder={INVITATION_COPY.urlPlaceholder}
          type="url"
        />
      );
    case "text":
      return (
        <input
          autoComplete="off"
          className={textField}
          defaultValue={value}
          id={id}
          maxLength={input.maxLength}
          name={field.name}
          type="text"
        />
      );
  }
}

/**
 * One input per property of the pinned version's schema (M4 T5, T8; S7, S11). The fields are grouped in
 * the short sections of `contentSections`, each a fieldset with two columns of fields from `sm` up, so the
 * draft reads in a few blocks instead of one long column. The form posts to a server action, which reads
 * the same fields again from the API's catalog and converts them, so the browser never chooses which keys
 * or types are stored. An empty input stays empty and is omitted, because a draft may stay partial.
 *
 * `photoUpload` is the draft's own «Subir foto» (M8 S2, S4): the page decides whether it exists and what it does, so
 * this form stays the one place that lays out a field, and the upload renders right under the template's photo link
 * field. An HTML form cannot nest another one, so the upload's controls carry `form="<id>"` and its own form element is
 * rendered next to this one, empty; the browser then submits exactly the file, the invitation id, and the kind, and a
 * content save never carries a file. A template with no main photo field renders exactly the form it rendered before
 * the upload existed.
 */
export interface PhotoUploadSpec {
  /** The invitation the upload is written to. */
  readonly id: string;
  /** The DOM id of the upload's own form, which its controls name with `form`. */
  readonly formId: string;
  /** The stored photo as an absolute URL, or null when the draft has none to show yet. */
  readonly currentUrl: string | null;
  readonly action: (formData: FormData) => Promise<void>;
}

/** The «Subir foto» block of the photo field: the current photo and the one file input of the upload (S4). */
function PhotoUpload({ upload }: { upload: PhotoUploadSpec }) {
  return (
    <div className="mt-4 rounded-field border-[1.5px] border-dashed border-field-border bg-surface p-3">
      <p className={fieldLabel}>{MEDIA_COPY.mainPhotoHeading}</p>
      {upload.currentUrl === null ? (
        <p className={fieldHint}>{MEDIA_COPY.mainPhotoNone}</p>
      ) : (
        // biome-ignore lint/performance/noImgElement: the photo is served by the API's public origin (M8 S4).
        <img
          alt={MEDIA_COPY.mainPhotoCurrent}
          className="mt-2 h-auto w-full max-w-56 rounded-lg ring-1 ring-gold/45"
          decoding="async"
          loading="lazy"
          src={upload.currentUrl}
        />
      )}
      <label className={fieldLabel} htmlFor={`${upload.formId}-file`}>
        {MEDIA_COPY.mainPhotoFileLabel}
      </label>
      <input
        accept={MEDIA_COPY.mainPhotoAccept}
        className={textField}
        form={upload.formId}
        id={`${upload.formId}-file`}
        name="file"
        required
        type="file"
      />
      <p className={fieldHint}>{MEDIA_COPY.mainPhotoHint}</p>
      <div className="mt-2 flex justify-end">
        <button className={`${quietButton} sm:w-auto`} form={upload.formId} type="submit">
          {MEDIA_COPY.mainPhotoSubmit}
        </button>
      </div>
    </div>
  );
}

export function ContentForm({
  id,
  sections,
  content,
  action,
  photoUpload,
}: {
  id: string;
  sections: readonly ContentSection[];
  content: Record<string, unknown>;
  action: (formData: FormData) => Promise<void>;
  photoUpload?: PhotoUploadSpec;
}) {
  return (
    <>
      <form action={action} className="flex flex-col gap-4">
        <input name="id" type="hidden" value={id} />

        <p className="text-sm leading-6 text-muted">{INVITATION_COPY.fieldsHint}</p>

        {sections.map((section) => (
          <fieldset
            className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5"
            key={section.key}
          >
            <legend className="px-1 text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {section.title}
            </legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div
                  className={field.input.kind === "textarea" ? "sm:col-span-2" : undefined}
                  key={field.name}
                >
                  <label
                    className={
                      field.input.kind === "checkbox"
                        ? "flex items-center gap-3 text-sm font-medium text-ink"
                        : fieldLabel
                    }
                    htmlFor={inputId(field)}
                  >
                    {field.label}
                    {field.required ? (
                      <span className="ml-2 text-xs font-normal tracking-normal text-muted">
                        {INVITATION_COPY.fieldRequired}
                      </span>
                    ) : null}
                  </label>
                  <FieldControl content={content} field={field} />
                  {field.name === "mainPhoto" && photoUpload !== undefined ? (
                    <PhotoUpload upload={photoUpload} />
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="flex justify-end">
          <button className={`${primaryButton} sm:w-auto sm:px-10`} type="submit">
            {INVITATION_COPY.save}
          </button>
        </div>
      </form>
      {photoUpload === undefined ? null : (
        <form action={photoUpload.action} id={photoUpload.formId}>
          <input name="id" type="hidden" value={photoUpload.id} />
          <input name="kind" type="hidden" value="main-photo" />
        </form>
      )}
    </>
  );
}
