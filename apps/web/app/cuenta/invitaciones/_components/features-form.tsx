import type { ReactNode } from "react";

import { FEATURE_COPY } from "../../../../lib/customer/copy.ts";
import type { FeatureSettingsView } from "../../../../lib/customer/invitation-features.ts";
import { fieldHint, fieldLabel, primaryButton, textField } from "../../../_components/ui.ts";

/**
 * The «Funcionalidades» section of a draft (F3; S3, S4). It renders on the server, so it works without
 * JavaScript and a save is a normal form post to a server action. The section is one form: the time zone
 * select with its Spanish labels, the WhatsApp field only when the package includes WhatsApp (and a hidden
 * field with the stored value otherwise, so saving the zone never clears a phone), and the automatic features
 * the guests will see. An archived invitation shows the same data read-only, like the content summary.
 */

const PHONE_INPUT_ID = "features-whatsapp-phone";
const TIME_ZONE_INPUT_ID = "features-time-zone";

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
          // unchanged so saving the time zone never clears it.
          <input name="whatsappPhone" type="hidden" value={view.whatsappPhone} />
        )}

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
