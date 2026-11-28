"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  ADDRESS_SLUG_MAX_LENGTH,
  type AddressCheckState,
  type AddressViewInput,
  addressDisplayState,
  addressHint,
  addressLine,
  addressSaveHint,
  addressStateLabel,
  canSaveAddress,
  normalizeAddressInput,
  renamesRemainingLabel,
} from "../../../../../lib/customer/address.ts";
import { ADDRESS_COPY } from "../../../../../lib/customer/copy.ts";
import { checkAddressAction, saveAddressAction } from "../../slug-actions.ts";
import { fieldHint, primaryButton, statusNote } from "../../../../_components/ui.ts";

/**
 * The address block of the «Publicar» tab (F11; S2.11, L15.4), following
 * `design/custom-address/01-campo-libre.html`: the real prefix, the field, the state under it, the rule, «Guardar
 * dirección», the note that the previous link keeps working, and how many renames are left.
 *
 * Everything the block knows comes from the API: the state is checked on the server after the debounce (never per
 * keystroke, and never decided here), the save is a server action, and the answer says what was stored. The block keeps
 * the address it last saved, so a check of that address is not asked again, and it renders the state in words — never
 * color alone — so the state is readable without seeing the hue.
 *
 * «Guardar dirección» is offered only for the address the server answered ✓ Disponible for, because a button that
 * offers a save it has to refuse is a button that lies (L15.4). The disabled state is the accessible one — a real
 * `disabled` button, out of the tab order, with a sentence that says why — and the server action refuses anything else
 * even if the button is reached some other way.
 */

/** How long the field rests before the address is checked: long enough that typing does not spend the limit (L15.3). */
const CHECK_DEBOUNCE_MS = 450;

/** The save while it is allowed: the block's one main action, in the app theme's wine (`design/system.md`). */
const saveButton = `${primaryButton} w-full sm:w-auto`;

/**
 * The same pill while it is not available: the pale `rose-100` wash with `ink` text, so it reads as the same control at
 * rest and never as the page's action (F11; L15.4, `design/system.md` tokens). The label says what can be done instead.
 */
const saveButtonDisabled =
  "inline-flex min-h-13 w-full cursor-not-allowed items-center justify-center rounded-full bg-rose-100 px-7 py-3 font-sans text-base font-medium tracking-[0.03em] text-ink ring-1 ring-rose-100 sm:w-auto";

/** The id of the sentence that says why the save is off, read by the button's own description. */
const SAVE_HINT_ID = "editor-address-save-hint";

