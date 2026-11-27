import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  availableFeatureKeys,
  CALENDAR_FEATURE_KEY,
  DEFAULT_INVITATION_TIME_ZONE,
  IMPLEMENTED_INVITATION_FEATURES,
  INVITATION_TIME_ZONES,
  ITINERARY_FEATURE_KEY,
  isInvitationTimeZone,
  isMusicCoverUrl,
  MUSIC_COVER_HOSTS,
  musicProviderOf,
  normalizePlaylistTitle,
  normalizePlaylistUrl,
  normalizeWhatsAppPhone,
  PLAYLIST_COVER_URL_MAX_LENGTH,
  PLAYLIST_TITLE_MAX_LENGTH,
  PLAYLIST_URL_LENGTH_ISSUE,
  PLAYLIST_URL_MAX_LENGTH,
  publicInvitationFeatures,
  validateInvitationFeatureSettings,
} from "./invitation-features";
import type { GiftRegistryStore, InvitationGiftRegistry } from "./invitation-gift-registry";
import type { InvitationItinerary } from "./invitation-itinerary";
import type { InvitationLodging } from "./invitation-lodging";

// The feature rules of an invitation (F1; S3, S4). The time zone allow-list, the WhatsApp phone normalization,
// and the feature gating are pure domain rules: the package contributes data keys only, the Spanish labels stay
// in the web, and nothing here imports a framework, an ORM, or a provider.

/** The stored feature keys of every seeded package (prisma/catalog-seed.ts), by package key. */
const SEEDED_PACKAGE_FEATURES = {
  basic: ["ITINERARY", "COUNTDOWN", "MAP", "WHATSAPP"],
  premium: [
    "ITINERARY",
    "COUNTDOWN",
    "MUSIC",
    "GALLERY",
    "MAP",
    "RSVP",
    "WHATSAPP",
    "LODGING",
    "GUESTBOOK",
  ],
  deluxe: [
    "ITINERARY",
    "COUNTDOWN",
    "MUSIC",
    "GALLERY",
    "MAP",
    "RSVP",
    "WHATSAPP",
    "GIFT_REGISTRY",
    "LODGING",
    "GUESTBOOK",
    "GUEST_ALBUM",
    "WHATSAPP_REMINDERS",
    "GUEST_LIST",
    "QR_PASS",
  ],
} as const;

