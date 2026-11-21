import { SETTINGS_COPY } from "../../../../lib/admin/settings/copy.ts";
import type { SettingsFieldView, SettingsPageView } from "../../../../lib/admin/settings/view.ts";
import {
  adminButton,
  adminCard,
  adminHint,
  adminInput,
  adminLabel,
  adminStatusNote,
  adminTextarea,
} from "../../_components/admin-ui.ts";

/**
 * The one settings form of `/admin/configuracion` (M9 T14; S5, S8, L15): the seven settings in the four groups the
 * owner decided, each with its label, its help text, and the range the API answered, then the optional note and
 * «Guardar». It is a plain server-rendered form with a server action, so it works without JavaScript, and the browser
 * is never the guard: `min`, `max`, and `step` only help the typing, and the API checks every value again (S5).
 *
 * The page states the rule the owner chose: lowering a limit deletes, hides, and rewrites nothing — it only stops what
 * is added afterwards (S8, L15). The last update line shows the API's own instant, never a date the page invented.
 */

const NOTE_FIELD = "note";

function NumberField({ field }: { field: SettingsFieldView }) {
  const hintId = `${field.field}-hint`;

  return (
    <div>
      <label className={adminLabel} htmlFor={field.field}>
        {field.label}
      </label>
      <input
        aria-describedby={hintId}
        className={adminInput}
        defaultValue={field.value}
        id={field.field}
        inputMode="numeric"
        max={field.max}
        min={field.min}
        name={field.field}
        required
        step={1}
        type="number"
      />
      <p className={adminHint} id={hintId}>
        {field.hint} {field.boundsHint}
      </p>
    </div>
  );
}

interface SettingsFormProperties {
  page: SettingsPageView;
  /** The server action of `app/admin/configuracion/actions.ts`; the form posts to it and never to the API. */
  action: (formData: FormData) => Promise<void>;
}

export function SettingsForm({ page, action }: SettingsFormProperties) {
  return (
    <form action={action} className={adminCard}>
      <div className="flex flex-col gap-6 px-5 py-5">
        <p className={adminStatusNote}>{SETTINGS_COPY.lowerLimitNote}</p>
        {page.groups.map((group) => (
          <fieldset
            className="min-w-0 border-t border-admin-border pt-5 first:border-t-0 first:pt-0"
            key={group.title}
          >
            <legend className="text-sm font-semibold text-admin-ink">{group.title}</legend>
            <p className={adminHint}>{group.hint}</p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {group.fields.map((field) => (
                <NumberField field={field} key={field.field} />
              ))}
            </div>
          </fieldset>
        ))}
        <div className="border-t border-admin-border pt-5">
          <label className={adminLabel} htmlFor={NOTE_FIELD}>
            {SETTINGS_COPY.noteLabel}
          </label>
          <textarea
            aria-describedby={`${NOTE_FIELD}-hint`}
            className={adminTextarea}
            id={NOTE_FIELD}
            maxLength={200}
            name={NOTE_FIELD}
            rows={3}
          />
          <p className={adminHint} id={`${NOTE_FIELD}-hint`}>
            {SETTINGS_COPY.noteHint}
          </p>
          <p className={adminHint}>{SETTINGS_COPY.auditNote}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-admin-border px-5 py-3">
        <p className="text-xs text-admin-muted">
          <time dateTime={page.updatedAt === "" ? undefined : page.updatedAt}>
            {page.updatedLabel}
          </time>
        </p>
        <button className={adminButton} type="submit">
          {SETTINGS_COPY.save}
        </button>
      </div>
    </form>
  );
}
