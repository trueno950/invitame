"use client";

import { useRef, useState } from "react";

import { INVITATION_COPY } from "../../../../../lib/customer/copy.ts";
import { whatsappShareHref } from "../../../../../lib/customer/invitation-share.ts";
import { focusRing, textField } from "../../../../_components/ui.ts";

/**
 * The success panel of a published invitation (T1; S2.2), in the «Publicar» tab that published it: the three large
 * actions the owner needs next, all of them with the absolute address the page resolved from its own request.
 *
 * - «Copiar enlace» writes the address to the clipboard and says «¡Copiado!». A browser that refuses the clipboard — an
 *   insecure origin, a denied permission — selects the address in the read-only field instead and says so, so one
 *   keypress still copies it and the panel never claims a copy that did not happen.
 * - «Compartir por WhatsApp» is a plain link to `wa.me` with the neutral Spanish message and the address, so it opens
 *   the app on a phone and WhatsApp Web on a wide screen without any script of its own.
 * - «Ver mi invitación» opens `/i/<slug>` in a new tab.
 *
 * The read-only field stays: it is the selectable fallback, and the address is easy to copy from it by hand.
 */

/** The three actions, at the size of a form's main action and sharing one row from `sm` up. */
const shareAction = `inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-primary bg-linear-to-b from-primary from-55% to-primary-deep px-5 py-3 text-center font-sans text-sm font-medium tracking-[0.03em] text-on-primary shadow-button ring-1 ring-primary-deep transition-[transform,background-color] duration-150 ease-out-soft hover:from-primary-deep active:scale-[0.97] ${focusRing}`;

const shareSecondary = `inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-surface px-5 py-3 text-center font-sans text-sm font-medium tracking-[0.02em] text-primary ring-[1.5px] ring-field-border transition-[transform,background-color] duration-150 ease-out-soft hover:bg-rose-50 active:scale-[0.97] ${focusRing}`;

/** What the panel last confirmed: nothing yet, a real copy, or an address selected for the customer to copy. */
type Confirmation = "idle" | "copied" | "selected";

export function SharePanel({ publicUrl }: { readonly publicUrl: string }) {
  const [confirmation, setConfirmation] = useState<Confirmation>("idle");
  const field = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      const clipboard = navigator.clipboard;

      if (clipboard !== undefined) {
        await clipboard.writeText(publicUrl);
        setConfirmation("copied");
        return;
      }
    } catch {
      // A refused clipboard is not an error to show: the address is selected below, so it is still one keypress away.
    }

    const element = field.current;

    element?.focus();
    element?.select();
    setConfirmation("selected");
  };

  return (
    <section
      aria-labelledby="editor-share-heading"
      className="rounded-field bg-rose-50/70 p-4 ring-1 ring-gold/45"
    >
      <h3 className="font-display text-xl font-semibold text-ink" id="editor-share-heading">
        {INVITATION_COPY.shareHeading}
      </h3>
      <p className="mt-1 text-sm leading-6 text-muted">{INVITATION_COPY.shareHint}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button className={shareAction} onClick={() => void copy()} type="button">
          {INVITATION_COPY.copyLink}
        </button>
        <a
          className={shareAction}
          href={whatsappShareHref(publicUrl)}
          rel="noreferrer"
          target="_blank"
        >
          {INVITATION_COPY.shareWhatsApp}
        </a>
        <a className={shareSecondary} href={publicUrl} rel="noreferrer" target="_blank">
          {INVITATION_COPY.openMine}
        </a>
      </div>

      <p aria-live="polite" className="mt-2 min-h-5 text-sm leading-5 font-medium text-primary">
        {confirmation === "idle"
          ? ""
          : confirmation === "copied"
            ? INVITATION_COPY.copied
            : INVITATION_COPY.copySelected}
      </p>

      {/* The selectable fallback: a read-only field is one click and one keypress away from the clipboard. */}
      <input
        aria-label={INVITATION_COPY.publicLinkLabel}
        className={textField}
        readOnly
        ref={field}
        value={publicUrl}
      />
    </section>
  );
}
