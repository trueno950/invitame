import type { CatalogErrorCode } from "../../../../lib/admin/catalog/copy.ts";
import {
  CATALOG_FIELD_COPY,
  ENTRY_COPY,
  type EntrySection,
} from "../../../../lib/admin/catalog/copy.ts";
import type { CatalogEntry } from "../../../../lib/server/admin-catalog-validators.ts";
import { adminCard } from "../../_components/admin-ui.ts";
import { CheckboxField, FormBody, SubmitFooter } from "./fields.tsx";
import { RecordBasicsFields } from "./record-basics.tsx";

interface EntryFormProperties {
  section: EntrySection;
  /** The record being edited; absent on the create form. */
  entry?: CatalogEntry | undefined;
  action: (formData: FormData) => Promise<void>;
  errorCode?: CatalogErrorCode | undefined;
  /** Where "Cancelar" goes: the section's list. */
  cancelHref: string;
}

/**
 * The create and edit form of a category or a feature (they share one shape). A server component:
 * the form posts to a server action and works without JavaScript. The key is chosen at creation and
 * shown read-only afterwards, because the API does not allow changing it.
 */
export function EntryForm({ section, entry, action, errorCode, cancelHref }: EntryFormProperties) {
  const copy = ENTRY_COPY[section];
  const invalidKey = errorCode === "key-taken" || errorCode === "validation";
  const invalidText = errorCode === "validation";

  return (
    <form action={action} className={adminCard}>
      <FormBody>
        <RecordBasicsFields
          invalidKey={invalidKey}
          invalidText={invalidText}
          keyHint={copy.keyHint}
          keyPlaceholder={copy.keyPlaceholder}
          record={entry}
        />
        {entry === undefined ? null : (
          <div className="sm:col-span-2">
            <CheckboxField
              defaultChecked={entry.isActive}
              hint={copy.activeHint}
              id="catalog-active"
              label={copy.activeLabel}
              name="isActive"
              value="true"
            />
          </div>
        )}
      </FormBody>
      <SubmitFooter
        cancelHref={cancelHref}
        label={entry === undefined ? copy.createSubmit : CATALOG_FIELD_COPY.save}
      />
    </form>
  );
}
