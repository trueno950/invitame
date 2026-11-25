"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ContentCard,
  type ContentCardRow,
  cardHoldingField,
  cardStateText,
  defaultOpenCardKey,
} from "../../../../../lib/customer/content-cards.ts";
import { EDITOR_COPY } from "../../../../../lib/customer/copy.ts";
import type { FieldFocusRequest } from "../../../../../lib/customer/editor-progress.ts";
import { isAddressFieldName } from "../../../../../lib/invitation-features/place-point.ts";
import { focusRing, quietButton } from "../../../../_components/ui.ts";
import {
  AddressFieldControl,
  ContentFieldControl,
  type FieldIssues,
  type PlaceFieldHandlers,
} from "./editor-fields.tsx";

/**
 * The «Contenido» panel as a stack of cards (T2; S1-S4), following `design/editor-content-grouping/01-tarjetas-resumen.html`:
 * the template's own sections become cards, one open at a time, and a closed card keeps one line of what it already
 * holds plus its state in words.
 *
 * What the artboard asks for and this island answers:
 *
 * - every card header is a button with `aria-expanded` and `aria-controls`, and only one card is open, so the tab
 *   shows a few fields at a time instead of the whole form; the open card's panel is the only one mounted, so a closed
 *   card holds no input at all;
 * - the tab opens on the first card that still owes something, which is where the work is;
 * - a date sits beside its time and a place beside its address from `sm` up, and every row stacks on a phone;
 * - opening another card flushes the autosave queue before the panel changes, so the fields typed a moment ago are on
 *   their way and nothing typed is discarded;
 * - the footer of an open card names the next group («Siguiente: Ceremonia») and moves the focus to its header, so the
 *   reading continues where it was going;
 * - a missing-field link elsewhere in the editor (`FieldFocusRequest`) opens the card that holds the field it names and
 *   scrolls that input into view with the focus on it, so the note is also the way to the field (T1; S2.4);
 * - the state is always written out («Completo», «Falta 1», «Faltan 2», «Opcional · 1 de 2»), never only a color, and
 *   the summary and the state follow every keystroke because both are recomputed from the values in the browser.
 *
 * The card model, the pairing, the summaries, and the counts live in `lib/customer/content-cards.ts`, which is pure;
 * the field control with its inline refusal is the one the tab already used, so a refused save is named under the same
 * field with the same `aria-describedby`.
 */

const chipBase =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[0.72rem] font-semibold whitespace-nowrap ring-[1.5px]";
const chipComplete = "bg-rose-50 text-ink ring-rose-100";
const chipMissing = "bg-rose-50 text-primary-deep ring-primary";
const chipOptional = "bg-surface text-muted ring-rose-100";

/** The state of a card in words: the color is a second cue, never the only one (S4). */
function StateChip({ card }: { readonly card: ContentCard }) {
  const tone =
    card.state.kind === "missing"
      ? chipMissing
      : card.state.kind === "complete"
        ? chipComplete
        : chipOptional;

  return (
    <span className={`${chipBase} ${tone}`}>
      {card.state.kind === "complete" ? (
        <span aria-hidden="true" className="text-primary">
          ✓
        </span>
      ) : null}
      {cardStateText(card.state)}
    </span>
  );
}