const PHONE = "+525512345678";
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
const ITINERARY: InvitationItinerary = {
  version: 1,
  items: [
    { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
    { time: "19:30", title: "Recepción y cóctel" },
  ],
};

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

describe("feature settings validation (S4, S7, F1)", () => {
  it("accepts an allow-listed zone, a normalized phone, a playlist link, and an itinerary", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Tijuana",
        whatsappPhone: "55-1234-5678",
        playlistUrl: PLAYLIST,
        itinerary: { version: 1, items: [{ time: "17:00", title: " Misa " }] },
        giftRegistry: null,
        lodging: null,
        reminders: null,
      }),
      {
        ok: true,
        value: {
          timeZone: "America/Tijuana",
          whatsappPhone: PHONE,
          playlistUrl: PLAYLIST,
          itinerary: { version: 1, items: [{ time: "17:00", title: "Misa" }] },
          giftRegistry: null,
          lodging: null,
          reminders: null,
        },
      },
    );
  });

  it("accepts a cleared phone, a cleared playlist link, and a cleared itinerary", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Cancun",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        reminders: null,
      }),
      {
        ok: true,
        value: {
          timeZone: "America/Cancun",
          whatsappPhone: null,
          playlistUrl: null,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
          reminders: null,
        },
      },
    );
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Cancun",
        whatsappPhone: "",
        playlistUrl: "  ",
        itinerary: { version: 1, items: [] },
        giftRegistry: null,
        lodging: null,
        reminders: null,
      }),
      {
        ok: true,
        value: {
          timeZone: "America/Cancun",
          whatsappPhone: null,
          playlistUrl: null,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
          reminders: null,
        },
      },
    );
  });

  it("reports every refused value, the zone, then the phone, then the playlist, then the itinerary", () => {
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "Europe/Madrid",
        whatsappPhone: "123",
        playlistUrl: "http://open.spotify.com/x",
        itinerary: { version: 1, items: [{ time: "26:00", title: "Misa" }] },
        giftRegistry: null,
        lodging: null,
        reminders: null,
      }),
      {
        ok: false,
        issues: [
          "timeZone must be one of the supported time zones",
          "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
          "playlistUrl must be an https link",
          "itinerary.items[0].time must be a time between 00:00 and 23:59",
        ],
      },
    );
  });

  it("stores the reminder switches, and reports their issues after the lodging's (F6; L9.1)", () => {
    // The two switches are part of the same feature-settings write, so one request saves them with the rest.
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        reminders: { version: 1, pendingRsvp: true, eventEve: true },
      }),
      {
        ok: true,
        value: {
          timeZone: "America/Mexico_City",
          whatsappPhone: null,
          playlistUrl: null,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
          reminders: { version: 1, pendingRsvp: true, eventEve: true },
        },
      },
    );

    // A refused switch is named with its own issue, after the lodging's, in the order the write validates them.
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: { version: 1, hotels: [{ name: "" }] },
        reminders: { version: 1, pendingRsvp: "sí", eventEve: true },
      }),
      {
        ok: false,
        issues: [
          "lodging.hotels[0].name must be between 1 and 60 characters",
          "reminders.pendingRsvp must be true or false",
        ],
      },
    );

    // Nothing switched on is no reminder settings, exactly like an absent value.
    assert.deepEqual(
      validateInvitationFeatureSettings({
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        reminders: { version: 1, pendingRsvp: false, eventEve: false },
      }),
      {
        ok: true,
        value: {
          timeZone: "America/Mexico_City",
          whatsappPhone: null,
          playlistUrl: null,
          itinerary: null,
          giftRegistry: null,
          lodging: null,
          reminders: null,
        },
      },
    );
  });

  it("reports a missing and a non-string zone with the same issue", () => {
    for (const timeZone of [undefined, null, 42, "", "America/Mexico_City "]) {
      const result = validateInvitationFeatureSettings({
        timeZone,
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: null,
        giftRegistry: null,
        lodging: null,
        reminders: null,
      });

      assert.equal(result.ok, false);
      assert.deepEqual(result.ok ? [] : result.issues, [
        "timeZone must be one of the supported time zones",
      ]);
    }
  });
});

