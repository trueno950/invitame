import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ACCOUNT_COPY, SIGN_IN_COPY } from "./copy.ts";

// Customer product copy (M2 T8c; L39): Spanish, addressed with "tú", in one reviewable module.

function strings(): string[] {
  const values: string[] = [];
  for (const copy of [SIGN_IN_COPY, ACCOUNT_COPY]) {
    for (const value of Object.values(copy)) {
      values.push(typeof value === "function" ? value("ana@ejemplo.mx") : value);
    }
  }
  return values;
}

describe("customer copy", () => {
  it("never addresses the customer with usted", () => {
    const formal = /\b(usted|ustedes|su correo|su cuenta|ingrese|escriba|revise|intente)\b/i;
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

  it("names the address it asked a code for, and nothing about whether it has an account", () => {
    const sent = SIGN_IN_COPY.codeRequested("ana@ejemplo.mx");
    assert.match(sent, /ana@ejemplo\.mx/);
    assert.doesNotMatch(sent, /registrad|existe|administrador|cuenta nueva/i);
  });

  it("tells a browser without JavaScript why each button stays disabled (T8e; S42)", () => {
    assert.match(SIGN_IN_COPY.noScript, /^Para pedir tu código, .*JavaScript en tu navegador\.$/);
    assert.match(ACCOUNT_COPY.noScript, /^Para cerrar sesión, .*JavaScript en tu navegador\.$/);
  });
});
