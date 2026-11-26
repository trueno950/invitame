import type { ReactNode } from "react";

import { FEATURE_COPY } from "../../../../lib/customer/copy.ts";
import type { FeatureSettingsView } from "../../../../lib/customer/invitation-features.ts";
import { fieldHint, fieldLabel } from "../../../_components/ui.ts";

/** The moments of a stored itinerary as a plain numbered list, which is what a read-only page can show (F1; L3.4). */
function ItinerarySummary({ view }: { view: FeatureSettingsView }) {
  if (!view.showItinerary) {
    return null;
  }

  // One line per moment, numbered by its place in the plan: a stored moment has no id of its own and the order the
  // owner saved is the order this list repeats.
  let position = 0;
  const moments = view.itinerary.map((moment) => {
    const index = position;
    position += 1;

    return (
      <li key={index}>
        <span className="font-medium tabular-nums">{moment.time}</span> {moment.title}
        {moment.place === "" ? null : <span className="text-muted"> · {moment.place}</span>}
        {moment.address === "" ? null : <span className="text-muted"> · {moment.address}</span>}
      </li>
    );
  });

  return (
    <div>
      <p className={fieldLabel}>{FEATURE_COPY.itineraryTitle}</p>
      {view.itinerary.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.itineraryEmpty}</p>
      ) : (
        <ol className="mt-2 list-decimal pl-5 text-sm leading-6 text-ink">{moments}</ol>
      )}
      <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.itineraryArchivedNote}</p>
    </div>
  );
}

/**
 * The «Funcionalidades» section of a draft as a read-only summary (F3, F6, F7; S3, S4, S7). The editable fields moved
 * into the editor's «Funciones» tab, where each one saves on its own (T2c); this block is what an archived invitation
 * or one whose pinned version left the catalog shows instead, together with the gift registry note and the automatic
 * features the package turns on.
 */

/** The shell of the section, so the editable and the read-only states read the same. */
function FeatureSection({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-panel bg-surface/80 p-4 ring-1 ring-gold/45 sm:p-5">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
        {FEATURE_COPY.sectionTitle}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.sectionHint}</p>
      {children}
    </section>
  );
}

/** The automatic features of the guest page, as a plain list of what the package turns on. */
function AutomaticFeatures({ view }: { view: FeatureSettingsView }) {
  return (
    <div>
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

/** The archived invitation's feature data: readable, with no form and no way to save. */
export function FeaturesSummary({ view }: { view: FeatureSettingsView }) {
  const zone =
    view.timeZones.find((choice) => choice.value === view.timeZone)?.label ?? view.timeZone;

  return (
    <FeatureSection>
      <div className="mt-4 flex flex-col gap-3">
        <p className={fieldLabel}>
          {FEATURE_COPY.timeZoneLabel}: <span className="font-normal text-ink">{zone}</span>
        </p>
        {view.whatsappPhone === "" ? null : (
          <p className={fieldLabel}>
            {FEATURE_COPY.whatsappLabel}:{" "}
            <span className="font-normal text-ink">{view.whatsappPhone}</span>
          </p>
        )}
        <ItinerarySummary view={view} />
        <p className="text-sm leading-6 text-muted">{FEATURE_COPY.archivedNote}</p>
        <AutomaticFeatures view={view} />
      </div>
    </FeatureSection>
  );
}
