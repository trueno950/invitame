import type { ReactElement } from "react";

import { INVITATION_COPY } from "../../../../lib/customer/copy.ts";
import type {
  DesignChoice,
  OccasionChoice,
  StyleChoice,
} from "../../../../lib/customer/template-steps.ts";
import { findRenderer } from "../../../../lib/renderers/registry.ts";
import type { SampleInvitation } from "../../../../lib/renderers/samples.ts";

/*
 * The visual parts of the «Paso a paso» chooser (T10b; S9, S10), following
 * `design/template-chooser-v2/02-paso-a-paso-*.html`. A design is a link to the theme step, a theme is a
 * link that reloads the same step with that theme selected, and the large sample is the chosen theme at
 * phone width. Every choice is a server URL, so nothing here needs a line of client script: no `use client`,
 * no effect, and no inline handler.
 *
 * Every miniature is the real, allow-listed renderer rendering the fixed sample content of `samples.ts`,
 * never a stored screenshot. The renderer draws its own viewport-sized background layer with
 * `position: fixed`; the scaled wrapper makes it the containing block of that layer, and `contain: paint`
 * clips it to the frame, so a miniature never paints behind the page.
 */

/** The layouts draw a phone-width page of 390 px, and the miniature shows the top of it, scaled down. */
const RENDER_WIDTH = 390;

const CARD = "transition-colors duration-150 ease-out-soft";
const CHOSEN_BADGE =
  "absolute right-2.5 top-2.5 shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-medium uppercase tracking-[0.1em] text-primary ring-1 ring-primary/40";

interface FrameProperties {
  /** The frame's own size and its clip; the inner page keeps the renderer's 390 px width. */
  frameClass: string;
  frameStyle?: { width: number; height: number };
  scaleClass: string;
  scaleStyle?: { transform: string };
  componentKey: string;
  sample: SampleInvitation;
}

