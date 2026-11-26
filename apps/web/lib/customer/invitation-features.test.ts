import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CreatorPackage, OwnedInvitation } from "../server/invitations-api.ts";
import {
  FEATURE_COPY,
  FEATURE_ISSUE_COPY,
  INVITATION_ERROR_COPY,
  INVITATION_NOTICE_COPY,
} from "./copy.ts";
import { featureIssueCodes, featureIssueMessages, featureIssuesTarget } from "./feature-issues.ts";
import { featureSettingsView, TIME_ZONE_CHOICES, timeZoneLabel } from "./invitation-features.ts";
import { invitationPageNotices } from "./invitations.ts";

// The creator's «Funcionalidades» section (F3; S3, S4): the time zone select with Spanish labels, the
// WhatsApp field that only a package including WhatsApp shows, the automatic features the guests will see,
// and the save action that maps every refusal of the API to a Spanish message.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const VERSION_ID = "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";
const PACKAGE_ID = "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15";
const AT = "2026-11-11T12:00:00.000Z";
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

const OWNED: OwnedInvitation = {
  id: ID,
  templateVersionId: VERSION_ID,
  packageId: PACKAGE_ID,
  slug: "invitacion-k7m2qx",
  status: "DRAFT",
  publishedAt: null,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
  content: { celebrantName: "Ana" },
  missingRequiredFields: [],
  timeZone: "America/Tijuana",
  featureSettings: { whatsappPhone: "+525512345678", playlistUrl: PLAYLIST },
  availableFeatures: ["COUNTDOWN", "MAP", "WHATSAPP", "CALENDAR"],
  places: {},
};

function creatorPackage(
  id: string,
  includedFeatureKeys: string[],
  key = "basic",
  name = "Basic",
): CreatorPackage {
  return {
    id,
    key,
    name,
    description: null,
    currentPrice: { amountMinor: 150000, currency: "MXN" },
    includedFeatureKeys,
  };
}

const BASIC = creatorPackage(PACKAGE_ID, ["COUNTDOWN", "MAP", "WHATSAPP"]);
const ITINERARY_PACKAGE = creatorPackage(
  PACKAGE_ID,
  ["ITINERARY", "COUNTDOWN", "MAP"],
  "premium",
  "Premium",
);
const MAP_ONLY = creatorPackage(PACKAGE_ID, ["MAP"], "esencial");
const LODGING_PACKAGE = creatorPackage(PACKAGE_ID, ["LODGING", "COUNTDOWN"], "premium", "Premium");

describe("the feature section's Spanish copy (S7)", () => {
  it("names the two batch-2 fields in Spanish", () => {
    assert.equal(FEATURE_COPY.playlistLabel, "Enlace de tu playlist");
    assert.match(FEATURE_COPY.playlistHint, /Spotify/);
    assert.match(FEATURE_ISSUE_COPY.playlist, /https/);
  });
});

describe("time zone choices", () => {
  it("offers the eleven zones with a Spanish label that names the place and the zone", () => {
    assert.deepEqual(
      TIME_ZONE_CHOICES.map((choice) => choice.value),
      [
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
      ],
    );
    assert.equal(timeZoneLabel("America/Mexico_City"), "Ciudad de México y centro del país");
    assert.equal(timeZoneLabel("America/Cancun"), "Cancún y Quintana Roo");
    assert.equal(timeZoneLabel("America/Mazatlan"), "Mazatlán, Sinaloa y Nayarit");
    assert.equal(timeZoneLabel("America/Hermosillo"), "Hermosillo, Sonora");
    assert.equal(timeZoneLabel("America/Chihuahua"), "Chihuahua");
    assert.equal(timeZoneLabel("America/Tijuana"), "Tijuana y Baja California");
    assert.equal(timeZoneLabel("America/Matamoros"), "Matamoros, Tamaulipas");
    assert.equal(timeZoneLabel("America/Monterrey"), "Monterrey");
    assert.equal(timeZoneLabel("America/Merida"), "Mérida");
    assert.equal(timeZoneLabel("America/Ojinaga"), "Ojinaga");
    assert.equal(timeZoneLabel("America/Bahia_Banderas"), "Bahía de Banderas");
    // A stored value outside the list is shown as it is, never guessed into another place.
    assert.equal(timeZoneLabel("Europe/Madrid"), "Europe/Madrid");
  });
});

