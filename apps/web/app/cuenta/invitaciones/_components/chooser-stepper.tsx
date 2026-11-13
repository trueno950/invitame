import type { ReactElement, ReactNode } from "react";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import {
  backHref,
  CHOOSER_STEPS,
  type ChooserState,
  type ChooserStep,
  continueHref,
  selectionSummary,
  stepHref,
} from "../../../../lib/customer/template-steps.ts";
import { pageActionButton } from "../../../_components/customer-workspace-shell.tsx";
import { textButton } from "../../../_components/ui.ts";

/*
 * The progress of the «Paso a paso» chooser (T10b; S10): the stepper that says which step is done, which is
 * current, and which comes next, and the footer bar that repeats the step and the current selection beside
 * the two ways forward and back. A done step is a plain link to its own server URL with the whole selection
 * kept, so going back never loses a choice; nothing here needs client script.
 */

/** The Spanish name of each step, in the order the stepper shows them. */
const STEP_NAMES: Readonly<Record<ChooserStep, string>> = {
  1: INVITATION_COPY.stepDesign,
  2: INVITATION_COPY.stepTheme,
  3: INVITATION_COPY.stepPackage,
};

/** The numbered circle of one step: filled when done, outlined when current, pale when still ahead. */
function stepNumberClass(step: ChooserStep, state: ChooserState): string {
  if (step < state.step) {
    return "bg-primary text-on-primary";
  }
  if (step === state.step) {
    return "bg-surface text-primary ring-2 ring-primary";
  }
  return "bg-rose-50 text-muted ring-[1.5px] ring-field-border";
}

function stepLabelClass(step: ChooserStep, state: ChooserState): string {
  if (step < state.step) {
    return "text-ink";
  }
  return step === state.step ? "font-semibold text-primary" : "text-muted";
}

function StepFace({ state, step }: { state: ChooserState; step: ChooserStep }): ReactElement {
  const done = step < state.step;

  return (
    <>
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold ${stepNumberClass(step, state)}`}
      >
        {done ? "✓" : step}
      </span>
      <span className={stepLabelClass(step, state)}>{STEP_NAMES[step]}</span>
      {done ? <span className="sr-only"> ({INVITATION_COPY.stepDone})</span> : null}
      {step === state.step ? (
        <span className="sr-only"> ({INVITATION_COPY.stepCurrent})</span>
      ) : null}
    </>
  );
}

/**
 * Where the flow is: one item per step, the done ones as links back to their own URL, the current one marked
 * `aria-current="step"`, and the ones ahead as plain text.
 */
export function ChooserStepper({ state }: { state: ChooserState }): ReactElement {
  return (
    <ol
      aria-label={INVITATION_COPY.stepsLabel}
      className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-field bg-surface px-3 py-2.5 ring-[1.5px] ring-rose-100"
    >
      {CHOOSER_STEPS.map((step) => (
        <li
          aria-current={step === state.step ? "step" : undefined}
          className="flex items-center gap-1.5 text-xs font-medium"
          key={step}
        >
          {step === CHOOSER_STEPS[0] ? null : (
            <span aria-hidden="true" className="mx-1 h-0.5 w-3.5 rounded-full bg-rose-100" />
          )}
          {step < state.step ? (
            <a
              className="flex items-center gap-1.5 rounded-sm hover:underline hover:decoration-rose hover:decoration-2 hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary"
              href={stepHref(state, step)}
            >
              <StepFace state={state} step={step} />
            </a>
          ) : (
            <StepFace state={state} step={step} />
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The footer bar of the artboard: which step the customer is on, the current selection (design · theme ·
 * package), and the two ways forward and back. On step 3 its primary action submits the create form, which
 * posts the published version id and the chosen package, so creating a draft stays one click.
 */
export function ChooserSummaryBar({
  canCreate,
  formId,
  state,
}: {
  /** Whether the create form exists: step 3 without packages has nothing to submit. */
  canCreate: boolean;
  formId: string;
  state: ChooserState;
}): ReactElement {
  const summary = selectionSummary(state);
  const back = backHref(state);
  const forward = continueHref(state);
  let action: ReactNode = null;

  if (state.step === 3) {
    action = canCreate ? (
      <button className={`${pageActionButton} min-h-12 px-6`} form={formId} type="submit">
        {INVITATION_COPY.createSubmit}
      </button>
    ) : null;
  } else if (forward !== undefined) {
    action = (
      <a className={`${pageActionButton} min-h-12 px-6`} href={forward}>
        {INVITATION_COPY.continueStep}
      </a>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-10">
      <div className="pointer-events-auto mx-auto flex max-w-6xl items-center gap-3 rounded-[1.375rem] bg-surface/95 p-2 pl-4 shadow-soft ring-[1.5px] ring-gold/70 backdrop-blur">
        <p className="min-w-0 flex-1">
          <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
            {INVITATION_COPY.stepOf(state.step)}
          </span>
          <span className="block truncate text-sm font-semibold text-ink">
            {summary ?? INVITATION_COPY.stepDesignHeading}
          </span>
        </p>
        {/*
          The narrow artboard keeps only the summary and the way forward in the bar, so the step's own
          content carries the way back there; from `sm` up the bar offers both, as the desktop artboard does.
        */}
        {back === undefined ? null : (
          <a className={`${textButton} hidden px-1 sm:inline`} href={back}>
            {INVITATION_COPY.backStep}
          </a>
        )}
        {action}
      </div>
    </div>
  );
}