/** One scaled, clipped page of the real renderer: the only thing every miniature and stage share. */
function ScaledInvitation({
  frameClass,
  frameStyle,
  scaleClass,
  scaleStyle,
  componentKey,
  sample,
}: FrameProperties): ReactElement | null {
  const Renderer = findRenderer(componentKey);

  if (Renderer === undefined) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative overflow-hidden bg-surface ${frameClass}`}
      data-miniature=""
      style={{ contain: "paint", ...frameStyle }}
    >
      <div
        className={`origin-top-left ${scaleClass}`}
        style={{ width: RENDER_WIDTH, ...scaleStyle }}
      >
        <Renderer configuration={sample.configuration} content={sample.content} />
      </div>
    </div>
  );
}

/** The step-1 miniature of one design: its theme at 200 px, the size the artboard draws it. */
function DesignMiniature({
  componentKey,
  sample,
}: {
  componentKey: string;
  sample: SampleInvitation;
}): ReactElement | null {
  return (
    <ScaledInvitation
      componentKey={componentKey}
      frameClass="mx-auto rounded-xl ring-1 ring-gold/45"
      frameStyle={{ width: 200, height: 267 }}
      sample={sample}
      scaleClass=""
      scaleStyle={{ transform: "scale(0.5128205128)" }}
    />
  );
}

/** One step-1 design: a link to its theme step, marked when it is the design the query names. */
export function DesignCard({
  design,
  href,
  selected,
}: {
  design: DesignChoice;
  href: string;
  selected: boolean;
}): ReactElement {
  const style = design.styles[0];

  return (
    <a
      aria-current={selected ? "true" : undefined}
      className={`group relative flex h-full flex-col gap-2 rounded-panel p-3.5 text-center ring-[1.5px] hover:bg-rose-50 ${
        selected ? "bg-rose-50 ring-2 ring-primary" : "bg-surface ring-field-border"
      } ${CARD} focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary`}
      href={href}
    >
      <span className="flex items-baseline justify-center gap-1.5 text-base font-semibold text-ink">
        {design.title}
      </span>
      {selected ? <span className={CHOSEN_BADGE}>{INVITATION_COPY.chosen}</span> : null}
      <span className="text-xs font-medium text-primary">
        {INVITATION_COPY.styleCount(design.styles.length)}
      </span>
      <span className="mb-1 text-xs leading-5 text-pretty text-muted">
        {design.description ?? ""}
      </span>
      {style?.sample === undefined ? null : (
        <DesignMiniature componentKey={design.componentKey} sample={style.sample} />
      )}
    </a>
  );
}

/** One occasion of the chooser: a miniature of its first design, its name, and its design count. */
export function OccasionCard({
  occasion,
  href,
  selected,
}: {
  occasion: OccasionChoice;
  href: string;
  selected: boolean;
}): ReactElement {
  const first = occasion.designs[0];
  const sample = first?.styles[0]?.sample;

  return (
    <a
      aria-current={selected ? "true" : undefined}
      className={`group relative flex h-full flex-col gap-2 rounded-panel p-3 text-center ring-[1.5px] ${CARD} focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-primary ${
        selected ? "ring-2 ring-primary" : "bg-surface ring-field-border hover:ring-primary/50"
      }`}
      href={href}
    >
      <span className="text-base font-semibold text-ink">{occasion.name}</span>
      <span className="text-xs font-medium text-primary">
        {INVITATION_COPY.designCount(occasion.designs.length)}
      </span>
      {first === undefined || sample === undefined ? (
        <span className="flex h-[160px] items-center justify-center rounded-lg bg-rose-50 px-3 text-center text-xs leading-5 text-muted">
          {INVITATION_COPY.sampleMissing}
        </span>
      ) : (
        <ScaledInvitation
          componentKey={first.componentKey}
          frameClass="mx-auto h-[160px] w-[120px] rounded-lg ring-1 ring-gold/45"
          sample={sample}
          scaleClass=""
          scaleStyle={{ transform: "scale(0.3077)" }}
        />
      )}
    </a>
  );
}

/** One step-2 theme: a comparable miniature, its name, and the fact that it is the chosen one. */
export function ThemeTile({
  componentKey,
  href,
  selected,
  style,
}: {
  componentKey: string;
  href: string;
  selected: boolean;
  style: StyleChoice;
}): ReactElement {
  return (
    <a
      aria-current={selected ? "true" : undefined}
      className={`group flex flex-col items-center gap-1.5 rounded-xl p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        selected ? "bg-rose-50" : "hover:bg-rose-50"
      } ${CARD}`}
      href={href}
    >
      <span
        className={`relative block rounded-[0.625rem] ${
          selected ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""
        }`}
      >
        {style.sample === undefined ? (
          <span className="block h-[104px] w-[78px] rounded-[0.625rem] bg-rose-50 ring-1 ring-field-border sm:h-[146px] sm:w-[109px]" />
        ) : (
          <ScaledInvitation
            componentKey={componentKey}
            frameClass="h-[104px] w-[78px] rounded-[0.625rem] ring-1 ring-field-border sm:h-[146px] sm:w-[109px]"
            sample={style.sample}
            scaleClass="scale-[0.2] sm:scale-[0.28]"
          />
        )}
        {selected ? (
          <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-primary text-[0.625rem] font-bold leading-none text-on-primary">
            ✓
          </span>
        ) : null}
      </span>
      <span
        className={`text-center text-[0.6875rem] leading-tight ${
          selected ? "font-semibold text-primary" : "text-muted"
        }`}
      >
        {style.label}
      </span>
    </a>
  );
}

/**
 * The stage of step 2: the chosen theme at phone width, clipped to a frame the artboard sizes, with the tag
 * that says the invitation shows example data. The step head carries the one link to the full sample page.
 */
export function SampleStage({
  componentKey,
  sample,
}: {
  componentKey: string;
  sample: SampleInvitation | undefined;
}): ReactElement {
  return (
    <div className="rounded-panel bg-surface p-3 ring-[1.5px] ring-gold sm:p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{INVITATION_COPY.stageTitle}</p>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-muted">
          {INVITATION_COPY.sampleNote}
        </span>
      </div>

      {sample === undefined ? (
        <p className="rounded-xl bg-rose-50 px-3 py-8 text-center text-sm leading-6 text-pretty text-muted">
          {INVITATION_COPY.sampleMissing}
        </p>
      ) : (
        <div className="relative">
          <ScaledInvitation
            componentKey={componentKey}
            frameClass="mx-auto h-[430px] w-[325px] rounded-xl ring-1 ring-gold/45 sm:h-[560px] sm:w-[390px]"
            sample={sample}
            scaleClass="scale-[0.8333] sm:scale-100"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-b from-transparent to-surface sm:hidden" />
        </div>
      )}
    </div>
  );
}
