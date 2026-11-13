import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { connection } from "next/server";
import type { ReactElement } from "react";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import {
  INVITATION_PATHS,
  invitationPageNotices,
  packageChoices,
} from "../../../../lib/customer/invitations.ts";
import {
  previewPath,
  TEMPLATE_FIELD_NAME,
  templateChoiceCards,
} from "../../../../lib/customer/template-preview.ts";
import {
  type ChooserState,
  type ChooserStep,
  chooserOccasions,
  draftChoice,
  type OccasionChoice,
  resolveChooserStep,
  stepHref,
} from "../../../../lib/customer/template-steps.ts";
import { requestOrigin } from "../../../../lib/server/request-origin.ts";
import { CustomerWorkspaceShell } from "../../../_components/customer-workspace-shell.tsx";
import { errorNote, quietButton, textButton } from "../../../_components/ui.ts";
import { ChooserStepper, ChooserSummaryBar } from "../_components/chooser-stepper.tsx";
import { Notices } from "../_components/notices.tsx";
import { OptionCard } from "../_components/option-card.tsx";
import { DesignCard, SampleStage, ThemeTile } from "../_components/template-choice-card.tsx";
import { invitations } from "../_lib/api.ts";
import { attempt, resolveRead } from "../_lib/load.ts";
import { createInvitationAction } from "../actions.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.createPageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The id the footer bar's «Crear borrador» button submits, so the create form stays one field set. */
const CREATE_FORM_ID = "chooser-create";

/** The numbered heading of one step. */
function StepHeading({
  id,
  number,
  title,
}: {
  id: string;
  number: ChooserStep;
  title: string;
}): ReactElement {
  return (
    <h2
      className="flex items-center gap-2 font-display text-[1.375rem] font-semibold text-ink"
      id={id}
    >
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-primary font-sans text-xs font-semibold text-on-primary"
      >
        {number}
      </span>
      {title}
    </h2>
  );
}

/**
 * The occasion of the whole flow, from the catalog: one entry per category that publishes templates, and the
 * current one marked. Changing it is a link to step 1 of that occasion, so the flow never needs a script and
 * never offers an occasion the catalog cannot fill.
 */
