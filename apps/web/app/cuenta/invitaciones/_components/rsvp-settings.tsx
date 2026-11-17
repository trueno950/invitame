import Link from "next/link";
import type { ReactNode } from "react";

import { RSVP_COPY } from "../../../../lib/customer/copy.ts";
import { timeZoneLabel } from "../../../../lib/customer/invitation-features.ts";
import type { RsvpSettingsView } from "../../../../lib/customer/invitation-rsvp.ts";
import {
  fieldHint,
  fieldLabel,
  primaryButton,
  textButton,
  textField,
} from "../../../_components/ui.ts";

/**
 * The «Asistencia» section of a draft (M6 G3; S1, S4). It is offered only when the package includes RSVP, and it
 * saves the deadline and the party limit through a server action, so it works without JavaScript like every other
 * form of the page. The deadline is written and read in the invitation's own zone, because that is the clock the
 * guest sees; the section also links to the page that lists the answers.
 */

const DEADLINE_INPUT_ID = "rsvp-deadline";
const PARTY_LIMIT_INPUT_ID = "rsvp-party-limit";

/** The shell of the section, so the editable and the read-only states read the same. */
function RsvpSection({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
        {RSVP_COPY.sectionTitle}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">{RSVP_COPY.sectionHint}</p>
      {children}
    </section>
  );
}

/** The link to the responses page, in the section's header area of both states. */
function ResponsesLink({ view }: { view: RsvpSettingsView }) {
  return (
    <p className="mt-3">
      <Link className={textButton} href={view.responsesHref}>
        {view.responsesLabel}
      </Link>
    </p>
  );
}

/** «1 persona», «2 personas»: the party limit as the creator reads it. */
function partyLabel(party: number): string {
  return party === 1 ? "1 persona" : `${party} personas`;
}

/**
 * The editable section of a draft: the deadline with the invitation's zone named next to it, the party limit from
 * 1 to 10, and the way to the answers. The browser is never the validator; the server action reads the same fields
 * again and the API refuses a value it cannot store.
 */
export function RsvpSettingsForm({
  view,
  action,
}: {
  view: RsvpSettingsView;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <RsvpSection>
      <form action={action} className="mt-4 flex flex-col gap-4">
        <input name="id" type="hidden" value={view.id} />
        {/* The zone the creator wrote in, so the action reads the same wall clock the field shows. */}
        <input name="timeZone" type="hidden" value={view.timeZone} />

        <div>
          <label className={fieldLabel} htmlFor={DEADLINE_INPUT_ID}>
            {RSVP_COPY.deadlineLabel}
          </label>
          <input
            className={textField}
            defaultValue={view.deadlineValue}
            id={DEADLINE_INPUT_ID}
            name="deadline"
            type="datetime-local"
          />
          <p className={fieldHint}>
            {RSVP_COPY.deadlineHint} Zona: {timeZoneLabel(view.timeZone)}.
          </p>
        </div>

        <div>
          <label className={fieldLabel} htmlFor={PARTY_LIMIT_INPUT_ID}>
            {RSVP_COPY.partyLimitLabel}
          </label>
          <select
            className={textField}
            defaultValue={String(view.partyLimit)}
            id={PARTY_LIMIT_INPUT_ID}
            name="partyLimit"
          >
            {view.partyLimits.map((party) => (
              <option key={party} value={party}>
                {partyLabel(party)}
              </option>
            ))}
          </select>
          <p className={fieldHint}>{RSVP_COPY.partyLimitHint}</p>
        </div>

        <ResponsesLink view={view} />

        <div className="flex justify-end">
          <button className={`${primaryButton} sm:w-auto sm:px-8`} type="submit">
            {RSVP_COPY.save}
          </button>
        </div>
      </form>
    </RsvpSection>
  );
}

/** The archived invitation's settings: readable, with no form and no way to save. */
export function RsvpSettingsSummary({ view }: { view: RsvpSettingsView }) {
  return (
    <RsvpSection>
      <div className="mt-4 flex flex-col gap-3">
        <p className={fieldLabel}>
          {RSVP_COPY.deadlineLabel}:{" "}
          <span className="font-normal text-ink">
            {view.deadlineText === "" ? RSVP_COPY.deadlineNone : view.deadlineText}
          </span>
        </p>
        <p className={fieldLabel}>
          {RSVP_COPY.partyLimitLabel}:{" "}
          <span className="font-normal text-ink">{partyLabel(view.partyLimit)}</span>
        </p>
        <ResponsesLink view={view} />
        <p className="text-sm leading-6 text-muted">{RSVP_COPY.archivedNote}</p>
      </div>
    </RsvpSection>
  );
}

/** Why the settings could not be read: the section promises nothing instead of showing guessed values. */
export function RsvpSettingsUnavailable() {
  return (
    <RsvpSection>
      <p className="mt-3 text-sm leading-6 text-muted">{RSVP_COPY.unavailable}</p>
    </RsvpSection>
  );
}
