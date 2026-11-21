import {
  type AnalyticsDay,
  retentionCutoffDay,
  todayInAnalyticsZone,
} from "../domain/analytics-window";

// Retention of the view counts (M9 T11; S3, S7, L12): «90 días». The owner chose a command plus a scheduled Railway
// task, so the command has to be safe to run every day and safe to run twice: it deletes the rows whose day is older
// than the cutoff and nothing else, and a dry run reports the same count without deleting.
//
// The cutoff is the last day retention keeps — ninety days before today in `America/Mexico_City` — so a row of exactly
// ninety days stays and a row of ninety-one days goes. Nothing about a view is aggregated before it is deleted: the
// owner's answer was «se borran o se agregan», and the command takes the first.

/** The maintenance side of `InvitationView`: one bounded count and one bounded delete, both by day. */
export interface InvitationViewRetentionRepository {
  /** How many rows are older than the given day; a dry run reports this and deletes nothing. */
  countOlderThan(day: AnalyticsDay): Promise<number>;

  /** Deletes the rows older than the given day and answers how many it deleted. */
  deleteOlderThan(day: AnalyticsDay): Promise<number>;
}

export const INVITATION_VIEW_RETENTION_REPOSITORY = Symbol("InvitationViewRetentionRepository");

/** The instant retention is judged at; injectable so a suite observes the cutoff without the wall clock. */
export type RetentionClock = () => Date;

/** What one run did, or would do. Counts only: no invitation, slug, or owner is ever reported. */
export interface InvitationViewRetentionResult {
  dryRun: boolean;
  /** The rows deleted, or the rows a dry run would delete. */
  deletedViews: number;
}

/**
 * The retention command's use case (S3, S7). It asks the port for one bounded operation and reports the count, so the
 * command prints counts only and its exit code states whether it finished. A dry run calls the count instead of the
 * delete, which is why it cannot remove anything even if the cutoff is wrong.
 */
export class PurgeInvitationViewsUseCase {
  constructor(
    private readonly views: InvitationViewRetentionRepository,
    private readonly now: RetentionClock = () => new Date(),
  ) {}

  async execute(options: { dryRun: boolean }): Promise<InvitationViewRetentionResult> {
    const cutoff = retentionCutoffDay(todayInAnalyticsZone(this.now()));
    const deletedViews = options.dryRun
      ? await this.views.countOlderThan(cutoff)
      : await this.views.deleteOlderThan(cutoff);

    return { dryRun: options.dryRun, deletedViews };
  }
}
