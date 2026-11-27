"use client";

import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  FEATURE_COPY,
  INVITATION_COPY,
  PLACE_PICKER_COPY,
  RSVP_COPY,
} from "../../../../../lib/customer/copy.ts";
import type { FeatureSettingsView } from "../../../../../lib/customer/invitation-features.ts";
import { timeZoneLabel } from "../../../../../lib/customer/invitation-features.ts";
import type { RsvpSettingsView } from "../../../../../lib/customer/invitation-rsvp.ts";
import type { ContentField } from "../../../../../lib/customer/invitations.ts";
import {
  addGiftRegistryStore,
  canAddGiftRegistryStore,
  type GiftRegistryDraft,
  type GiftRegistryDraftStore,
  isGiftRegistryStoreIncomplete,
  moveGiftRegistryStore,
  removeGiftRegistryStore,
  setGiftRegistryEnvelopes,
  setGiftRegistryNote,
  setGiftRegistryTransfer,
  updateGiftRegistryStore,
} from "../../../../../lib/customer/gift-registry.ts";
import {
  addItineraryMoment,
  canAddItineraryMoment,
  type ItineraryDraftMoment,
  isItineraryMomentIncomplete,
  moveItineraryMoment,
  removeItineraryMoment,
  updateItineraryMoment,
} from "../../../../../lib/customer/itinerary.ts";
import {
  addLodgingHotel,
  canAddLodgingHotel,
  type LodgingDraft,
  type LodgingDraftHotel,
  isLodgingHotelIncomplete,
  moveLodgingHotel,
  removeLodgingHotel,
  setLodgingTransport,
  updateLodgingHotel,
} from "../../../../../lib/customer/lodging.ts";
import {
  type LivestreamDraft,
  livestreamUrlIssue,
  setLivestreamNote,
  setLivestreamUrl,
} from "../../../../../lib/customer/livestream.ts";
import type { RemindersDraft } from "../../../../../lib/customer/reminders.ts";
import {
  activeOptionId,
  blurredPicker,
  dismissedSuggestions,
  keyAction,
  notedPicker,
  openedSuggestions,
  optionId,
  PLACE_SEARCH_DEBOUNCE_MS,
  type PlacePickerState,
  placeNoteKind,
  placeSearchRequest,
  resultMoved,
  searchAnswered,
  searchFailed,
  searchIdle,
  searchStarted,
  suggestionsPicker,
} from "../../../../../lib/customer/place-picker.ts";
import type {
  PlaceSearchResult,
  PlaceWriteResult,
} from "../../../../../lib/customer/place-search.ts";
import {
  type PlacePoint,
  type StoredPlaces,
  storedPlaceOf,
} from "../../../../../lib/invitation-features/place-point.ts";
import {
  fieldHint,
  fieldLabel,
  quietButton,
  textButton,
  textField,
} from "../../../../_components/ui.ts";
import { GuardedLink } from "../../_components/autosave/navigation-guard.tsx";

/**
 * The fields of the invitation editor (T2c; S2, S3, S4). Each one is bound to the value the editor holds in the
 * browser and reports every change to the autosave queue, so nothing is ever submitted as a form: the value the owner
 * typed stays on screen while its own save is on its way, and a field the API refused is named under that field.
 *
 * The three groups are the ones the artboard puts in its tabs — the template's own content sections, the invitation's
 * features, and its attendance settings — and all of them share one convention: `onChange` stores the value and queues
 * the save, `onBlur` flushes it at once, and a refusal comes back as the message the action already wrote in Spanish.
 */

/** The message a refused save left for one field, or nothing when that field was accepted. */
export type FieldIssues = Readonly<Record<string, string>>;

const checkbox = `size-5 rounded-sm border-[1.5px] border-field-border text-primary focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary`;

const multilineField = `${textField} resize-y leading-6`;

const refusal = "mt-1.5 text-sm leading-6 font-medium text-primary-deep";

/** The error of one field, under it and named by the field's own `aria-describedby`. */
function FieldRefusal({ id, message }: { id: string; message: string | undefined }) {
  return message === undefined ? null : (
    <p className={refusal} id={id}>
      {message}
    </p>
  );
}

/** The text a control shows for a value the editor holds; an emptied field is an empty control. */
function textOf(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/** One input of the template's content, with the native control its own schema property asks for (S11). */
export function ContentFieldControl({
  field,
  value,
  issue,
  idPrefix,
  onChange,
  onFlush,
}: {
  field: ContentField;
  value: unknown;
  issue: string | undefined;
  idPrefix: string;
  onChange: (name: string, next: unknown) => void;
  onFlush: () => void;
}) {
  const id = `${idPrefix}-${field.name}`;
  const messageId = `${id}-error`;
  const text = textOf(value);
  const shared = {
    "aria-describedby": issue === undefined ? undefined : messageId,
    "aria-invalid": issue === undefined ? undefined : true,
    id,
    name: field.name,
    onBlur: onFlush,
  } as const;
  const { input } = field;

  const control = (() => {
    switch (input.kind) {
      case "checkbox":
        return (
          <input
            aria-describedby={shared["aria-describedby"]}
            aria-invalid={shared["aria-invalid"]}
            checked={value === true}
            className={checkbox}
            id={id}
            name={field.name}
            onBlur={onFlush}
            onChange={(event) => onChange(field.name, event.target.checked)}
            type="checkbox"
          />
        );
      case "textarea":
        return (
          <textarea
            {...shared}
            className={multilineField}
            maxLength={input.maxLength}
            onChange={(event) => onChange(field.name, event.target.value)}
            rows={input.rows}
            value={text}
          />
        );
      case "number":
        return (
          <input
            {...shared}
            className={textField}
            inputMode={input.step === "1" ? "numeric" : "decimal"}
            max={input.max}
            min={input.min}
            onChange={(event) => onChange(field.name, event.target.value)}
            step={input.step}
            type="number"
            value={text}
          />
        );
      case "date":
        return (
          <input
            {...shared}
            className={textField}
            onChange={(event) => onChange(field.name, event.target.value)}
            type="date"
            value={text}
          />
        );
      case "time":
        return (
          <input
            {...shared}
            className={textField}
            onChange={(event) => onChange(field.name, event.target.value)}
            type="time"
            value={text}
          />
        );
      case "url":
        return (
          <input
            {...shared}
            autoComplete="url"
            className={textField}
            inputMode="url"
            maxLength={input.maxLength}
            onChange={(event) => onChange(field.name, event.target.value)}
            placeholder={INVITATION_COPY.urlPlaceholder}
            type="url"
            value={text}
          />
        );
      case "text":
        return (
          <input
            {...shared}
            autoComplete="off"
            className={textField}
            maxLength={input.maxLength}
            onChange={(event) => onChange(field.name, event.target.value)}
            type="text"
            value={text}
          />
        );
    }
  })();

  return (
    <div className={input.kind === "textarea" ? "sm:col-span-2" : undefined}>
      <label
        className={
          input.kind === "checkbox"
            ? "flex items-center gap-3 text-sm font-medium text-ink"
            : fieldLabel
        }
        htmlFor={id}
      >
        {field.label}
        {field.required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
            <span className="sr-only"> ({INVITATION_COPY.fieldRequired})</span>
          </>
        ) : null}
      </label>
      {control}
      <FieldRefusal id={messageId} message={issue} />
    </div>
  );
}