describe("feature gating (S4, F1)", () => {
  const gated = (
    includedFeatureKeys: readonly string[],
    whatsappPhone: string | null = PHONE,
    playlistUrl: string | null = PLAYLIST,
    playlistTitle: string | null = null,
    playlistCoverUrl: string | null = null,
    itinerary: InvitationItinerary | null = ITINERARY,
    giftRegistry: InvitationGiftRegistry | null = null,
    lodging: InvitationLodging | null = null,
  ) =>
    availableFeatureKeys({
      includedFeatureKeys,
      whatsappPhone,
      playlistUrl,
      playlistTitle,
      playlistCoverUrl,
      itinerary,
      giftRegistry,
      lodging,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
    });

  const featuresOf = (gate: {
    includedFeatureKeys: readonly string[];
    whatsappPhone: string | null;
    playlistUrl: string | null;
    playlistTitle?: string | null;
    playlistCoverUrl?: string | null;
    itinerary?: InvitationItinerary | null;
    giftRegistry?: InvitationGiftRegistry | null;
    lodging?: InvitationLodging | null;
    rsvpDeadline?: Date | null;
    rsvpPartyLimit?: number;
  }) =>
    publicInvitationFeatures({
      playlistTitle: null,
      playlistCoverUrl: null,
      itinerary: null,
      giftRegistry: null,
      lodging: null,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
      ...gate,
    });

  it("answers the guestbook with its visible entries only while the package grants it (F7; L10.4)", () => {
    const entries = [
      { authorName: "Tía Rosa", message: "¡Que sea un día hermoso!" },
      { authorName: "Sofía y Jorge", message: "Nos vemos en la pista." },
    ];

    const GATE = {
      includedFeatureKeys: ["GUESTBOOK"],
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      itinerary: null,
      giftRegistry: null,
      lodging: null,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
    };

    assert.deepEqual(publicInvitationFeatures(GATE, [], entries).guestbook, entries);
    // A wall with no message is still a wall: the key is granted and the list is empty, never null.
    assert.deepEqual(publicInvitationFeatures(GATE).guestbook, []);
    // A package without the key keeps the stored messages private.
    assert.equal(
      publicInvitationFeatures({ ...GATE, includedFeatureKeys: ["COUNTDOWN"] }, [], entries)
        .guestbook,
      null,
    );
  });

  it("answers the album with its published photos and its count only while the package grants it (F8; L11.4)", () => {
    const photos = [{ url: "https://api.example.test/media/photo", uploaderName: "Tía Rosa" }];
    const GATE = {
      includedFeatureKeys: ["GUEST_ALBUM"],
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      itinerary: null,
      giftRegistry: null,
      lodging: null,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
    };

    assert.deepEqual(publicInvitationFeatures(GATE, [], [], { photos, count: 12 }).guestAlbum, {
      photos,
      count: 12,
    });
    // An album with no published photo is still an album: it is what receives the first one.
    assert.deepEqual(publicInvitationFeatures(GATE).guestAlbum, { photos: [], count: 0 });
    // A package without the key keeps every photo private, whatever the read collected.
    assert.equal(
      publicInvitationFeatures({ ...GATE, includedFeatureKeys: ["COUNTDOWN"] }, [], [], {
        photos,
        count: 12,
      }).guestAlbum,
      null,
    );
  });

  it("implements exactly ITINERARY, COUNTDOWN, MAP, RSVP, WHATSAPP, MUSIC, GIFT_REGISTRY, LODGING, GUESTBOOK, GUEST_ALBUM, GUEST_LIST, QR_PASS, and GALLERY, with CALENDAR always added", () => {
    assert.deepEqual(IMPLEMENTED_INVITATION_FEATURES, [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "MUSIC",
      "GIFT_REGISTRY",
      "LODGING",
      "GUESTBOOK",
      "GUEST_ALBUM",
      "GUEST_LIST",
      "QR_PASS",
      "GALLERY",
    ]);
    assert.equal(CALENDAR_FEATURE_KEY, "CALENDAR");
    assert.equal(ITINERARY_FEATURE_KEY, "ITINERARY");
    // The itinerary arrived with F1 and is granted to every package; a key this batch does not implement never
    // becomes a feature.
    assert.deepEqual(gated(["ITINERARY"]), ["ITINERARY", "CALENDAR"]);
    assert.deepEqual(gated(["GALLERY"]), ["GALLERY", "CALENDAR"]);
    assert.deepEqual(gated(["VIDEO"]), ["CALENDAR"]);
    // The guest list and its QR pass are implemented by M6 G2 (S3, S4).
    assert.deepEqual(gated(["GUEST_LIST", "QR_PASS"]), ["GUEST_LIST", "QR_PASS", "CALENDAR"]);
    // The guestbook is the wall itself (F7; L10.2): the key is offered while no entry is stored, because the wall is
    // what receives the first one.
    assert.deepEqual(gated(["GUESTBOOK"]), ["GUESTBOOK", "CALENDAR"]);
    // The album follows the same rule (F8; L11.4): the key is granted and the read answers no photo yet.
    assert.deepEqual(gated(["GUEST_ALBUM"]), ["GUEST_ALBUM", "CALENDAR"]);
  });

  it("shows the features each seeded package includes, plus CALENDAR", () => {
    // Basic grants neither MUSIC nor GIFT_REGISTRY, and every seeded package now grants ITINERARY (F1; S7).
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.basic), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "WHATSAPP",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.premium), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "MUSIC",
      "GUESTBOOK",
      "GALLERY",
      "CALENDAR",
    ]);
    // Deluxe adds the guest album (F8; L11.2); the reminders key is granted but not implemented by this deployment, so
    // gating drops it instead of letting a key select a component.
    assert.deepEqual(gated(["WHATSAPP_REMINDERS"]), ["CALENDAR"]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.deluxe), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "MUSIC",
      "GIFT_REGISTRY",
      "GUESTBOOK",
      "GUEST_ALBUM",
      "GUEST_LIST",
      "QR_PASS",
      "GALLERY",
      "CALENDAR",
    ]);
  });

  it("drops the itinerary while the invitation has none, whatever the package includes", () => {
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.basic, PHONE, PLAYLIST, null, null, null), [
      "COUNTDOWN",
      "MAP",
      "WHATSAPP",
      "CALENDAR",
    ]);
    assert.deepEqual(
      gated(SEEDED_PACKAGE_FEATURES.premium, PHONE, PLAYLIST, null, null, {
        version: 1,
        items: [],
      }),
      ["COUNTDOWN", "MAP", "RSVP", "WHATSAPP", "MUSIC", "GUESTBOOK", "GALLERY", "CALENDAR"],
    );
    // A package that does not grant the key shows no itinerary even while one is stored.
    assert.deepEqual(gated(["COUNTDOWN"], PHONE, PLAYLIST), ["COUNTDOWN", "CALENDAR"]);
  });

  it("drops WhatsApp while no phone is stored, whatever the package includes", () => {
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.basic, null), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.premium, null), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "MUSIC",
      "GUESTBOOK",
      "GALLERY",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.deluxe, null), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "MUSIC",
      "GIFT_REGISTRY",
      "GUESTBOOK",
      "GUEST_ALBUM",
      "GUEST_LIST",
      "QR_PASS",
      "GALLERY",
      "CALENDAR",
    ]);
  });

  it("keeps MUSIC out while no playlist link is stored, whatever the package includes", () => {
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.premium, PHONE, null), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "GUESTBOOK",
      "GALLERY",
      "CALENDAR",
    ]);
    assert.deepEqual(gated(SEEDED_PACKAGE_FEATURES.deluxe, PHONE, null), [
      "ITINERARY",
      "COUNTDOWN",
      "MAP",
      "RSVP",
      "WHATSAPP",
      "GIFT_REGISTRY",
      "GUESTBOOK",
      "GUEST_ALBUM",
      "GUEST_LIST",
      "QR_PASS",
      "GALLERY",
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
        itinerary: null,
        giftRegistry: false,
        giftRegistryDetails: null,
        lodging: null,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
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

  it("answers the stored itinerary only while the package grants ITINERARY (F1; L3.3)", () => {
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["ITINERARY"],
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: ITINERARY,
        giftRegistry: null,
        lodging: null,
      }).itinerary,
      { items: ITINERARY.items },
    );
    // A stored itinerary the package does not grant stays private, exactly like the stored phone and link.
    assert.equal(
      featuresOf({
        includedFeatureKeys: ["COUNTDOWN"],
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: ITINERARY,
        giftRegistry: null,
        lodging: null,
      }).itinerary,
      null,
    );
    // An empty list means no itinerary, so there is nothing to draw.
    assert.equal(
      featuresOf({
        includedFeatureKeys: ["ITINERARY"],
        whatsappPhone: null,
        playlistUrl: null,
        itinerary: { version: 1, items: [] },
        giftRegistry: null,
        lodging: null,
      }).itinerary,
      null,
    );
  });

  it("answers the stored gift registry only while the package grants it and it shows something (F2; L4.1, L4.3)", () => {
    const store: GiftRegistryStore = { name: "Liverpool", url: "https://x.mx/1" };
    const registry: InvitationGiftRegistry = {
      version: 1,
      stores: [store],
      transfer: { bank: "BBVA", holder: "Ana", clabe: "012180000123456782" },
      envelopes: true,
      note: "Con cariño",
    };

    // The granted package reads the registry without its version, and the transfer and the note as null when absent.
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["GIFT_REGISTRY"],
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry: registry,
      }).giftRegistryDetails,
      {
        stores: [store],
        transfer: { bank: "BBVA", holder: "Ana", clabe: "012180000123456782" },
        envelopes: true,
        note: "Con cariño",
      },
    );
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["GIFT_REGISTRY"],
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry: { version: 1, stores: [store], envelopes: false },
      }).giftRegistryDetails,
      { stores: [store], transfer: null, envelopes: false, note: null },
    );
    // A package without the key keeps a stored registry private, and the grant is still answered for the legacy text.
    const withheld = featuresOf({
      includedFeatureKeys: ["COUNTDOWN"],
      whatsappPhone: null,
      playlistUrl: null,
      giftRegistry: registry,
    });
    assert.equal(withheld.giftRegistryDetails, null);
    assert.equal(withheld.giftRegistry, false);

    // An empty registry is no registry, while the grant still lets an older invitation's text field show (L4.3).
    for (const giftRegistry of [null, { version: 1, stores: [], envelopes: false }] as const) {
      const features = featuresOf({
        includedFeatureKeys: ["GIFT_REGISTRY"],
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry,
      });
      assert.equal(features.giftRegistryDetails, null);
      assert.equal(features.giftRegistry, true);
    }
    // A row written around the API is no registry at all.
    assert.equal(
      featuresOf({
        includedFeatureKeys: ["GIFT_REGISTRY"],
        whatsappPhone: null,
        playlistUrl: null,
        giftRegistry: { version: 7, stores: [store], envelopes: false } as never,
      }).giftRegistryDetails,
      null,
    );
  });

  it("keeps GIFT_REGISTRY in the owner's gated keys while the package grants it, even with no registry (F2; L4.3)", () => {
    assert.deepEqual(gated(["GIFT_REGISTRY"], PHONE, PLAYLIST, null, null, null, null), [
      "GIFT_REGISTRY",
      "CALENDAR",
    ]);
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
        itinerary: null,
        giftRegistry: false,
        giftRegistryDetails: null,
        lodging: null,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
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
        itinerary: null,
        giftRegistry: false,
        giftRegistryDetails: null,
        lodging: null,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
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
        music: { url: PLAYLIST, provider: "spotify", title: null, coverUrl: null },
        itinerary: null,
        giftRegistry: true,
        giftRegistryDetails: null,
        lodging: null,
        guestbook: null,
        guestAlbum: null,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
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
      { mode: "open", deadline, partyLimit: 6, qrPass: false },
    );
    // Deluxe grants GUEST_LIST: personal links replace the open form, which G2 implements (S3, S4).
    assert.deepEqual(
      featuresOf({
        includedFeatureKeys: ["RSVP", "GUEST_LIST"],
        whatsappPhone: null,
        playlistUrl: null,
      }).rsvp,
      { mode: "guest-list", deadline: null, partyLimit: 4, qrPass: false },
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

  it("answers the QR pass only for a guest list whose package grants QR_PASS (M6 G2; S3, S4)", () => {
    const qrPassOf = (includedFeatureKeys: readonly string[]) =>
      featuresOf({ includedFeatureKeys, whatsappPhone: null, playlistUrl: null }).rsvp.qrPass;

    // Deluxe: the guest list and the QR pass together.
    assert.equal(qrPassOf(["RSVP", "GUEST_LIST", "QR_PASS"]), true);
    // The QR pass is an access pass for a guest list: without one, it is not offered.
    assert.equal(qrPassOf(["QR_PASS"]), false);
    assert.equal(qrPassOf(["RSVP", "QR_PASS"]), false);
    // A guest list without QR_PASS has personal links and no QR.
    assert.equal(qrPassOf(["RSVP", "GUEST_LIST"]), false);
    // A look-alike key never selects the pass.
    assert.equal(qrPassOf(["RSVP", "GUEST_LIST", "qr_pass"]), false);
  });
});

