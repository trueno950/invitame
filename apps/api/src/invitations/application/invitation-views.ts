// Counting one opening of an invitation link (M9 T11; S2, S7, L12). The owner chose «Cada apertura del enlace» — every
// served public invitation, reloads and the owner's own visit included — shown as «aperturas», never «personas», with
// the public link and the guest links counted together and separately. Nothing about the visitor is stored: the row is
// one calendar day in `America/Mexico_City`, one source, and one counter.
//
// Counting happens in the public reads, only after the invitation resolved and is renderable, and it is
// fire-and-forget: the route never waits for it and a failure never changes the guest's answer. This use case is the
// application boundary of that write; the adapter performs one upsert, so a retry and a concurrent request both
// increment instead of duplicating.

/** The two links a view can open (S7): the plain public link and one guest's personal link. Stored verbatim. */
export type InvitationViewSource = "PUBLIC" | "GUEST";

/**
 * The write side of `InvitationView`, owned by this module. `increment` is one `INSERT … ON CONFLICT DO UPDATE SET
 * count = count + 1`, with the day computed in SQL from `at` in `America/Mexico_City`, so two requests in the same
 * second and two requests on either side of the zone's midnight each land in the row they belong to.
 */
export interface InvitationViewRepository {
  increment(invitationId: string, source: InvitationViewSource, at: Date): Promise<void>;
}

export const INVITATION_VIEW_REPOSITORY = Symbol("InvitationViewRepository");

/** The instant a view is counted at; injectable so a suite observes the day boundary without the wall clock. */
export type InvitationViewClock = () => Date;

/** One opening to count: the invitation that was served and which of its links the guest opened. */
export interface RecordInvitationViewInput {
  invitationId: string;
  source: InvitationViewSource;
}

/**
 * Counts one served opening. The caller does not await it and logs its failure once instead of answering it, so the
 * guest page is the same whether the counter is healthy or not (S7). The rejection is deliberately not swallowed here:
 * the route owns the one structured line, and a test can observe the failure.
 */
export class RecordInvitationViewUseCase {
  constructor(
    private readonly views: InvitationViewRepository,
    private readonly now: InvitationViewClock = () => new Date(),
  ) {}

  async execute(input: RecordInvitationViewInput): Promise<void> {
    await this.views.increment(input.invitationId, input.source, this.now());
  }
}
