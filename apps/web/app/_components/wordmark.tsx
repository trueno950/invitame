import { Ornament } from "./ornament.tsx";

/**
 * The InvitaMe wordmark (M2 T8t; S35): "Invita" in the display serif, "Me" in the wine script, and
 * a small rose. Assistive technology reads it as the single word "InvitaMe".
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-baseline leading-none">
      <span className="sr-only">InvitaMe</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        <span className="font-display text-[1.875rem] font-semibold tracking-[0.01em] text-ink">
          Invita
        </span>
        <span className="ml-px translate-y-0.5 font-script text-[2.375rem] text-primary">Me</span>
        <Ornament className="ml-1 size-3.5 self-start" name="rose" />
      </span>
    </span>
  );
}