describe("featureSettingsView", () => {
  it("shows the stored settings and the automatic features of a package that includes WhatsApp", () => {
    const view = featureSettingsView(OWNED, [BASIC]);

    assert.equal(view.id, ID);
    assert.equal(view.editable, true);
    assert.equal(view.timeZone, "America/Tijuana");
    assert.equal(view.whatsappPhone, "+525512345678");
    assert.equal(view.showWhatsapp, true);
    assert.equal(view.playlistUrl, PLAYLIST);
    assert.equal(view.showMusic, false);
    assert.deepEqual(view.timeZones, TIME_ZONE_CHOICES);
    assert.deepEqual(view.automaticFeatures, [
      "Cuenta regresiva hasta el inicio",
      "Mapa con enlaces a Google Maps y Waze",
      "Botón para agregar al calendario",
    ]);
  });

  it("hides the WhatsApp field when the package does not include it, though a phone is stored", () => {
    const view = featureSettingsView(
      { ...OWNED, availableFeatures: ["MAP", "CALENDAR"], packageId: PACKAGE_ID },
      [MAP_ONLY],
    );

    assert.equal(view.showWhatsapp, false);
    assert.deepEqual(view.automaticFeatures, [
      "Mapa con enlaces a Google Maps y Waze",
      "Botón para agregar al calendario",
    ]);
    // The stored number stays in the view, so a save never clears it by accident.
    assert.equal(view.whatsappPhone, "+525512345678");
  });

  it("offers only the calendar when the catalog cannot answer for the package", () => {
    const view = featureSettingsView(OWNED, undefined);

    assert.equal(view.showWhatsapp, false);
    assert.deepEqual(view.automaticFeatures, ["Botón para agregar al calendario"]);
  });

  it("keeps a stored zone outside the list selectable, so saving never silently changes it", () => {
    const view = featureSettingsView({ ...OWNED, timeZone: "Europe/Madrid" }, [BASIC]);

    assert.equal(view.timeZone, "Europe/Madrid");
    assert.equal(view.timeZones.length, TIME_ZONE_CHOICES.length + 1);
    assert.deepEqual(view.timeZones.at(-1), { value: "Europe/Madrid", label: "Europe/Madrid" });
  });

  it("shows the playlist field only for a package that includes MUSIC, and keeps the stored link", () => {
    const premium = featureSettingsView({ ...OWNED, packageId: PACKAGE_ID }, [
      creatorPackage(PACKAGE_ID, ["COUNTDOWN", "MUSIC"], "premium", "Premium"),
    ]);

    assert.equal(premium.showMusic, true);
    assert.equal(premium.playlistUrl, PLAYLIST);
    // The stored link stays in the view even when the package does not grant music, so a save keeps it.
    const basic = featureSettingsView(OWNED, [BASIC]);
    assert.equal(basic.showMusic, false);
    assert.equal(basic.playlistUrl, PLAYLIST);
  });

  it("offers the itinerary block only while the package grants it (F1; L3.2, L3.4)", () => {
    const stored = {
      ...OWNED,
      featureSettings: {
        ...OWNED.featureSettings,
        itinerary: {
          version: 1 as const,
          items: [
            {
              time: "17:00",
              title: "Misa",
              place: "Parroquia de San Juan",
              address: "Av. Juárez 45",
            },
            { time: "19:30", title: "Recepción y cóctel" },
          ],
        },
      },
    };

    const granted = featureSettingsView(stored, [ITINERARY_PACKAGE]);

    assert.equal(granted.showItinerary, true);
    assert.deepEqual(granted.itinerary, [
      { time: "17:00", title: "Misa", place: "Parroquia de San Juan", address: "Av. Juárez 45" },
      { time: "19:30", title: "Recepción y cóctel", place: "", address: "" },
    ]);

    // A package without the key, and a catalog that could not be read, offer no editor for the plan.
    assert.equal(featureSettingsView(stored, [BASIC]).showItinerary, false);
    assert.equal(featureSettingsView(stored, undefined).showItinerary, false);
    // An invitation without a plan opens an empty list, which is what the editor adds the first moment to.
    assert.deepEqual(featureSettingsView(OWNED, [ITINERARY_PACKAGE]).itinerary, []);
  });

  it("offers the lodging block only while the package grants LODGING, and opens it from the stored cards (F4; L7.4)", () => {
    const stored = {
      ...OWNED,
      featureSettings: {
        ...OWNED.featureSettings,
        lodging: {
          version: 1 as const,
          hotels: [
            {
              name: "Hotel Misión",
              distance: "A 5 min",
              bookingUrl: "https://hotelmision.example.com/reserva",
            },
          ],
          transport: "Camión a las 19:00.",
        },
      },
    };

    const granted = featureSettingsView(stored, [LODGING_PACKAGE]);

    assert.equal(granted.showLodging, true);
    assert.deepEqual(granted.lodging.hotels, [
      {
        name: "Hotel Misión",
        distance: "A 5 min",
        price: "",
        groupCode: "",
        bookingUrl: "https://hotelmision.example.com/reserva",
        address: "",
      },
    ]);
    assert.equal(granted.lodging.transport, "Camión a las 19:00.");

    // A package without the key, and a catalog that could not be read, offer no editor for the cards.
    assert.equal(featureSettingsView(stored, [BASIC]).showLodging, false);
    assert.equal(featureSettingsView(stored, undefined).showLodging, false);
    // An invitation without a lodging opens an empty list, which is what the editor adds the first hotel to.
    assert.deepEqual(featureSettingsView(OWNED, [LODGING_PACKAGE]).lodging.hotels, []);
  });

  it("offers the reminder block only to a granting package, with its stored switches and the capability (F6; L9.1, L9.2, L9.5)", () => {
    const remindersPackage = creatorPackage(PACKAGE_ID, ["WHATSAPP_REMINDERS"], "deluxe", "Deluxe");
    const stored: OwnedInvitation = {
      ...OWNED,
      featureSettings: {
        ...OWNED.featureSettings,
        reminders: { version: 1, pendingRsvp: true, eventEve: false },
      },
      remindersConfigured: false,
    };

    const granted = featureSettingsView(stored, [remindersPackage]);

    assert.equal(granted.showReminders, true);
    assert.deepEqual(granted.reminders, { pendingRsvp: true, eventEve: false });
    // This deployment has no provider, which is what the block shows as «Aún no está activo» (S6, L9.5).
    assert.equal(granted.remindersConfigured, false);

    // A package without the key, and a catalog that could not be read, offer no reminder editor.
    assert.equal(featureSettingsView(stored, [BASIC]).showReminders, false);
    assert.equal(featureSettingsView(stored, undefined).showReminders, false);
    // An invitation without stored switches shows them off, so the owner can switch one on.
    assert.deepEqual(featureSettingsView(OWNED, [remindersPackage]).reminders, {
      pendingRsvp: false,
      eventEve: false,
    });
    // A body written before F6 carries no capability, which reads as «not configured» rather than as an error.
    assert.equal(featureSettingsView(OWNED, [remindersPackage]).remindersConfigured, false);
  });

  it("names the reminder copy in Spanish (F6; L9.5, L9.6)", () => {
    assert.equal(FEATURE_COPY.remindersTitle, "Recordatorios por WhatsApp");
    assert.equal(FEATURE_COPY.remindersInactiveTitle, "Aún no está activo");
    assert.match(FEATURE_COPY.remindersPendingRsvpHint, /7 días y 2 días/);
    assert.match(FEATURE_COPY.remindersEventEveHint, /Un día antes/);
    assert.equal(FEATURE_COPY.remindersPreviewTitle, "Vista previa del mensaje");
  });

  it("names the lodging sentence of a refusal (F4; L7.4)", () => {
    assert.deepEqual(
      featureIssueCodes([
        "lodging.version must be 1",
        "lodging.hotels[1].bookingUrl must be an https link of at most 500 characters",
        "lodging.transport must be a string of at most 400 characters",
      ]),
      ["lodging"],
    );
    assert.equal(FEATURE_ISSUE_COPY.lodging.length > 0, true);
  });

  it("names the itinerary sentence of a refusal (F1; L3.4)", () => {
    assert.deepEqual(
      featureIssueCodes([
        "itinerary.version must be 1",
        "itinerary.items[2].title must be between 1 and 60 characters",
      ]),
      ["itinerary"],
    );
    assert.equal(FEATURE_ISSUE_COPY.itinerary.length > 0, true);
  });

  it("lists the packages that include the gift registry when this one does not (S7)", () => {
    // Each catalog package has its own id, and the invitation's own package is the first of them.
    const own = creatorPackage(PACKAGE_ID, ["COUNTDOWN", "MAP", "WHATSAPP"], "basic", "Basic");
    const premium = creatorPackage(
      "6b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e16",
      ["COUNTDOWN", "MUSIC"],
      "premium",
      "Premium",
    );
    const deluxe = creatorPackage(
      "7b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e17",
      ["COUNTDOWN", "MUSIC", "GIFT_REGISTRY"],
      "deluxe",
      "Deluxe",
    );
    const premiumPlus = creatorPackage(
      "8b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e18",
      ["COUNTDOWN", "MUSIC", "GIFT_REGISTRY"],
      "premium_plus",
      "Premium Plus",
    );

    // A package that grants the gift registry needs no note.
    assert.equal(
      featureSettingsView({ ...OWNED, packageId: deluxe.id }, [own, premium, deluxe])
        .giftRegistryNote,
      "",
    );
    assert.equal(
      featureSettingsView({ ...OWNED, packageId: own.id }, [own, premium, deluxe]).giftRegistryNote,
      "La mesa de regalos se muestra con el paquete Deluxe.",
    );
    // Two packages that include it are both named, in the catalog's order.
    assert.equal(
      featureSettingsView({ ...OWNED, packageId: own.id }, [own, premium, deluxe, premiumPlus])
        .giftRegistryNote,
      "La mesa de regalos se muestra con los paquetes Deluxe y Premium Plus.",
    );
    // A catalog in which no package includes it still says why the block does not show.
    assert.equal(
      featureSettingsView({ ...OWNED, packageId: own.id }, [own, premium]).giftRegistryNote,
      "La mesa de regalos se muestra con un paquete que la incluya.",
    );
    // A catalog that could not be read names no package at all: nothing is promised.
    assert.equal(featureSettingsView(OWNED, undefined).giftRegistryNote, "");
  });

  it("keeps an archived invitation readable and refuses an invalid one read-only", () => {
    const archived = featureSettingsView({ ...OWNED, status: "ARCHIVED" }, [BASIC]);
    assert.equal(archived.editable, false);
    assert.equal(archived.timeZone, "America/Tijuana");

    const published = featureSettingsView({ ...OWNED, status: "PUBLISHED" }, [BASIC]);
    assert.equal(published.editable, true);
  });
});

