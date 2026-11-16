import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  availableFeatureKeys,
  CALENDAR_FEATURE_KEY,
  DEFAULT_INVITATION_TIME_ZONE,
  IMPLEMENTED_INVITATION_FEATURES,
  INVITATION_TIME_ZONES,
  isInvitationTimeZone,
  musicProviderOf,
  normalizePlaylistUrl,
  normalizeWhatsAppPhone,
  PLAYLIST_URL_LENGTH_ISSUE,
  PLAYLIST_URL_MAX_LENGTH,
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
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

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

describe("playlist link normalization (S7)", () => {
  it("bounds the normalized link, not only the typed one, by the column width", () => {
    // Accented path characters are percent-encoded by the URL parser, so 480 typed characters grow past 500.
    const typed = `https://open.spotify.com/${"a".repeat(470)}\u00e9\u00e9\u00e9\u00e9\u00e9`;

    assert.deepEqual(normalizePlaylistUrl(typed), { ok: false, issue: PLAYLIST_URL_LENGTH_ISSUE });
  });

  const ACCEPTED: Array<[string, string, string]> = [
    ["a Spotify playlist", "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", "spotify"],
    ["an Apple Music playlist", "https://music.apple.com/mx/playlist/pl.123", "apple_music"],
    ["a YouTube Music playlist", "https://music.youtube.com/playlist?list=PL123", "youtube"],
    ["a YouTube playlist", "https://www.youtube.com/playlist?list=PL123", "youtube"],
    ["a YouTube host without www", "https://youtube.com/watch?v=abc", "youtube"],
    ["a short YouTube link", "https://youtu.be/abc123", "youtube"],
    ["a Deezer playlist", "https://www.deezer.com/playlist/908622995", "deezer"],
    ["a Deezer host without www", "https://deezer.com/mx/playlist/908622995", "deezer"],
    ["a SoundCloud set", "https://soundcloud.com/artist/sets/playlist", "soundcloud"],
  ];

  for (const [label, value, provider] of ACCEPTED) {
    it(`accepts ${label} and answers its service`, () => {
      assert.deepEqual(normalizePlaylistUrl(value), { ok: true, url: value }, value);
      assert.equal(musicProviderOf(value), provider, value);
    });
  }

  it("trims the surrounding spaces and lower-cases the host, and nothing else", () => {
    assert.deepEqual(normalizePlaylistUrl("  https://Open.Spotify.COM/playlist/abc  "), {
      ok: true,
      url: "https://open.spotify.com/playlist/abc",
    });
    assert.deepEqual(normalizePlaylistUrl("https://youtu.be/abc123?t=42"), {
      ok: true,
      url: "https://youtu.be/abc123?t=42",
    });
  });

  it("clears the link for null, undefined, and a blank string", () => {
    for (const value of [null, undefined, "", "   ", "\t\n"]) {
      assert.deepEqual(normalizePlaylistUrl(value), { ok: true, url: null }, String(value));
    }
  });

  it("refuses a value that is not a string", () => {
    for (const value of [42, true, {}, [PLAYLIST]]) {
      assert.deepEqual(normalizePlaylistUrl(value), {
        ok: false,
        issue: "playlistUrl must be a string or null",
      });
    }
  });

  it("refuses every scheme but https", () => {
    for (const value of [
      "http://open.spotify.com/playlist/abc",
      "HTTP://open.spotify.com/playlist/abc",
      "ftp://open.spotify.com/playlist/abc",
      "javascript:alert(1)",
      "//open.spotify.com/playlist/abc",
      "open.spotify.com/playlist/abc",
    ]) {
      assert.deepEqual(
        normalizePlaylistUrl(value),
        { ok: false, issue: "playlistUrl must be an https link" },
        value,
      );
    }
  });

  it("refuses every host that is not one of the allow-listed services", () => {
    for (const value of [
      "https://example.com/playlist/abc",
      "https://open.spotify.com.evil.example/playlist/abc",
      "https://open.spotify.com@evil.example/playlist/abc",
      "https://spotify.com/playlist/abc",
      "https://www.open.spotify.com/playlist/abc",
      "https://open.spotify.com:8443/playlist/abc",
    ]) {
      assert.deepEqual(
        normalizePlaylistUrl(value),
        {
          ok: false,
          issue: "playlistUrl must link to Spotify, Apple Music, YouTube, Deezer, or SoundCloud",
        },
        value,
      );
    }
  });

  it("refuses a link longer than five hundred characters", () => {
    const base = "https://open.spotify.com/playlist/";
    const accepted = `${base}${"a".repeat(PLAYLIST_URL_MAX_LENGTH - base.length)}`;
    assert.equal([...accepted].length, PLAYLIST_URL_MAX_LENGTH);
    assert.deepEqual(normalizePlaylistUrl(accepted), { ok: true, url: accepted });

    for (const value of [
      `${base}${"a".repeat(PLAYLIST_URL_MAX_LENGTH - base.length + 1)}`,
      `https://open.spotify.com/${"a".repeat(PLAYLIST_URL_MAX_LENGTH)}`,
    ]) {
      assert.deepEqual(normalizePlaylistUrl(value), {
        ok: false,
        issue: "playlistUrl must be at most 500 characters",
      });
    }
  });

  it("answers no service for a value that is not a normalized allow-listed link", () => {
    for (const value of [null, "", "https://example.com", "http://open.spotify.com/x"]) {
      assert.equal(musicProviderOf(value), null, String(value));
    }
  });
});

