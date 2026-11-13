import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  availableFeatureKeys,
  CALENDAR_FEATURE_KEY,
  DEFAULT_INVITATION_TIME_ZONE,
  IMPLEMENTED_INVITATION_FEATURES,
  INVITATION_TIME_ZONES,
  isInvitationTimeZone,
  normalizeWhatsAppPhone,
  publicInvitationFeatures,
  validateInvitationFeatureSettings,
} from "./invitation-features";

// The feature rules of an invitation (F1; S3, S4). The time zone allow-list, the WhatsApp phone normalization,
// and the feature gating are pure domain rules: the package contributes data keys only, the Spanish labels stay
// in the web, and nothing here imports a framework, an ORM, or a provider.

/** The stored feature keys of every seeded package (prisma/catalog-seed.ts), by package key. */
const SEEDED_PACKAGE_FEATURES = {
  basic: ["COUNTDOWN", "MAP", "WHATSAPP"],
  premium: ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"],
  deluxe: [
    "COUNTDOWN",
    "MUSIC",
    "GALLERY",
    "MAP",
    "RSVP",
    "WHATSAPP",
    "GIFT_REGISTRY",
    "GUEST_LIST",
    "QR_PASS",
  ],
} as const;

const PHONE = "+525512345678";

describe("invitation time zones (S4)", () => {
  it("keeps every allow-listed zone inside the database Invitation_timeZone_format check", () => {
    // The migration's CHECK is invisible to Prisma; a zone it refused would only fail on the first real write.
    const check = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)+$/;

    for (const zone of INVITATION_TIME_ZONES) {
      assert.match(zone, check, zone);
    }
  });

  it("offers exactly the eleven Mexico zones S4 lists, Mexico City first", () => {
    assert.deepEqual(INVITATION_TIME_ZONES, [
      "America/Mexico_City",
      "America/Cancun",
      "America/Mazatlan",
      "America/Hermosillo",
      "America/Chihuahua",
      "America/Tijuana",
      "America/Matamoros",
      "America/Monterrey",
      "America/Merida",
      "America/Ojinaga",
      "America/Bahia_Banderas",
    ]);
    assert.equal(DEFAULT_INVITATION_TIME_ZONE, "America/Mexico_City");
    assert.equal(INVITATION_TIME_ZONES.includes(DEFAULT_INVITATION_TIME_ZONE), true);
  });

  it("keeps every listed zone because the installed tz data treats all of them as canonical", () => {
    // `Intl.supportedValuesOf("timeZone")` returns the canonical zone ids of the installed tz data and leaves
    // out the pure links (`US/Pacific`, `GMT`, `Mexico/General`, ...). Every S4 zone is answered here, so none
    // of the eleven is a pure alias and the full allow-list stands.
    const canonical = new Set(Intl.supportedValuesOf("timeZone"));

    for (const zone of INVITATION_TIME_ZONES) {
      assert.equal(canonical.has(zone), true, `${zone} is a canonical zone`);
      // And every listed zone is accepted by the runtime, so formatting cannot fail later.
      assert.doesNotThrow(
        () => new Intl.DateTimeFormat("es-MX", { timeZone: zone }).format(new Date(0)),
        zone,
      );
    }
    assert.equal(canonical.has("US/Pacific"), false, "the probe excludes links");
    assert.equal(canonical.has("Mexico/General"), false, "the probe excludes links");
  });

  it("accepts only an exact member of the allow-list", () => {
    for (const zone of INVITATION_TIME_ZONES) {
      assert.equal(isInvitationTimeZone(zone), true, zone);
    }
    for (const value of [
      "Europe/Madrid",
      "america/mexico_city",
      "America/Mexico_City ",
      " America/Mexico_City",
      "Mexico/General",
      "",
      null,
      undefined,
      42,
      ["America/Mexico_City"],
    ]) {
      assert.equal(isInvitationTimeZone(value), false, String(value));
    }
  });
});

describe("WhatsApp phone normalization (S4)", () => {
  const ACCEPTED: Array<[string, string]> = [
    ["a bare ten-digit Mexican number", "5512345678"],
    ["a number with spaces", "55 1234 5678"],
    ["a number with dashes", "55-1234-5678"],
    ["a number with parentheses", "(55) 1234-5678"],
    ["a number mixing separators", "(55) 1234 5678"],
    ["an international number", "+14155550123"],
    ["an international number with separators", "+52 (55) 1234-5678"],
    ["the shortest accepted international number", "+12345678"],
    ["the longest accepted international number", "+123456789012345"],
    ["a number with no-break spaces", "55\u00a01234\u00a05678"],
  ];

  for (const [label, value] of ACCEPTED) {
    it(`normalizes ${label} to E.164`, () => {
      const expected =
        value.startsWith("+") || value.startsWith("+52")
          ? `+${value.replaceAll(/[\s()-]/gu, "").replace(/^\+/u, "")}`
          : `+52${value.replaceAll(/[\s()-]/gu, "")}`;

      assert.deepEqual(normalizeWhatsAppPhone(value), { ok: true, phone: expected }, value);
    });
  }

  it("adds +52 to a ten-digit Mexican number", () => {
    assert.deepEqual(normalizeWhatsAppPhone("55 1234 5678"), { ok: true, phone: PHONE });
    assert.deepEqual(normalizeWhatsAppPhone("(55) 1234-5678"), { ok: true, phone: PHONE });
  });

  it("clears the phone for null, undefined, and a blank string", () => {
    for (const value of [null, undefined, "", "   ", "\t\n"]) {
      assert.deepEqual(normalizeWhatsAppPhone(value), { ok: true, phone: null }, String(value));
    }
  });

  it("refuses a value that is not a string", () => {
    for (const value of [5512345678, true, {}, ["5512345678"]]) {
      assert.deepEqual(normalizeWhatsAppPhone(value), {
        ok: false,
        issue: "whatsappPhone must be a string or null",
      });
    }
  });

  it("refuses a phone of an unrecognized shape with the same message", () => {
    const issue =
      "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +";

    for (const value of [
      "123456789", // nine digits
      "12345678901", // eleven digits without +
      "+1234567", // seven digits
      "+1234567890123456", // sixteen digits
      "+0123456789", // no country code may start with zero
      "++5512345678",
      "55.1234.5678",
      "55_1234_5678",
      "551234567a",
      "tel:5512345678",
      "+",
      "+52",
    ]) {
      assert.deepEqual(normalizeWhatsAppPhone(value), { ok: false, issue }, value);
    }
  });
});

