import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type InvitationViewRetentionRepository,
  INVITATION_VIEW_RETENTION_REPOSITORY,
  PurgeInvitationViewsUseCase,
} from "./invitation-view-retention";

// The retention rule of the views (M9 T11; S3, S7, L12): ninety days are kept and anything older is deleted, with a dry
// run that counts without deleting. The clock is explicit, so the cutoff is observed exactly; the SQL of the adapter
// and the day boundary are proved in the `*.db-spec.ts` suite.

/** 2026-11-29 02:00 UTC is 2026-11-28 in Ciudad de México, so the cutoff is 2026-08-30. */
const NOW = new Date("2026-11-29T02:00:00.000Z");

class FakeRetentionRepository implements InvitationViewRetentionRepository {
  readonly counted: string[] = [];
  readonly deleted: string[] = [];
  /** The rows the fake table holds, oldest first, as `YYYY-MM-DD` days. */
  rows: string[] = [];

  async countOlderThan(day: string): Promise<number> {
    this.counted.push(day);
    return this.rows.filter((row) => row < day).length;
  }

  async deleteOlderThan(day: string): Promise<number> {
    this.deleted.push(day);
    const kept = this.rows.filter((row) => row >= day);

    return this.rows.length - kept.length;
  }
}

function harness(rows: string[]) {
  const views = new FakeRetentionRepository();
  views.rows = rows;

  return { views, purge: new PurgeInvitationViewsUseCase(views, () => NOW) };
}

describe("invitation view retention (M9 T11; S3)", () => {
  it("deletes the views older than ninety days and keeps a row of exactly ninety days", async () => {
    const { views, purge } = harness(["2026-08-29", "2026-08-30", "2026-11-28"]);

    const result = await purge.execute({ dryRun: false });

    assert.deepEqual(result, { dryRun: false, deletedViews: 1 });
    assert.deepEqual(
      views.deleted,
      ["2026-08-30"],
      "the cutoff is the last kept day, not the first deleted one",
    );
    assert.equal(views.counted.length, 0, "an apply run counts nothing, it deletes");
  });

  it("counts what it would delete in a dry run and deletes nothing", async () => {
    const { views, purge } = harness(["2026-08-29", "2026-08-30", "2026-11-28"]);

    const result = await purge.execute({ dryRun: true });

    assert.deepEqual(result, { dryRun: true, deletedViews: 1 });
    assert.deepEqual(views.counted, ["2026-08-30"]);
    assert.deepEqual(views.deleted, [], "a dry run never deletes");
  });

  it("is idempotent: a second run with nothing older than the cutoff answers zero", async () => {
    const { purge } = harness(["2026-08-30", "2026-11-28"]);

    assert.deepEqual(await purge.execute({ dryRun: false }), { dryRun: false, deletedViews: 0 });
    assert.deepEqual(await purge.execute({ dryRun: false }), { dryRun: false, deletedViews: 0 });
  });

  it("names the retention port the invitations module declares", () => {
    assert.equal(typeof INVITATION_VIEW_RETENTION_REPOSITORY, "symbol");
  });
});
