import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GUEST_NAME_MAX_LENGTH,
  GUEST_NOTE_MAX_LENGTH,
  GUEST_SEATS_MAX,
  GUEST_SEATS_MIN,
  GUEST_TOKEN_ISSUE,
  GUEST_TOKEN_LENGTH,
  guestTotalsOf,
  isGuestTokenFormat,
  validateGuestInput,
} from "./invitation-guest";

// The guest-list rules of an invitation (M6 G2; S1, S4). They are pure: the creator's input is normalized and
// bounded here, the personal token's shape is decided here, and the totals of a list are counted here, so the
// repository and the routes only carry values. A refused guest stores nothing.

describe("guest input (M6 G2; S4)", () => {
  const VALID = { name: "  Ana   Pérez ", seats: 2, phone: "55 1234 5678", note: "  Mesa 4 " };

  it("normalizes the name, the phone, and the note of a guest the creator added", () => {
    assert.deepEqual(validateGuestInput(VALID), {
      ok: true,
      value: {
        name: "Ana Pérez",
        seats: 2,
        phone: "+525512345678",
        note: "Mesa 4",
      },
    });
  });

  it("stores no phone and no note when they are absent, null, or blank", () => {
    for (const empty of [undefined, null, "", "   "]) {
      const validation = validateGuestInput({ name: "Ana", seats: 1, phone: empty, note: empty });
      assert.equal(validation.ok, true, JSON.stringify(empty));
      assert.deepEqual(validation.ok ? validation.value : null, {
        name: "Ana",
        seats: 1,
        phone: null,
        note: null,
      });
    }
  });

  it("accepts every seat count from 1 to 10 and every name up to 80 characters", () => {
    for (let seats = GUEST_SEATS_MIN; seats <= GUEST_SEATS_MAX; seats += 1) {
      const validation = validateGuestInput({ name: "Ana", seats, phone: null, note: null });
      assert.equal(validation.ok, true, String(seats));
    }
    for (const name of [
      "A",
      "Á".repeat(GUEST_NAME_MAX_LENGTH),
      "😀".repeat(GUEST_NAME_MAX_LENGTH),
    ]) {
      assert.equal(
        validateGuestInput({ name, seats: 1, phone: null, note: null }).ok,
        true,
        name.slice(0, 4),
      );
    }
    // The note bound is counted in characters, like every other bounded field.
    const note = "n".repeat(GUEST_NOTE_MAX_LENGTH);
    assert.equal(validateGuestInput({ name: "Ana", seats: 1, phone: null, note }).ok, true);
  });

  it("reports every issue in a fixed order — name, seats, phone, note — and returns no value", () => {
    assert.deepEqual(
      validateGuestInput({ name: "", seats: 0, phone: "12345", note: "n".repeat(201) }),
      {
        ok: false,
        issues: [
          "name must be between 1 and 80 characters",
          "seats must be between 1 and 10",
          "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          "note must be at most 200 characters",
        ],
      },
    );
    assert.deepEqual(validateGuestInput({ name: 7, seats: "2", phone: 5, note: [] }), {
      ok: false,
      issues: [
        "name must be a string",
        "seats must be an integer",
        "phone must be a string or null",
        "note must be a string or null",
      ],
    });
  });

  it("refuses seats that are fractional or outside 1 to 10", () => {
    for (const seats of [0, 11, -1]) {
      const validation = validateGuestInput({ name: "Ana", seats, phone: null, note: null });
      assert.equal(validation.ok, false, String(seats));
      assert.deepEqual(validation.ok ? [] : validation.issues, ["seats must be between 1 and 10"]);
    }
    for (const seats of [1.5, Number.NaN, "2", null]) {
      const validation = validateGuestInput({ name: "Ana", seats, phone: null, note: null });
      assert.equal(validation.ok, false, String(seats));
      assert.deepEqual(validation.ok ? [] : validation.issues, ["seats must be an integer"]);
    }
  });
});

describe("the personal guest token (M6 G2; S4)", () => {
  it("accepts exactly 22 base64url characters and refuses anything else", () => {
    assert.equal(GUEST_TOKEN_LENGTH, 22);
    for (const token of [
      "AAAAAAAAAAAAAAAAAAAAAA",
      "abcdefghijklmnopqrstuv",
      "0123456789-_ABCDEFGHIJ",
    ]) {
      assert.equal(token.length, GUEST_TOKEN_LENGTH);
      assert.equal(isGuestTokenFormat(token), true, token);
    }
    for (const token of [
      "",
      "A".repeat(21),
      "A".repeat(23),
      `${"A".repeat(21)}=`,
      `${"A".repeat(21)}+`,
      `${"A".repeat(21)}/`,
      "AAAAAAAAAAAAAAAAAAAAA ",
      "AAAAAAAAAAAAAAAAAAAAA\n",
      "áAAAAAAAAAAAAAAAAAAAA",
      7,
      null,
      undefined,
      {},
    ]) {
      assert.equal(isGuestTokenFormat(token), false, JSON.stringify(token));
    }
    assert.equal(GUEST_TOKEN_ISSUE, "token must be a guest token");
  });
});

describe("guest list totals (M6 G2; S1, S4)", () => {
  const at = new Date("2026-11-20T10:00:00.000Z");

  it("counts guests, seats, confirmed people, declines, pending guests, and check-ins", () => {
    assert.deepEqual(
      guestTotalsOf([
        {
          seats: 3,
          checkedInAt: at,
          response: { attending: true, partySize: 3 },
        },
        { seats: 2, checkedInAt: null, response: { attending: true, partySize: 1 } },
        { seats: 4, checkedInAt: null, response: { attending: false, partySize: 0 } },
        { seats: 1, checkedInAt: null, response: null },
        { seats: 2, checkedInAt: null, response: null },
      ]),
      {
        guests: 5,
        seats: 12,
        attendingGuests: 2,
        attendingPeople: 4,
        declinedCount: 1,
        pendingCount: 2,
        checkedInCount: 1,
      },
    );
  });

  it("answers zeroes for an empty guest list", () => {
    assert.deepEqual(guestTotalsOf([]), {
      guests: 0,
      seats: 0,
      attendingGuests: 0,
      attendingPeople: 0,
      declinedCount: 0,
      pendingCount: 0,
      checkedInCount: 0,
    });
  });
});
