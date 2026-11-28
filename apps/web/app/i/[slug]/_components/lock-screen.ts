import { createElement, type ReactElement } from "react";

import type { LockScreenView } from "../../../../lib/public/invitation-lock.ts";
import { errorNote, primaryButton, textField } from "../../../_components/ui.ts";

/**
 * The lock screen a guest reads while the invitation stores an access code (F13; S2.13, L18.1, L18.3), following
 * `design/password-invitation/01-pantalla-con-candado.html`: one centred card with the padlock, the celebration's name,
 * the private line, the field, «Ver invitación», and the note that the guest asks whoever invited them.
 *
 * A server component with no client script: the form posts to the unlock server action, so the screen works with the
 * script off, and the refusal it comes back with is one neutral sentence the server renders above the field.
 *
 * The colors are the app's own tokens of `design/system.md` — the artboard's `--surface`, `--soft`, `--ink`, `--line`,
 * and `--accent` map to `surface`, `rose-50`, `ink`, `field-border`, and `primary`. That is the only palette a locked
 * page can paint with: a locked answer carries one display name and no renderer identity at all (L18.3), so no theme is
 * known while the screen is drawn, and the invitation's `--inv-*` tokens arrive only after it is unlocked.
 *
 * `.ts` + `createElement` rather than `.tsx`, like every renderer of this product, so `node --test` can render it and
 * read the markup a guest receives.
 */

const h = createElement;

/** The one field's id, which the label names. */
const PASSWORD_FIELD_ID = "invitacion-contrasena";

/** The padlock of the artboard, drawn as one inline glyph: decoration, so no assistive technology announces it. */
function PadlockGlyph(): ReactElement {
  return h(
    "svg",
    {
      "aria-hidden": "true",
      className: "size-6",
      fill: "none",
      focusable: "false",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 1.8,
      viewBox: "0 0 24 24",
    },
    h("rect", { height: 10, key: "body", rx: 2.4, width: 14, x: 5, y: 10.5 }),
    h("path", { d: "M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7", key: "shackle" }),
  );
}

export interface InvitationLockScreenProperties {
  /** Everything the screen says, built from the locked answer and the page's own notice (F13; L18.1, L18.3). */
  readonly view: LockScreenView;
  /** The unlock server action the form posts to; a server function, never a client script. */
  readonly action: (formData: FormData) => Promise<void>;
}

export function InvitationLockScreen({
  view,
  action,
}: InvitationLockScreenProperties): ReactElement {
  return h(
    "main",
    {
      className:
        "paper-wash relative isolate flex min-h-screen items-center justify-center px-4 py-10 text-ink sm:px-8",
    },
    h(
      "form",
      {
        action,
        className:
          "w-full max-w-sm rounded-[1.375rem] bg-surface px-6 py-8 text-center shadow-paper ring-1 ring-rose-100",
      },
      // The invitation the form unlocks: the page it belongs to, never a value the guest could point elsewhere.
      h("input", { key: "slug", name: "slug", type: "hidden", value: view.slug }),
      h(
        "div",
        {
          className:
            "mx-auto mb-2.5 grid size-14 place-items-center rounded-full bg-rose-50 text-primary ring-1 ring-rose-100",
          key: "lock",
        },
        h(PadlockGlyph, { key: "glyph" }),
      ),
      // The one fact a locked answer carries: who is celebrating, or the screen's generic line (L18.3).
      h(
        "h1",
        {
          className:
            "font-display text-[clamp(1.75rem,7vw,2.25rem)] font-semibold text-primary [text-wrap:balance]",
          key: "subject",
        },
        view.subject,
      ),
      h(
        "p",
        { className: "mt-1.5 text-sm leading-6 text-muted", key: "private" },
        view.privateLine,
      ),
      // A refusal is a sentence, announced when it arrives, and it never says which of the two refusals happened (L18.3).
      ...(view.notice === undefined
        ? []
        : [
            h(
              "p",
              { className: `${errorNote} mt-4 text-left`, key: "notice", role: "alert" },
              view.notice.message,
            ),
          ]),
      h(
        "label",
        { className: "sr-only", htmlFor: PASSWORD_FIELD_ID, key: "label" },
        view.fieldLabel,
      ),
      h("input", {
        autoComplete: "current-password",
        className: `${textField} mt-4 text-center tracking-[0.1em]`,
        id: PASSWORD_FIELD_ID,
        key: "password",
        name: "password",
        placeholder: view.fieldLabel,
        required: true,
        type: "password",
      }),
      h(
        "button",
        { className: `mt-3 w-full ${primaryButton}`, key: "submit", type: "submit" },
        view.submit,
      ),
      h("p", { className: "mt-3 text-xs leading-6 text-muted", key: "hint" }, view.hint),
    ),
  );
}
