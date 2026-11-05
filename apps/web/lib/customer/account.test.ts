import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiClientError, type OwnProfile, type OwnProfileUpdate } from "../server/api-client.ts";
import { loadAccountView, saveDisplayName } from "./account.ts";
import { ACCOUNT_COPY } from "./copy.ts";

// The customer's own account page (M2 T8c; S1, L29, L39): how the profile read and the display-name
// update map to what `/cuenta` renders. The API stays the authority on validation and sessions.

const CUSTOMER: OwnProfile = {
  id: "0b8f2a1e-6c1d-4f61-9d55-3b8a8f9f0c11",
  email: "ana@ejemplo.mx",
  displayName: "Ana",
  role: "CUSTOMER",
};

describe("loadAccountView", () => {
  it("shows a signed-in customer's profile", async () => {
    assert.deepEqual(await loadAccountView(async () => ({ signedIn: true, value: CUSTOMER })), {
      kind: "customer",
      profile: CUSTOMER,
    });
  });

  it("reports signed-out when the API answers 401 or no session cookie exists", async () => {
    assert.deepEqual(await loadAccountView(async () => ({ signedIn: false })), {
      kind: "signed-out",
    });
  });

  it("shows nothing role-specific to an administrator", async () => {
    const view = await loadAccountView(async () => ({
      signedIn: true,
      value: { ...CUSTOMER, role: "ADMIN" },
    }));

    assert.deepEqual(view, { kind: "not-customer" });
  });

  it("reports unavailable on every API failure instead of throwing", async () => {
    const failures = [
      new ApiClientError("unavailable", 503),
      new ApiClientError("unavailable"),
      new ApiClientError("rejected", 403),
      new ApiClientError("invalid-response", 200),
      new Error("unexpected"),
    ];
    for (const failure of failures) {
      assert.deepEqual(
        await loadAccountView(async () => {
          throw failure;
        }),
        { kind: "unavailable" },
        failure.message,
      );
    }
  });
});

describe("saveDisplayName", () => {
  function recorder(answer: (update: OwnProfileUpdate) => Promise<OwnProfile | null>) {
    const updates: OwnProfileUpdate[] = [];
    const update = async (next: OwnProfileUpdate) => {
      updates.push(next);
      const profile = await answer(next);
      return profile === null
        ? { signedIn: false as const }
        : { signedIn: true as const, value: profile };
    };
    return { update, updates };
  }

  it("sends the trimmed name and reports it saved", async () => {
    const { update, updates } = recorder(async ({ displayName }) => ({ ...CUSTOMER, displayName }));

    assert.deepEqual(await saveDisplayName(update, "  Ana López  "), {
      status: "saved",
      message: ACCOUNT_COPY.nameSaved,
    });
    assert.deepEqual(updates, [{ displayName: "Ana López" }]);
  });

  it("clears the name when the field is empty or only spaces", async () => {
    for (const value of ["", "   ", null]) {
      const { update, updates } = recorder(async () => ({ ...CUSTOMER, displayName: null }));

      assert.deepEqual(await saveDisplayName(update, value), {
        status: "saved",
        message: ACCOUNT_COPY.nameCleared,
      });
      assert.deepEqual(updates, [{ displayName: null }], String(value));
    }
  });

  it("maps the API's 400 to the Spanish length message", async () => {
    const { update } = recorder(async () => {
      throw new ApiClientError("rejected", 400);
    });

    assert.deepEqual(await saveDisplayName(update, "x".repeat(121)), {
      status: "error",
      message: ACCOUNT_COPY.nameInvalid,
    });
  });

  it("maps every other failure to the generic save message", async () => {
    for (const failure of [
      new ApiClientError("rejected", 403),
      new ApiClientError("unavailable", 502),
      new ApiClientError("unavailable"),
      new ApiClientError("invalid-response", 200),
      new Error("unexpected"),
    ]) {
      const { update } = recorder(async () => {
        throw failure;
      });

      assert.deepEqual(
        await saveDisplayName(update, "Ana"),
        { status: "error", message: ACCOUNT_COPY.nameFailed },
        failure.message,
      );
    }
  });

  it("reports signed-out when the session ended", async () => {
    const { update } = recorder(async () => null);

    assert.deepEqual(await saveDisplayName(update, "Ana"), { status: "signed-out" });
  });

  it("refuses a non-text field without calling the API", async () => {
    const { update, updates } = recorder(async () => CUSTOMER);

    assert.deepEqual(await saveDisplayName(update, new File(["x"], "name.txt")), {
      status: "error",
      message: ACCOUNT_COPY.nameInvalid,
    });
    assert.equal(updates.length, 0);
  });
});
