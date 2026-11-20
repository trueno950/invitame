import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AccountAlreadyActiveError,
  AccountAlreadyDisabledError,
  AdminAccountProtectedError,
} from "./account-support.errors";
import {
  disableTransition,
  mayRequestSignInCode,
  reactivateTransition,
  refuseProtectedAdministrator,
  SUPPORT_ACCOUNT_ROLE,
  SUPPORT_ACCOUNT_STATUS,
  type SupportAccountState,
} from "./account-support";

// The account support rules (M9 T9; S4, S6, L8, L9), from a table: an administrator account is protected from both
// support transitions, disable runs ACTIVE → DISABLED and reactivate DISABLED → ACTIVE with their own refusals, and
// only an active customer may be sent a sign-in code. The repository states the same rules inside its transaction and
// the migration's own columns are behind them; this file is where the rules are named once.

const ADMIN: SupportAccountState = {
  role: SUPPORT_ACCOUNT_ROLE.ADMIN,
  status: SUPPORT_ACCOUNT_STATUS.ACTIVE,
};
const CUSTOMER_ACTIVE: SupportAccountState = {
  role: SUPPORT_ACCOUNT_ROLE.CUSTOMER,
  status: SUPPORT_ACCOUNT_STATUS.ACTIVE,
};
const CUSTOMER_DISABLED: SupportAccountState = {
  role: SUPPORT_ACCOUNT_ROLE.CUSTOMER,
  status: SUPPORT_ACCOUNT_STATUS.DISABLED,
};

describe("refuseProtectedAdministrator", () => {
  it("refuses an administrator account and lets a customer through", () => {
    assert.throws(
      () => refuseProtectedAdministrator(ADMIN),
      (error: unknown) => error instanceof AdminAccountProtectedError,
    );
    assert.throws(
      () => refuseProtectedAdministrator({ ...ADMIN, status: "DISABLED" }),
      (error: unknown) => error instanceof AdminAccountProtectedError,
      "a disabled administrator is protected too: only the server-side command changes it",
    );
    assert.equal(refuseProtectedAdministrator(CUSTOMER_ACTIVE), undefined);
    assert.equal(refuseProtectedAdministrator(CUSTOMER_DISABLED), undefined);
  });
});

describe("disableTransition", () => {
  it("answers DISABLED for an active account", () => {
    assert.equal(disableTransition(SUPPORT_ACCOUNT_STATUS.ACTIVE), "DISABLED");
  });

  it("refuses an account that is already disabled", () => {
    assert.throws(
      () => disableTransition(SUPPORT_ACCOUNT_STATUS.DISABLED),
      (error: unknown) => error instanceof AccountAlreadyDisabledError,
    );
  });
});

describe("reactivateTransition", () => {
  it("answers ACTIVE for a disabled account", () => {
    assert.equal(reactivateTransition(SUPPORT_ACCOUNT_STATUS.DISABLED), "ACTIVE");
  });

  it("refuses an account that is already active", () => {
    assert.throws(
      () => reactivateTransition(SUPPORT_ACCOUNT_STATUS.ACTIVE),
      (error: unknown) => error instanceof AccountAlreadyActiveError,
    );
  });
});

describe("mayRequestSignInCode", () => {
  it("answers true only for an active customer, like the sender that delivers the code", () => {
    assert.equal(mayRequestSignInCode(CUSTOMER_ACTIVE), true);
    assert.equal(mayRequestSignInCode(ADMIN), false, "an administrator signs in with a password");
    assert.equal(mayRequestSignInCode(CUSTOMER_DISABLED), false);
    assert.equal(mayRequestSignInCode({ ...ADMIN, status: "DISABLED" }), false);
  });
});