export function AddressField({
  invitationId,
  prefix,
  renamesRemaining,
  slug,
}: {
  readonly invitationId: string;
  /** `invitame.mx/i/`, built from the deployment's own public origin (L15.4). */
  readonly prefix: string;
  /** How many renames the invitation still has, from the API's own read (L15.2). */
  readonly renamesRemaining: number;
  readonly slug: string;
}) {
  const [value, setValue] = useState(slug);
  const [savedSlug, setSavedSlug] = useState(slug);
  const [remaining, setRemaining] = useState(renamesRemaining);
  const [state, setState] = useState<AddressCheckState>("idle");
  /** The address the last answer belongs to, so a stale answer never describes a newer value (L15.4). */
  const [checked, setChecked] = useState("");
  const [message, setMessage] = useState<string>("");
  const [saving, setSaving] = useState(false);
  /** The server components around this block — the share panel above all — reread the invitation after a save. */
  const router = useRouter();
  /** The answer of the last finished check, so a stale answer never overwrites a newer one. */
  const answered = useRef(0);

  const normalized = normalizeAddressInput(value);
  const unchanged = normalized === savedSlug;

  useEffect(() => {
    if (unchanged || normalized === "") {
      setState("idle");

      return;
    }

    const asked = answered.current + 1;
    answered.current = asked;
    const timer = setTimeout(() => {
      void checkAddressAction(invitationId, normalized)
        .then((answer) => {
          if (answered.current === asked) {
            setState(answer.state);
            setChecked(normalized);
          }
        })
        .catch(() => {
          if (answered.current === asked) {
            setState("unavailable");
            setChecked(normalized);
          }
        });
    }, CHECK_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [invitationId, normalized, unchanged]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const result = await saveAddressAction(invitationId, normalized);

      if (result.ok) {
        setSavedSlug(result.slug);
        setValue(result.slug);
        setRemaining(result.renamesRemaining);
        setState("idle");
        setChecked("");
        setMessage(ADDRESS_COPY.saved);
        // The page's own reads answer the new address, so the share panel and the link beside it show it at once
        // (F11; L15.4).
        router.refresh();
        return;
      }
      setMessage(result.message);
    } catch {
      setMessage(ADDRESS_COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  // One view of the block's own facts, so the field, the line under the button, and the button itself never disagree.
  const view: AddressViewInput = { checked, remaining, savedSlug, state, value };
  const shownState = addressDisplayState(view);
  const stateLabel = addressStateLabel(shownState);
  const saveHint = addressSaveHint(view);
  /** The save is offered only for the address the server answered ✓ Disponible for (F11; L15.4). */
  const canSave = canSaveAddress(view);
  // A field the owner cannot change is a field with nothing left to say: the block states why instead of offering it.
  const locked = remaining <= 0 && unchanged;

  return (
    <section
      aria-labelledby="editor-address-heading"
      className="flex flex-col gap-2 rounded-field bg-rose-50/70 p-4 ring-1 ring-rose-100"
    >
      <h3 className="font-display text-xl font-semibold text-ink" id="editor-address-heading">
        {ADDRESS_COPY.heading}
      </h3>
      <p className="text-sm leading-6 text-muted">{ADDRESS_COPY.lead}</p>

      <label className="mt-1 text-sm font-medium text-ink" htmlFor="editor-address">
        {ADDRESS_COPY.label}
      </label>
      <div className="flex items-center overflow-hidden rounded-field border-[1.5px] border-field-border bg-surface focus-within:outline-2">
        <span className="pl-3.5 text-sm whitespace-nowrap text-muted">{prefix}</span>
        <input
          autoComplete="off"
          className="min-h-11 w-full flex-1 border-0 bg-transparent px-3.5 text-sm text-ink outline-none"
          id="editor-address"
          maxLength={ADDRESS_SLUG_MAX_LENGTH}
          name="slug"
          onChange={(event) => {
            setValue(event.target.value);
            setMessage("");
          }}
          readOnly={saving}
          spellCheck={false}
          type="text"
          value={value}
        />
      </div>

      {/* Text, never color alone: the state is a sentence an owner can read (L15.4). */}
      <p
        aria-live="polite"
        className={`min-h-5 text-sm font-semibold ${
          shownState === "available" ? "text-primary" : "text-muted"
        }`}
      >
        {stateLabel}
      </p>
      <p className={fieldHint}>{addressHint()}</p>

      {locked ? (
        <p className="text-sm leading-6 text-muted">{ADDRESS_COPY.noRenamesLeft}</p>
      ) : (
        <>
          <button
            aria-describedby={SAVE_HINT_ID}
            className={canSave ? saveButton : saveButtonDisabled}
            disabled={!canSave || saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? ADDRESS_COPY.saving : ADDRESS_COPY.save}
          </button>
          {/* Why the button is off, when the state above does not already say it; a description, not a bubble. */}
          <p className={saveHint === "" ? "sr-only" : fieldHint} id={SAVE_HINT_ID}>
            {saveHint}
          </p>
        </>
      )}

      {/*
        The answer of the save, announced politely. The live region is always in the document so an answer is announced
        when it arrives, and it draws nothing while there is nothing to say (L15.4).
      */}
      <p aria-live="polite" className={message === "" ? "sr-only" : statusNote}>
        {message}
      </p>

      {/* The address the owner is looking at, in full: the one the invitation has, or the one it will have (L15.4). */}
      <p className="text-sm leading-6 break-all text-muted">{addressLine(view, prefix)}</p>
      <p className="text-sm leading-6 text-muted">{renamesRemainingLabel(remaining)}</p>
      <p className="rounded-field bg-surface px-3 py-2 text-sm leading-6 text-muted">
        {ADDRESS_COPY.previousLinkNote}
      </p>
    </section>
  );
}