describe("feature settings validation (S4, S7)", () => {
  it("accepts an allow-listed zone, a normalized phone, and a playlist link", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Tijuana",
        whatsappPhone: "55-1234-5678",
        playlistUrl: PLAYLIST,
      }),
      {
        ok: true,
        value: { timeZone: "America/Tijuana", whatsappPhone: PHONE, playlistUrl: PLAYLIST },
      },
    );
  });

  it("accepts a cleared phone and a cleared playlist link", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Cancun",
        whatsappPhone: null,
        playlistUrl: null,
      }),
      { ok: true, value: { timeZone: "America/Cancun", whatsappPhone: null, playlistUrl: null } },
    );
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Cancun",
        whatsappPhone: "",
        playlistUrl: "  ",
      }),
      { ok: true, value: { timeZone: "America/Cancun", whatsappPhone: null, playlistUrl: null } },
    );
  });

  it("reports every refused value, the zone, then the phone, then the playlist", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "Europe/Madrid",
        whatsappPhone: "123",
        playlistUrl: "http://open.spotify.com/x",
      }),
      {
        ok: false,
        issues: [
          "timeZone must be one of the supported time zones",
          "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          "playlistUrl must be an https link",
        ],
      },
    );
  });

  it("reports a missing and a non-string zone with the same issue", () => {
    for (const timeZone of [undefined, null, 42, "", "America/Mexico_City "]) {
      const result = validateInvitationFeatureSettings({
        timeZone,
        whatsappPhone: null,
        playlistUrl: null,
      });

      assert.equal(result.ok, false);
      assert.deepEqual(result.ok ? [] : result.issues, [
        "timeZone must be one of the supported time zones",
      ]);
    }
  });
});