describe("feature settings validation (S4)", () => {
  it("accepts an allow-listed zone and a normalized phone", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Tijuana",
        whatsappPhone: "55-1234-5678",
      }),
      {
        ok: true,
        value: { timeZone: "America/Tijuana", whatsappPhone: PHONE },
      },
    );
  });

  it("accepts a cleared phone", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({ timeZone: "America/Cancun", whatsappPhone: null }),
      { ok: true, value: { timeZone: "America/Cancun", whatsappPhone: null } },
    );
    assert.deepEqual(
      validateInvitationFeatureSettings({ timeZone: "America/Cancun", whatsappPhone: "" }),
      { ok: true, value: { timeZone: "America/Cancun", whatsappPhone: null } },
    );
  });

  it("reports every refused value, the zone before the phone", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({ timeZone: "Europe/Madrid", whatsappPhone: "123" }),
      {
        ok: false,
        issues: [
          "timeZone must be one of the supported time zones",
          "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
        ],
      },
    );
  });

  it("reports a missing and a non-string zone with the same issue", () => {
    for (const timeZone of [undefined, null, 42, "", "America/Mexico_City "]) {
      const result = validateInvitationFeatureSettings({ timeZone, whatsappPhone: null });

      assert.equal(result.ok, false);
      assert.deepEqual(result.ok ? [] : result.issues, [
        "timeZone must be one of the supported time zones",
      ]);
    }
  });
});

describe("feature gating (S4)", () => {
  const gated = (includedFeatureKeys: readonly string[], whatsappPhone: string | null = PHONE) =>
    availableFeatureKeys({ includedFeatureKeys, whatsappPhone });

  it("implements exactly COUNTDOWN, MAP, and WHATSAPP, with CALENDAR always added", () => {
    assert.deepEqual(IMPLEMENTED_INVITATION_FEATURES, ["COUNTDOWN", "MAP", "WHATSAPP"]);
    assert.equal(CALENDAR_FEATURE_KEY, "CALENDAR");
    // A catalog feature this batch does not implement never becomes an available feature.
    assert.deepEqual(
      gated(["MUSIC", "GALLERY", "RSVP", "GIFT_REGISTRY", "GUEST_LIST", "QR_PASS"]),
      ["CALENDAR"],
    );
  });

  it("shows the features each seeded package includes, plus CALENDAR", () => {
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.basic), [
      "COUNTDOWN",
      "MAP",
      "WHATSAPP",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.premium), [
      "COUNTDOWN",
      "MAP",
      "WHATSAPP",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.deluxe), [
      "COUNTDOWN",
      "MAP",
      "WHATSAPP",
      "CALENDAR",
    ]);
  });

  it("drops WhatsApp while no phone is stored, whatever the package includes", () => {
    for (const packageKey of ["basic", "premium", "deluxe"] as const) {
      assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES[packageKey], null), [
        "COUNTDOWN",
        "MAP",
        "CALENDAR",
      ]);
    }
  });

  it("keeps a stored phone out of the guest features when the package lacks WHATSAPP", () => {
    assert.deepEqual(gated(["COUNTDOWN", "MAP"]), ["COUNTDOWN", "MAP", "CALENDAR"]);
    assert.deepEqual(
      publicInvitationFeatures({ includedFeatureKeys: ["COUNTDOWN", "MAP"], whatsappPhone: PHONE }),
      {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: null,
      },
    );
  });

  it("is decided by keys alone: an unknown key never selects a feature and a duplicate never repeats one", () => {
    assert.deepEqual(gated(["COUNTDOWN", "COUNTDOWN", "MAP", "MAP", "WHATSAPP", "WHATSAPP"]), [
      "COUNTDOWN",
      "MAP",
      "WHATSAPP",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(["countdown", "Map", "whatsapp"]), ["CALENDAR"]);
    assert.deepEqual(gated([], PHONE), ["CALENDAR"]);
  });

  it("maps the gated keys to the guest booleans and the WhatsApp phone", () => {
    assert.deepEqual(
      publicInvitationFeatures({ includedFeatureKeys: ["COUNTDOWN"], whatsappPhone: null }),
      {
        countdown: true,
        map: false,
        calendar: true,
        whatsapp: null,
      },
    );
    assert.deepEqual(
      publicInvitationFeatures({ includedFeatureKeys: ["MAP", "WHATSAPP"], whatsappPhone: PHONE }),
      {
        countdown: false,
        map: true,
        calendar: true,
        whatsapp: { phone: PHONE },
      },
    );
  });
});
