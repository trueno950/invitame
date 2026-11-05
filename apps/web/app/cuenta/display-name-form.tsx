"use client";

import { useActionState, useId, useState } from "react";

import type { DisplayNameFormState } from "../../lib/customer/account.ts";
import { ACCOUNT_COPY } from "../../lib/customer/copy.ts";
import {
  errorNote,
  fieldHint,
  fieldLabel,
  quietButton,
  statusNote,
  textField,
} from "../_components/ui.ts";
import { updateDisplayName } from "./actions.ts";

const INITIAL_STATE: DisplayNameFormState = { status: "idle" };

interface DisplayNameFormProperties {
  displayName: string | null;
}

/** Changes or clears the display name through a server action; an empty field clears it. */
export function DisplayNameForm({ displayName }: DisplayNameFormProperties) {
  const [value, setValue] = useState(displayName ?? "");
  const [state, formAction, pending] = useActionState(updateDisplayName, INITIAL_STATE);
  const ids = useId();
  const fieldId = `${ids}-name`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className={fieldLabel} htmlFor={fieldId}>
          {ACCOUNT_COPY.nameLabel}
        </label>
        <input
          aria-describedby={failed ? `${hintId} ${errorId}` : hintId}
          aria-invalid={failed ? true : undefined}
          autoComplete="name"
          className={textField}
          id={fieldId}
          name="displayName"
          onChange={(event) => setValue(event.target.value)}
          type="text"
          value={value}
        />
        <p className={fieldHint} id={hintId}>
          {ACCOUNT_COPY.nameHint}
        </p>
      </div>

      <div>
        <button className={quietButton} disabled={pending} type="submit">
          {pending ? ACCOUNT_COPY.saving : ACCOUNT_COPY.saveName}
        </button>
      </div>

      <div aria-live="polite" role="status">
        {state.status === "saved" ? <p className={statusNote}>{state.message}</p> : null}
      </div>
      <div aria-live="assertive" id={errorId} role="alert">
        {state.status === "error" ? <p className={errorNote}>{state.message}</p> : null}
      </div>
    </form>
  );
}
