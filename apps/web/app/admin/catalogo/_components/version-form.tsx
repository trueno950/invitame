"use client";

import { useActionState, useState } from "react";

import { VERSION_COPY } from "../../../../lib/admin/catalog/copy.ts";
import type {
  VersionFormState,
  VersionFormValues,
} from "../../../../lib/admin/catalog/versions.ts";
import {
  errorNote,
  fieldHint,
  fieldLabel,
  primaryButton,
  textField,
} from "../../../_components/ui.ts";
import { createTemplateVersionAction } from "../actions.ts";

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
  const describedBy = (hintId: string) => (failed ? `${hintId} ${ERROR_ID}` : hintId);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="id" type="hidden" value={templateId} />
      <div>
        <label className={fieldLabel} htmlFor="version-renderer">
          {VERSION_COPY.rendererLabel}
        </label>
        <select
          aria-describedby="version-renderer-hint"
          className={textField}
          id="version-renderer"
          name="componentKey"
          onChange={(event) => setComponentKey(event.target.value)}
          value={componentKey}
        >
          {rendererKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
        <p className={fieldHint} id="version-renderer-hint">
          {VERSION_COPY.rendererHint}
        </p>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="version-schema">
          {VERSION_COPY.schemaLabel}
        </label>
        <textarea
          aria-describedby={describedBy("version-schema-hint")}
          aria-invalid={failed ? true : undefined}
          autoCapitalize="off"
          autoComplete="off"
          className={`${textField} min-h-48 font-mono text-sm`}
          id="version-schema"
          name="schema"
          onChange={(event) => setSchema(event.target.value)}
          required
          rows={10}
          spellCheck={false}
          value={schema}
        />
        <p className={fieldHint} id="version-schema-hint">
          {VERSION_COPY.jsonHint}
        </p>
      </div>
      <div>
        <label className={fieldLabel} htmlFor="version-configuration">
          {VERSION_COPY.configurationLabel}
        </label>
        <textarea
          aria-describedby={describedBy("version-configuration-hint")}
          aria-invalid={failed ? true : undefined}
          autoCapitalize="off"
          autoComplete="off"
          className={`${textField} min-h-48 font-mono text-sm`}
          id="version-configuration"
          name="configuration"
          onChange={(event) => setConfiguration(event.target.value)}
          required
          rows={10}
          spellCheck={false}
          value={configuration}
        />
        <p className={fieldHint} id="version-configuration-hint">
          {VERSION_COPY.jsonHint}
        </p>
      </div>

      <div aria-live="assertive" id={ERROR_ID} role="alert">
        {state.status === "error" ? (
          <div className={errorNote}>
            <p>{state.message}</p>
            {state.issues.length === 0 ? null : (
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">
                  {VERSION_COPY.technicalDetails}
                </summary>
                <p className="mt-2 text-muted">{VERSION_COPY.technicalDetailsNote}</p>
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

      <button className={primaryButton} disabled={pending} type="submit">
        {pending ? VERSION_COPY.submitting : VERSION_COPY.submit}
      </button>
    </form>
  );
}
