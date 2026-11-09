import { fieldHint, fieldLabel, textField } from "../../../_components/ui.ts";
import { ERROR_ID } from "./notices.tsx";

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
  placeholder?: string | undefined;
  inputMode?: "decimal" | "text" | undefined;
}

function describedBy(id: string, hint: string | undefined, invalid: boolean | undefined) {
  const ids = [hint === undefined ? undefined : `${id}-hint`, invalid ? ERROR_ID : undefined];
  const joined = ids.filter((value) => value !== undefined).join(" ");
  return joined === "" ? undefined : joined;
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
  placeholder,
  inputMode,
}: FieldProperties) {
  return (
    <div>
      <label className={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={describedBy(id, hint, invalid)}
        aria-invalid={invalid ? true : undefined}
        autoCapitalize="off"
        autoComplete="off"
        className={textField}
        defaultValue={defaultValue}
        id={id}
        inputMode={inputMode}
        name={name}
        placeholder={placeholder}
        required={required}
        spellCheck={false}
        type="text"
      />
      {hint === undefined ? null : (
        <p className={fieldHint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  id,
  name,
  label,
  hint,
  defaultValue,
  invalid,
}: Omit<FieldProperties, "required" | "placeholder" | "inputMode">) {
  return (
    <div>
      <label className={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <textarea
        aria-describedby={describedBy(id, hint, invalid)}
        aria-invalid={invalid ? true : undefined}
        className={`${textField} min-h-28`}
        defaultValue={defaultValue}
        id={id}
        name={name}
        rows={3}
      />
      {hint === undefined ? null : (
        <p className={fieldHint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
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
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink" htmlFor={id}>
        <input
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
          className="size-5 accent-primary"
          defaultChecked={defaultChecked}
          id={id}
          name={name}
          type="checkbox"
          value={value}
        />
        {label}
      </label>
      {hint === undefined ? null : (
        <p className={fieldHint} id={`${id}-hint`}>
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
  defaultValue: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function SelectField({ id, name, label, hint, defaultValue, options }: SelectProperties) {
  return (
    <div>
      <label className={fieldLabel} htmlFor={id}>
        {label}
      </label>
      <select
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className={textField}
        defaultValue={defaultValue}
        id={id}
        name={name}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint === undefined ? null : (
        <p className={fieldHint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
