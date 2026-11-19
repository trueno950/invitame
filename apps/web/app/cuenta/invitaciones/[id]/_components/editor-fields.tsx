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
  activeOptionId,
  dismissedSuggestions,
  keyAction,
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
import { fieldHint, fieldLabel, textButton, textField } from "../../../../_components/ui.ts";
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
  const [searchNote, setSearchNote] = useState<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
        if (result.ok) {
          setPicker((current) => searchAnswered(current, asked, result.suggestions));
          setSearchNote(result.suggestions.length === 0 ? PLACE_PICKER_COPY.empty : undefined);
          return;
        }
        setSearchNote(
          result.failure === "rate-limited"
            ? PLACE_PICKER_COPY.limited
            : result.failure === "not-found"
              ? PLACE_PICKER_COPY.notFound
              : PLACE_PICKER_COPY.failed,
        );
      } catch {
        setSearchNote(PLACE_PICKER_COPY.failed);
      }
      setPicker((current) => searchFailed(current, asked));
    },
    [onSearch],
  );

  const change = (next: string) => {
    onChange(field.name, next);
    setSearchNote(undefined);
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
    setSearchNote(undefined);
    void onSavePlace(field.name, suggestion)
      .then((result) => {
        if (!result.ok) {
          setSearchNote(result.message);
        }
      })
      .catch(() => setSearchNote(PLACE_PICKER_COPY.saveFailed));
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
    searchNote === undefined ? undefined : searchNoteId,
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
          maxLength={field.input.kind === "text" ? field.input.maxLength : undefined}
          name={field.name}
          onBlur={() => {
            onFlush();
            setPicker((current) => dismissedSuggestions(current));
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
      {searchNote === undefined ? null : (
        <p aria-live="polite" className={searchNoteText} id={searchNoteId}>
          {searchNote}
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
}: {
  view: FeatureSettingsView;
  values: FeatureValues;
  issues: FieldIssues | undefined;
  onChange: (next: Partial<FeatureValues>) => void;
  onFlush: () => void;
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
