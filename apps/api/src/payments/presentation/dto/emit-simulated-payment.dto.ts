import { IsIn } from "class-validator";

// The body of the development-only simulated emit (M7 S4). Two outcomes and nothing else: the amount, the currency,
// the provider reference, and the event id all come from the stored payment, so a caller can never make the API sign
// an event about an amount it did not quote.

/** The two outcomes the simulated page offers: «Pagar» and «Simular rechazo». */
export const SIMULATED_EMIT_OUTCOMES = ["paid", "failed"] as const;

export type SimulatedEmitOutcome = (typeof SIMULATED_EMIT_OUTCOMES)[number];

export class EmitSimulatedPaymentDto {
  @IsIn(SIMULATED_EMIT_OUTCOMES)
  outcome!: SimulatedEmitOutcome;
}