/** The pin that marks a confirmed location: the shape, not the color alone, says the address is precise. */
function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 9.8 8 14 8 14Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="6.5" r="1.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const optionBase =
  "flex min-h-11 w-full cursor-pointer items-center px-3.5 text-left text-sm leading-5 text-ink";
const optionActive = "bg-rose-50";
const listBox =
  "absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-field border-[1.5px] border-field-border bg-surface py-1 shadow-soft";

/** The pinned note: the pin and the sentence, announced politely when the address becomes precise. */
const confirmedNote = "mt-2 flex items-center gap-1.5 text-sm font-medium text-primary";
const searchNoteText = "mt-1.5 text-sm leading-6 text-muted";

/** What the address combobox needs from the editor: the stored points, the search, and the write (S1, S2). */
export interface PlaceFieldHandlers {
  /** Every stored point of the invitation, as the owner read answered them. */
  readonly places: StoredPlaces;
  /** The server action that asks the API for the places a text matches. */
  readonly onSearch: (query: string) => Promise<PlaceSearchResult>;
  /** The server action that stores the point of one field, answering the invitation's stored points. */
  readonly onSavePlace: (field: string, point: PlacePoint) => Promise<PlaceWriteResult>;
}

/**
 * One address field of the template, with the place search of the precise-locations slice (S1, S2). Typing asks the
 * API — debounced, and only from three characters on — and a listbox of at most five real places opens under the
 * field with the full ARIA combobox semantics: arrows move, Enter chooses, Escape closes, a click chooses, and the
 * active option is named by `aria-activedescendant` so a screen reader reads it while the focus never leaves the
 * input. Choosing a suggestion writes its label through the same autosave every field uses and stores its
 * coordinates, so the guest's links and map use the precise point instead of the words.
 *
 * Free typing always works: a failed or limited search is one quiet note, the address the owner wrote is kept, and
 * the field only says «Elige una sugerencia para ubicarla con precisión» until a stored label matches its text.
 */
