import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AdministratorRecoveryRepository,
  IssueInitialPassword,
  ResetSecondFactorResult,
} from "./administrator-account.repository";
import { InvalidAdministratorEmailError } from "./create-administrator.use-case";
import {
  type ResetSecondFactorEvent,
  ResetSecondFactorUseCase,
} from "./reset-second-factor.use-case";

// The administrator recovery use case (M2 T10a, S44) with an in-memory port: the Prisma transaction
// is proved in `prisma-administrator-account.repository.db-spec.ts`.

class RecordingRepository implements AdministratorRecoveryRepository {
  readonly calls: IssueInitialPassword[] = [];

  constructor(private readonly result: ResetSecondFactorResult | Error) {}

  async resetSecondFactor(input: IssueInitialPassword): Promise<ResetSecondFactorResult> {
    this.calls.push(input);
    if (this.result instanceof Error) {
      throw this.result;
    }
    return this.result;
  }
}

const NOW = new Date("2026-11-07T12:00:00.000Z");
const PASSWORD = "P".repeat(24);

function useCaseWith(result: ResetSecondFactorResult | Error) {
  const repository = new RecordingRepository(result);
  const events: ResetSecondFactorEvent[] = [];
  const useCase = new ResetSecondFactorUseCase({
    accounts: repository,
    hashPassword: async (password) => `hash-of-${password.length}`,
    log: (event) => events.push(event),
    generatePassword: () => PASSWORD,
    now: () => NOW,
  });
  return { useCase, repository, events };
}

describe("ResetSecondFactorUseCase", () => {
  // The port reports the same outcome for a pending and an enrolled administrator: both are reset.
  for (const state of ["pending", "enrolled"] as const) {
    it(`resets a ${state} administrator and returns the new initial password once`, async () => {
      const { useCase, repository, events } = useCaseWith({
        outcome: "reset",
        userId: `user-${state}`,
        revokedSessions: 2,
      });

      const result = await useCase.execute("  Locked.Admin@Example.TEST ");

      assert.deepEqual(repository.calls, [
        { email: "locked.admin@example.test", passwordHash: "hash-of-24", issuedAt: NOW },
      ]);
      assert.deepEqual(result, {
        outcome: { outcome: "reset", userId: `user-${state}`, revokedSessions: 2 },
        initialPassword: PASSWORD,
      });
      assert.deepEqual(events, [
        { event: "administrator_second_factor_reset", userId: `user-${state}` },
      ]);
    });
  }

  for (const refused of [
    { outcome: "refused", reason: "unknown" },
    { outcome: "refused", userId: "user-c", reason: "customer" },
    { outcome: "refused", userId: "user-d", reason: "disabled" },
  ] as const) {
    it(`refuses ${refused.reason} without a password and logs the reason`, async () => {
      const { useCase, repository, events } = useCaseWith(refused);

      const result = await useCase.execute("someone@example.test");

      assert.deepEqual(result, { outcome: refused });
      assert.equal(repository.calls.length, 1, "the refusal is decided inside the transaction");
      const { outcome: _outcome, ...fields } = refused;
      assert.deepEqual(events, [{ event: "administrator_second_factor_reset_refused", ...fields }]);
    });
  }

  it("logs only the error class of a repository failure and rethrows it", async () => {
    const failure = new Error('relation "user" violates locked.admin@example.test');
    failure.name = "PrismaClientKnownRequestError";
    const { useCase, events } = useCaseWith(failure);

    await assert.rejects(useCase.execute("locked.admin@example.test"), failure);

    assert.deepEqual(events, [
      { event: "administrator_second_factor_reset_failed", error: "PrismaClientKnownRequestError" },
    ]);
  });

  it("never logs the address, the password, or its hash", async () => {
    for (const result of [
      { outcome: "reset", userId: "u", revokedSessions: 1 },
      { outcome: "refused", reason: "unknown" },
      { outcome: "refused", userId: "u", reason: "disabled" },
      new Error("secret.person@example.test PPPP hash-of-24"),
    ] as const) {
      const { useCase, events } = useCaseWith(result);
      await useCase.execute("secret.person@example.test").catch(() => undefined);
      const logged = JSON.stringify(events);

      assert.equal(events.length, 1, "one event per run");
      for (const forbidden of ["secret.person", "PPPP", "hash-of"]) {
        assert.equal(logged.includes(forbidden), false, forbidden);
      }
    }
  });

  for (const invalid of ["", "   ", "no-at-sign"]) {
    it(`rejects ${JSON.stringify(invalid)} before touching the repository`, async () => {
      const { useCase, repository, events } = useCaseWith({
        outcome: "refused",
        reason: "unknown",
      });

      await assert.rejects(useCase.execute(invalid), InvalidAdministratorEmailError);
      assert.equal(repository.calls.length, 0);
      assert.deepEqual(events, []);
    });
  }
});
