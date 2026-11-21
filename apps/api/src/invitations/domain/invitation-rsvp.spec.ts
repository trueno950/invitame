import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_RSVP_PARTY_LIMIT,
  isRsvpOpenOn,
  normalizeRsvpName,
  RSVP_MESSAGE_MAX_LENGTH,
  RSVP_NAME_MAX_LENGTH,
  RSVP_PARTY_SIZE_MAX,
  rsvpDedupeKey,
  rsvpModeOf,
  validateRsvpResponse,
  RSVP_PARTY_LIMIT_MAX,
  rsvpPartyLimitRangeIssue,
  validateRsvpSettings,
} from "./invitation-rsvp";

// The RSVP rules of an invitation (M6 G1; S1, S4): the name the creator reads, the key retries dedupe on, the
// settings a creator saves, and the response a guest submits. They are pure: no framework, no ORM, no provider,
// and the settings are passed in, never read from a table.

const LIMIT = { partyLimit: 4 };

function issuesOf(result: { readonly ok: boolean }): string[] {
  if (result.ok || !("issues" in result)) {
    return [];
  }
  return [...(result.issues as readonly string[])];
}

describe("RSVP name normalization (S4)", () => {
  it("trims and collapses internal whitespace but keeps the case and the accents the creator reads", () => {
    assert.deepEqual(normalizeRsvpName("  Ana   María\tPérez  "), {
      ok: true,
      value: "Ana María Pérez",
    });
    assert.deepEqual(normalizeRsvpName("ANA PÉREZ"), { ok: true, value: "ANA PÉREZ" });
    assert.deepEqual(normalizeRsvpName("Ana\u00a0Pérez"), { ok: true, value: "Ana Pérez" });
  });

  it("accepts one character and exactly the maximum, counted in characters", () => {
    assert.deepEqual(normalizeRsvpName("A"), { ok: true, value: "A" });
    const widest = "Á".repeat(RSVP_NAME_MAX_LENGTH);
    assert.deepEqual(normalizeRsvpName(widest), { ok: true, value: widest });
    assert.equal(RSVP_NAME_MAX_LENGTH, 80);
  });

  it("refuses a blank name, a name one character too wide, and a value that is not a string", () => {
    for (const [value, issue] of [
      ["", "name must be between 1 and 80 characters"],
      ["   ", "name must be between 1 and 80 characters"],
      ["A".repeat(RSVP_NAME_MAX_LENGTH + 1), "name must be between 1 and 80 characters"],
      [42, "name must be a string"],
      [null, "name must be a string"],
      [undefined, "name must be a string"],
    ] as const) {
      assert.deepEqual(normalizeRsvpName(value), { ok: false, issue }, String(value));
    }
  });
});

describe("RSVP dedupe key (S4)", () => {
  it("treats the same name typed with different spacing, case, and accents as one guest", () => {
    const key = rsvpDedupeKey("Ana Pérez", null);

    for (const name of ["ana perez", "  ANA   PÉREZ ", "Ana\u00a0Pérez", "ana pérez"]) {
      assert.equal(rsvpDedupeKey(name, null), key, name);
    }
    // The stored key is the normalized name; nothing of the guest's original spelling is kept in it.
    assert.equal(key, "ana perez|");
  });

  it("separates two guests by name and by normalized phone", () => {
    assert.notEqual(rsvpDedupeKey("Ana Pérez", null), rsvpDedupeKey("Ana Peres", null));
    assert.notEqual(rsvpDedupeKey("Ana Pérez", null), rsvpDedupeKey("Ana Pérez", "+525512345678"));
    assert.equal(rsvpDedupeKey("Ana Pérez", "+525512345678"), "ana perez|+525512345678");
  });

  it("normalizes a decomposed name the same way as a precomposed one", () => {
    // "Pérez" typed with a combining acute accent is the same guest as the precomposed spelling.
    assert.equal(rsvpDedupeKey("Pe\u0301rez", null), rsvpDedupeKey("Pérez", null));
  });
});

