import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_PANEL_COPY, ADMIN_SIGN_IN_COPY, SECOND_FACTOR_POLICY } from "./copy.ts";
import { ENROLLMENT_COPY } from "./enrollment-copy.ts";

// Administrator product copy (M2 T8d; S20, S22, S36, L42): Spanish, addressed with "tú" like the
// customers, in one reviewable module, and never revealing whether an address has an account.

// Better Auth's default number of backup codes (see `enrollment.ts`), passed to `backupCount`.
const BACKUP_CODE_COUNT = 10;

/**
 * Every number the copy writes before `unit`, such as the 6 of «6 dígitos». Any whitespace counts,
 * a non-breaking space included. Numbers written in words, such as «un minuto», are not detected.
 */
function numbersBefore(unit: string): Set<number> {
  const pattern = new RegExp(`(\\d+)\\s+${unit}`, "g");
  const numbers = new Set<number>();
  for (const value of strings()) {
    for (const [, number] of value.matchAll(pattern)) {
      numbers.add(Number(number));
    }
  }
  return numbers;
}

function strings(): string[] {
  const values: string[] = [];
  for (const copy of [ADMIN_SIGN_IN_COPY, ADMIN_PANEL_COPY, ENROLLMENT_COPY]) {
    for (const value of Object.values(copy)) {
      values.push(typeof value === "function" ? value(BACKUP_CODE_COUNT) : value);
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

  it("states the code length, period, and lock of SECOND_FACTOR_POLICY wherever it names them", () => {
    assert.deepEqual(numbersBefore("dígitos?"), new Set([SECOND_FACTOR_POLICY.codeDigits]));
    assert.deepEqual(numbersBefore("segundos?"), new Set([SECOND_FACTOR_POLICY.codePeriodSeconds]));
    assert.deepEqual(numbersBefore("minutos?"), new Set([SECOND_FACTOR_POLICY.lockoutMinutes]));
  });

  it("tells a browser without JavaScript why each button stays disabled (T8e; S42)", () => {
    const lines = [
      ADMIN_SIGN_IN_COPY.noScript,
      ENROLLMENT_COPY.noScript,
      ADMIN_PANEL_COPY.noScript,
    ];
    for (const line of lines) {
      assert.match(line, /JavaScript en tu navegador\.$/);
    }
    assert.equal(new Set(lines).size, lines.length);
  });
});
