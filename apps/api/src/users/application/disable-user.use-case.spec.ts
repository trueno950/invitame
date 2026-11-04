import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DISABLE_USER_EVENT,
  type DisableUserEvent,
  DisableUserUseCase,
  InvalidEmailError,
} from "./disable-user.use-case";
import type { DisabledUser, UserAccessRepository } from "./user-access.repository";

// Disabling a user (M2 T6a; ADR 0004 decision 6, S9, S18) against a recording repository.

const EMAIL = "Guest.Person@Example.test";
const USER_ID = "8b0f7c1e-5f0a-4d8e-9a43-2a1d5c3b9e10";

class RecordingRepository implements UserAccessRepository {
  readonly calls: string[] = [];
  private status: "ACTIVE" | "DISABLED" = "ACTIVE";
  private sessions = 2;

  constructor(private readonly known: boolean = true) {}

  async disableAndRevokeSessions(email: string): Promise<DisabledUser | null> {
    this.calls.push(email);
    if (!this.known) {
      return null;
    }

    const alreadyDisabled = this.status === "DISABLED";
    const revokedSessions = this.sessions;
    this.status = "DISABLED";
    this.sessions = 0;
    return { userId: USER_ID, alreadyDisabled, revokedSessions };
  }
}

function createUseCase(repository: UserAccessRepository) {
  const events: DisableUserEvent[] = [];
  return { useCase: new DisableUserUseCase(repository, (event) => events.push(event)), events };
}

describe("DisableUserUseCase", () => {
  it("disables the user and revokes their sessions in one repository call, by normalized email", async () => {
    const repository = new RecordingRepository();
    const { useCase, events } = createUseCase(repository);

    const result = await useCase.execute(`  ${EMAIL} `);

    assert.deepEqual(repository.calls, ["guest.person@example.test"]);
    assert.deepEqual(result, { userId: USER_ID, alreadyDisabled: false, revokedSessions: 2 });
    assert.deepEqual(events, [
      {
        event: DISABLE_USER_EVENT.DISABLED,
        userId: USER_ID,
        alreadyDisabled: false,
        revokedSessions: 2,
      },
    ]);
  });

  it("is idempotent: a second run keeps the user disabled and revokes nothing more", async () => {
    const repository = new RecordingRepository();
    const { useCase, events } = createUseCase(repository);

    await useCase.execute(EMAIL);
    const second = await useCase.execute(EMAIL);

    assert.deepEqual(second, { userId: USER_ID, alreadyDisabled: true, revokedSessions: 0 });
    assert.equal(events.length, 2);
  });

  it("reports an unknown email as not found", async () => {
    const { useCase, events } = createUseCase(new RecordingRepository(false));

    assert.equal(await useCase.execute(EMAIL), null);
    assert.deepEqual(events, [{ event: DISABLE_USER_EVENT.NOT_FOUND }]);
  });

  it("never logs the email address", async () => {
    for (const known of [true, false]) {
      const { useCase, events } = createUseCase(new RecordingRepository(known));
      await useCase.execute(EMAIL);

      const logged = JSON.stringify(events).toLowerCase();
      assert.ok(!logged.includes("guest.person"));
      assert.ok(!logged.includes("example.test"));
    }
  });

  for (const input of ["", "   ", "not-an-email"]) {
    it(`rejects ${JSON.stringify(input)} without touching the repository`, async () => {
      const repository = new RecordingRepository();
      const { useCase, events } = createUseCase(repository);

      await assert.rejects(useCase.execute(input), InvalidEmailError);
      assert.deepEqual(repository.calls, []);
      assert.deepEqual(events, []);
    });
  }
});
