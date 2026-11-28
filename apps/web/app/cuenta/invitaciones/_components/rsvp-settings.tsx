import Link from "next/link";
import type { ReactNode } from "react";

import { RSVP_COPY } from "../../../../lib/customer/copy.ts";
import { partySizeLabel, type RsvpSettingsView } from "../../../../lib/customer/invitation-rsvp.ts";
import { fieldLabel, textButton } from "../../../_components/ui.ts";

/**
 * The «Asistencia» section of a draft as a read-only summary (M6 G3; S1, S4). The editable deadline and party limit
 * moved into the editor's «Asistencia» tab, where each one saves on its own (T2c); this block is what an archived
 * invitation shows instead, and it keeps the way to the page that lists the answers.
 */

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
          <span className="font-normal text-ink">{partySizeLabel(view.partyLimit)}</span>
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
