"use client";

import { useEffect, useState } from "react";

import {
  type AutosaveQueueState,
  savedStatusLabel,
} from "../../../../../lib/customer/autosave-queue.ts";
import { AUTOSAVE_COPY } from "../../../../../lib/customer/copy.ts";
import { CUSTOMER_SIGN_IN_PATH } from "../../../../../lib/customer/invitations.ts";
import { focusRing } from "../../../../_components/ui.ts";

/**
 * The one status line of the editor (T2a; S4). It says whether the work is on its way («Guardando…»), already
 * stored («Guardado hace un momento», and how long ago after the first minute), or failed and can be tried again
 * («No se pudo guardar · Reintentar»). The state always travels as text, never as color or an icon alone, and it is
 * an `aria-live="polite"` region whose text changes only when the state does, so a screen reader is never told the
 * same thing twice.
 *
 * `dirty` is the moment between a keystroke and its save: the line keeps the «Guardado hace…» it already showed,
 * because that is still the truth until the new save is answered. A failed save whose reason is an ended session
 * offers the sign-in page instead of a retry that could not work; that link is a plain `<a>` so it leaves the
 * document and the browser asks before dropping the changes the queue still holds (S2). The pending changes and
 * the field values stay where the creator left them: nothing is discarded to show the error.
 */

/** How often the relative time is recomputed; the line itself is only announced when its text changes. */
const RELATIVE_TIME_TICK_MS = 1_000;

/**
 * How long a confirmation stays on screen. A stored state is good news, not something to keep reading: after this the
 * line folds away until the next change, while «Guardando…» and a failure stay until they are resolved.
 */
const SAVED_VISIBLE_MS = 4_000;

const strip =
  "flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-field bg-rose-50 px-4 py-2 text-sm leading-6 text-ink ring-1 ring-rose-100";

const actionButton = `inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-semibold text-primary transition-colors hover:bg-rose-100 ${focusRing}`;

const spinner =
  "size-3.5 shrink-0 rounded-full border-2 border-rose-100 border-t-primary motion-safe:animate-spin";

const tick =
  "grid size-4.5 shrink-0 place-items-center rounded-full bg-primary text-[10px] leading-none text-on-primary";

const warning = "size-4 shrink-0 text-primary";

/** The small triangle that marks a failure: decoration, because the line's own text already says so. */
function WarningIcon() {
  return (
    <svg aria-hidden="true" className={warning} fill="none" viewBox="0 0 16 16">
      <path
        d="M8 1.8 15 14H1L8 1.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M8 6v3.4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <circle cx="8" cy="11.6" fill="currentColor" r="0.9" />
    </svg>
  );
}

export interface SaveStatusProps {
  /** The queue's state, from `useAutosave`. */
  readonly state: AutosaveQueueState;
  /** Tries the failed channel again; the retry button calls it. */
  readonly onRetry: () => void;
  /** Extra classes of the surrounding layout, such as a sticky offset. */
  readonly className?: string;
}

export function SaveStatus({ state, onRetry, className }: SaveStatusProps) {
  // Only a stored state is described: while a change is dirty, «Todo guardado» would no longer be true, so the line
  // waits for the save that follows a moment later.
  const shownAt = state.kind === "saved" ? state.savedAt : undefined;
  const [now, setNow] = useState<number | undefined>(undefined);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (shownAt === undefined) {
      return;
    }

    setNow(Date.now());
    setSettled(false);
    const ticker = setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS);
    const fold = setTimeout(() => setSettled(true), SAVED_VISIBLE_MS);
    return () => {
      clearInterval(ticker);
      clearTimeout(fold);
    };
  }, [shownAt]);

  // Before the first tick the label is the one of a save that just happened, so a server render and the browser
  // agree on it.
  const savedLabel =
    shownAt === undefined || settled
      ? undefined
      : savedStatusLabel(shownAt, now ?? Date.parse(shownAt));
  // `dirty` with nothing stored yet and `idle` are not states the line shows, so the region stays mounted (a live
  // region created together with its text may not be announced) but empty and collapsed.
  const visible = state.kind === "saving" || savedLabel !== undefined || state.kind === "error";

  return (
    <div
      aria-atomic="true"
      aria-label={AUTOSAVE_COPY.regionLabel}
      aria-live="polite"
      className={visible ? `${strip} ${className ?? ""}` : (className ?? "")}
      role="status"
    >
      {state.kind === "saving" ? (
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <span aria-hidden="true" className={spinner} />
          {AUTOSAVE_COPY.saving}
        </p>
      ) : null}

      {savedLabel === undefined ? null : (
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <span aria-hidden="true" className={tick}>
            ✓
          </span>
          {savedLabel}
        </p>
      )}

      {state.kind === "error" ? (
        <>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <WarningIcon />
            <span className="font-semibold text-primary">{AUTOSAVE_COPY.failed}</span>
            <span className="text-muted">{`· ${state.failure.message}`}</span>
          </p>
          {state.failure.reason === "signed-out" ? (
            <a className={actionButton} href={CUSTOMER_SIGN_IN_PATH}>
              {AUTOSAVE_COPY.signIn}
            </a>
          ) : (
            <button className={actionButton} onClick={onRetry} type="button">
              {AUTOSAVE_COPY.retry}
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
