import type { ReactNode } from "react";

import { PASSWORD_COPY } from "../../../../../lib/customer/copy.ts";
import {
  INVITATION_PASSWORD_MAX_LENGTH,
  INVITATION_PASSWORD_MIN_LENGTH,
  type PasswordProtectionView,
} from "../../../../../lib/customer/password-protection.ts";
import {
  fieldHint,
  fieldLabel,
  primaryButton,
  quietButton,
  textField,
} from "../../../../_components/ui.ts";
import { GuardedForm } from "../../_components/autosave/navigation-guard.tsx";

/**
 * The «Pedir contraseña» block of the «Publicar» tab (F13; S2.13, L18.1, L18.5), following
 * `design/password-invitation/03-ajuste-anfitrion.html` in the app's own tokens: the switch, the field with its rule, the
 * state in words, the two actions, and the ready-to-share message the owner reads once.
 *
 * A server component with two plain forms, so it works with the script off: the artboard's switch is the pair of actions
 * itself — an invitation with no code offers the field and «Guardar contraseña», and an invitation that stores one offers
 * «Contraseña activa» with «Cambiar contraseña» (a `<details>` the browser opens without any script) and «Quitar
 * contraseña». The state is a sentence, never a hue, and the field states the rule it enforces.
 *
 * Nothing here can show the code back: the API answers whether one is set and never the code, so the only moment the
 * value is on screen is the ready-to-share message, rendered once from the render the save landed on.
 */

/** The one field id, which the labels of both forms name. */
const PASSWORD_FIELD_ID = "editor-password";

/** The field and the button of one save: the first code, or the one that replaces it. */
function PasswordSaveForm({
  action,
  invitationId,
  submitLabel,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly invitationId: string;
  readonly submitLabel: string;
}): ReactNode {
  return (
    // The browser posts this form itself (`native`): the save answers with the ready-to-share line, and the page the
    // browser lands on has to be the only render, or the render this action answers with takes the line first and the
    // owner never sees it.
    <GuardedForm action={action} className="flex flex-col gap-2" native section="publicar">
      <input name="id" type="hidden" value={invitationId} />
      <label className={fieldLabel} htmlFor={PASSWORD_FIELD_ID}>
        {PASSWORD_COPY.label}
      </label>
      <input
        autoComplete="new-password"
        className={textField}
        id={PASSWORD_FIELD_ID}
        maxLength={INVITATION_PASSWORD_MAX_LENGTH}
        minLength={INVITATION_PASSWORD_MIN_LENGTH}
        name="password"
        required
        type="password"
      />
      <p className={fieldHint}>{PASSWORD_COPY.hint}</p>
      <button className={`${primaryButton} w-full sm:w-auto`} type="submit">
        {submitLabel}
      </button>
    </GuardedForm>
  );
}

export function PasswordField({
  invitationId,
  view,
  saveAction,
  removeAction,
  shareMessage,
}: {
  readonly invitationId: string;
  readonly view: PasswordProtectionView;
  readonly saveAction: (formData: FormData) => Promise<void>;
  readonly removeAction: (formData: FormData) => Promise<void>;
  /** The ready-to-share line of the code that was just saved (L18.1); absent on every other render. */
  readonly shareMessage?: string;
}) {
  return (
    <section
      aria-labelledby="editor-password-heading"
      className="flex flex-col gap-2 rounded-field bg-rose-50/70 p-4 ring-1 ring-rose-100"
    >
      <h3 className="font-display text-xl font-semibold text-ink" id="editor-password-heading">
        {PASSWORD_COPY.heading}
      </h3>
      <p className="text-sm leading-6 text-muted">{PASSWORD_COPY.lead}</p>

      <div className="mt-1 flex flex-col gap-3 rounded-field bg-surface p-4 ring-1 ring-rose-100">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={fieldLabel}>{PASSWORD_COPY.switchLabel}</p>
          {/* The state in words, so it reads without seeing a color (design/system.md). */}
          <p className="text-sm font-semibold text-ink">
            {view.protected ? PASSWORD_COPY.active : PASSWORD_COPY.off}
          </p>
        </div>

        {shareMessage === undefined ? null : (
          <div className="rounded-field bg-rose-50 px-3 py-2 ring-1 ring-rose-100">
            <label className={fieldLabel} htmlFor="editor-password-share">
              {PASSWORD_COPY.shareLead}
            </label>
            {/* Read-only and one click to select, so the owner can copy the whole line with its code. */}
            <input
              className={`${textField} mt-1 break-all`}
              id="editor-password-share"
              readOnly
              value={shareMessage}
            />
          </div>
        )}

        {view.show ? null : <p className={fieldHint}>{PASSWORD_COPY.notIncluded}</p>}

        {view.protected ? (
          <>
            <p className={fieldHint}>{PASSWORD_COPY.activeNote}</p>
            {view.show ? (
              // A native disclosure, so replacing the code needs no script either.
              <details className="rounded-field bg-rose-50/70 px-3 py-2 ring-1 ring-rose-100">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  {PASSWORD_COPY.change}
                </summary>
                <div className="mt-2 flex flex-col gap-2">
                  <PasswordSaveForm
                    action={saveAction}
                    invitationId={invitationId}
                    submitLabel={PASSWORD_COPY.save}
                  />
                </div>{" "}
              </details>
            ) : null}
            <p className={fieldHint}>{PASSWORD_COPY.changeNote}</p>
            <GuardedForm action={removeAction} native section="publicar">
              <input name="id" type="hidden" value={invitationId} />
              <button className={`${quietButton} w-full sm:w-auto`} type="submit">
                {PASSWORD_COPY.remove}
              </button>
            </GuardedForm>
          </>
        ) : (
          <PasswordSaveForm
            action={saveAction}
            invitationId={invitationId}
            submitLabel={PASSWORD_COPY.save}
          />
        )}
      </div>
    </section>
  );
}