export function AddressFieldControl({
  field,
  value,
  issue,
  idPrefix,
  onChange,
  onFlush,
  place,
}: {
  field: ContentField;
  value: unknown;
  issue: string | undefined;
  idPrefix: string;
  onChange: (name: string, next: unknown) => void;
  onFlush: () => void;
  place: PlaceFieldHandlers;
}) {
  const { places, onSearch, onSavePlace } = place;
  const id = `${idPrefix}-${field.name}`;
  const listId = `${id}-listbox`;
  const noteId = `${id}-place-note`;
  const searchNoteId = `${id}-place-search`;
  const messageId = `${id}-error`;
  const text = textOf(value);
  const [picker, setPicker] = useState<PlacePickerState>(suggestionsPicker);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The note belongs to the state that answers one text, so an answer for other words never repaints it.
  const note = picker.note;
  const kind = placeNoteKind(storedPlaceOf(places, field.name), text);

  const stopTimer = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  // A field unmounted with a keystroke still pending never asks: the debounce dies with the field.
  useEffect(() => stopTimer, [stopTimer]);

  const ask = useCallback(
    async (query: string, asked: string) => {
      setPicker(searchStarted(asked));
      try {
        const result = await onSearch(query);
        // The state answers one text, so a slow answer for words the field no longer holds — list and note both —
        // leaves what the owner reads untouched.
        setPicker((current) =>
          result.ok
            ? searchAnswered(current, asked, result.suggestions)
            : searchFailed(current, asked, result.failure),
        );
      } catch {
        setPicker((current) => searchFailed(current, asked, "unavailable"));
      }
    },
    [onSearch],
  );

  const change = (next: string) => {
    onChange(field.name, next);
    stopTimer();
    // A changed text closes the list at once: a suggestion of other words is never shown under these.
    setPicker(searchIdle(next));
    const request = placeSearchRequest(next);

    if (request.kind === "wait") {
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void ask(request.query, next);
    }, PLACE_SEARCH_DEBOUNCE_MS);
  };

  const choose = (suggestion: PlacePoint) => {
    stopTimer();
    // The label travels through the autosave every field uses, so the content is written the moment it is chosen.
    onChange(field.name, suggestion.label);
    onFlush();
    setPicker(suggestionsPicker);
    void onSavePlace(field.name, suggestion)
      .then((result) => {
        if (!result.ok) {
          setPicker((current) => notedPicker(current, result.message));
        }
      })
      .catch(() => setPicker((current) => notedPicker(current, PLACE_PICKER_COPY.saveFailed)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = keyAction(picker, event.key);

    switch (action.kind) {
      case "open":
        event.preventDefault();
        setPicker((current) => openedSuggestions(current));
        return;
      case "move":
        event.preventDefault();
        setPicker((current) => resultMoved(current, action.delta));
        return;
      case "choose": {
        const chosen = picker.suggestions[action.index];

        if (chosen !== undefined) {
          event.preventDefault();
          choose(chosen);
        }
        return;
      }
      case "dismiss":
        event.preventDefault();
        setPicker((current) => dismissedSuggestions(current));
        return;
      default:
        return;
    }
  };

  const describedBy = [
    noteId,
    note === undefined ? undefined : searchNoteId,
    issue === undefined ? undefined : messageId,
  ]
    .filter((part) => part !== undefined)
    .join(" ");

  return (
    <div className={field.input.kind === "textarea" ? "sm:col-span-2" : undefined}>
      <label className={fieldLabel} htmlFor={id}>
        {field.label}
        {field.required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-primary">
              *
            </span>
            <span className="sr-only"> ({INVITATION_COPY.fieldRequired})</span>
          </>
        ) : null}
      </label>
      <div className="relative">
        <input
          aria-activedescendant={activeOptionId(picker, id)}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={describedBy}
          aria-expanded={picker.open}
          aria-invalid={issue === undefined ? undefined : true}
          autoComplete="off"
          className={textField}
          id={id}
          maxLength={
            // The declared bound of the schema, whatever control its type asks for: the combobox is one line, but a
            // field declared wider than a text input is still held to its own width before the API refuses it.
            "maxLength" in field.input ? field.input.maxLength : undefined
          }
          name={field.name}
          onBlur={() => {
            onFlush();
            // The focus is what a search answers: a keystroke still waiting is dropped, and an answer for a field the
            // owner left opens no list under it.
            stopTimer();
            setPicker(blurredPicker);
          }}
          onChange={(event) => change(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={PLACE_PICKER_COPY.fieldHint}
          role="combobox"
          type="text"
          value={text}
        />
        {picker.open ? (
          <div
            aria-label={PLACE_PICKER_COPY.listLabel}
            className={listBox}
            id={listId}
            role="listbox"
          >
            {picker.suggestions.map((suggestion, index) => (
              <div
                aria-selected={index === picker.activeIndex}
                className={`${optionBase} ${index === picker.activeIndex ? optionActive : ""}`}
                id={optionId(id, index)}
                key={`${suggestion.label}-${String(suggestion.lat)}`}
                // `mousedown` and not `click`: the field keeps its focus, so the choice is never lost to a blur.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(suggestion);
                }}
                role="option"
                // Never a tab stop of its own: the focus stays in the input and `aria-activedescendant` names the option.
                tabIndex={-1}
              >
                {suggestion.label}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <p
        aria-live="polite"
        className={kind === "confirmed" ? confirmedNote : fieldHint}
        id={noteId}
      >
        {kind === "confirmed" ? (
          <>
            <PinIcon />
            {PLACE_PICKER_COPY.confirmed}
          </>
        ) : (
          PLACE_PICKER_COPY.hint
        )}
      </p>
      {note === undefined ? null : (
        <p aria-live="polite" className={searchNoteText} id={searchNoteId}>
          {note}
        </p>
      )}
      <FieldRefusal id={messageId} message={issue} />
    </div>
  );
}

/** The values the feature fields hold in the browser while their saves are on their way. */
export interface FeatureValues {
  readonly timeZone: string;
  readonly whatsappPhone: string;
  readonly playlistUrl: string;
  /** The moments of the day as the browser holds them, in the owner's order (F1; L3.4). */
  readonly itinerary: readonly ItineraryDraftMoment[];
  /** The gift registry as the browser holds it: stores, transfer, envelopes switch, and note (F2; L4.4). */
  readonly giftRegistry: GiftRegistryDraft;
  /** The lodging as the browser holds it: the hotels in the owner's order and the transport note (F4; L7.4). */
  readonly lodging: LodgingDraft;
  /** The livestream as the browser holds it: the link and its note (F9; L12.1). */
  readonly livestream: LivestreamDraft;
  /** The opening animation switch as the browser holds it, on by default (F10; L14.3). */
  readonly openingAnimation: boolean;
  /** The WhatsApp reminder switches as the browser holds them (F6; L9.1). */
  readonly reminders: RemindersDraft;
}

/** The switch of one reminder, matching the editor's other switches: a track, a knob, and the word of its state. */
const reminderSwitchBase =
  "inline-flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * The «Recordatorios por WhatsApp» block of «Funciones» (F6; S2.6, S6, L9.5, L9.6), following
 * `design/whatsapp-reminders/01-automaticos.html` with the app's own tokens: the status card while this deployment has
 * no provider, the two switches — stored either way, so they work the moment it is activated — and the preview of the
 * message the command would send, built from the invitation's own data.
 *
 * The card never dims or disables the switches: a control that looks off but works is a trap, and the switches are
 * exactly what the owner is asked to leave ready (L9.5). The status is a worded note with an icon and never colour
 * alone, and the preview is plain text, because the message is plain text.
 */
function RemindersFields({
  view,
  values,
  issue,
  onChange,
  onFlush,
  preview,
}: {
  view: FeatureSettingsView;
  values: FeatureValues;
  issue: string | undefined;
  onChange: (next: Partial<FeatureValues>) => void;
  onFlush: () => void;
  preview: string | undefined;
}) {
  const rows = [
    {
      key: "pendingRsvp" as const,
      label: FEATURE_COPY.remindersPendingRsvpLabel,
      hint: FEATURE_COPY.remindersPendingRsvpHint,
    },
    {
      key: "eventEve" as const,
      label: FEATURE_COPY.remindersEventEveLabel,
      hint: FEATURE_COPY.remindersEventEveHint,
    },
  ];

  return (
    <div>
      <p className={fieldLabel}>{FEATURE_COPY.remindersTitle}</p>
      <p className={fieldHint}>{FEATURE_COPY.remindersHint}</p>

      {view.remindersConfigured ? null : (
        <div
          className="mt-3 flex items-start gap-3 rounded-field bg-rose-50 p-3 ring-1 ring-rose-100"
          role="status"
        >
          <span aria-hidden="true" className="text-base leading-6">
            ⏸
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{FEATURE_COPY.remindersInactiveTitle}</p>
            <p className="mt-1 text-sm leading-6 text-muted">
              {FEATURE_COPY.remindersInactiveBody}
            </p>
          </div>
        </div>
      )}

      <ul className="mt-3 flex flex-col">
        {rows.map((row) => {
          const checked = values.reminders[row.key];
          const labelId = `reminders-${row.key}-label`;
          const hintId = `reminders-${row.key}-hint`;

          return (
            <li
              className="flex items-center justify-between gap-3 border-b border-rose-100 py-3 last:border-b-0"
              key={row.key}
            >
              <div>
                <p className="text-sm font-medium text-ink" id={labelId}>
                  {row.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted" id={hintId}>
                  {row.hint}
                </p>
              </div>
              {/* The label names the control and «Activado» / «Desactivado» states its value, so the state is never
                  colour alone and a screen reader hears one switch with its own name (L9.5). */}
              <button
                aria-checked={checked}
                aria-describedby={hintId}
                aria-labelledby={`${labelId} ${labelId}-state`}
                className={`${reminderSwitchBase} ${checked ? "text-primary" : "text-muted"}`}
                onClick={() => {
                  onChange({ reminders: { ...values.reminders, [row.key]: !checked } });
                  // A switch is one deliberate action: it is sent at once instead of waiting for the debounce.
                  onFlush();
                }}
                role="switch"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none ${
                    checked ? "bg-primary" : "bg-field-border"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 size-5 rounded-full bg-surface shadow-soft transition-transform motion-reduce:transition-none ${
                      checked ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </span>
                <span id={`${labelId}-state`}>{checked ? "Activado" : "Desactivado"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <FieldRefusal id="reminders-error" message={issue} />

      {preview === undefined ? null : (
        <div className="mt-3 rounded-field bg-rose-50 p-3 ring-1 ring-rose-100">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            {FEATURE_COPY.remindersPreviewTitle}
          </p>
          <p className="mt-2 text-sm leading-6 text-ink">{preview}</p>
          <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.remindersPreviewNote}</p>
        </div>
      )}
    </div>
  );
}

/** The small controls of one itinerary moment: no form, no navigation, so each press is a save of its own (L3.4). */
const itineraryControl = `${textButton} min-h-11`;

/**
 * The «Itinerario» block of «Funciones» (F1; L3.4): one row per moment with its time, its title, and the two optional
 * texts, plus the controls that add, remove, and reorder them. Every control is a real button with its own accessible
 * name — «Subir Misa», «Quitar Momento 3» — so the order is never changed by color, drag, or an icon alone, and a
 * moment the API would refuse is named in the status line instead of being stored half-written.
 */
function ItineraryFields({
  values,
  onChange,
  onFlush,
}: {
  values: FeatureValues;
  onChange: (next: Partial<FeatureValues>) => void;
  onFlush: () => void;
}) {
  const drafts = values.itinerary;
  const nameOf = (index: number): string => {
    const title = drafts[index]?.title.trim() ?? "";

    return title === "" ? FEATURE_COPY.itineraryMomentLabel(index + 1) : title;
  };
  const change = (next: readonly ItineraryDraftMoment[]) => {
    onChange({ itinerary: next });
    // A press is one deliberate action, not a keystroke: it is sent at once instead of waiting for the debounce.
    onFlush();
  };
  const patch = (index: number, valuesOfMoment: Partial<ItineraryDraftMoment>) =>
    onChange({ itinerary: updateItineraryMoment(drafts, index, valuesOfMoment) });

  /**
   * The id of the hint of one row, while that row is still being written. A row like that is not an error, but the hint
   * under it says why it is not saved yet, and the time and the title both name it for a reader that never sees it.
   */
  const incompleteHintId = (index: number): string | undefined => {
    const moment = drafts[index];

    return moment !== undefined && isItineraryMomentIncomplete(moment)
      ? `itinerary-${index}-incomplete`
      : undefined;
  };

  const field = (
    index: number,
    key: keyof ItineraryDraftMoment,
    label: string,
    type: "text" | "time",
    maxLength: number,
  ) => {
    const id = `itinerary-${index}-${key}`;

    return (
      <div>
        <label className={fieldLabel} htmlFor={id}>
          {label}
        </label>
        <input
          aria-describedby={key === "time" || key === "title" ? incompleteHintId(index) : undefined}
          className={textField}
          id={id}
          maxLength={maxLength}
          name={id}
          onBlur={onFlush}
          onChange={(event) => patch(index, { [key]: event.target.value })}
          type={type}
          value={drafts[index]?.[key] ?? ""}
        />
      </div>
    );
  };

  // One row per moment, numbered by its place in the plan: a moment has no id of its own, and the position is both the
  // order the owner sees and the order the plan is stored in, so it is also the identity each row keeps while editing.
  let position = 0;
  const rows = drafts.map((_moment) => {
    const index = position;
    position += 1;

    return (
      <li
        className="flex flex-col gap-3 rounded-field bg-surface p-3 ring-1 ring-field-border"
        key={index}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={fieldLabel}>
            {nameOf(index)}
            <span className="ml-2 text-xs font-normal text-muted">
              {FEATURE_COPY.itineraryMomentLabel(index + 1)}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              aria-label={`${FEATURE_COPY.itineraryMoveUp} ${nameOf(index)}`}
              className={itineraryControl}
              disabled={index === 0}
              onClick={() => change(moveItineraryMoment(drafts, index, "up"))}
              type="button"
            >
              {FEATURE_COPY.itineraryMoveUp}
            </button>
            <button
              aria-label={`${FEATURE_COPY.itineraryMoveDown} ${nameOf(index)}`}
              className={itineraryControl}
              disabled={index === drafts.length - 1}
              onClick={() => change(moveItineraryMoment(drafts, index, "down"))}
              type="button"
            >
              {FEATURE_COPY.itineraryMoveDown}
            </button>
            <button
              aria-label={`${FEATURE_COPY.itineraryRemove} ${nameOf(index)}`}
              className={itineraryControl}
              onClick={() => change(removeItineraryMoment(drafts, index))}
              type="button"
            >
              {FEATURE_COPY.itineraryRemove}
            </button>
          </div>
        </div>
        {incompleteHintId(index) === undefined ? null : (
          <p className="text-sm leading-6 text-muted" id={incompleteHintId(index)}>
            {FEATURE_COPY.itineraryIncomplete}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {field(index, "time", FEATURE_COPY.itineraryTimeLabel, "time", 5)}
          {field(index, "title", FEATURE_COPY.itineraryMomentTitleLabel, "text", 60)}
          {field(index, "place", FEATURE_COPY.itineraryPlaceLabel, "text", 160)}
          {field(index, "address", FEATURE_COPY.itineraryAddressLabel, "text", 160)}
        </div>
      </li>
    );
  });

  return (
    <div className="border-t border-rose-100 pt-6">
      <p className={fieldLabel}>{FEATURE_COPY.itineraryTitle}</p>
      <p className={fieldHint}>{FEATURE_COPY.itineraryHint}</p>

      {drafts.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted">{FEATURE_COPY.itineraryEmpty}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-4">{rows}</ol>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          className={`${quietButton} self-start`}
          disabled={!canAddItineraryMoment(drafts)}
          onClick={() => change(addItineraryMoment(drafts))}
          type="button"
        >
          {FEATURE_COPY.itineraryAdd}
        </button>
        {canAddItineraryMoment(drafts) ? null : (
          <p className="text-sm leading-6 text-muted">{FEATURE_COPY.itineraryLimitNote}</p>
        )}
      </div>
    </div>
  );
}

/**
 * The «Mesa de regalos» block of «Funciones» (F2; L4.4): one row per store with its name, its reference, and the link a
 * guest opens, plus the controls that add, remove, and reorder them; then the transfer data, the «Lluvia de sobres»
 * switch, and the note. Every control is a real button with its own accessible name — «Subir Liverpool», «Quitar Tienda
 * 2» — so the order is never changed by color, drag, or an icon alone. A store that is still being written is never
 * sent: it stays in the browser with a hint of its own, and the stored one keeps its last complete version while the
 * owner retypes it.
 */
function GiftRegistryFields({
  values,
  issue,
  onChange,
  onFlush,
}: {
  values: FeatureValues;
  issue: string | undefined;
  onChange: (next: Partial<FeatureValues>) => void;
  onFlush: () => void;
}) {
  const drafts = values.giftRegistry;
  const nameOf = (index: number): string => {
    const name = drafts.stores[index]?.name.trim() ?? "";

    return name === "" ? FEATURE_COPY.giftRegistryStoreLabel(index + 1) : name;
  };
  const change = (next: GiftRegistryDraft) => {
    onChange({ giftRegistry: next });
    // A press is one deliberate action, not a keystroke: it is sent at once instead of waiting for the debounce.
    onFlush();
  };
  const patch = (index: number, store: Partial<GiftRegistryDraftStore>) =>
    onChange({ giftRegistry: updateGiftRegistryStore(drafts, index, store) });
  const patchTransfer = (transfer: Partial<GiftRegistryDraft["transfer"]>) =>
    onChange({ giftRegistry: setGiftRegistryTransfer(drafts, transfer) });

  const incompleteHintId = (index: number): string | undefined => {
    const store = drafts.stores[index];

    return store !== undefined && isGiftRegistryStoreIncomplete(store)
      ? `gift-registry-${index}-incomplete`
      : undefined;
  };

  const field = (
    index: number,
    key: keyof GiftRegistryDraftStore,
    label: string,
    options: { maxLength: number; placeholder?: string; type?: "text" | "url" },
  ) => {
    const id = `gift-registry-${index}-${key}`;

    return (
      <div>
        <label className={fieldLabel} htmlFor={id}>
          {label}
        </label>
        <input
          aria-describedby={key === "name" || key === "url" ? incompleteHintId(index) : undefined}
          autoComplete={options.type === "url" ? "url" : "off"}
          className={textField}
          id={id}
          inputMode={options.type === "url" ? "url" : undefined}
          maxLength={options.maxLength}
          name={id}
          onBlur={onFlush}
          onChange={(event) => patch(index, { [key]: event.target.value })}
          placeholder={options.placeholder}
          type={options.type ?? "text"}
          value={drafts.stores[index]?.[key] ?? ""}
        />
      </div>
    );
  };

  let position = 0;
  const rows = drafts.stores.map((_store) => {
    const index = position;
    position += 1;

    return (
      <li
        className="flex flex-col gap-3 rounded-field bg-surface p-3 ring-1 ring-field-border"
        key={index}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={fieldLabel}>
            {nameOf(index)}
            <span className="ml-2 text-xs font-normal text-muted">
              {FEATURE_COPY.giftRegistryStoreLabel(index + 1)}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              aria-label={`${FEATURE_COPY.giftRegistryMoveUp} ${nameOf(index)}`}
              className={itineraryControl}
              disabled={index === 0}
              onClick={() => change(moveGiftRegistryStore(drafts, index, "up"))}
              type="button"
            >
              {FEATURE_COPY.giftRegistryMoveUp}
            </button>
            <button
              aria-label={`${FEATURE_COPY.giftRegistryMoveDown} ${nameOf(index)}`}
              className={itineraryControl}
              disabled={index === drafts.stores.length - 1}
              onClick={() => change(moveGiftRegistryStore(drafts, index, "down"))}
              type="button"
            >
              {FEATURE_COPY.giftRegistryMoveDown}
            </button>
            <button
              aria-label={`${FEATURE_COPY.giftRegistryRemove} ${nameOf(index)}`}
              className={itineraryControl}
              onClick={() => change(removeGiftRegistryStore(drafts, index))}
              type="button"
            >
              {FEATURE_COPY.giftRegistryRemove}
            </button>
          </div>
        </div>
        {incompleteHintId(index) === undefined ? null : (
          <p className="text-sm leading-6 text-muted" id={incompleteHintId(index)}>
            {FEATURE_COPY.giftRegistryIncomplete}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {field(index, "name", FEATURE_COPY.giftRegistryStoreNameLabel, { maxLength: 40 })}
          {field(index, "reference", FEATURE_COPY.giftRegistryStoreReferenceLabel, {
            maxLength: 60,
          })}
          <div className="sm:col-span-2">
            {field(index, "url", FEATURE_COPY.giftRegistryStoreUrlLabel, {
              maxLength: 500,
              placeholder: FEATURE_COPY.giftRegistryStoreUrlPlaceholder,
              type: "url",
            })}
          </div>
        </div>
      </li>
    );
  });

  const transferField = (
    key: keyof GiftRegistryDraft["transfer"],
    label: string,
    options: { maxLength: number; inputMode?: "numeric"; placeholder?: string },
  ) => {
    const id = `gift-registry-transfer-${key}`;

    return (
      <div>
        <label className={fieldLabel} htmlFor={id}>
          {label}
        </label>
        <input
          autoComplete="off"
          className={textField}
          id={id}
          inputMode={options.inputMode}
          maxLength={options.maxLength}
          name={id}
          onBlur={onFlush}
          onChange={(event) => patchTransfer({ [key]: event.target.value })}
          placeholder={options.placeholder}
          type="text"
          value={drafts.transfer[key]}
        />
      </div>
    );
  };

  const envelopesId = "gift-registry-envelopes";
  const noteId = "gift-registry-note";

  return (
    <div className="border-t border-rose-100 pt-6">
      <p className={fieldLabel}>{FEATURE_COPY.giftRegistryTitle}</p>
      <p className={fieldHint}>{FEATURE_COPY.giftRegistryHint}</p>

      {drafts.stores.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted">{FEATURE_COPY.giftRegistryEmpty}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-4">{rows}</ol>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          className={`${quietButton} self-start`}
          disabled={!canAddGiftRegistryStore(drafts)}
          onClick={() => change(addGiftRegistryStore(drafts))}
          type="button"
        >
          {FEATURE_COPY.giftRegistryAdd}
        </button>
        {canAddGiftRegistryStore(drafts) ? null : (
          <p className="text-sm leading-6 text-muted">{FEATURE_COPY.giftRegistryLimitNote}</p>
        )}
      </div>

      <div className="mt-6 border-t border-rose-100 pt-6">
        <p className={fieldLabel}>{FEATURE_COPY.giftRegistryTransferTitle}</p>
        <p className={fieldHint}>{FEATURE_COPY.giftRegistryTransferHint}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {transferField("bank", FEATURE_COPY.giftRegistryBankLabel, { maxLength: 60 })}
          {transferField("holder", FEATURE_COPY.giftRegistryHolderLabel, { maxLength: 60 })}
          <div className="sm:col-span-2">
            {transferField("clabe", FEATURE_COPY.giftRegistryClabeLabel, {
              maxLength: 24,
              inputMode: "numeric",
              placeholder: "0121 8000 0123 4567 82",
            })}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3">
        <input
          checked={drafts.envelopes}
          className={`${checkbox} mt-1`}
          id={envelopesId}
          name={envelopesId}
          onChange={(event) =>
            onChange({ giftRegistry: setGiftRegistryEnvelopes(drafts, event.target.checked) })
          }
          onBlur={onFlush}
          type="checkbox"
        />
        <div>
          <label className={fieldLabel} htmlFor={envelopesId}>
            {FEATURE_COPY.giftRegistryEnvelopesLabel}
          </label>
          <p className={fieldHint}>{FEATURE_COPY.giftRegistryEnvelopesHint}</p>
        </div>
      </div>

      <div className="mt-6">
        <label className={fieldLabel} htmlFor={noteId}>
          {FEATURE_COPY.giftRegistryNoteLabel}
        </label>
        <textarea
          className={multilineField}
          id={noteId}
          maxLength={200}
          name={noteId}
          onBlur={onFlush}
          onChange={(event) =>
            onChange({ giftRegistry: setGiftRegistryNote(drafts, event.target.value) })
          }
          rows={3}
          value={drafts.note}
        />
        <FieldRefusal id="gift-registry-error" message={issue} />
      </div>
    </div>
  );
}

/**
 * The «Hospedaje y transporte» block of «Funciones» (F4; L7.4): one row per hotel with its name, distance, price, group
 * code, booking link, and address, plus the controls that add, remove, and reorder them; then the transport note. Every
 * control is a real button with its own accessible name — «Subir Hotel Misión», «Quitar Hotel 2» — so the order is
 * never changed by color, drag, or an icon alone. A hotel that is still being written is never sent: it stays in the
 * browser with a hint of its own, and the stored one keeps its last complete version while the owner retypes it.
 */
function LodgingFields({
  values,
  issue,
  onChange,
  onFlush,
}: {
  values: FeatureValues;
  issue: string | undefined;
  onChange: (next: Partial<FeatureValues>) => void;
  onFlush: () => void;
}) {
  const drafts = values.lodging;
  const nameOf = (index: number): string => {
    const name = drafts.hotels[index]?.name.trim() ?? "";

    return name === "" ? FEATURE_COPY.lodgingHotelLabel(index + 1) : name;
  };
  const change = (next: LodgingDraft) => {
    onChange({ lodging: next });
    // A press is one deliberate action, not a keystroke: it is sent at once instead of waiting for the debounce.
    onFlush();
  };
  const patch = (index: number, hotel: Partial<LodgingDraftHotel>) =>
    onChange({ lodging: updateLodgingHotel(drafts, index, hotel) });

  const incompleteHintId = (index: number): string | undefined => {
    const hotel = drafts.hotels[index];

    return hotel !== undefined && isLodgingHotelIncomplete(hotel)
      ? `lodging-${index}-incomplete`
      : undefined;
  };

  const field = (
    index: number,
    key: keyof LodgingDraftHotel,
    label: string,
    options: { maxLength: number; placeholder?: string; type?: "text" | "url" },
  ) => {
    const id = `lodging-${index}-${key}`;

    return (
      <div>
        <label className={fieldLabel} htmlFor={id}>
          {label}
        </label>
        <input
          aria-describedby={key === "name" ? incompleteHintId(index) : undefined}
          autoComplete={options.type === "url" ? "url" : "off"}
          className={textField}
          id={id}
          inputMode={options.type === "url" ? "url" : undefined}
          maxLength={options.maxLength}
          name={id}
          onBlur={onFlush}
          onChange={(event) => patch(index, { [key]: event.target.value })}
          placeholder={options.placeholder}
          type={options.type ?? "text"}
          value={drafts.hotels[index]?.[key] ?? ""}
        />
      </div>
    );
  };

  // One row per hotel, numbered by its place in the list: a hotel has no id of its own, and the position is both the
  // order the owner sees and the order the cards are stored in, so it is also the identity each row keeps while editing.
  let position = 0;
  const rows = drafts.hotels.map((_hotel) => {
    const index = position;
    position += 1;

    return (
      <li
        className="flex flex-col gap-3 rounded-field bg-surface p-3 ring-1 ring-field-border"
        key={index}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={fieldLabel}>
            {nameOf(index)}
            <span className="ml-2 text-xs font-normal text-muted">
              {FEATURE_COPY.lodgingHotelLabel(index + 1)}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              aria-label={`${FEATURE_COPY.lodgingMoveUp} ${nameOf(index)}`}
              className={itineraryControl}
              disabled={index === 0}
              onClick={() => change(moveLodgingHotel(drafts, index, "up"))}
              type="button"
            >
              {FEATURE_COPY.lodgingMoveUp}
            </button>
            <button
              aria-label={`${FEATURE_COPY.lodgingMoveDown} ${nameOf(index)}`}
              className={itineraryControl}
              disabled={index === drafts.hotels.length - 1}
              onClick={() => change(moveLodgingHotel(drafts, index, "down"))}
              type="button"
            >
              {FEATURE_COPY.lodgingMoveDown}
            </button>
            <button
              aria-label={`${FEATURE_COPY.lodgingRemove} ${nameOf(index)}`}
              className={itineraryControl}
              onClick={() => change(removeLodgingHotel(drafts, index))}
              type="button"
            >
              {FEATURE_COPY.lodgingRemove}
            </button>
          </div>
        </div>
        {incompleteHintId(index) === undefined ? null : (
          <p className="text-sm leading-6 text-muted" id={incompleteHintId(index)}>
            {FEATURE_COPY.lodgingIncomplete}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {field(index, "name", FEATURE_COPY.lodgingHotelNameLabel, { maxLength: 60 })}
          {field(index, "distance", FEATURE_COPY.lodgingHotelDistanceLabel, {
            maxLength: 40,
            placeholder: FEATURE_COPY.lodgingHotelDistancePlaceholder,
          })}
          {field(index, "price", FEATURE_COPY.lodgingHotelPriceLabel, {
            maxLength: 60,
            placeholder: FEATURE_COPY.lodgingHotelPricePlaceholder,
          })}
          {field(index, "groupCode", FEATURE_COPY.lodgingHotelGroupCodeLabel, {
            maxLength: 40,
            placeholder: FEATURE_COPY.lodgingHotelGroupCodePlaceholder,
          })}
          <div className="sm:col-span-2">
            {field(index, "bookingUrl", FEATURE_COPY.lodgingHotelBookingUrlLabel, {
              maxLength: 500,
              placeholder: FEATURE_COPY.lodgingHotelBookingUrlPlaceholder,
              type: "url",
            })}
          </div>
          <div className="sm:col-span-2">
            {field(index, "address", FEATURE_COPY.lodgingHotelAddressLabel, { maxLength: 160 })}
          </div>
        </div>
      </li>
    );
  });

  const transportId = "lodging-transport";

  return (
    <div className="border-t border-rose-100 pt-6">
      <p className={fieldLabel}>{FEATURE_COPY.lodgingTitle}</p>
      <p className={fieldHint}>{FEATURE_COPY.lodgingHint}</p>

      {drafts.hotels.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted">{FEATURE_COPY.lodgingEmpty}</p>
      ) : (
        <ol className="mt-4 flex flex-col gap-4">{rows}</ol>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <button
          className={`${quietButton} self-start`}
          disabled={!canAddLodgingHotel(drafts)}
          onClick={() => change(addLodgingHotel(drafts))}
          type="button"
        >
          {FEATURE_COPY.lodgingAdd}
        </button>
        {canAddLodgingHotel(drafts) ? null : (
          <p className="text-sm leading-6 text-muted">{FEATURE_COPY.lodgingLimitNote}</p>
        )}
      </div>

      <div className="mt-6">
        <label className={fieldLabel} htmlFor={transportId}>
          {FEATURE_COPY.lodgingTransportLabel}
        </label>
        <textarea
          className={multilineField}
          id={transportId}
          maxLength={400}
          name={transportId}
          onBlur={onFlush}
          onChange={(event) =>
            onChange({ lodging: setLodgingTransport(drafts, event.target.value) })
          }
          rows={3}
          value={drafts.transport}
        />
        <p className={fieldHint}>{FEATURE_COPY.lodgingTransportHint}</p>
        <FieldRefusal id="lodging-error" message={issue} />
      </div>
    </div>
  );
}

/**
 * The «Transmisión en vivo» block of «Funciones» (F9; L12.1, L12.4): the link of the stream and one optional note. The
 * field names its own rule while the address is being written — the API's own sentence, never a guess — so an unfinished
 * link is a hint and not an error, and the note is bounded by its control. Everything is a labelled control, so the block
 * is usable with a screen reader and with no client script.
 */
function LivestreamFields({
  values,
  issue,
  onChange,
  onFlush,
}: {
  values: FeatureValues;
  issue: string | undefined;
  onChange: (next: Partial<FeatureValues>) => void;
  onFlush: () => void;
}) {
  const drafts = values.livestream;
  const urlId = "livestream-url";
  const noteId = "livestream-note";
  // The link's own hint is the API's refusal sentence while it cannot be stored, and the neutral hint otherwise.
  const urlHint = livestreamUrlIssue(drafts);

  return (
    <div className="border-t border-rose-100 pt-6">
      <p className={fieldLabel}>{FEATURE_COPY.livestreamTitle}</p>
      <p className={fieldHint}>{FEATURE_COPY.livestreamHint}</p>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label className={fieldLabel} htmlFor={urlId}>
            {FEATURE_COPY.livestreamUrlLabel}
          </label>
          <input
            aria-describedby={urlHint === "" ? `${urlId}-hint` : `${urlId}-issue`}
            aria-invalid={urlHint === "" ? undefined : true}
            autoComplete="url"
            className={textField}
            id={urlId}
            inputMode="url"
            maxLength={500}
            name={urlId}
            onBlur={onFlush}
            onChange={(event) =>
              onChange({ livestream: setLivestreamUrl(drafts, event.target.value) })
            }
            placeholder={FEATURE_COPY.livestreamUrlPlaceholder}
            type="url"
            value={drafts.url}
          />
          {urlHint === "" ? (
            <p className={fieldHint} id={`${urlId}-hint`}>
              {FEATURE_COPY.livestreamUrlHint}
            </p>
          ) : (
            <p className={fieldHint} id={`${urlId}-issue`}>
              {urlHint}
            </p>
          )}
        </div>

        <div>
          <label className={fieldLabel} htmlFor={noteId}>
            {FEATURE_COPY.livestreamNoteLabel}
          </label>
          <input
            className={textField}
            id={noteId}
            maxLength={120}
            name={noteId}
            onBlur={onFlush}
            onChange={(event) =>
              onChange({ livestream: setLivestreamNote(drafts, event.target.value) })
            }
            placeholder={FEATURE_COPY.livestreamNotePlaceholder}
            type="text"
            value={drafts.note}
          />
          <p className={fieldHint}>{FEATURE_COPY.livestreamNoteHint}</p>
        </div>

        <FieldRefusal id="livestream-error" message={issue} />
      </div>
    </div>
  );
}

/**
 * The «Animación de apertura» switch of «Funciones» (F10; S2.10, L14.2, L14.3), following
 * `design/opening-animation/01-sobre-con-sello.html` with the app's own tokens: one row that says what the guest sees and
 * one switch that keeps it on or turns it off. It matches the reminder switches — a track, a knob, and the word of its
 * state — so the state is never colour alone, and a press is one deliberate action that is saved at once.
 */
function OpeningAnimationField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const labelId = "opening-animation-label";
  const hintId = "opening-animation-hint";

  return (
    <div className="border-t border-rose-100 pt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink" id={labelId}>
            {FEATURE_COPY.openingAnimationLabel}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted" id={hintId}>
            {FEATURE_COPY.openingAnimationHint}
          </p>
        </div>
        <button
          aria-checked={checked}
          aria-describedby={hintId}
          aria-labelledby={`${labelId} ${labelId}-state`}
          className={`${reminderSwitchBase} ${checked ? "text-primary" : "text-muted"}`}
          onClick={() => onChange(!checked)}
          role="switch"
          type="button"
        >
          <span
            aria-hidden="true"
            className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none ${
              checked ? "bg-primary" : "bg-field-border"
            }`}
          >
            <span
              className={`absolute left-0.5 size-5 rounded-full bg-surface shadow-soft transition-transform motion-reduce:transition-none ${
                checked ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </span>
          <span id={`${labelId}-state`}>
            {checked ? FEATURE_COPY.openingAnimationOn : FEATURE_COPY.openingAnimationOff}
          </span>
        </button>
      </div>
    </div>
  );
}

/** The automatic features a guest sees, as a plain list of what the package turns on (S4). */
function AutomaticFeatures({ view }: { view: FeatureSettingsView }) {
  return (
    <div className="mt-6 border-t border-rose-100 pt-6">
      <p className={fieldLabel}>{FEATURE_COPY.automaticHeading}</p>
      <p className={fieldHint}>{FEATURE_COPY.automaticHint}</p>
      {view.automaticFeatures.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.automaticNone}</p>
      ) : (
        <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-ink">
          {view.automaticFeatures.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The time zone, the WhatsApp number, and the playlist link of one invitation (S4). A field whose key the package
 * does not grant is not offered at all: the autosave fills it from what is stored, so saving one field never clears
 * another.
 */
export function FeatureFields({
  view,
  values,
  issues,
  onChange,
  onFlush,
  reminderPreview,
}: {
  view: FeatureSettingsView;
  values: FeatureValues;
  issues: FieldIssues | undefined;
  onChange: (next: Partial<FeatureValues>) => void;
  onFlush: () => void;
  /** The message the reminder block previews, built by the page from the invitation's own data (F6; L9.6). */
  reminderPreview: string | undefined;
}) {
  const zoneId = "features-time-zone";
  const phoneId = "features-whatsapp-phone";
  const playlistId = "features-playlist-url";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={fieldLabel} htmlFor={zoneId}>
          {FEATURE_COPY.timeZoneLabel}
        </label>
        <select
          aria-describedby={issues?.timeZone === undefined ? undefined : `${zoneId}-error`}
          aria-invalid={issues?.timeZone === undefined ? undefined : true}
          className={textField}
          id={zoneId}
          name="timeZone"
          onBlur={onFlush}
          onChange={(event) => onChange({ timeZone: event.target.value })}
          value={values.timeZone}
        >
          {view.timeZones.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <p className={fieldHint}>{FEATURE_COPY.timeZoneHint}</p>
        <FieldRefusal id={`${zoneId}-error`} message={issues?.timeZone} />
      </div>

      {view.showWhatsapp ? (
        <div>
          <label className={fieldLabel} htmlFor={phoneId}>
            {FEATURE_COPY.whatsappLabel}
          </label>
          <input
            aria-describedby={issues?.whatsappPhone === undefined ? undefined : `${phoneId}-error`}
            aria-invalid={issues?.whatsappPhone === undefined ? undefined : true}
            autoComplete="tel"
            className={textField}
            id={phoneId}
            inputMode="tel"
            name="whatsappPhone"
            onBlur={onFlush}
            onChange={(event) => onChange({ whatsappPhone: event.target.value })}
            placeholder={FEATURE_COPY.whatsappPlaceholder}
            type="tel"
            value={values.whatsappPhone}
          />
          <p className={fieldHint}>{FEATURE_COPY.whatsappHint}</p>
          <FieldRefusal id={`${phoneId}-error`} message={issues?.whatsappPhone} />
        </div>
      ) : null}

      {view.showMusic ? (
        <div>
          <label className={fieldLabel} htmlFor={playlistId}>
            {FEATURE_COPY.playlistLabel}
          </label>
          <input
            aria-describedby={issues?.playlistUrl === undefined ? undefined : `${playlistId}-error`}
            aria-invalid={issues?.playlistUrl === undefined ? undefined : true}
            autoComplete="url"
            className={textField}
            id={playlistId}
            inputMode="url"
            name="playlistUrl"
            onBlur={onFlush}
            onChange={(event) => onChange({ playlistUrl: event.target.value })}
            placeholder={FEATURE_COPY.playlistPlaceholder}
            type="url"
            value={values.playlistUrl}
          />
          <p className={fieldHint}>{FEATURE_COPY.playlistHint}</p>
          <FieldRefusal id={`${playlistId}-error`} message={issues?.playlistUrl} />
        </div>
      ) : null}

      {view.showItinerary ? (
        <ItineraryFields onChange={onChange} onFlush={onFlush} values={values} />
      ) : null}

      {view.showGiftRegistry ? (
        <GiftRegistryFields
          issue={issues?.giftRegistry}
          onChange={onChange}
          onFlush={onFlush}
          values={values}
        />
      ) : null}

      {view.showLodging ? (
        <LodgingFields
          issue={issues?.lodging}
          onChange={onChange}
          onFlush={onFlush}
          values={values}
        />
      ) : null}

      {view.showLivestream ? (
        <LivestreamFields
          issue={issues?.livestream}
          onChange={onChange}
          onFlush={onFlush}
          values={values}
        />
      ) : null}

      {view.showOpeningAnimation ? (
        <OpeningAnimationField
          checked={values.openingAnimation}
          onChange={(next) => {
            onChange({ openingAnimation: next });
            // A switch is one deliberate action: it is sent at once instead of waiting for the debounce.
            onFlush();
          }}
        />
      ) : null}

      {view.showReminders ? (
        <RemindersFields
          issue={issues?.reminders}
          onChange={onChange}
          onFlush={onFlush}
          preview={reminderPreview}
          values={values}
          view={view}
        />
      ) : null}

      {view.giftRegistryNote === "" ? null : (
        <p className="text-sm leading-6 text-muted">{view.giftRegistryNote}</p>
      )}

      <AutomaticFeatures view={view} />
    </div>
  );
}

/** The attendance settings the browser holds: the deadline's wall clock, and the party limit. */
export interface RsvpValues {
  readonly deadline: string;
  readonly partyLimit: number;
}

/**
 * The attendance settings of one invitation (S4): the deadline in the invitation's own zone, the party limit, and the
 * way to the answers. Every change is saved on its own, so the section no longer has a button of its own.
 */
export function RsvpFields({
  view,
  values,
  issues,
  onChange,
  onFlush,
}: {
  view: RsvpSettingsView;
  values: RsvpValues;
  issues: FieldIssues | undefined;
  onChange: (next: { deadline?: string | null; partyLimit?: number }) => void;
  onFlush: () => void;
}) {
  const deadlineId = "rsvp-deadline";
  const partyId = "rsvp-party-limit";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={fieldLabel} htmlFor={deadlineId}>
          {RSVP_COPY.deadlineLabel}
        </label>
        <input
          aria-describedby={issues?.deadline === undefined ? undefined : `${deadlineId}-error`}
          aria-invalid={issues?.deadline === undefined ? undefined : true}
          className={textField}
          id={deadlineId}
          name="deadline"
          onBlur={onFlush}
          onChange={(event) =>
            onChange({ deadline: event.target.value === "" ? null : event.target.value })
          }
          type="datetime-local"
          value={values.deadline}
        />
        <p className={fieldHint}>
          {RSVP_COPY.deadlineHint} Zona: {timeZoneLabel(view.timeZone)}.
        </p>
        <FieldRefusal id={`${deadlineId}-error`} message={issues?.deadline} />
      </div>

      <div>
        <label className={fieldLabel} htmlFor={partyId}>
          {RSVP_COPY.partyLimitLabel}
        </label>
        <select
          aria-describedby={issues?.partyLimit === undefined ? undefined : `${partyId}-error`}
          aria-invalid={issues?.partyLimit === undefined ? undefined : true}
          className={textField}
          id={partyId}
          name="partyLimit"
          onBlur={onFlush}
          onChange={(event) => onChange({ partyLimit: Number(event.target.value) })}
          value={String(values.partyLimit)}
        >
          {view.partyLimits.map((party) => (
            <option key={party} value={party}>
              {party === 1 ? "1 persona" : `${party} personas`}
            </option>
          ))}
        </select>
        <p className={fieldHint}>{RSVP_COPY.partyLimitHint}</p>
        <FieldRefusal id={`${partyId}-error`} message={issues?.partyLimit} />
      </div>

      <p>
        <GuardedLink className={textButton} href={view.responsesHref}>
          {view.responsesLabel}
        </GuardedLink>
      </p>
    </div>
  );
}
