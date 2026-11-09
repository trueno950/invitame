import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatMxn,
  formatPesosField,
  MAX_PESOS_TEXT,
  type PesosParse,
  parsePesos,
} from "./price.ts";

// Pesos typed by an administrator become centavos with string arithmetic only, never a float
// (M3 T8a; S4: "Solo MXN, entero en centavos"). The documented rule: optional surrounding spaces, ASCII
// digits, and an optional dot with one or two decimals. A comma, a currency sign, an exponent, a sign,
// and more than two decimals are refused, because each reads two ways ("1,000" is a thousand in
// Mexico and one in much of Europe), so a wrong price is never guessed.

function ok(amountMinor: number): PesosParse {
  return { ok: true, amountMinor };
}

describe("parsePesos", () => {
  it("converts whole pesos and decimals exactly", () => {
    const cases: Array<[string, number]> = [
      ["10", 1000],
      ["10.5", 1050],
      ["10.05", 1005],
      ["10.50", 1050],
      ["0", 0],
      ["0.00", 0],
      ["0.01", 1],
      ["0.1", 10],
      ["1500", 150000],
      ["19.99", 1999],
      ["1.15", 115],
      ["8.2", 820],
      ["  250 ", 25000],
      ["007", 700],
      ["21474836.47", 2_147_483_647],
      ["21474836", 2_147_483_600],
    ];

    for (const [input, amountMinor] of cases) {
      assert.deepEqual(parsePesos(input), ok(amountMinor), input);
    }
  });

  it("never loses a cent to floating point", () => {
    // 0.07 * 100 and 1.15 * 100 are not whole numbers in floating point.
    assert.notEqual(0.07 * 100, 7);
    assert.deepEqual(parsePesos("0.07"), ok(7));
    assert.notEqual(1.15 * 100, 115);
    assert.deepEqual(parsePesos("1.15"), ok(115));
    assert.deepEqual(parsePesos("4.35"), ok(435));
  });

  it("refuses an empty value", () => {
    for (const input of ["", "   ", "\n"]) {
      assert.deepEqual(parsePesos(input), { ok: false, reason: "empty" }, JSON.stringify(input));
    }
  });

  it("refuses thousands separators, comma decimals, symbols, signs, and exponents", () => {
    for (const input of [
      "1,000",
      "1,000.50",
      "10,5",
      "1 000",
      "$10",
      "10 MXN",
      "-1",
      "-0",
      "+5",
      "1e3",
      "0x10",
      "10.",
      ".5",
      ".",
      "1..5",
      "1.5.0",
      "abc",
      "NaN",
      "Infinity",
      "１０",
    ]) {
      assert.deepEqual(
        parsePesos(input),
        input.trim() === "" ? { ok: false, reason: "empty" } : { ok: false, reason: "format" },
        JSON.stringify(input),
      );
    }
  });

  it("refuses more than two decimals, even when they are zeros", () => {
    for (const input of ["10.001", "10.500", "0.005", "1.234"]) {
      assert.deepEqual(parsePesos(input), { ok: false, reason: "format" }, input);
    }
  });

  it("refuses an amount above the API's maximum in centavos", () => {
    assert.equal(MAX_PESOS_TEXT, "21474836.47");
    for (const input of [
      "21474836.48",
      "21474837",
      "99999999",
      "100000000",
      "99999999999999999999999",
      "0000000000000000000021474837",
    ]) {
      assert.deepEqual(parsePesos(input), { ok: false, reason: "too-large" }, input);
    }
    assert.deepEqual(parsePesos("0000000000000000000021474836.47"), ok(2_147_483_647));
  });
});

describe("formatPesosField", () => {
  it("writes centavos back as the text the form accepts", () => {
    assert.equal(formatPesosField(0), "0");
    assert.equal(formatPesosField(1), "0.01");
    assert.equal(formatPesosField(1000), "10");
    assert.equal(formatPesosField(1050), "10.50");
    assert.equal(formatPesosField(1005), "10.05");
    assert.equal(formatPesosField(2_147_483_647), "21474836.47");
  });

  it("round-trips through parsePesos", () => {
    for (const amountMinor of [0, 1, 99, 100, 101, 1999, 150000, 2_147_483_647]) {
      assert.deepEqual(parsePesos(formatPesosField(amountMinor)), ok(amountMinor));
    }
  });
});

describe("formatMxn", () => {
  it("formats centavos as Mexican pesos", () => {
    assert.equal(formatMxn(0, "MXN"), "$0.00");
    assert.equal(formatMxn(150000, "MXN"), "$1,500.00");
    assert.equal(formatMxn(1999, "MXN"), "$19.99");
    assert.equal(formatMxn(2_147_483_647, "MXN"), "$21,474,836.47");
  });

  it("keeps another currency's code visible instead of showing it as pesos", () => {
    assert.match(formatMxn(1500, "USD"), /USD/);
    assert.match(formatMxn(1500, "USD"), /15\.00/);
  });
});
