import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  CreatorPackage,
  InvitationResult,
  InvitationsClient,
  OwnedInvitation,
} from "../server/invitations-api.ts";
import { FEATURE_ISSUE_COPY, INVITATION_ERROR_COPY, INVITATION_NOTICE_COPY } from "./copy.ts";
import { featureIssueCodes, featureIssueMessages, featureIssuesTarget } from "./feature-issues.ts";
import {
  featureSettingsView,
  parseFeatureSettingsForm,
  saveInvitationFeatures,
  TIME_ZONE_CHOICES,
  timeZoneLabel,
} from "./invitation-features.ts";
import { invitationPageNotices } from "./invitations.ts";

// The creator's «Funcionalidades» section (F3; S3, S4): the time zone select with Spanish labels, the
// WhatsApp field that only a package including WhatsApp shows, the automatic features the guests will see,
// and the save action that maps every refusal of the API to a Spanish message.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const VERSION_ID = "4b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e14";
const PACKAGE_ID = "5b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e15";
const AT = "2026-11-11T12:00:00.000Z";

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
  featureSettings: { whatsappPhone: "+525512345678" },
  availableFeatures: ["COUNTDOWN", "MAP", "WHATSAPP", "CALENDAR"],
};

function creatorPackage(id: string, includedFeatureKeys: string[], key = "basic"): CreatorPackage {
  return {
    id,
    key,
    name: "Basic",
    description: null,
    currentPrice: { amountMinor: 150000, currency: "MXN" },
    includedFeatureKeys,
  };
}

const BASIC = creatorPackage(PACKAGE_ID, ["COUNTDOWN", "MAP", "WHATSAPP"]);
const MAP_ONLY = creatorPackage(PACKAGE_ID, ["MAP"], "esencial");

interface Answers {
  updateInvitationFeatures?: () => Promise<InvitationResult<OwnedInvitation>>;
}

interface Stub {
  api: InvitationsClient;
  calls: string[];
}

function unexpected(name: string): Promise<never> {
  return Promise.reject(new Error(`unexpected ${name}`));
}

function stub(answers: Answers = {}): Stub {
  const calls: string[] = [];
  const api: InvitationsClient = {
    list: () => unexpected("list"),
    get: () => unexpected("get"),
    create: () => unexpected("create"),
    replaceContent: () => unexpected("replaceContent"),
    updateInvitationFeatures: (id, features) => {
      calls.push(`updateInvitationFeatures:${id}:${JSON.stringify(features)}`);
      return answers.updateInvitationFeatures?.() ?? unexpected("updateInvitationFeatures");
    },
    archive: () => unexpected("archive"),
    publish: () => unexpected("publish"),
    unpublish: () => unexpected("unpublish"),
    templates: () => unexpected("templates"),
    packages: () => unexpected("packages"),
  };
  return { api, calls };
}

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }
  return data;
}

const DETAIL = `/cuenta/invitaciones/${ID}`;

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
    assert.equal(
      timeZoneLabel("America/Mexico_City"),
      "Ciudad de México y centro del país (America/Mexico_City)",
    );
    assert.equal(timeZoneLabel("America/Cancun"), "Cancún y Quintana Roo (America/Cancun)");
    assert.equal(
      timeZoneLabel("America/Mazatlan"),
      "Mazatlán, Sinaloa y Nayarit (America/Mazatlan)",
    );
    assert.equal(timeZoneLabel("America/Hermosillo"), "Hermosillo, Sonora (America/Hermosillo)");
    assert.equal(timeZoneLabel("America/Chihuahua"), "Chihuahua (America/Chihuahua)");
    assert.equal(timeZoneLabel("America/Tijuana"), "Tijuana y Baja California (America/Tijuana)");
    assert.equal(timeZoneLabel("America/Matamoros"), "Matamoros, Tamaulipas (America/Matamoros)");
    assert.equal(timeZoneLabel("America/Monterrey"), "Monterrey (America/Monterrey)");
    assert.equal(timeZoneLabel("America/Merida"), "Mérida (America/Merida)");
    assert.equal(timeZoneLabel("America/Ojinaga"), "Ojinaga (America/Ojinaga)");
    assert.equal(
      timeZoneLabel("America/Bahia_Banderas"),
      "Bahía de Banderas (America/Bahia_Banderas)",
    );
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

  it("keeps an archived invitation readable and refuses an invalid one read-only", () => {
    const archived = featureSettingsView({ ...OWNED, status: "ARCHIVED" }, [BASIC]);
    assert.equal(archived.editable, false);
    assert.equal(archived.timeZone, "America/Tijuana");

    const published = featureSettingsView({ ...OWNED, status: "PUBLISHED" }, [BASIC]);
    assert.equal(published.editable, true);
  });
});

