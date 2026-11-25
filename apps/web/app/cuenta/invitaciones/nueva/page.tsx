import type { Metadata } from "next";
import { headers } from "next/headers";
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
  chooserOccasions,
  DESIGN_PARAM,
  draftChoice,
  OCCASION_PARAM,
  resolveChooserStep,
  stepHref,
} from "../../../../lib/customer/template-steps.ts";
import { requestOrigin } from "../../../../lib/server/request-origin.ts";
import { CustomerWorkspaceShell } from "../../../_components/customer-workspace-shell.tsx";
import { errorNote, quietButton, textButton } from "../../../_components/ui.ts";
import { ChooserStepper, ChooserSummaryBar } from "../_components/chooser-stepper.tsx";
import { Notices } from "../_components/notices.tsx";
import { OptionCard } from "../_components/option-card.tsx";
import {
  DesignCard,
  OccasionCard,
  SampleStage,
  ThemeTile,
} from "../_components/template-choice-card.tsx";
import { invitations } from "../_lib/api.ts";
import { attempt, resolveRead } from "../_lib/load.ts";
import { createInvitationAction } from "../actions.ts";

export const metadata: Metadata = {
  title: INVITATION_COPY.createPageTitle,
};

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

/** The id the footer bar's «Crear mi invitación» button submits, so the create form stays one field set. */
const CREATE_FORM_ID = "chooser-create";

/** The query flag that reopens the occasion picker after an occasion is already chosen. */
const PICK_OCCASION_PARAM = "ocasiones";

/** The heading of one step: the title only, because the stepper already carries the step number. */
function StepHeading({ id, title }: { id: string; title: string }): ReactElement {
  return (
    <h2 className="font-display text-[1.375rem] font-semibold text-ink" id={id}>
      {title}
    </h2>
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
 * pinned version. Creating and editing the draft is free (S6). The shared «← Mis invitaciones» pill opens the header,
 * and the ways back and forward sit on the footer bar at every width, phones included (T2; S2.3, S2.5).
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
  const pickingOccasion =
    parameters[PICK_OCCASION_PARAM] === "1" || parameters[OCCASION_PARAM] === undefined;
  const hasChosenOccasion = parameters[OCCASION_PARAM] !== undefined;
  const draft = draftChoice(state);
  const designs = state.occasion?.designs ?? [];
  const design = state.design;
  const style = state.style;

  return (
    <CustomerWorkspaceShell
      back
      eyebrow={INVITATION_COPY.createEyebrow}
      heading={available ? INVITATION_COPY.createHeading : INVITATION_COPY.unavailableHeading}
      intro={available ? INVITATION_COPY.createIntro : INVITATION_COPY.unavailableBody}
    >
      <div className="flex flex-col gap-5 pb-24">
        <Notices error={notices.error} notice={notices.notice} />

        {available ? (
          <>
            <div className="flex flex-col gap-4">
              <ChooserStepper state={state} />
              {pickingOccasion ? (
                <section aria-labelledby="ocasion" className="flex flex-col gap-3">
                  <h2 className="font-display text-[1.375rem] font-semibold text-ink" id="ocasion">
                    {INVITATION_COPY.occasionLabel}
                  </h2>
                  <ul
                    aria-label={INVITATION_COPY.occasionLabel}
                    className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
                  >
                    {occasions.map((occasion) => (
                      <li key={occasion.key}>
                        <OccasionCard
                          href={stepHref({ occasion }, 1)}
                          occasion={occasion}
                          selected={hasChosenOccasion && occasion.key === state.occasion?.key}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
                <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{INVITATION_COPY.occasionLabel}:</span>
                  <span className="font-semibold text-ink">{state.occasion?.name ?? ""}</span>
                  <a
                    className={textButton}
                    href={`${stepHref({ occasion: state.occasion }, 1)}&${PICK_OCCASION_PARAM}=1`}
                  >
                    {INVITATION_COPY.changeOccasion}
                  </a>
                </p>
              )}
            </div>

            {!pickingOccasion && state.step === 1 ? (
              <section aria-labelledby="paso-diseno" className="flex flex-col gap-3">
                <StepHeading id="paso-diseno" title={INVITATION_COPY.stepDesignHeading} />
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

            {!pickingOccasion && state.step === 2 && design !== undefined && style !== undefined ? (
              <section aria-labelledby="paso-tema" className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StepHeading id="paso-tema" title={INVITATION_COPY.stepThemeHeading} />
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

            {!pickingOccasion && state.step === 3 && design !== undefined && style !== undefined ? (
              <section aria-labelledby="paso-paquete" className="flex flex-col gap-3">
                <StepHeading id="paso-paquete" title={INVITATION_COPY.stepPackageHeading} />
                <p className="text-sm leading-6 text-pretty text-muted">
                  {INVITATION_COPY.packageNote}
                </p>
                <ul
                  aria-label={INVITATION_COPY.packageLabel}
                  className="grid items-stretch gap-3 pt-3 sm:grid-cols-3"
                >
                  {packageCards.map((card) => (
                    <li className={card.featured ? "lg:-mt-2" : ""} key={card.value}>
                      <OptionCard
                        description={card.description}
                        features={card.features}
                        featured={card.featured}
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
                {draft === undefined || design === undefined ? null : (
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
                    {/*
                      The occasion and the design come back with the form so a refused create returns to this
                      step with the selection kept (S12). The server rebuilds the URL from them, adding the
                      theme and the package from the two values above, and the page resolves every value
                      against the catalog again before it renders anything.
                    */}
                    {state.occasion === undefined ? null : (
                      <input name={OCCASION_PARAM} type="hidden" value={state.occasion.key} />
                    )}
                    <input name={DESIGN_PARAM} type="hidden" value={design.componentKey} />
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
      </div>

      {available && cards.length > 0 ? (
        <ChooserSummaryBar canCreate={draft !== undefined} formId={CREATE_FORM_ID} state={state} />
      ) : null}
    </CustomerWorkspaceShell>
  );
}
