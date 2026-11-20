import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AdminInvitationsClient,
  InvitationsFailure,
  InvitationsResult,
} from "../../server/admin-invitations-client.ts";
import type {
  AccountFailure,
  AccountResult,
  AdminUsersClient,
} from "../../server/admin-users-client.ts";
import { ApiClientError } from "../../server/api-client.ts";
import { SIGN_IN_PATH } from "../catalog/commands.ts";
import {
  disableOwnerAccount,
  reactivateOwnerAccount,
  resendOwnerSignInCode,
  unpublishInvitation,
} from "./commands.ts";
import { INVITATIONS_PATHS, invitationDetailPath } from "./copy.ts";

// The logic of the administrator's unpublish server action (M9 T8; S4, S6). It reads the submitted form, calls the API
// client at most once, and answers the path to redirect to — always a 303 after POST, with `?notice=` or `?error=` and
// a code from a fixed set. The API authorizes the call, applies the transition, and writes the audit row; nothing here
// decides whether an invitation may be unpublished, and the server repeats the form's own rule for «Otro».

const INVITATION_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const DETAIL_PATH = invitationDetailPath(INVITATION_ID);

const OK: InvitationsResult<unknown> = { ok: true, value: {} };

type Call = { method: string; args: unknown[] };

function stub(answer: InvitationsResult<unknown> | Error = OK) {
  const calls: Call[] = [];
  const api = {
    list: async (...args: unknown[]) => {
      calls.push({ method: "list", args });
      throw new Error("the unpublish command never lists");
    },
    detail: async (...args: unknown[]) => {
      calls.push({ method: "detail", args });
      throw new Error("the unpublish command never reads a detail");
    },
    unpublish: async (...args: unknown[]) => {
      calls.push({ method: "unpublish", args });
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  } as unknown as AdminInvitationsClient;

  return { api, calls };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const failure = (value: InvitationsFailure): InvitationsResult<never> => ({
  ok: false,
  failure: value,
});

describe("unpublishInvitation", () => {
  it("asks once with the reason and the note, and returns to the invitation with the notice", async () => {
    const { api, calls } = stub();

    assert.equal(
      await unpublishInvitation(
        api,
        form({
          invitationId: INVITATION_ID,
          reason: "OWNER_REQUEST",
          note: "  Lo pidió por correo.  ",
        }),
      ),
      `${DETAIL_PATH}?notice=unpublished`,
    );
    assert.deepEqual(calls, [
      {
        method: "unpublish",
        args: [INVITATION_ID, { reason: "OWNER_REQUEST", note: "Lo pidió por correo." }],
      },
    ]);
  });

  it("sends no note when the administrator left it empty, and accepts every reason of the closed set", async () => {
    for (const reason of ["ABUSE", "OWNER_REQUEST", "PAYMENT_ERROR"] as const) {
      const { api, calls } = stub();

      assert.equal(
        await unpublishInvitation(api, form({ invitationId: INVITATION_ID, reason, note: "   " })),
        `${DETAIL_PATH}?notice=unpublished`,
        reason,
      );
      assert.deepEqual(calls, [
        { method: "unpublish", args: [INVITATION_ID, { reason, note: null }] },
      ]);
    }
  });

  it("sends «Otro» with its note", async () => {
    const { api, calls } = stub();

    assert.equal(
      await unpublishInvitation(
        api,
        form({ invitationId: INVITATION_ID, reason: "OTHER", note: "Un error del sistema." }),
      ),
      `${DETAIL_PATH}?notice=unpublished`,
    );
    assert.deepEqual(calls, [
      {
        method: "unpublish",
        args: [INVITATION_ID, { reason: "OTHER", note: "Un error del sistema." }],
      },
    ]);
  });

  it("reports each refusal of the API back to the invitation with its code", async () => {
    for (const code of [
      "not-found",
      "not-published",
      "already-archived",
      "validation",
      "unavailable",
    ] as const) {
      const { api } = stub(failure(code));

      assert.equal(
        await unpublishInvitation(api, form({ invitationId: INVITATION_ID, reason: "ABUSE" })),
        `${DETAIL_PATH}?error=${code}`,
        code,
      );
    }
  });

  it("sends an ended session to sign in and a customer away from the panel", async () => {
    assert.equal(
      await unpublishInvitation(
        stub(failure("signed-out")).api,
        form({ invitationId: INVITATION_ID, reason: "ABUSE" }),
      ),
      SIGN_IN_PATH,
    );
    assert.equal(
      await unpublishInvitation(
        stub(failure("forbidden")).api,
        form({ invitationId: INVITATION_ID, reason: "ABUSE" }),
      ),
      "/cuenta",
    );
  });

  it("reports an unexpected failure as unavailable instead of pretending it succeeded", async () => {
    assert.equal(
      await unpublishInvitation(
        stub(new ApiClientError("unavailable", 503)).api,
        form({ invitationId: INVITATION_ID, reason: "ABUSE" }),
      ),
      `${DETAIL_PATH}?error=unavailable`,
    );
  });

  it("never calls the API for a missing or malformed invitation id", async () => {
    const { api, calls } = stub();
    const repeatedId = new FormData();
    repeatedId.append("invitationId", INVITATION_ID);
    repeatedId.append("invitationId", INVITATION_ID);
    repeatedId.set("reason", "ABUSE");

    for (const data of [
      form({ reason: "ABUSE" }),
      form({ invitationId: "", reason: "ABUSE" }),
      form({ invitationId: "no-es-un-uuid", reason: "ABUSE" }),
      form({ invitationId: `${INVITATION_ID}/unpublish`, reason: "ABUSE" }),
      repeatedId,
    ]) {
      assert.equal(
        await unpublishInvitation(api, data),
        `${INVITATIONS_PATHS.index}?error=invalid-form`,
      );
    }
    assert.deepEqual(calls, []);
  });

  it("never calls the API for a reason outside the closed set", async () => {
    const { api, calls } = stub();

    for (const data of [
      form({ invitationId: INVITATION_ID }),
      form({ invitationId: INVITATION_ID, reason: "" }),
      form({ invitationId: INVITATION_ID, reason: "abuse" }),
      form({ invitationId: INVITATION_ID, reason: "PAID" }),
    ]) {
      assert.equal(await unpublishInvitation(api, data), `${DETAIL_PATH}?error=invalid-form`);
    }
    assert.deepEqual(calls, []);
  });

  it("repeats «Otro» needs a note, and bounds the note at 500 characters, before calling the API", async () => {
    const { api, calls } = stub();

    for (const data of [
      form({ invitationId: INVITATION_ID, reason: "OTHER" }),
      form({ invitationId: INVITATION_ID, reason: "OTHER", note: "   " }),
      form({ invitationId: INVITATION_ID, reason: "ABUSE", note: "a".repeat(501) }),
      form({ invitationId: INVITATION_ID, reason: "OTHER", note: "a".repeat(501) }),
    ]) {
      assert.equal(await unpublishInvitation(api, data), `${DETAIL_PATH}?error=invalid-form`);
    }
    assert.deepEqual(calls, []);

    // The bound counts the note as stored: 500 characters are accepted, and the surrounding spaces do not count.
    const accepted = stub();
    assert.equal(
      await unpublishInvitation(
        accepted.api,
        form({ invitationId: INVITATION_ID, reason: "OTHER", note: `  ${"a".repeat(500)}  ` }),
      ),
      `${DETAIL_PATH}?notice=unpublished`,
    );
  });
});

// The three owner account actions of the support card (M9 T9; S4, S6, L9). Each reads the submitted form — the
// invitation the card belongs to, the owner's account id, the reason, and the note — calls the account client once, and
// answers the invitation's page with `?notice=` or `?error=` and a code from a fixed set. The API authorizes the call,
// applies the change, and writes the audit row; nothing here decides whether an action may run.

const OWNER_ID = "9b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e19";

function accountStub(answer: AccountResult<unknown> | Error = { ok: true, value: {} }) {
  const calls: Call[] = [];
  const api = {
    disable: async (...args: unknown[]) => {
      calls.push({ method: "disable", args });
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    reactivate: async (...args: unknown[]) => {
      calls.push({ method: "reactivate", args });
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
    resendSignInCode: async (...args: unknown[]) => {
      calls.push({ method: "resendSignInCode", args });
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    },
  } as unknown as AdminUsersClient;

  return { api, calls };
}

const accountFailure = (value: AccountFailure): AccountResult<never> => ({
  ok: false,
  failure: value,
});

const OWNER_FORM = {
  invitationId: INVITATION_ID,
  userId: OWNER_ID,
  reason: "OWNER_REQUEST",
  note: "  Lo pidió por correo.  ",
} as const;

describe("the owner account actions (M9 T9; S4, S6, L9)", () => {
  it("asks once with the owner's id, the reason, and the trimmed note, and returns with the notice", async () => {
    const cases = [
      ["disable", disableOwnerAccount, "account-disabled"],
      ["reactivate", reactivateOwnerAccount, "account-reactivated"],
      ["resendSignInCode", resendOwnerSignInCode, "sign-in-code-requested"],
    ] as const;

    for (const [method, command, notice] of cases) {
      const { api, calls } = accountStub();

      assert.equal(await command(api, form(OWNER_FORM)), `${DETAIL_PATH}?notice=${notice}`, method);
      assert.deepEqual(calls, [
        { method, args: [OWNER_ID, { reason: "OWNER_REQUEST", note: "Lo pidió por correo." }] },
      ]);
    }
  });

  it("sends no note when the administrator left it empty, and requires one for «Otro»", async () => {
    const { api, calls } = accountStub();

    assert.equal(
      await disableOwnerAccount(api, form({ ...OWNER_FORM, note: "   " })),
      `${DETAIL_PATH}?notice=account-disabled`,
    );
    assert.deepEqual(calls, [
      { method: "disable", args: [OWNER_ID, { reason: "OWNER_REQUEST", note: null }] },
    ]);

    const refused = accountStub();
    for (const data of [
      form({ ...OWNER_FORM, reason: "OTHER", note: "" }),
      form({ ...OWNER_FORM, reason: "OTHER", note: "   " }),
      form({ ...OWNER_FORM, reason: "OTHER", note: "a".repeat(501) }),
    ]) {
      assert.equal(
        await disableOwnerAccount(refused.api, data),
        `${DETAIL_PATH}?error=invalid-form`,
      );
    }
    assert.deepEqual(refused.calls, []);
  });

  it("reports each refusal of the API back to the invitation with its own code", async () => {
    for (const code of [
      "not-found",
      "admin-protected",
      "already-disabled",
      "already-active",
      "cannot-sign-in-by-code",
      "validation",
      "unavailable",
    ] as const) {
      const { api } = accountStub(accountFailure(code));

      assert.equal(
        await disableOwnerAccount(api, form(OWNER_FORM)),
        `${DETAIL_PATH}?error=${code}`,
        code,
      );
    }
  });

  it("sends an ended session to sign in and a customer away from the panel", async () => {
    assert.equal(
      await reactivateOwnerAccount(accountStub(accountFailure("signed-out")).api, form(OWNER_FORM)),
      SIGN_IN_PATH,
    );
    assert.equal(
      await resendOwnerSignInCode(accountStub(accountFailure("forbidden")).api, form(OWNER_FORM)),
      "/cuenta",
    );
  });

  it("reports an unexpected failure as unavailable instead of pretending it ran", async () => {
    assert.equal(
      await resendOwnerSignInCode(
        accountStub(new ApiClientError("unavailable", 503)).api,
        form(OWNER_FORM),
      ),
      `${DETAIL_PATH}?error=unavailable`,
    );
  });

  it("never calls the API for a missing, repeated, or malformed id or reason", async () => {
    const { api, calls } = accountStub();
    const repeatedUser = new FormData();
    for (const [name, value] of Object.entries(OWNER_FORM)) {
      repeatedUser.set(name, value);
    }
    repeatedUser.append("userId", OWNER_ID);

    // Without a usable invitation id the command has no page to answer, so it falls back to the list.
    for (const data of [
      form({ userId: OWNER_ID, reason: "ABUSE" }),
      form({ ...OWNER_FORM, invitationId: "no-es-un-uuid" }),
    ]) {
      assert.equal(
        await disableOwnerAccount(api, data),
        `${INVITATIONS_PATHS.index}?error=invalid-form`,
      );
    }

    for (const data of [
      form({ invitationId: INVITATION_ID, reason: "ABUSE" }),
      form({ ...OWNER_FORM, userId: "no-es-un-uuid" }),
      form({ ...OWNER_FORM, userId: "" }),
      form({ ...OWNER_FORM, reason: "abuse" }),
      repeatedUser,
    ]) {
      assert.equal(await disableOwnerAccount(api, data), `${DETAIL_PATH}?error=invalid-form`);
    }
    assert.deepEqual(calls, []);
  });
});
