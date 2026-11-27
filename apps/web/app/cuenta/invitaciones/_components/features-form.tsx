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

/** The stored gift registry as a plain list, which is what a read-only page can show (F2; L4.4). */
function GiftRegistrySummary({ view }: { view: FeatureSettingsView }) {
  if (!view.showGiftRegistry) {
    return null;
  }

  const { stores, transfer, envelopes, note } = view.giftRegistry;

  return (
    <div>
      <p className={fieldLabel}>{FEATURE_COPY.giftRegistryTitle}</p>
      {stores.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.giftRegistryEmpty}</p>
      ) : (
        <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-ink">
          {stores.map((store) => (
            <li key={`${store.name}-${store.reference}-${store.url}`}>
              {store.name}
              {store.reference === "" ? null : (
                <span className="text-muted"> · {store.reference}</span>
              )}
              {store.url === "" ? null : <span className="text-muted"> · {store.url}</span>}
            </li>
          ))}
        </ul>
      )}
      {transfer.bank === "" && transfer.holder === "" && transfer.clabe === "" ? null : (
        <p className="mt-2 text-sm leading-6 text-ink">
          {FEATURE_COPY.giftRegistryTransferTitle}: {transfer.bank} · {transfer.holder} ·{" "}
          {transfer.clabe}
        </p>
      )}
      {envelopes ? (
        <p className="mt-2 text-sm leading-6 text-ink">{FEATURE_COPY.giftRegistryEnvelopesLabel}</p>
      ) : null}
      {note === "" ? null : <p className="mt-2 text-sm leading-6 text-ink">{note}</p>}
      <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.giftRegistryArchivedNote}</p>
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

/** The stored lodging as a plain list, which is what a read-only page can show (F4; L7.4). */
function LodgingSummary({ view }: { view: FeatureSettingsView }) {
  if (!view.showLodging) {
    return null;
  }

  const { hotels, transport } = view.lodging;

  return (
    <div>
      <p className={fieldLabel}>{FEATURE_COPY.lodgingTitle}</p>
      {hotels.length === 0 ? (
        <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.lodgingEmpty}</p>
      ) : (
        <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-ink">
          {hotels.map((hotel) => (
            <li key={`${hotel.name}-${hotel.address}`}>
              {hotel.name}
              {hotel.distance === "" ? null : (
                <span className="text-muted"> · {hotel.distance}</span>
              )}
              {hotel.price === "" ? null : <span className="text-muted"> · {hotel.price}</span>}
              {hotel.groupCode === "" ? null : (
                <span className="text-muted"> · {hotel.groupCode}</span>
              )}
              {hotel.bookingUrl === "" ? null : (
                <span className="text-muted"> · {hotel.bookingUrl}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {transport === "" ? null : (
        <p className="mt-2 text-sm leading-6 text-ink">
          {FEATURE_COPY.lodgingTransportLabel}: {transport}
        </p>
      )}
      <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.lodgingArchivedNote}</p>
    </div>
  );
}

/** The stored livestream as a plain pair of lines, which is what a read-only page can show (F9; L12.4). */
function LivestreamSummary({ view }: { view: FeatureSettingsView }) {
  if (!view.showLivestream) {
    return null;
  }

  const { url, note } = view.livestream;

  return (
    <div>
      <p className={fieldLabel}>{FEATURE_COPY.livestreamTitle}</p>
      {url === "" ? (
        <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.livestreamUrlHint}</p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-ink">
          {FEATURE_COPY.livestreamUrlLabel}: {url}
        </p>
      )}
      {note === "" ? null : (
        <p className="mt-2 text-sm leading-6 text-ink">
          {FEATURE_COPY.livestreamNoteLabel}: {note}
        </p>
      )}
      <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.livestreamArchivedNote}</p>
    </div>
  );
}

/** The stored opening animation switch as one line, which is what an archived invitation shows (F10; L14.3). */
function OpeningAnimationSummary({ view }: { view: FeatureSettingsView }) {
  if (!view.showOpeningAnimation) {
    return null;
  }

  return (
    <p className={fieldLabel}>
      {FEATURE_COPY.openingAnimationLabel}:{" "}
      <span className="font-normal text-ink">
        {view.openingAnimation ? FEATURE_COPY.openingAnimationOn : FEATURE_COPY.openingAnimationOff}
      </span>
    </p>
  );
}

/** The stored reminder switches as a read-only pair, which is what an archived invitation shows (F6; L9.5). */
function RemindersSummary({ view }: { view: FeatureSettingsView }) {
  if (!view.showReminders) {
    return null;
  }

  return (
    <div>
      <p className={fieldLabel}>{FEATURE_COPY.remindersTitle}</p>
      {view.remindersConfigured ? null : (
        <p className="mt-2 text-sm leading-6 text-muted">
          {FEATURE_COPY.remindersInactiveTitle}: {FEATURE_COPY.remindersInactiveBody}
        </p>
      )}
      <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-ink">
        <li>
          {FEATURE_COPY.remindersPendingRsvpLabel}:{" "}
          {view.reminders.pendingRsvp ? "Activado" : "Desactivado"}
        </li>
        <li>
          {FEATURE_COPY.remindersEventEveLabel}:{" "}
          {view.reminders.eventEve ? "Activado" : "Desactivado"}
        </li>
      </ul>
      <p className="mt-2 text-sm leading-6 text-muted">{FEATURE_COPY.remindersArchivedNote}</p>
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
        <GiftRegistrySummary view={view} />
        <LodgingSummary view={view} />
        <LivestreamSummary view={view} />
        <OpeningAnimationSummary view={view} />
        <RemindersSummary view={view} />
        <p className="text-sm leading-6 text-muted">{FEATURE_COPY.archivedNote}</p>
        <AutomaticFeatures view={view} />
      </div>
    </FeatureSection>
  );
}