/** The disclosure marker: a ring pointing right while the card is closed and up while it is open. */
function Chevron({ open }: { readonly open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-5 shrink-0 place-items-center rounded-full ${open ? "bg-primary text-on-primary" : "bg-rose-50 text-primary"}`}
    >
      <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
        <path
          d={open ? "M2.5 7.5 6 4l3.5 3.5" : "M4.5 2.5 8 6l-3.5 3.5"}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </svg>
    </span>
  );
}

/** The classes of a card header: one button either way, in its open or its closed shape. */
const headerBase = `flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors motion-reduce:transition-none ${focusRing}`;
const headerClosed = "min-h-14 rounded-panel hover:bg-rose-50";
const headerOpen = "min-h-13 rounded-t-panel bg-rose-50";

/** The fields of one row: the two that share it side by side from `sm` up, stacked on a phone. */
function CardRow({
  row,
  values,
  issues,
  idPrefix,
  onChange,
  onFlush,
  place,
}: {
  readonly row: ContentCardRow;
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: FieldIssues | undefined;
  readonly idPrefix: string;
  readonly onChange: (name: string, next: unknown) => void;
  readonly onFlush: () => void;
  readonly place: PlaceFieldHandlers;
}) {
  return (
    <div className={row.fields.length === 2 ? "grid gap-x-3 gap-y-4 sm:grid-cols-2" : undefined}>
      {row.fields.map((field) =>
        // An address field is the one field with the place search of the precise-locations slice (S1, S2); the rule is
        // the name the API also derives from the schema, never a label or a template.
        isAddressFieldName(field.name) ? (
          <AddressFieldControl
            field={field}
            idPrefix={idPrefix}
            issue={issues?.[field.name]}
            key={field.name}
            onChange={onChange}
            onFlush={onFlush}
            place={place}
            value={values[field.name]}
          />
        ) : (
          <ContentFieldControl
            field={field}
            idPrefix={idPrefix}
            issue={issues?.[field.name]}
            key={field.name}
            onChange={onChange}
            onFlush={onFlush}
            value={values[field.name]}
          />
        ),
      )}
    </div>
  );
}

/**
 * Brings a field into view inside its own scroll area. From `lg` up the form column scrolls on its own, so scrolling the
 * whole page would push the header and the tabs out of view; only that column moves then. On a phone the page itself
 * scrolls, and the field lands in the middle of the screen.
 */
function revealInScrollArea(element: HTMLElement): void {
  let area = element.parentElement;

  while (area !== null) {
    const overflow = getComputedStyle(area).overflowY;

    if ((overflow === "auto" || overflow === "scroll") && area.scrollHeight > area.clientHeight) {
      const offset =
        element.getBoundingClientRect().top -
        area.getBoundingClientRect().top -
        area.clientHeight / 3;

      area.scrollBy({ top: offset, behavior: "smooth" });
      return;
    }
    area = area.parentElement;
  }
  element.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function ContentCards({
  cards,
  values,
  issues,
  idPrefix,
  onChange,
  onFlush,
  place,
  focus,
}: {
  readonly cards: readonly ContentCard[];
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: FieldIssues | undefined;
  /** Makes the card ids of this panel unique, and the field ids with them. */
  readonly idPrefix: string;
  readonly onChange: (name: string, next: unknown) => void;
  readonly onFlush: () => void;
  /** The place search every address field of this panel uses (S1, S2). */
  readonly place: PlaceFieldHandlers;
  /** The field a missing-field link named, which this panel opens and focuses (T1; S2.4). */
  readonly focus?: FieldFocusRequest | undefined;
}) {
  const [openKey, setOpenKey] = useState<string | undefined>(() => defaultOpenCardKey(cards));
  const toggles = useRef(new Map<string, HTMLButtonElement>());
  /** The request already acted on, so a keystroke that recomputes the cards never re-focuses the same field. */
  const handled = useRef<string | undefined>(undefined);
  /** The field the next render brings on screen, which the effect below then scrolls to and focuses. */
  const [pendingField, setPendingField] = useState<string | undefined>(undefined);

  // A missing-field link opens the card that holds it. The field itself is mounted by the render this state change
  // causes, so the focus is moved by the effect below, once the card is open.
  useEffect(() => {
    if (focus === undefined) {
      return;
    }

    const request = `${focus.nonce}:${focus.field}`;

    if (handled.current === request) {
      return;
    }

    const card = cardHoldingField(cards, focus.field);

    if (card === undefined) {
      return;
    }
    handled.current = request;
    setOpenKey(card.key);
    setPendingField(focus.field);
  }, [focus, cards]);

  // The input is on screen now (the card was already open, or the render above committed it): scroll it into view and
  // focus it, so the owner types where the link promised.
  useEffect(() => {
    if (pendingField === undefined) {
      return;
    }

    const element = document.getElementById(`${idPrefix}-${pendingField}`);

    if (element === null) {
      return;
    }
    setPendingField(undefined);
    revealInScrollArea(element);
    element.focus({ preventScroll: true });
  }, [pendingField, idPrefix]);

  const open = useCallback(
    (card: ContentCard, moveFocus: boolean) => {
      setOpenKey(card.key);
      // A different card is not a save: the queue is flushed so the field typed a moment ago is on its way, and the
      // value stays in the browser's state, so nothing typed is discarded.
      onFlush();
      if (moveFocus) {
        toggles.current.get(card.key)?.focus();
      }
    },
    [onFlush],
  );

  const toggle = (card: ContentCard) => {
    if (card.key === openKey) {
      setOpenKey(undefined);
      return;
    }
    open(card, false);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-5 text-muted">{EDITOR_COPY.cards.requiredLegend}</p>
      {cards.map((card, index) => {
        const isOpen = card.key === openKey;
        const panelId = `${idPrefix}-card-${card.key}`;
        const titleId = `${panelId}-title`;
        const next = cards[index + 1];

        return (
          <section
            aria-labelledby={titleId}
            className={
              isOpen
                ? "rounded-panel bg-surface shadow-soft ring-[1.5px] ring-primary"
                : "rounded-panel bg-surface ring-[1.5px] ring-rose-100"
            }
            key={card.key}
          >
            <h3 className="m-0">
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                className={`${headerBase} ${isOpen ? headerOpen : headerClosed}`}
                id={`${panelId}-toggle`}
                onClick={() => toggle(card)}
                ref={(element) => {
                  if (element === null) {
                    toggles.current.delete(card.key);
                    return;
                  }
                  toggles.current.set(card.key, element);
                }}
                type="button"
              >
                <Chevron open={isOpen} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-ink" id={titleId}>
                    {card.title}
                  </span>
                  <span className="truncate text-xs leading-5 text-muted">{card.summary}</span>
                </span>
                <StateChip card={card} />
              </button>
            </h3>

            {/*
              The panel exists so `aria-controls` always resolves, but a closed card mounts no field: the tab shows the
              fields of one group, not every input of the template hidden behind a `display: none`.
            */}
            <div
              className={isOpen ? "flex flex-col gap-3 px-3.5 pt-2 pb-3.5" : undefined}
              hidden={!isOpen}
              id={panelId}
            >
              {isOpen ? (
                <>
                  <div className="flex flex-col gap-3">
                    {card.rows.map((row) => (
                      <CardRow
                        idPrefix={idPrefix}
                        issues={issues}
                        key={row.fields.map((field) => field.name).join("-")}
                        onChange={onChange}
                        onFlush={onFlush}
                        place={place}
                        row={row}
                        values={values}
                      />
                    ))}
                  </div>
                  {next === undefined ? null : (
                    <div className="border-t border-rose-100 pt-3 sm:flex sm:justify-end">
                      <button
                        className={`${quietButton} w-full sm:w-auto`}
                        onClick={() => open(next, true)}
                        type="button"
                      >
                        {EDITOR_COPY.cards.next(next.title)}
                      </button>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