describe("feature gating (S4)", () => {
  const gated = (
    includedFeatureKeys: readonly string[],
    whatsappPhone: string | null = PHONE,
    playlistUrl: string | null = PLAYLIST,
  ) =>
    availableFeatureKeys({
      includedFeatureKeys,
      whatsappPhone,
      playlistUrl,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
    });

  const featuresOf = (gate: {
    includedFeatureKeys: readonly string[];
    whatsappPhone: string | null;
    playlistUrl: string | null;
    rsvpDeadline?: Date | null;
    rsvpPartyLimit?: number;
  }) =>
    publicInvitationFeatures({
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
      ...gate,
    });

  it("implements exactly COUNTDOWN, MAP, RSVP, WHATSAPP, MUSIC, and GIFT_REGISTRY, with CALENDAR always added", () => {
    assert.deepEqual(IMPLEMENTED_INVITATION_FEATURES, [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "MUSIC",
      "GIFT_REGISTRY",
    ]);
    assert.equal(CALENDAR_FEATURE_KEY, "CALENDAR");
    // A catalog feature this batch does not implement never becomes an available feature.
    assert.deepEqual(gated(["GALLERY", "GUEST_LIST", "QR_PASS"]), ["CALENDAR"]);
  });

  it("shows the features each seeded package includes, plus CALENDAR", () => {
    // Basic grants neither MUSIC nor GIFT_REGISTRY (prisma/catalog-seed.ts, S7).
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.basic), [
      "COUNTDOWN",
      "MAP",
      "WHATSAPP",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.premium), [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "MUSIC",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.deluxe), [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "MUSIC",
      "GIFT_REGISTRY",
      "CALENDAR",
    ]);
  });

  it("drops WhatsApp while no phone is stored, whatever the package includes", () => {
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.basic, null), ["COUNTDOWN", "MAP", "CALENDAR"]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.premium, null), [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "MUSIC",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.deluxe, null), [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "MUSIC",
      "GIFT_REGISTRY",
      "CALENDAR",
    ]);
  });

  it("keeps MUSIC out while no playlist link is stored, whatever the package includes", () => {
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.premium, PHONE, null), [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.deluxe, PHONE, null), [
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "GIFT_REGISTRY",
      "CALENDAR",
    ]);
  });

  it("keeps a stored phone out of the guest features when the package lacks WHATSAPP", () => {
    assert.deepEqual(gated(["COUNTDOWN", "MAP"], PHONE, null), ["COUNTDOWN", "MAP", "CALENDAR"]);
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["COUNTDOWN", "MAP"],
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      }),
      {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        rsvp: { mode: null, deadline: null, partyLimit: 4 },
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

  it("maps the gated keys to the guest booleans, the phone, the music link, and the gift registry", () => {
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["COUNTDOWN"],
        whatsappPhone: null,
        playlistUrl: null,
      }),
      {
        countdown: true,
        map: false,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        rsvp: { mode: null, deadline: null, partyLimit: 4 },
      },
    );
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["MAP", "WHATSAPP"],
        whatsappPhone: PHONE,
        playlistUrl: null,
      }),
      {
        countdown: false,
        map: true,
        calendar: true,
        whatsapp: { phone: PHONE },
        music: null,
        giftRegistry: false,
        rsvp: { mode: null, deadline: null, partyLimit: 4 },
      },
    );
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["MUSIC", "GIFT_REGISTRY"],
        whatsappPhone: null,
        playlistUrl: PLAYLIST,
      }),
      {
        countdown: false,
        map: false,
        calendar: true,
        whatsapp: null,
        music: { url: PLAYLIST, provider: "spotify" },
        giftRegistry: true,
        rsvp: { mode: null, deadline: null, partyLimit: 4 },
      },
    );
  });

  it("answers the RSVP mode the pinned package grants, with the invitation's deadline and party limit (M6 G1)", () => {
    const deadline = new Date("2026-12-31T23:59:59.000Z");

    // Premium grants RSVP and no guest list: the open form (S3, S4).
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["RSVP"],
        whatsappPhone: null,
        playlistUrl: null,
        rsvpDeadline: deadline,
        rsvpPartyLimit: 6,
      }).rsvp,
      { mode: "open", deadline, partyLimit: 6 },
    );
    // Deluxe grants GUEST_LIST: personal links replace the open form, which G2 implements (S3, S4).
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["RSVP", "GUEST_LIST"],
        whatsappPhone: null,
        playlistUrl: null,
      }).rsvp,
      { mode: "guest-list", deadline: null, partyLimit: 4 },
    );
    // A package that grants neither key exposes no RSVP at all, even if a key only looks alike.
    for (const includedFeatureKeys of [["COUNTDOWN"], ["rsvp"], ["guest_list"]]) {
      assert.deepEqual(
        featuresOf({ includedFeatureKeys, whatsappPhone: null, playlistUrl: null }).rsvp.mode,
        null,
        includedFeatureKeys.join(","),
      );
    }
  });
});