describe("RSVP settings validation (S4)", () => {
  it("accepts the default party limit when the owner changes nothing and clears the deadline with null", () => {
    assert.deepEqual(validateRsvpSettings({ deadline: null, partyLimit: 4 }), {
      ok: true,
      value: { deadline: null, partyLimit: 4 },
    });
    assert.equal(DEFAULT_RSVP_PARTY_LIMIT, 4);
  });

  it("accepts every party limit from 1 to 10, both bounds included", () => {
    for (let partyLimit = 1; partyLimit <= 10; partyLimit += 1) {
      const result = validateRsvpSettings({ deadline: null, partyLimit });
      assert.equal(result.ok, true, String(partyLimit));
      assert.equal(result.ok ? result.value.partyLimit : null, partyLimit);
    }
  });

  it("stores an ISO instant with an offset as the instant it names", () => {
    const result = validateRsvpSettings({
      deadline: "2026-12-31T23:59:59.000Z",
      partyLimit: 4,
    });

    assert.equal(result.ok, true);
    assert.equal(
      result.ok ? result.value.deadline?.toISOString() : null,
      "2026-12-31T23:59:59.000Z",
    );

    const offset = validateRsvpSettings({ deadline: "2026-12-31T18:59:59-05:00", partyLimit: 4 });
    assert.equal(
      offset.ok ? offset.value.deadline?.toISOString() : null,
      "2026-12-31T23:59:59.000Z",
    );
  });

  it("refuses a deadline that is not an ISO instant with an offset, and nothing else", () => {
    for (const deadline of [
      "2026-12-31",
      "31/12/2026",
      "not-a-date",
      "",
      "2026-12-31T23:59:59",
      42,
      {},
    ]) {
      const result = validateRsvpSettings({ deadline, partyLimit: 4 });
      assert.equal(result.ok, false, JSON.stringify(deadline));
      assert.deepEqual(issuesOf(result), [
        "deadline must be an ISO 8601 instant with an offset, or null",
      ]);
    }
  });

  it("refuses a party limit that is not an integer from 1 to 10", () => {
    for (const [partyLimit, issues] of [
      [0, ["partyLimit must be between 1 and 10"]],
      [11, ["partyLimit must be between 1 and 10"]],
      [-1, ["partyLimit must be between 1 and 10"]],
      [4.5, ["partyLimit must be an integer"]],
      ["4", ["partyLimit must be an integer"]],
      [null, ["partyLimit must be an integer"]],
      [undefined, ["partyLimit must be an integer"]],
    ] as const) {
      assert.deepEqual(
        issuesOf(validateRsvpSettings({ deadline: null, partyLimit })),
        issues,
        String(partyLimit),
      );
    }
  });

  it("reports the deadline first and the party limit last, and refuses nothing it accepted", () => {
    assert.deepEqual(issuesOf(validateRsvpSettings({ deadline: "someday", partyLimit: 0 })), [
      "deadline must be an ISO 8601 instant with an offset, or null",
      "partyLimit must be between 1 and 10",
    ]);
  });

  it("refuses a party limit above the maximum the settings row states, naming that maximum (S5, S8)", () => {
    assert.deepEqual(
      issuesOf(validateRsvpSettings({ deadline: null, partyLimit: 7 }, { maxPartyLimit: 6 })),
      ["partyLimit must be between 1 and 6"],
    );
    assert.deepEqual(
      validateRsvpSettings({ deadline: null, partyLimit: 6 }, { maxPartyLimit: 6 }),
      { ok: true, value: { deadline: null, partyLimit: 6 } },
      "the lowered maximum is inclusive",
    );
    assert.equal(rsvpPartyLimitRangeIssue(6), "partyLimit must be between 1 and 6");

    // A maximum wider than the column can hold never admits a party size the database refuses.
    assert.deepEqual(
      issuesOf(validateRsvpSettings({ deadline: null, partyLimit: 11 }, { maxPartyLimit: 40 })),
      [`partyLimit must be between 1 and ${RSVP_PARTY_LIMIT_MAX}`],
    );
  });
});

