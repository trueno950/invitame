import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AdministratorAccountRepository,
  IssueInitialPassword,
  IssueInitialPasswordResult,
} from "./administrator-account.repository";
import {
  type CreateAdministratorEvent,
  CreateAdministratorUseCase,
  InvalidAdministratorEmailError,
} from "./create-administrator.use-case";
import {
  generateInitialPassword,
  INITIAL_PASSWORD_ALPHABET,
  INITIAL_PASSWORD_LENGTH,
} from "./initial-password";

// The administrator creation use case (M2 T7; ADR 0004 decision 3, S20) with an in-memory port: the
// Prisma transaction is proved in `prisma-administrator-account.repository.db-spec.ts`.

class RecordingRepository implements AdministratorAccountRepository {
  readonly calls: IssueInitialPassword[] = [];

  constructor(private readonly result: IssueInitialPasswordResult) {}

  async issueInitialPassword(input: IssueInitialPassword): Promise<IssueInitialPasswordResult> {
    this.calls.push(input);
    return this.result;
  }
}

const NOW = new Date("2026-11-04T12:00:00.000Z");

function useCaseWith(result: IssueInitialPasswordResult) {
  const repository = new RecordingRepository(result);
  const events: CreateAdministratorEvent[] = [];
  const hashed: string[] = [];
  const useCase = new CreateAdministratorUseCase({
    accounts: repository,
    hashPassword: async (password) => {
      hashed.push(password);
      return `hash-of-${password.length}`;
    },
    log: (event) => events.push(event),
    generatePassword: () => "P".repeat(INITIAL_PASSWORD_LENGTH),
    now: () => NOW,
  });
  return { useCase, repository, events, hashed };
}

describe("initial administrator password (S20)", () => {
  it("has 24 characters from the unambiguous alphabet", () => {
    for (let sample = 0; sample < 200; sample += 1) {
      const password = generateInitialPassword();
      assert.equal(password.length, 24);
      for (const character of password) {
        assert.ok(INITIAL_PASSWORD_ALPHABET.includes(character), character);
      }
    }
  });

  it("uses an alphabet without look-alike characters", () => {
    for (const ambiguous of ["0", "O", "o", "1", "l", "I"]) {
      assert.equal(INITIAL_PASSWORD_ALPHABET.includes(ambiguous), false, ambiguous);
    }
    assert.equal(new Set(INITIAL_PASSWORD_ALPHABET).size, INITIAL_PASSWORD_ALPHABET.length);
    assert.equal(INITIAL_PASSWORD_ALPHABET.length, 56);
  });

  it("never repeats across samples (CSPRNG)", () => {
    const samples = new Set(Array.from({ length: 500 }, () => generateInitialPassword()));
    assert.equal(samples.size, 500);
  });
});

describe("CreateAdministratorUseCase", () => {
  it("creates an administrator with the hashed password and returns the password once", async () => {
    const { useCase, repository, events, hashed } = useCaseWith({
      outcome: "created",
      userId: "user-1",
    });

    const result = await useCase.execute("  New.Admin@Example.TEST ");

    assert.deepEqual(repository.calls, [
      { email: "new.admin@example.test", passwordHash: "hash-of-24", issuedAt: NOW },
    ]);
    assert.deepEqual(hashed, ["P".repeat(24)]);
    assert.deepEqual(result, {
      outcome: { outcome: "created", userId: "user-1" },
      initialPassword: "P".repeat(24),
    });
    assert.deepEqual(events, [{ event: "administrator_created", userId: "user-1" }]);
  });

  it("reissues the password of an un-enrolled administrator and reports revoked sessions", async () => {
    const { useCase, events } = useCaseWith({
      outcome: "reissued",
      userId: "user-2",
      revokedSessions: 2,
    });

    const result = await useCase.execute("admin@example.test");

    assert.equal(result.initialPassword, "P".repeat(24));
    assert.deepEqual(events, [
      { event: "administrator_password_reissued", userId: "user-2", revokedSessions: 2 },
    ]);
  });

  for (const reason of ["customer", "enrolled", "disabled"] as const) {
    it(`refuses a ${reason} account without returning a password`, async () => {
      const { useCase, events } = useCaseWith({ outcome: "refused", userId: "user-3", reason });

      const result = await useCase.execute("someone@example.test");

      assert.equal(result.initialPassword, undefined);
      assert.deepEqual(events, [
        { event: "administrator_create_refused", userId: "user-3", reason },
      ]);
    });
  }

  it("never logs the address, the password, or its hash", async () => {
    for (const result of [
      { outcome: "created", userId: "u" },
      { outcome: "reissued", userId: "u", revokedSessions: 0 },
      { outcome: "refused", userId: "u", reason: "enrolled" },
    ] as const) {
      const { useCase, events } = useCaseWith(result);
      await useCase.execute("secret.person@example.test");
      const logged = JSON.stringify(events);

      for (const forbidden of ["secret.person", "PPPP", "hash-of"]) {
        assert.equal(logged.includes(forbidden), false, forbidden);
      }
    }
  });

  for (const invalid of ["", "   ", "no-at-sign", "two words@example.test"]) {
    it(`rejects ${JSON.stringify(invalid)} before touching the repository`, async () => {
      const { useCase, repository, hashed } = useCaseWith({ outcome: "created", userId: "u" });

      await assert.rejects(useCase.execute(invalid), InvalidAdministratorEmailError);
      assert.equal(repository.calls.length, 0);
      assert.equal(hashed.length, 0);
    });
  }
});
