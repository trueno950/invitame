import Link from "next/link";
import type { ChangeEvent, ReactNode } from "react";

import { CATALOG_FIELD_COPY, CATALOG_TABLE_COPY } from "../../../../lib/admin/catalog/copy.ts";
import { AdminSelect } from "../../_components/admin-select.tsx";
import {
  adminButton,
  adminButtonOutline,
  adminHint,
  adminInput,
  adminLabel,
  adminTextarea,
} from "../../_components/admin-ui.ts";
import { ERROR_ID } from "./notices.tsx";

/** The padded two-column grid that holds a form card's fields; a field spans both with `sm:col-span-2`. */
export function FormBody({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">{children}</div>;
}

/** The row of buttons at the bottom of a form card. */
export function FormFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-3">{children}</div>
  );
}

/**
 * The usual footer of a form card: «Cancelar» back to `cancelHref` when there is one, then the submit
 * button. A pending submit shows `pendingLabel` and is disabled.
 */
export function SubmitFooter({
  label,
  cancelHref,
  pending = false,
  pendingLabel,
}: {
  label: string;
  cancelHref?: string | undefined;
  pending?: boolean | undefined;
  pendingLabel?: string | undefined;
}) {
  return (
    <FormFooter>
      {cancelHref === undefined ? null : (
        <Link className={adminButtonOutline} href={cancelHref}>
          {CATALOG_TABLE_COPY.cancel}
        </Link>
      )}
      <button className={adminButton} disabled={pending} type="submit">
        {pending && pendingLabel !== undefined ? pendingLabel : label}
      </button>
    </FormFooter>
  );
}

/** The key of an existing record, shown read-only because the API does not allow changing it. */
export function ReadOnlyKey({ value }: { value: string }) {
  return (
    <div>
      <p className={adminLabel}>{CATALOG_FIELD_COPY.keyLabel}</p>
      <p className="mt-1.5 flex min-h-9 items-center rounded-md border border-admin-border bg-admin-subtle px-3 py-1.5 font-mono text-sm break-all text-admin-ink">
        {value}
      </p>
      <p className={adminHint}>{CATALOG_FIELD_COPY.keyReadOnlyHint}</p>
    </div>
  );
}

interface FieldProperties {
  /** Unique within the page: the label, the hint, and the error all point at it. */
  id: string;
  name: string;
  label: string;
  hint?: string | undefined;
  defaultValue?: string | undefined;
  required?: boolean | undefined;
  /** Marks the field invalid and points it at the page's error message. */
  invalid?: boolean | undefined;
  /** The id of that error message: the page's `Notices` unless the form has its own. */
  errorId?: string | undefined;
  placeholder?: string | undefined;
  inputMode?: "decimal" | "numeric" | "text" | undefined;
}

function describedBy(
  id: string,
  hint: string | undefined,
  invalid: boolean | undefined,
  errorId = ERROR_ID,
) {
  const ids = [hint === undefined ? undefined : `${id}-hint`, invalid ? errorId : undefined];
  const joined = ids.filter((value) => value !== undefined).join(" ");
  return joined === "" ? undefined : joined;
}

/** The label above a field and its hint below; every field of the catalog forms is laid out by it. */
function FieldFrame({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string | undefined;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={adminLabel} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : (
        <p className={adminHint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** A single-line text field with a visible label and its hint, also usable without JavaScript. */
export function TextField({
  id,
  name,
  label,
  hint,
  defaultValue,
  required,
  invalid,
  errorId,
  placeholder,
  inputMode,
}: FieldProperties) {
  return (
    <FieldFrame hint={hint} id={id} label={label}>
      <input
        aria-describedby={describedBy(id, hint, invalid, errorId)}
        aria-invalid={invalid ? true : undefined}
        autoCapitalize="off"
        autoComplete="off"
        className={adminInput}
        defaultValue={defaultValue}
        id={id}
        inputMode={inputMode}
        name={name}
        placeholder={placeholder}
        required={required}
        spellCheck={false}
        type="text"
      />
    </FieldFrame>
  );
}

interface TextAreaProperties extends Omit<FieldProperties, "placeholder" | "inputMode"> {
  /** A controlled value, with `onChange`, for client forms; server forms use `defaultValue`. */
  value?: string | undefined;
  onChange?: ((event: ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
  rows?: number | undefined;
  /** For code such as JSON: a monospace font, a taller box, and no spelling or capitalization help. */
  code?: boolean | undefined;
}

export function TextAreaField({
  id,
  name,
  label,
  hint,
  defaultValue,
  required,
  invalid,
  errorId,
  value,
  onChange,
  rows = 3,
  code = false,
}: TextAreaProperties) {
  return (
    <FieldFrame hint={hint} id={id} label={label}>
      <textarea
        aria-describedby={describedBy(id, hint, invalid, errorId)}
        aria-invalid={invalid ? true : undefined}
        autoCapitalize={code ? "off" : undefined}
        autoComplete={code ? "off" : undefined}
        className={code ? `${adminTextarea} min-h-64 font-mono text-xs` : adminTextarea}
        defaultValue={defaultValue}
        id={id}
        name={name}
        onChange={onChange}
        required={required}
        rows={rows}
        spellCheck={code ? false : undefined}
        value={value}
      />
    </FieldFrame>
  );
}

interface CheckboxProperties {
  id: string;
  name: string;
  value?: string;
  label: string;
  hint?: string | undefined;
  defaultChecked: boolean;
}

/** A checkbox in its own label: the whole row is the click target. */
export function CheckboxField({
  id,
  name,
  value,
  label,
  hint,
  defaultChecked,
}: CheckboxProperties) {
  return (
    <div>
      <label className="flex min-h-8 items-center gap-2.5 text-sm text-admin-ink" htmlFor={id}>
        <input
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
          className="size-4 shrink-0 accent-admin-primary"
          defaultChecked={defaultChecked}
          id={id}
          name={name}
          type="checkbox"
          value={value}
        />
        {label}
      </label>
      {hint === undefined ? null : (
        <p className={adminHint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

interface SelectProperties {
  id: string;
  name: string;
  label: string;
  hint?: string | undefined;
  /** The starting option of a server form; a client form passes `value` and `onChange` instead. */
  defaultValue?: string | undefined;
  value?: string | undefined;
  onChange?: ((event: ChangeEvent<HTMLSelectElement>) => void) | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function SelectField({
  id,
  name,
  label,
  hint,
  defaultValue,
  value,
  onChange,
  options,
}: SelectProperties) {
  return (
    <FieldFrame hint={hint} id={id} label={label}>
      <AdminSelect
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        defaultValue={defaultValue}
        id={id}
        name={name}
        onChange={onChange}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </AdminSelect>
    </FieldFrame>
  );
}