describe("RSVP response validation (S4)", () => {
  it("accepts an attending response from 1 to the invitation's limit and normalizes the phone", () => {
    const result = validateRsvpResponse(
      {
        name: "  Ana   Pérez ",
        attending: true,
        partySize: 4,
        phone: "55 1234 5678",
        message: "  ¡Con gusto!  ",
      },
      LIMIT,
    );

    assert.deepEqual(result, {
      ok: true,
      value: {
        name: "Ana Pérez",
        attending: true,
        partySize: 4,
        phone: "+525512345678",
        message: "¡Con gusto!",
        dedupeKey: "ana perez|+525512345678",
      },
    });
  });

  it("refuses an attending response of 0 or above the invitation's limit", () => {
    const cases: Array<[number, string[]]> = [
      [0, ["partySize must be between 1 and 4 when attending"]],
      [5, ["partySize must be between 1 and 4 when attending"]],
      [11, ["partySize must be an integer between 0 and 10"]],
    ];

    for (const [partySize, issues] of cases) {
      assert.deepEqual(
        issuesOf(
          validateRsvpResponse(
            { name: "Ana", attending: true, partySize, phone: null, message: null },
            LIMIT,
          ),
        ),
        issues,
        String(partySize),
      );
    }
    // A missing party size is never a guess: an attending guest must say how many people come.
    assert.deepEqual(
      issuesOf(
        validateRsvpResponse(
          { name: "Ana", attending: true, partySize: undefined, phone: null, message: null },
          LIMIT,
        ),
      ),
      ["partySize must be between 1 and 4 when attending"],
    );
  });

  it("stores a declined response with no people, whatever the party size it was sent with", () => {
    const declined = validateRsvpResponse(
      { name: "Ana", attending: false, partySize: 0, phone: null, message: null },
      LIMIT,
    );
    assert.equal(declined.ok, true);
    assert.equal(declined.ok ? declined.value.partySize : null, 0);

    assert.deepEqual(
      issuesOf(
        validateRsvpResponse(
          { name: "Ana", attending: false, partySize: 2, phone: null, message: null },
          LIMIT,
        ),
      ),
      ["partySize must be 0 when not attending"],
    );
    // A declined response may omit the party size; it is stored as 0, never as a guess.
    const omitted = validateRsvpResponse(
      { name: "Ana", attending: false, phone: null, message: null },
      LIMIT,
    );
    assert.equal(omitted.ok, true);
    assert.equal(omitted.ok ? omitted.value.partySize : null, 0);
  });

  it("refuses a party size that is not an integer in 0 to 10", () => {
    for (const partySize of [-1, 1.5, "2", null, {}]) {
      assert.deepEqual(
        issuesOf(
          validateRsvpResponse(
            { name: "Ana", attending: false, partySize, phone: null, message: null },
            LIMIT,
          ),
        ),
        ["partySize must be an integer between 0 and 10"],
        String(partySize),
      );
    }
    assert.equal(RSVP_PARTY_SIZE_MAX, 10);
  });

  it("refuses an attending value that is not a boolean", () => {
    for (const attending of ["true", 1, null, undefined]) {
      assert.deepEqual(
        issuesOf(
          validateRsvpResponse(
            { name: "Ana", attending, partySize: 1, phone: null, message: null },
            LIMIT,
          ),
        ),
        ["attending must be a boolean"],
        String(attending),
      );
    }
  });

  it("keeps the message optional and bounded to 280 characters", () => {
    assert.equal(RSVP_MESSAGE_MAX_LENGTH, 280);

    const widest = validateRsvpResponse(
      { name: "Ana", attending: true, partySize: 1, phone: null, message: "é".repeat(280) },
      LIMIT,
    );
    assert.equal(widest.ok, true);
    assert.equal(widest.ok ? widest.value.message?.length : null, 280);

    for (const [message, issues] of [
      ["é".repeat(281), ["message must be at most 280 characters"]],
      [42, ["message must be a string or null"]],
    ] as const) {
      assert.deepEqual(
        issuesOf(
          validateRsvpResponse(
            { name: "Ana", attending: true, partySize: 1, phone: null, message },
            LIMIT,
          ),
        ),
        issues,
        String(message),
      );
    }

    const blank = validateRsvpResponse(
      { name: "Ana", attending: true, partySize: 1, phone: null, message: "   " },
      LIMIT,
    );
    assert.equal(blank.ok ? blank.value.message : "unset", null);
  });

  it("normalizes the phone with the WhatsApp rules and refuses any other shape", () => {
    for (const [phone, expected] of [
      ["5512345678", "+525512345678"],
      ["+14155550123", "+14155550123"],
      [null, null],
      ["", null],
    ] as const) {
      const result = validateRsvpResponse(
        { name: "Ana", attending: true, partySize: 1, phone, message: null },
        LIMIT,
      );
      assert.equal(result.ok ? result.value.phone : "unset", expected, String(phone));
    }

    for (const [phone, issues] of [
      [
        "12345",
        [
          "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
        ],
      ],
      [5512345678, ["phone must be a string or null"]],
    ] as const) {
      assert.deepEqual(
        issuesOf(
          validateRsvpResponse(
            { name: "Ana", attending: true, partySize: 1, phone, message: null },
            LIMIT,
          ),
        ),
        issues,
        String(phone),
      );
    }
  });

  it("reports every issue in a fixed order, name first and the message last", () => {
    assert.deepEqual(
      issuesOf(
        validateRsvpResponse(
          {
            name: "",
            attending: "yes",
            partySize: 99,
            phone: "12345",
            message: "x".repeat(281),
          },
          LIMIT,
        ),
      ),
      [
        "name must be between 1 and 80 characters",
        "attending must be a boolean",
        "partySize must be an integer between 0 and 10",
        "phone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
        "message must be at most 280 characters",
      ],
    );
  });
});

describe("RSVP gating (S1, S4)", () => {
  it("opens RSVP for a package with RSVP and no guest list", () => {
    assert.equal(rsvpModeOf(["COUNTDOWN", "RSVP"]), "open");
    assert.equal(rsvpModeOf(["RSVP", "GUEST_LIST"]), "guest-list");
    assert.equal(rsvpModeOf(["GUEST_LIST"]), "guest-list");
    assert.equal(rsvpModeOf(["COUNTDOWN", "MAP"]), null);
    assert.equal(rsvpModeOf([]), null);
    // A key is compared whole; a look-alike never selects a mode.
    assert.equal(rsvpModeOf(["rsvp"]), null);
    assert.equal(rsvpModeOf(["guest_list"]), null);
  });

  it("stays open until the deadline passes and forever with no deadline", () => {
    const deadline = new Date("2026-12-31T23:59:59.000Z");

    assert.equal(isRsvpOpenOn(null, new Date("2030-01-01T00:00:00.000Z")), true);
    assert.equal(isRsvpOpenOn(deadline, new Date("2026-12-30T00:00:00.000Z")), true);
    assert.equal(isRsvpOpenOn(deadline, deadline), true);
    assert.equal(isRsvpOpenOn(deadline, new Date("2027-01-01T00:00:00.000Z")), false);
  });
});