describe("parseFeatureSettingsForm", () => {
  it("reads the submitted zone and trims a blank phone into null", () => {
    assert.deepEqual(
      parseFeatureSettingsForm(formData({ timeZone: "America/Merida", whatsappPhone: "  " })),
      { ok: true, timeZone: "America/Merida", whatsappPhone: null },
    );
    assert.deepEqual(
      parseFeatureSettingsForm(
        formData({ timeZone: "America/Merida", whatsappPhone: "55 1234 5678" }),
      ),
      { ok: true, timeZone: "America/Merida", whatsappPhone: "55 1234 5678" },
    );
  });

  it("refuses a zone outside the list and a phone that cannot be one", () => {
    assert.deepEqual(parseFeatureSettingsForm(formData({ whatsappPhone: "" })), {
      ok: false,
      issues: ["timezone"],
    });
    assert.deepEqual(
      parseFeatureSettingsForm(formData({ timeZone: "Europe/Madrid", whatsappPhone: "" })),
      { ok: false, issues: ["timezone"] },
    );
    const tooLong = "5".repeat(40);
    assert.deepEqual(
      parseFeatureSettingsForm(formData({ timeZone: "America/Merida", whatsappPhone: tooLong })),
      { ok: false, issues: ["phone"] },
    );
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

describe("saveInvitationFeatures", () => {
  it("saves the zone and the phone and returns to the page with the confirmation", async () => {
    const { api, calls } = stub({
      updateInvitationFeatures: async () => ({ ok: true, value: OWNED }),
    });

    const target = await saveInvitationFeatures(
      api,
      formData({ id: ID, timeZone: "America/Merida", whatsappPhone: "55 1234 5678" }),
    );

    assert.equal(target, `${DETAIL}?notice=features-saved`);
    assert.deepEqual(calls, [
      `updateInvitationFeatures:${ID}:${JSON.stringify({
        timeZone: "America/Merida",
        whatsappPhone: "55 1234 5678",
      })}`,
    ]);
  });

  it("clears the phone when the field is submitted empty", async () => {
    const { api, calls } = stub({
      updateInvitationFeatures: async () => ({
        ok: true,
        value: { ...OWNED, featureSettings: { whatsappPhone: null } },
      }),
    });

    await saveInvitationFeatures(api, formData({ id: ID, timeZone: "America/Merida" }));

    assert.deepEqual(calls, [
      `updateInvitationFeatures:${ID}:${JSON.stringify({
        timeZone: "America/Merida",
        whatsappPhone: null,
      })}`,
    ]);
  });

  it("returns the Spanish features error with the codes of the issues the API named", async () => {
    const { api } = stub({
      updateInvitationFeatures: async () => ({
        ok: false,
        failure: "features-invalid",
        issues: [
          "timeZone must be one of the supported time zones",
          "whatsappPhone must be a Mexican 10-digit number or an international number with 8 to 15 digits after +",
        ],
      }),
    });

    assert.equal(
      await saveInvitationFeatures(
        api,
        formData({ id: ID, timeZone: "America/Tijuana", whatsappPhone: "12" }),
      ),
      `${DETAIL}?error=features-invalid&issues=timezone,phone`,
    );
  });

  it("returns one generic features error when the API names no issue it knows", async () => {
    const { api } = stub({
      updateInvitationFeatures: async () => ({ ok: false, failure: "features-invalid" }),
    });

    assert.equal(
      await saveInvitationFeatures(api, formData({ id: ID, timeZone: "America/Tijuana" })),
      `${DETAIL}?error=features-invalid&issues=other`,
    );
  });

  it("refuses an archived invitation like the content form does", async () => {
    const { api } = stub({
      updateInvitationFeatures: async () => ({ ok: false, failure: "not-editable" }),
    });

    assert.equal(
      await saveInvitationFeatures(api, formData({ id: ID, timeZone: "America/Tijuana" })),
      `${DETAIL}?error=not-editable`,
    );
  });

  it("sends nothing for a zone or phone it refuses, and treats a throwing call as unavailable", async () => {
    const { api, calls } = stub();

    assert.equal(
      await saveInvitationFeatures(api, formData({ id: ID, timeZone: "Europe/Madrid" })),
      `${DETAIL}?error=features-invalid&issues=timezone`,
    );
    assert.equal(
      await saveInvitationFeatures(
        api,
        formData({ id: ID, timeZone: "America/Tijuana", whatsappPhone: "5".repeat(40) }),
      ),
      `${DETAIL}?error=features-invalid&issues=phone`,
    );
    assert.equal(
      await saveInvitationFeatures(api, formData({ id: "1", timeZone: "America/Tijuana" })),
      "/cuenta/invitaciones?error=not-found",
    );
    assert.equal(
      await saveInvitationFeatures(api, formData({ id: ID, timeZone: "America/Tijuana" })),
      `${DETAIL}?error=unavailable`,
    );
    // Only the last submission reached the API; a zone, a phone, or an id refused here never does.
    assert.equal(calls.length, 1);
  });

  it("sends an ended session to sign-in and a missing draft to its own error", async () => {
    const ended = stub({
      updateInvitationFeatures: async () => ({ ok: false, failure: "signed-out" }),
    });
    assert.equal(
      await saveInvitationFeatures(ended.api, formData({ id: ID, timeZone: "America/Tijuana" })),
      "/ingresar",
    );

    const missing = stub({
      updateInvitationFeatures: async () => ({ ok: false, failure: "not-found" }),
    });
    assert.equal(
      await saveInvitationFeatures(missing.api, formData({ id: ID, timeZone: "America/Tijuana" })),
      `${DETAIL}?error=not-found`,
    );
  });
});
