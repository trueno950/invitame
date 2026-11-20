import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_ACTION_REASON } from "../../admin/domain/admin-action";
import type { SignInCodeResender } from "../../auth/sign-in-code/sign-in-code-resender";
import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  AdminAccountProtectedError,
  UserCannotSignInByCodeError,
} from "../domain/account-support.errors";
import type {
  AdminAccountDisabled,
  AdminSignInCodeRequest,
  AdminUserAccountRepository,
  AdminUserActionAudit,
} from "./admin-user-account.repository";
import {
  DisableAdminUserAccountUseCase,
  ReactivateAdminUserAccountUseCase,
  ResendSignInCodeUseCase,
} from "./admin-user-account.use-cases";

// The three account support use cases (M9 T9; S4, S6, L9) against recording ports. A use case decides nothing about
// whether an action may run — the repository states the guarded rules inside its transaction — but it does build the
// one audit entry, so the actor is always the session's own id, and the resend waits for the recorded request before
// it asks the auth module for a code.

const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "duena@example.test";

const COMMAND = {
  userId: USER_ID,
  adminUserId: ADMIN_ID,
  reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
  note: "  Lo pidió por correo.  ",
} as const;

/** The audit the use case hands the port: the note as the administrator sent it; the recorder trims it. */
const AUDIT: AdminUserActionAudit = {
  adminUserId: ADMIN_ID,
  reason: ADMIN_ACTION_REASON.OWNER_REQUEST,
  note: "  Lo pidió por correo.  ",
};

type Answer<T> = T | Error | null;

class RecordingAccounts implements AdminUserAccountRepository {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  constructor(
    private readonly disable: Answer<AdminAccountDisabled> = {
      status: "DISABLED",
      revokedSessions: 2,
    },
    private readonly reactivate: Answer<{ status: "ACTIVE" }> = { status: "ACTIVE" },
    private readonly request: Answer<AdminSignInCodeRequest> = { email: EMAIL },
  ) {}

  private answer<T>(value: Answer<T>): T | null {
    if (value instanceof Error) {
      throw value;
    }
    return value;
  }

  async disableForAdmin(userId: string, audit: AdminUserActionAudit) {
    this.calls.push({ method: "disable", args: [userId, audit] });
    return this.answer(this.disable);
  }

  async reactivateForAdmin(userId: string, audit: AdminUserActionAudit) {
    this.calls.push({ method: "reactivate", args: [userId, audit] });
    return this.answer(this.reactivate);
  }

  async requestSignInCodeForAdmin(userId: string, audit: AdminUserActionAudit) {
    this.calls.push({ method: "request", args: [userId, audit] });
    return this.answer(this.request);
  }
}

class RecordingResender implements SignInCodeResender {
  readonly requested: string[] = [];

  constructor(private readonly order: string[] = []) {}

  async requestSignInCode(email: string): Promise<void> {
    this.order.push("resend");
    this.requested.push(email);
  }
}

describe("DisableAdminUserAccountUseCase (M9 T9; S4, S6)", () => {
  it("hands the port the account and the audit entry, and answers what it changed", async () => {
    const accounts = new RecordingAccounts();

    assert.deepEqual(await new DisableAdminUserAccountUseCase(accounts).execute(COMMAND), {
      status: "DISABLED",
      revokedSessions: 2,
    });
    assert.deepEqual(accounts.calls, [{ method: "disable", args: [USER_ID, AUDIT] }]);
  });

  it("lets the port's refusals through unchanged, so the route can answer its own conflict", async () => {
    for (const refusal of [new AdminAccountProtectedError(), new AccountAlreadyDisabledError()]) {
      const accounts = new RecordingAccounts(refusal);

      await assert.rejects(
        new DisableAdminUserAccountUseCase(accounts).execute(COMMAND),
        (error: unknown) => error === refusal,
      );
    }
  });

  it("answers null for an account no user has, so the route answers one 404", async () => {
    const accounts = new RecordingAccounts(null);

    assert.equal(await new DisableAdminUserAccountUseCase(accounts).execute(COMMAND), null);
  });
});

describe("ReactivateAdminUserAccountUseCase (M9 T9; S4, S6, L9)", () => {
  it("hands the port the account and the audit entry, and answers what it changed", async () => {
    const accounts = new RecordingAccounts();

    assert.deepEqual(await new ReactivateAdminUserAccountUseCase(accounts).execute(COMMAND), {
      status: "ACTIVE",
    });
    assert.deepEqual(accounts.calls, [{ method: "reactivate", args: [USER_ID, AUDIT] }]);
  });

  it("lets the port's refusals through unchanged", async () => {
    for (const refusal of [new AdminAccountProtectedError(), new AccountAlreadyActiveError()]) {
      const accounts = new RecordingAccounts(undefined, refusal);

      await assert.rejects(
        new ReactivateAdminUserAccountUseCase(accounts).execute(COMMAND),
        (error: unknown) => error === refusal,
      );
    }
  });

  it("answers null for an account no user has", async () => {
    const accounts = new RecordingAccounts(undefined, null);

    assert.equal(await new ReactivateAdminUserAccountUseCase(accounts).execute(COMMAND), null);
  });
});

describe("ResendSignInCodeUseCase (M9 T9; S4, S6, L9)", () => {
  it("records the request first and only then asks for the code", async () => {
    const order: string[] = [];
    const accounts = new RecordingAccounts();
    const recorded = accounts.requestSignInCodeForAdmin.bind(accounts);
    accounts.requestSignInCodeForAdmin = async (...args) => {
      order.push("record");
      return recorded(...args);
    };
    const codes = new RecordingResender(order);
    const useCase = new ResendSignInCodeUseCase(accounts, codes);

    const result = await useCase.execute(COMMAND);

    assert.deepEqual(result, { outcome: "requested" });
    assert.deepEqual(order, ["record", "resend"], "the audit row is written before the request");
    assert.deepEqual(codes.requested, [EMAIL]);
    assert.ok(!JSON.stringify(result).includes(EMAIL), "the answer carries no address");
  });

  it("sends nothing, and answers the refusal, when the account may not sign in by code", async () => {
    const accounts = new RecordingAccounts(undefined, undefined, new UserCannotSignInByCodeError());
    const codes = new RecordingResender();

    await assert.rejects(
      new ResendSignInCodeUseCase(accounts, codes).execute(COMMAND),
      (error: unknown) => error instanceof UserCannotSignInByCodeError,
    );
    assert.deepEqual(codes.requested, [], "a refused request sends no code");
  });

  it("answers null, and sends nothing, for an account no user has", async () => {
    const accounts = new RecordingAccounts(undefined, undefined, null);
    const codes = new RecordingResender();

    assert.equal(await new ResendSignInCodeUseCase(accounts, codes).execute(COMMAND), null);
    assert.deepEqual(codes.requested, []);
  });
});
