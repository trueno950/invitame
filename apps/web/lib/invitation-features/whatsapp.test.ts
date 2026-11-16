import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { whatsappDigits, whatsappUrl } from "./whatsapp.ts";

// The WhatsApp button of the guest page (S4): a `wa.me` link to the creator's E.164 number with a neutral
// prefilled Spanish greeting that names the celebration, so the guest only has to press send. The phone is
// never logged, so a refusal names the rule and not the number.

describe("WhatsApp link", () => {
  it("opens a chat with the creator's number and a greeting naming the celebration", () => {
    const href = whatsappUrl("+525512345678", "Cumpleaños de Mateo");
    const parsed = new URL(href);

    assert.equal(parsed.origin, "https://wa.me");
    assert.equal(parsed.pathname, "/525512345678");
    assert.equal(
      parsed.searchParams.get("text"),
      "¡Hola! Te escribo por la invitación de Cumpleaños de Mateo.",
    );
  });

  it("encodes the greeting instead of putting raw text in the query", () => {
    const href = whatsappUrl("+525512345678", "Bautizo de Emilia & familia");

    assert.doesNotMatch(href, /[ "¡]/);
    assert.equal(
      new URL(href).searchParams.get("text"),
      "¡Hola! Te escribo por la invitación de Bautizo de Emilia & familia.",
    );
  });

  it("keeps every celebration on its own number and greeting", () => {
    assert.notEqual(
      whatsappUrl("+525512345678", "Cumpleaños de Mateo"),
      whatsappUrl("+525598765432", "Cumpleaños de Mateo"),
    );
    assert.notEqual(
      whatsappUrl("+525512345678", "Cumpleaños de Mateo"),
      whatsappUrl("+525512345678", "Bautizo de Emilia"),
    );
  });

  it("reads the digits of an E.164 number without the plus sign", () => {
    assert.equal(whatsappDigits("+525512345678"), "525512345678");
    assert.equal(whatsappDigits("+12345678"), "12345678");
  });

  it("refuses a phone that is not stored as E.164 without echoing it", () => {
    for (const phone of [
      "52 55 1234 5678",
      "525512345678",
      "+52 (55) 1234 5678",
      "+1234567",
      "+1234567890123456",
    ]) {
      assert.throws(
        () => whatsappUrl(phone, "Cumpleaños de Mateo"),
        (error: unknown) => {
          assert.ok(error instanceof RangeError);
          assert.match(error.message, /E\.164/);
          assert.doesNotMatch(error.message, /\d{4}/, "the message never repeats the number");
          return true;
        },
      );
    }
  });
});