function OccasionRow({
  occasions,
  state,
}: {
  occasions: readonly OccasionChoice[];
  state: ChooserState;
}): ReactElement {
  const current = state.occasion;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span>{INVITATION_COPY.occasionLabel}</span>
      {occasions.length > 1 ? (
        <ul className="flex flex-wrap items-center gap-2">
          {occasions.map((occasion) => (
            <li key={occasion.key}>
              {occasion.key === current?.key ? (
                <span className="font-semibold text-ink">{occasion.name}</span>
              ) : (
                <a className={textButton} href={stepHref({ occasion }, 1)}>
                  {occasion.name}
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <span className="font-semibold text-ink">{current?.name ?? ""}</span>
      )}
    </div>
  );
}

/**
 * `/cuenta/invitaciones/nueva` (M4 T5, T8; T9, T10b; S6, S8, S9, S10, S11): the «Paso a paso» chooser. A
 * customer picks the design, then the theme, then the package, each one a server URL addressed by its own
 * query (`paso`, `ocasion`, `diseno`, `tema`, `paquete`) and resolved against the creator catalog, so the
 * whole flow ships no client script. Step 1 shows the occasion's designs in a row with a live miniature of
 * the real renderer; step 2 shows the chosen design in each of its themes beside the large sample of the
 * chosen one; step 3 shows the packages and the create form, which still posts the published version id.
 * «Ver completa» opens that sample at phone width. The API is the authority on whether a package fits the
 * pinned version. Creating and editing the draft is free (S6).
 */
export default async function NewInvitationPage({
  searchParams,
}: {
  searchParams: SearchParameters;
}) {
  await connection();
  const parameters = await searchParams;
  const notices = invitationPageNotices(parameters);
  const origin = requestOrigin(await headers());
  const [templates, packages] = await Promise.all([
    attempt(() => invitations.templates()),
    attempt(() => invitations.packages()),
  ]);
  const loadedTemplates = resolveRead(templates);
  const loadedPackages = resolveRead(packages);
  const available = loadedTemplates.status === "ok" && loadedPackages.status === "ok";
  // A page with no trustworthy origin still offers every template; only the miniatures need one, so they
  // are dropped instead of the choice (`samples.ts` builds the sample photo from the origin).
  const cards =
    loadedTemplates.status === "ok" ? templateChoiceCards(loadedTemplates.value, origin ?? "") : [];
  const packageCards = loadedPackages.status === "ok" ? packageChoices(loadedPackages.value) : [];
  const occasions = chooserOccasions(cards);
  const state = resolveChooserStep(occasions, packageCards, parameters);
  const draft = draftChoice(state);
  const designs = state.occasion?.designs ?? [];
  const design = state.design;
  const style = state.style;

  return (
    <CustomerWorkspaceShell
      eyebrow={INVITATION_COPY.createEyebrow}
      heading={available ? INVITATION_COPY.createHeading : INVITATION_COPY.unavailableHeading}
      intro={available ? INVITATION_COPY.createIntro : INVITATION_COPY.unavailableBody}
    >
      <div className="flex flex-col gap-5 pb-24">
        <Notices error={notices.error} notice={notices.notice} />

        {available ? (
          <>
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <OccasionRow occasions={occasions} state={state} />
              <ChooserStepper state={state} />
            </div>

            {state.step === 1 ? (
              <section aria-labelledby="paso-diseno" className="flex flex-col gap-3">
                <StepHeading
                  id="paso-diseno"
                  number={1}
                  title={INVITATION_COPY.stepDesignHeading}
                />
                <p className="text-sm leading-6 text-pretty text-muted">
                  {state.design === undefined
                    ? INVITATION_COPY.designStepHint
                    : INVITATION_COPY.chosenNote(state.design.title)}
                </p>
                <ul
                  aria-label={INVITATION_COPY.templateLabel}
                  className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4"
                >
                  {designs.map((design) => (
                    <li
                      className="w-[78%] shrink-0 snap-center sm:w-auto sm:shrink"
                      key={design.componentKey}
                    >
                      <DesignCard
                        design={design}
                        href={stepHref(
                          { occasion: state.occasion, design, package: state.package },
                          2,
                        )}
                        selected={design.componentKey === state.design?.componentKey}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {state.step === 2 && design !== undefined && style !== undefined ? (
              <section aria-labelledby="paso-tema" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StepHeading id="paso-tema" number={2} title={INVITATION_COPY.stepThemeHeading} />
                  <a className={textButton} href={previewPath(style.versionId)}>
                    {INVITATION_COPY.viewFull}
                  </a>
                </div>
                <p className="text-sm leading-6 text-pretty text-muted">
                  {design.styles.length === 1
                    ? INVITATION_COPY.singleStyleNote
                    : INVITATION_COPY.chosenNote(style.label)}
                </p>
                <div className="grid gap-4 lg:grid-cols-2">
                  <SampleStage componentKey={design.componentKey} sample={style.sample} />
                  <div className="flex flex-col gap-2">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted">
                      {INVITATION_COPY.themeLabel}
                    </p>
                    <ul
                      aria-label={INVITATION_COPY.themeLabel}
                      className="grid grid-cols-4 gap-2 sm:gap-3"
                    >
                      {design.styles.map((option) => (
                        <li key={option.versionId}>
                          <ThemeTile
                            componentKey={design.componentKey}
                            href={stepHref(
                              {
                                occasion: state.occasion,
                                design,
                                style: option,
                                package: state.package,
                              },
                              2,
                            )}
                            selected={option.versionId === style.versionId}
                            style={option}
                          />
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs leading-5 text-pretty text-muted">
                      {INVITATION_COPY.themeNote}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {state.step === 3 && design !== undefined && style !== undefined ? (
              <section aria-labelledby="paso-paquete" className="flex flex-col gap-3">
                <StepHeading
                  id="paso-paquete"
                  number={3}
                  title={INVITATION_COPY.stepPackageHeading}
                />
                <p className="text-sm leading-6 text-pretty text-muted">
                  {INVITATION_COPY.packageNote}
                </p>
                <ul aria-label={INVITATION_COPY.packageLabel} className="grid gap-3 sm:grid-cols-3">
                  {packageCards.map((card) => (
                    <li key={card.value}>
                      <OptionCard
                        description={card.description}
                        href={stepHref(
                          {
                            occasion: state.occasion,
                            design,
                            style,
                            package: card,
                          },
                          3,
                        )}
                        meta={card.meta}
                        selected={card.value === state.package?.value}
                        title={card.name}
                        value={card.value}
                      />
                    </li>
                  ))}
                </ul>
                {draft === undefined ? null : (
                  <form
                    action={createInvitationAction}
                    className="flex justify-end"
                    id={CREATE_FORM_ID}
                  >
                    <input
                      name={TEMPLATE_FIELD_NAME}
                      type="hidden"
                      value={draft.templateVersionId}
                    />
                    <input name="packageId" type="hidden" value={draft.packageId} />
                  </form>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {available && cards.length === 0 ? (
          <p className="leading-7 text-pretty text-muted">{INVITATION_COPY.noTemplates}</p>
        ) : null}

        {available && cards.length > 0 && packageCards.length === 0 ? (
          <p className="leading-7 text-pretty text-muted">{INVITATION_COPY.noPackages}</p>
        ) : null}

        {available ? null : (
          <div className="flex flex-col items-start gap-4">
            <p className={errorNote}>{INVITATION_COPY.unavailableBody}</p>
            <a className={quietButton} href={INVITATION_PATHS.create}>
              {INVITATION_COPY.retry}
            </a>
          </div>
        )}

        <div className="border-t border-gold/40 pt-4">
          <Link className={textButton} href={INVITATION_PATHS.list}>
            {INVITATION_COPY.backToList}
          </Link>
        </div>
      </div>

      {available && cards.length > 0 ? (
        <ChooserSummaryBar canCreate={draft !== undefined} formId={CREATE_FORM_ID} state={state} />
      ) : null}
    </CustomerWorkspaceShell>
  );
}
