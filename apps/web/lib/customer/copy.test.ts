import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InvitationPayment } from "../server/invitations-api.ts";
import {
  ACCOUNT_COPY,
  INVITATION_COPY,
  PLACE_PICKER_COPY,
  PUBLIC_INVITATION_COPY,
  SIGN_IN_CODE_POLICY,
  SIGN_IN_COPY,
} from "./copy.ts";
import { publishHintFor } from "./publish-copy.ts";

// Customer product copy (M2 T8c; L39): Spanish, addressed with "tú", in one reviewable module.

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
  for (const copy of [
    SIGN_IN_COPY,
    ACCOUNT_COPY,
    INVITATION_COPY,
    PUBLIC_INVITATION_COPY,
    PLACE_PICKER_COPY,
  ]) {
    for (const value of Object.values(copy)) {
      values.push(typeof value === "function" ? value("11 nov 2026") : value);
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

  it("states the code length and lifetime of SIGN_IN_CODE_POLICY wherever it names them", () => {
    assert.deepEqual(numbersBefore("dígitos?"), new Set([SIGN_IN_CODE_POLICY.digits]));
    assert.deepEqual(numbersBefore("minutos?"), new Set([SIGN_IN_CODE_POLICY.validityMinutes]));
  });

  it("tells a browser without JavaScript why each button stays disabled (T8e; S42)", () => {
    assert.match(SIGN_IN_COPY.noScript, /^Para pedir tu código, .*JavaScript en tu navegador\.$/);
    assert.match(ACCOUNT_COPY.noScript, /^Para cerrar sesión, .*JavaScript en tu navegador\.$/);
  });
});

// What the publish block says about the price (T3; S3), exactly as the API describes the payment state: a free
// deployment answers no amount, a free package answers an amount of zero, and a paid package answers either the
// amount it still owes or the one it was paid.

/** A package that costs `$1,500.00` and has no payment yet (M7 S4). */
const UNPAID_PACKAGE: InvitationPayment = {
  paymentRequired: true,
  status: null,
  amountMinor: 150000,
  currency: "MXN",
  paidAt: null,
};

/** The same package once the provider confirmed the payment: the gate stops asking, the package is not free. */
const PAID_PACKAGE: InvitationPayment = {
  ...UNPAID_PACKAGE,
  paymentRequired: false,
  status: "paid",
  paidAt: "2026-11-12T10:00:00.000Z",
};

/** A package whose price in force is zero, so publishing it never asks for money. */
const FREE_PACKAGE: InvitationPayment = {
  paymentRequired: false,
  status: null,
  amountMinor: 0,
  currency: "MXN",
  paidAt: null,
};

/** A deployment where payments run in free mode: nothing is sold and the panel is not rendered (M7 S4). */
const FREE_MODE: InvitationPayment = {
  paymentRequired: false,
  status: null,
  amountMinor: null,
  currency: null,
  paidAt: null,
};

const NO_COST = /no tiene costo|sin costo/i;

describe("publish hint copy", () => {
  it("keeps today's promise for a free package and for free mode", () => {
    for (const payment of [FREE_PACKAGE, FREE_MODE]) {
      assert.equal(publishHintFor(payment), INVITATION_COPY.publishHint);
      assert.match(publishHintFor(payment), /Publicar no tiene costo\./);
    }
  });

  it("never promises no cost for a paid package, whatever its payment state", () => {
    for (const payment of [
      UNPAID_PACKAGE,
      PAID_PACKAGE,
      { ...UNPAID_PACKAGE, status: "failed" as const },
      { ...UNPAID_PACKAGE, status: "expired" as const },
      { ...UNPAID_PACKAGE, status: "refunded" as const },
    ]) {
      const hint = publishHintFor(payment);
      assert.doesNotMatch(hint, NO_COST, hint);
      // The block still says what publishing does; only the price promise is dropped.
      assert.match(hint, /publícala para compartirla con tus invitados/);
    }
  });

  it("promises nothing about the price when the payment read failed", () => {
    assert.doesNotMatch(publishHintFor(undefined), NO_COST);
  });
});
