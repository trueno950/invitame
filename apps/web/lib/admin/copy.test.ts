import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_PANEL_COPY, ADMIN_SIGN_IN_COPY } from "./copy.ts";

// Administrator product copy (M2 T8d; S20, S22, S36, L42): Spanish, addressed with "tú" like the
// customers, in one reviewable module, and never revealing whether an address has an account.

function strings(): string[] {
  const values: string[] = [];
  for (const copy of [ADMIN_SIGN_IN_COPY, ADMIN_PANEL_COPY]) {
    for (const value of Object.values(copy)) {
      values.push(value);
    }
  }
  return values;
}

describe("administrator copy", () => {
  it("never addresses the administrator with usted", () => {
    const formal =
      /\b(usted|ustedes|su correo|su cuenta|su contraseña|ingrese|escriba|revise|intente|espere|vuelva)\b/i;
    for (const value of strings()) {
      assert.doesNotMatch(value, formal, value);
    }
  });

  it("uses no em dash and no empty string", () => {
    for (const value of strings()) {
      assert.ok(value.trim().length > 0);
      assert.ok(!value.includes("—") && !value.includes("--"), value);
    }
  });

  it("answers a wrong address, a wrong password, a customer, and an expired password with one message", () => {
    const message = ADMIN_SIGN_IN_COPY.invalidCredentials;
    assert.doesNotMatch(
      message,
      /no existe|no está registrad|no encontramos|no es administrador|cliente|venci|expir|24 horas/i,
    );
    assert.match(message, /correo/i);
    assert.match(message, /contraseña/i);
  });

  it("keeps the rate limit and the wrong code apart from the credentials message", () => {
    const distinct = new Set([
      ADMIN_SIGN_IN_COPY.invalidCredentials,
      ADMIN_SIGN_IN_COPY.tooManyAttempts,
      ADMIN_SIGN_IN_COPY.invalidCode,
      ADMIN_SIGN_IN_COPY.invalidBackupCode,
      ADMIN_SIGN_IN_COPY.locked,
      ADMIN_SIGN_IN_COPY.unavailable,
    ]);
    assert.equal(distinct.size, 6);
  });

  it("offers the backup code as an alternative to the authenticator app", () => {
    assert.match(ADMIN_SIGN_IN_COPY.useBackupCode, /respaldo/i);
    assert.match(ADMIN_SIGN_IN_COPY.useAuthenticatorCode, /app/i);
  });

  it("labels the panel's sign-out «Cerrar sesión», as on the customer pages", () => {
    assert.equal(ADMIN_PANEL_COPY.signOut, "Cerrar sesión");
    assert.equal(ADMIN_PANEL_COPY.emailLabel, "Correo electrónico");
  });
});
