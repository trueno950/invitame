import type { ReactNode } from "react";

import { FEATURE_COPY } from "../../../../lib/customer/copy.ts";
import type { FeatureSettingsView } from "../../../../lib/customer/invitation-features.ts";
import { fieldHint, fieldLabel, primaryButton, textField } from "../../../_components/ui.ts";

/**
 * The «Funcionalidades» section of a draft (F3, F6, F7; S3, S4, S7). It renders on the server, so it works
 * without JavaScript and a save is a normal form post to a server action. The section is one form: the time zone
 * select with its Spanish labels, the WhatsApp field only when the package includes WhatsApp, the playlist field
 * only when the package includes MUSIC (and, in either case, a hidden field with the stored value otherwise, so
 * saving another field never clears it), the gift registry note of a package that does not grant it, and the
 * automatic features the guests will see. An archived invitation shows the same data read-only, like the content
 * summary.
 */

const PHONE_INPUT_ID = "features-whatsapp-phone";
const TIME_ZONE_INPUT_ID = "features-time-zone";
const PLAYLIST_INPUT_ID = "features-playlist-url";

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

/**
 * The gift registry is a content field, and its block only renders when the package grants it (F7; S7). The
 * field stays where the content form puts it; this note says why its block may not show, naming the packages that
 * include it when the catalog can be read.
 */
function GiftRegistryNote({ view }: { view: FeatureSettingsView }) {
  return view.giftRegistryNote === "" ? null : (
    <p className="text-sm leading-6 text-muted">{view.giftRegistryNote}</p>
  );
}

/**
 * The editable section of a draft: the form the owner saves, and the automatic features it explains. The
 * browser is never the validator; the server action reads the same fields again and the API refuses a zone
 * it does not accept or a phone it cannot store.
 */
export function FeaturesForm({
  view,
  action,
}: {
  view: FeatureSettingsView;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <FeatureSection>
      <form action={action} className="mt-4 flex flex-col gap-4">
        <input name="id" type="hidden" value={view.id} />

        <div>
          <label className={fieldLabel} htmlFor={TIME_ZONE_INPUT_ID}>
            {FEATURE_COPY.timeZoneLabel}
          </label>
          <select
            className={textField}
            defaultValue={view.timeZone}
            id={TIME_ZONE_INPUT_ID}
            name="timeZone"
          >
            {view.timeZones.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          <p className={fieldHint}>{FEATURE_COPY.timeZoneHint}</p>
        </div>

        {view.showWhatsapp ? (
          <div>
            <label className={fieldLabel} htmlFor={PHONE_INPUT_ID}>
              {FEATURE_COPY.whatsappLabel}
            </label>
            <input
              autoComplete="tel"
              className={textField}
              defaultValue={view.whatsappPhone}
              id={PHONE_INPUT_ID}
              inputMode="tel"
              name="whatsappPhone"
              placeholder={FEATURE_COPY.whatsappPlaceholder}
              type="tel"
            />
            <p className={fieldHint}>{FEATURE_COPY.whatsappHint}</p>
          </div>
        ) : (
          // The package does not include WhatsApp: the field is not offered, and the stored number travels
          // unchanged so saving another field never clears it.
          <input name="whatsappPhone" type="hidden" value={view.whatsappPhone} />
        )}

        {view.showMusic ? (
          <div>
            <label className={fieldLabel} htmlFor={PLAYLIST_INPUT_ID}>
              {FEATURE_COPY.playlistLabel}
            </label>
            <input
              autoComplete="url"
              className={textField}
              defaultValue={view.playlistUrl}
              id={PLAYLIST_INPUT_ID}
              inputMode="url"
              name="playlistUrl"
              placeholder={FEATURE_COPY.playlistPlaceholder}
              type="url"
            />
            <p className={fieldHint}>{FEATURE_COPY.playlistHint}</p>
          </div>
        ) : (
          // The package does not include MUSIC: the field is not offered, and the stored link travels unchanged.
          <input name="playlistUrl" type="hidden" value={view.playlistUrl} />
        )}

        <GiftRegistryNote view={view} />

        <AutomaticFeatures view={view} />

        <div className="flex justify-end">
          <button className={`${primaryButton} sm:w-auto sm:px-8`} type="submit">
            {FEATURE_COPY.save}
          </button>
        </div>
      </form>
    </FeatureSection>
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
        <p className="text-sm leading-6 text-muted">{FEATURE_COPY.archivedNote}</p>
        <AutomaticFeatures view={view} />
      </div>
    </FeatureSection>
  );
}
