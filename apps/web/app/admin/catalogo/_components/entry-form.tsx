import type { CatalogErrorCode } from "../../../../lib/admin/catalog/copy.ts";
import {
  CATALOG_FIELD_COPY,
  ENTRY_COPY,
  type EntrySection,
} from "../../../../lib/admin/catalog/copy.ts";
import type { CatalogEntry } from "../../../../lib/server/admin-catalog-validators.ts";
import { fieldLabel, primaryButton } from "../../../_components/ui.ts";
import { CheckboxField, TextAreaField, TextField } from "./fields.tsx";

interface EntryFormProperties {
  section: EntrySection;
  /** The record being edited; absent on the create form. */
  entry?: CatalogEntry | undefined;
  action: (formData: FormData) => Promise<void>;
  errorCode?: CatalogErrorCode | undefined;
}

/**
 * The create and edit form of a category or a feature (they share one shape). A server component:
 * the form posts to a server action and works without JavaScript. The key is chosen at creation and
 * shown read-only afterwards, because the API does not allow changing it.
 */
export function EntryForm({ section, entry, action, errorCode }: EntryFormProperties) {
  const copy = ENTRY_COPY[section];
  const invalidKey = errorCode === "key-taken" || errorCode === "validation";
  const invalidText = errorCode === "validation";

  return (
    <form action={action} className="flex flex-col gap-5">
      {entry === undefined ? (
        <TextField
          hint={copy.keyHint}
          id="catalog-key"
          invalid={invalidKey}
          label={CATALOG_FIELD_COPY.keyLabel}
          name="key"
          placeholder={copy.keyPlaceholder}
          required
        />
      ) : (
        <>
          <input name="id" type="hidden" value={entry.id} />
          <div>
            <p className={fieldLabel}>{CATALOG_FIELD_COPY.keyLabel}</p>
            <p className="mt-1 break-all font-mono text-sm text-ink">{entry.key}</p>
            <p className="mt-1 text-sm text-muted">{CATALOG_FIELD_COPY.keyReadOnlyHint}</p>
          </div>
        </>
      )}
      <TextField
        defaultValue={entry?.name}
        hint={CATALOG_FIELD_COPY.nameHint}
        id="catalog-name"
        invalid={invalidText}
        label={CATALOG_FIELD_COPY.nameLabel}
        name="name"
        required
      />
      <TextAreaField
        defaultValue={entry?.description ?? ""}
        hint={CATALOG_FIELD_COPY.descriptionHint}
        id="catalog-description"
        invalid={invalidText}
        label={CATALOG_FIELD_COPY.descriptionLabel}
        name="description"
      />
      {entry === undefined ? null : (
        <CheckboxField
          defaultChecked={entry.isActive}
          hint={copy.activeHint}
          id="catalog-active"
          label={copy.activeLabel}
          name="isActive"
          value="true"
        />
      )}
      <button className={primaryButton} type="submit">
        {entry === undefined ? copy.createSubmit : CATALOG_FIELD_COPY.save}
      </button>
    </form>
  );
}