describe("feature issues", () => {
  it("maps each documented English issue to one code, with an unknown one as other", () => {
    assert.deepEqual(
      featureIssueCodes([
        "timeZone must be one of the supported time zones",
        "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
      ]),
      ["timezone", "phone"],
    );
    assert.deepEqual(featureIssueCodes(["whatsappPhone must be a string or null"]), ["phone-type"]);
    // Every playlist issue the API can name maps to the one Spanish sentence of the field (S7).
    for (const issue of [
      "playlistUrl must be a string or null",
      "playlistUrl must be an https link",
      "playlistUrl must link to Spotify, Apple Music, YouTube, Deezer, or SoundCloud",
      "playlistUrl must be at most 500 characters",
    ]) {
      assert.deepEqual(featureIssueCodes([issue]), ["playlist"], issue);
    }
    assert.deepEqual(featureIssueMessages("playlist"), [FEATURE_ISSUE_COPY.playlist]);
    assert.deepEqual(featureIssueCodes(["something else"]), ["other"]);
    assert.deepEqual(featureIssueCodes([]), ["other"]);
    // A repeated issue is named once, and the list never grows past one code per issue it knows.
    assert.deepEqual(
      featureIssueCodes([
        "timeZone must be one of the supported time zones",
        "timeZone must be one of the supported time zones",
      ]),
      ["timezone"],
    );
  });

  it("turns the codes of the query into Spanish sentences, and nothing for a code it does not know", () => {
    assert.deepEqual(featureIssueMessages("timezone,phone"), [
      FEATURE_ISSUE_COPY.timezone,
      FEATURE_ISSUE_COPY.phone,
    ]);
    assert.deepEqual(featureIssueMessages("invented"), []);
    assert.deepEqual(featureIssueMessages(undefined), []);
    assert.deepEqual(featureIssueMessages(["timezone"]), [FEATURE_ISSUE_COPY.timezone]);
    assert.equal(
      featureIssuesTarget("/cuenta/x", ["phone"]),
      "/cuenta/x?error=features-invalid&issues=phone",
    );
  });
});

