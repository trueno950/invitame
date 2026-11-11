"use client";

import { useActionState, useState } from "react";

import { VERSION_COPY } from "../../../../lib/admin/catalog/copy.ts";
import type {
  VersionFormState,
  VersionFormValues,
} from "../../../../lib/admin/catalog/versions.ts";
import { adminErrorNote } from "../../_components/admin-ui.ts";
import { createTemplateVersionAction } from "../actions.ts";
import { SelectField, SubmitFooter, TextAreaField } from "./fields.tsx";

const INITIAL_STATE: VersionFormState = { status: "idle" };
const ERROR_ID = "version-error";

interface VersionFormProperties {
  templateId: string;
  /** The `componentKey` values the API lists; the select offers nothing else. */
  rendererKeys: readonly string[];
  /** The copy of an existing version the form starts from, or empty values. */
  prefill: VersionFormValues;
}

/**
 * The create-version form (M3 T8b; S6, S8). A client component only because the API's answer stays on
 * the page: `useActionState` shows the bounded contract `issues` in a details list and keeps what was
 * typed, which a redirect would have to carry in the URL. It still posts to a server action, so it
 * works without JavaScript (the server renders the returned state). The browser never calls the API.
 */
export function VersionForm({ templateId, rendererKeys, prefill }: VersionFormProperties) {
  const [state, formAction, pending] = useActionState(createTemplateVersionAction, INITIAL_STATE);
  const initial = state.status === "error" ? state.values : prefill;
  const [componentKey, setComponentKey] = useState(initial.componentKey);
  const [schema, setSchema] = useState(initial.schema);
  const [configuration, setConfiguration] = useState(initial.configuration);
  const failed = state.status === "error";

  return (
    <form action={formAction}>
      <div className="flex flex-col gap-5 px-5 py-5">
        <input name="id" type="hidden" value={templateId} />
        <SelectField
          hint={VERSION_COPY.rendererHint}
          id="version-renderer"
          label={VERSION_COPY.rendererLabel}
          name="componentKey"
          onChange={(event) => setComponentKey(event.target.value)}
          options={rendererKeys.map((key) => ({ value: key, label: key }))}
          value={componentKey}
        />
        <div className="grid gap-5 xl:grid-cols-2">
          <TextAreaField
            code
            errorId={ERROR_ID}
            hint={VERSION_COPY.jsonHint}
            id="version-schema"
            invalid={failed}
            label={VERSION_COPY.schemaLabel}
            name="schema"
            onChange={(event) => setSchema(event.target.value)}
            required
            rows={10}
            value={schema}
          />
          <TextAreaField
            code
            errorId={ERROR_ID}
            hint={VERSION_COPY.jsonHint}
            id="version-configuration"
            invalid={failed}
            label={VERSION_COPY.configurationLabel}
            name="configuration"
            onChange={(event) => setConfiguration(event.target.value)}
            required
            rows={10}
            value={configuration}
          />
        </div>

        <div aria-live="assertive" id={ERROR_ID} role="alert">
          {state.status === "error" ? (
            <div className={adminErrorNote}>
              <p>{state.message}</p>
              {state.issues.length === 0 ? null : (
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium">
                    {VERSION_COPY.technicalDetails}
                  </summary>
                  <p className="mt-2 text-admin-muted">{VERSION_COPY.technicalDetailsNote}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs break-words">
                    {state.issues.map((issue, index) => (
                      // The API's lines have no id and may repeat; their position is their identity.
                      // biome-ignore lint/suspicious/noArrayIndexKey: a static, bounded list.
                      <li key={`${index}-${issue}`}>{issue}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <SubmitFooter
        label={VERSION_COPY.submit}
        pending={pending}
        pendingLabel={VERSION_COPY.submitting}
      />
    </form>
  );
}
