import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSignInCodeMessage, SIGN_IN_CODE_EXPIRES_IN_SECONDS } from "./sign-in-code-message";

describe("sign-in code message", () => {
  it("states the code lifetime as a whole number of minutes, in both bodies", () => {
    const minutes = SIGN_IN_CODE_EXPIRES_IN_SECONDS / 60;
    assert.ok(Number.isInteger(minutes), "the message prints the lifetime in whole minutes");

    const message = buildSignInCodeMessage({
      to: "customer@example.test",
      code: "123456",
      idempotencyKey: "key",
    });

    assert.ok(message.text.includes(`Este código vence en ${minutes} minutos`));
    assert.ok(message.html?.includes(`Este código vence en ${minutes} minutos`));
  });
});
