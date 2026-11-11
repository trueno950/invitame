import { CATALOG_FIELD_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { ReadOnlyKey, TextAreaField, TextField } from "./fields.tsx";

interface RecordBasicsProperties {
  /** The stored record on an edit form; absent on a create form. */
  record?: { id: string; key: string; name: string; description: string | null } | undefined;
  /** The key field's hint and example, which name the area (`baby-shower`, `premium`…). */
  keyHint: string;
  keyPlaceholder: string;
  /** Marks the key invalid (it is taken, or the input was refused). */
  invalidKey?: boolean | undefined;
  /** Marks the name and the description invalid. */
  invalidText?: boolean | undefined;
}

/**
 * The fields every catalog record shares, inside a `FormBody` grid: the key (chosen at creation, then
 * read-only with the record's hidden id, because the API does not allow changing it), the name, and
 * the description across both columns. Area-specific fields follow as siblings.
 */
export function RecordBasicsFields({
  record,
  keyHint,
  keyPlaceholder,
  invalidKey,
  invalidText,
}: RecordBasicsProperties) {
  return (
    <>
      {record === undefined ? (
        <TextField
          hint={keyHint}
          id="catalog-key"
          invalid={invalidKey}
          label={CATALOG_FIELD_COPY.keyLabel}
          name="key"
          placeholder={keyPlaceholder}
          required
        />
      ) : (
        <>
          <input name="id" type="hidden" value={record.id} />
          <ReadOnlyKey value={record.key} />
        </>
      )}
      <TextField
        defaultValue={record?.name}
        hint={CATALOG_FIELD_COPY.nameHint}
        id="catalog-name"
        invalid={invalidText}
        label={CATALOG_FIELD_COPY.nameLabel}
        name="name"
        required
      />
      <div className="sm:col-span-2">
        <TextAreaField
          defaultValue={record?.description ?? ""}
          hint={CATALOG_FIELD_COPY.descriptionHint}
          id="catalog-description"
          invalid={invalidText}
          label={CATALOG_FIELD_COPY.descriptionLabel}
          name="description"
        />
      </div>
    </>
  );
}