describe("the playlist metadata bounds (S2)", () => {
  it("trims the title and cuts it at the column width, and refuses a value that says nothing", () => {
    assert.equal(normalizePlaylistTitle("  Today’s Top Hits "), "Today’s Top Hits");
    // A longer title is cut, not refused: it is the provider's data and the card can show the beginning.
    assert.equal(
      normalizePlaylistTitle("a".repeat(PLAYLIST_TITLE_MAX_LENGTH + 40)),
      "a".repeat(PLAYLIST_TITLE_MAX_LENGTH),
    );
    // Counted in characters, so a title of non-ASCII letters keeps the same width the column stores.
    assert.equal(
      [...(normalizePlaylistTitle("ñ".repeat(PLAYLIST_TITLE_MAX_LENGTH + 10)) ?? "")].length,
      PLAYLIST_TITLE_MAX_LENGTH,
    );

    for (const value of ["", "   ", 7, null, undefined, {}, ["título"]]) {
      assert.equal(normalizePlaylistTitle(value), null, String(value));
    }
  });

  it("keeps a title to one line of visible text, so provider characters never reach a card (S2)", () => {
    // A line break, a tab, and a NUL separate words instead of breaking the guest's card.
    assert.equal(normalizePlaylistTitle("Today’s\nTop\tHits"), "Today’s Top Hits");
    assert.equal(normalizePlaylistTitle("La\u0000boda"), "La boda");
    // A bidi override and a zero-width character only reorder or hide text, so they are dropped.
    assert.equal(normalizePlaylistTitle("La\u202Eboda"), "Laboda");
    assert.equal(normalizePlaylistTitle("La\u200Bboda"), "Laboda");
    // A title of nothing but control characters says nothing.
    assert.equal(normalizePlaylistTitle("\n\t\u0000"), null);
    // A non-breaking space is a space, so a provider cannot hide the word boundary from the column.
    assert.equal(normalizePlaylistTitle("La\u00A0boda"), "La boda");
  });

  it("cuts a title at the bound without answering half of a character (S2)", () => {
    // U+FE0F joins the character before it: a cut between the two would render two glyphs instead of one.
    const heart = "\u2764\uFE0F";
    const cut = normalizePlaylistTitle(`${"a".repeat(PLAYLIST_TITLE_MAX_LENGTH - 1)}${heart}b`);

    assert.equal(cut, "a".repeat(PLAYLIST_TITLE_MAX_LENGTH - 1));
    assert.equal([...(cut ?? "")].length, PLAYLIST_TITLE_MAX_LENGTH - 1);
  });

  it("refuses a cover the column would not store as the value the provider gave (S2)", () => {
    // The URL parser trims spaces and drops tabs and line breaks, so it accepts values the column's
    // `starts_with(..., 'https://')` check refuses; a value with such a character is no cover at all.
    for (const value of [
      " https://i.scdn.co/image/abc",
      "https://i.scdn.co/image/abc ",
      "https://i.scdn.co/im\nage/abc",
      "https://i.scdn.co/image/abc\t",
      "https://i.scdn.co/image/a\u0000bc",
    ]) {
      assert.equal(isMusicCoverUrl(value), false, JSON.stringify(value));
    }
  });

  it("accepts a cover only over https on an allow-listed image host", () => {
    for (const host of MUSIC_COVER_HOSTS) {
      assert.equal(isMusicCoverUrl(`https://${host}/image/abc`), true, host);
    }
    assert.equal(isMusicCoverUrl("https://image-cdn-ak.spotifycdn.com/image/abc"), true);
    assert.equal(isMusicCoverUrl("https://image-cdn-fa.spotifycdn.com/image/abc"), true);

    for (const value of [
      "http://i.scdn.co/image/abc",
      "https://evil.test/image/abc",
      "https://i.scdn.co.evil.test/image/abc",
      "https://sub.i.scdn.co/image/abc",
      "https://i.scdn.co:8443/image/abc",
      "https://user:secret@i.scdn.co/image/abc",
      "https://image-cdn.spotifycdn.com/image/abc",
      "https://image-cdn-ak.spotifycdn.com.evil.test/image/abc",
      "javascript:alert(1)",
      `https://i.scdn.co/${"a".repeat(PLAYLIST_COVER_URL_MAX_LENGTH)}`,
      7,
      null,
      undefined,
    ]) {
      assert.equal(isMusicCoverUrl(value), false, String(value));
    }
  });

  it("never shows a stored cover the deployment does not allow, and keeps the link (S2)", () => {
    const gate = {
      includedFeatureKeys: ["MUSIC"],
      whatsappPhone: null,
      playlistUrl: PLAYLIST,
      playlistTitle: "  La boda  ",
      playlistCoverUrl: "https://evil.test/cover.jpg",
      itinerary: null,
      giftRegistry: null,
      lodging: null,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
    };

    // The title is trimmed and the off-list cover is dropped, so a row written around the API cannot reach a guest.
    assert.deepEqual(publicInvitationFeatures(gate).music, {
      url: PLAYLIST,
      provider: "spotify",
      title: "La boda",
      coverUrl: null,
    });
  });
});
