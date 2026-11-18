"use client";

import { FEATURE_COPY, INVITATION_COPY, RSVP_COPY } from "../../../../../lib/customer/copy.ts";
import type { FeatureSettingsView } from "../../../../../lib/customer/invitation-features.ts";
import { timeZoneLabel } from "../../../../../lib/customer/invitation-features.ts";
import type { RsvpSettingsView } from "../../../../../lib/customer/invitation-rsvp.ts";
import type { ContentField, ContentSection } from "../../../../../lib/customer/invitations.ts";
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
function ContentFieldControl({
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
          <span className="ml-2 text-xs font-normal tracking-normal text-muted">
            {INVITATION_COPY.fieldRequired}
          </span>
        ) : null}
      </label>
      {control}
      <FieldRefusal id={messageId} message={issue} />
    </div>
  );
}

/**
 * Every content field of the pinned template, grouped in the template's own short sections. The groups are separated
 * by a hairline instead of a card each, because the form column is already one panel: the owner reads one page of
 * fields, not a stack of nested boxes.
 */
export function ContentFields({
  sections,
  values,
  issues,
  idPrefix,
  onChange,
  onFlush,
}: {
  sections: readonly ContentSection[];
  values: Readonly<Record<string, unknown>>;
  issues: FieldIssues | undefined;
  idPrefix: string;
  onChange: (name: string, next: unknown) => void;
  onFlush: () => void;
}) {
  return (
    <>
      {sections.map((section, index) => (
        <fieldset
          className={index === 0 ? undefined : "mt-6 border-t border-rose-100 pt-6"}
          key={section.key}
        >
          <legend className="font-display text-xl font-semibold text-ink">{section.title}</legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {section.fields.map((field) => (
              <ContentFieldControl
                field={field}
                idPrefix={idPrefix}
                issue={issues?.[field.name]}
                key={field.name}
                onChange={onChange}
                onFlush={onFlush}
                value={values[field.name]}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </>
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