describe("feature notices", () => {
  it("shows the Spanish sentences of a refused feature save and the confirmation of a saved one", () => {
    assert.deepEqual(
      invitationPageNotices({ error: "features-invalid", issues: "timezone,phone" }),
      {
        error: INVITATION_ERROR_COPY["features-invalid"],
        issues: [FEATURE_ISSUE_COPY.timezone, FEATURE_ISSUE_COPY.phone],
      },
    );
    assert.deepEqual(invitationPageNotices({ error: "features-invalid" }), {
      error: INVITATION_ERROR_COPY["features-invalid"],
    });
    assert.deepEqual(invitationPageNotices({ error: "features-invalid", issues: "invented" }), {
      error: INVITATION_ERROR_COPY["features-invalid"],
    });
    assert.deepEqual(invitationPageNotices({ notice: "features-saved" }), {
      notice: INVITATION_NOTICE_COPY["features-saved"],
    });
  });

  it("keeps the publication issues and the content errors mapping as they were (preserved)", () => {
    assert.deepEqual(invitationPageNotices({ error: "not-publishable", issues: "field:date" }), {
      error: INVITATION_ERROR_COPY["not-publishable"],
      issues: ["Falta: Fecha."],
    });
    assert.deepEqual(invitationPageNotices({ error: "content-invalid" }), {
      error: INVITATION_ERROR_COPY["content-invalid"],
    });
    assert.deepEqual(invitationPageNotices({ notice: "saved" }), {
      notice: INVITATION_NOTICE_COPY.saved,
    });
  });
});
