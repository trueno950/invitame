import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type InvitationViewRepository,
  INVITATION_VIEW_REPOSITORY,
  RecordInvitationViewUseCase,
} from "./invitation-views";

// Counting one opening of a public or a guest link (M9 T11; S2, S7, L12). This suite owns the application rule: the day
// is taken from the use case's own clock — the adapter converts that instant to the Ciudad de México day in SQL — and
// the source is the closed pair the API can write. PostgreSQL's upsert behavior is proved in the `*.db-spec.ts` suite.

/** The clock every case counts at: 2026-11-29 05:30 UTC is 2026-11-28 23:30 in Ciudad de México. */
const NOW = new Date("2026-11-29T05:30:00.000Z");

class FakeViewRepository implements InvitationViewRepository {
  readonly increments: Array<{ invitationId: string; source: string; at: Date }> = [];
  fail = false;

  async increment(invitationId: string, source: "PUBLIC" | "GUEST", at: Date): Promise<void> {
    if (this.fail) {
      throw new Error("counter unavailable");
    }
    this.increments.push({ invitationId, source, at });
  }
}

const INVITATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("recording one invitation view (M9 T11; S2, S7)", () => {
  it("counts a PUBLIC opening of the public link with the instant of the request", async () => {
    const views = new FakeViewRepository();

    await new RecordInvitationViewUseCase(views, () => NOW).execute({
      invitationId: INVITATION_ID,
      source: "PUBLIC",
    });

    assert.deepEqual(views.increments, [
      { invitationId: INVITATION_ID, source: "PUBLIC", at: NOW },
    ]);
  });

  it("counts a GUEST opening of a guest link as its own source", async () => {
    const views = new FakeViewRepository();
    const useCase = new RecordInvitationViewUseCase(views, () => NOW);

    await useCase.execute({ invitationId: INVITATION_ID, source: "GUEST" });
    await useCase.execute({ invitationId: INVITATION_ID, source: "PUBLIC" });

    assert.deepEqual(
      views.increments.map((increment) => increment.source),
      ["GUEST", "PUBLIC"],
    );
  });

  it("hands a counter failure to the caller, which is what the route logs instead of answering it", async () => {
    const views = new FakeViewRepository();
    views.fail = true;

    await assert.rejects(
      new RecordInvitationViewUseCase(views, () => NOW).execute({
        invitationId: INVITATION_ID,
        source: "PUBLIC",
      }),
      /counter unavailable/,
    );
    assert.deepEqual(views.increments, []);
  });

  it("names the view port the invitations module declares", () => {
    assert.equal(typeof INVITATION_VIEW_REPOSITORY, "symbol");
  });
});
