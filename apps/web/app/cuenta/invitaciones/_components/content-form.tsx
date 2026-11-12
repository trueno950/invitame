import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import { type ContentField, fieldValue } from "../../../../lib/customer/invitations.ts";
import { fieldLabel, primaryButton, textField } from "../../../_components/ui.ts";

const checkbox = `size-5 rounded-sm border-[1.5px] border-field-border text-primary focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary`;

function inputId(field: ContentField): string {
  return `content-${field.name}`;
}

/** The `type` and `step` of a number input: whole numbers for an integer, decimals for a number. */
function numberInput(type: "integer" | "number") {
  return type === "integer"
    ? ({ type: "number", step: "1", inputMode: "numeric" } as const)
    : ({ type: "number", step: "any", inputMode: "decimal" } as const);
}

interface ContentFormProperties {
  id: string;
  fields: readonly ContentField[];
  content: Record<string, unknown>;
  action: (formData: FormData) => Promise<void>;
}

/**
 * One input per property of the pinned version's schema (M4 T5; S7). The form posts to a server action,
 * which reads the same fields again from the API's catalog and converts them, so the browser never
 * chooses which keys or types are stored. An empty input stays empty and is omitted, because a draft may
 * stay partial; a number input is a convenience here and an integer is proven on the server.
 */
export function ContentForm({ id, fields, content, action }: ContentFormProperties) {
  return (
    <form action={action} className="flex flex-col gap-5">
      <input name="id" type="hidden" value={id} />

      {fields.map((field) =>
        field.type === "boolean" ? (
          <div key={field.name}>
            <label
              className="flex items-center gap-3 text-sm font-medium text-ink"
              htmlFor={inputId(field)}
            >
              <input
                className={checkbox}
                defaultChecked={content[field.name] === true}
                id={inputId(field)}
                name={field.name}
                type="checkbox"
                value="true"
              />
              {field.label}
            </label>
          </div>
        ) : (
          <div key={field.name}>
            <label className={fieldLabel} htmlFor={inputId(field)}>
              {field.label}
            </label>
            <input
              autoComplete="off"
              className={textField}
              defaultValue={fieldValue(field, content)}
              id={inputId(field)}
              name={field.name}
              {...(field.type === "string" ? { type: "text" } : numberInput(field.type))}
            />
          </div>
        ),
      )}

      <button className={primaryButton} type="submit">
        {INVITATION_COPY.save}
      </button>
    </form>
  );
}
