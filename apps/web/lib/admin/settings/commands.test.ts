import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AdminSettingsClient,
  OperationalSettings,
  SettingsSaveResult,
  SettingsView,
} from "../../server/admin-settings-client.ts";
import {
  SETTINGS_ERROR_COPY,
  SETTINGS_FIELD_COPY,
  SETTINGS_NOTICE_COPY,
  SETTINGS_PATHS,
} from "./copy.ts";
import { saveSettings } from "./commands.ts";
import { parseSettingsForm } from "./form.ts";
import { settingsPageNotices } from "./notices.ts";

// The settings command (M9 T14; S5, S8, L15). The form is read here, on the web server, and the API stays the guard:
// this command only refuses what it cannot turn into a request at all (seven integers and a note of at most 200
// characters), maps each refusal the API answers to the page's own Spanish notice, and answers the path to redirect to
// (303 after POST). Nothing here decides whether a limit is acceptable: the API's own bounds do.

const VALUES: OperationalSettings = {
  rsvpDefaultPartyLimit: 4,
  rsvpMaxPartyLimit: 10,
  galleryPhotoLimit: 12,
  storedAssetLimit: 40,
  maxUploadMegabytes: 10,
  placeSearchResultLimit: 5,
  analyticsDefaultWindowDays: 30,
};

const VIEW: SettingsView = {
  settings: VALUES,
  bounds: {
    rsvpDefaultPartyLimit: { min: 1, max: 10 },
    rsvpMaxPartyLimit: { min: 1, max: 10 },
    galleryPhotoLimit: { min: 1, max: 24 },
    storedAssetLimit: { min: 1, max: 80 },
    maxUploadMegabytes: { min: 1, max: 15 },
    placeSearchResultLimit: { min: 1, max: 10 },
    analyticsDefaultWindowDays: { min: 7, max: 90 },
  },
  updatedAt: "2026-11-20T16:30:00.000Z",
};

/** A client that records each call and answers the same outcome every time. */
function fakeClient(
  result: SettingsSaveResult = { ok: true, value: VIEW },
  onCall?: (settings: OperationalSettings, note: string | undefined) => void,
) {
  const calls: Array<{ settings: OperationalSettings; note: string | undefined }> = [];

  const api: AdminSettingsClient = {
    read: async () => ({ ok: true, value: VIEW }),
    update: async (settings, note) => {
      calls.push({ settings, note });
      onCall?.(settings, note);
      return result;
    },
  };

  return { api, calls };
}

/** A submitted form of the page; an override replaces one entry, and `undefined` removes it. */
function form(overrides: Record<string, string | undefined> = {}): FormData {
  const data = new FormData();
  const entries: Record<string, string> = {
    rsvpDefaultPartyLimit: "4",
    rsvpMaxPartyLimit: "10",
    galleryPhotoLimit: "12",
    storedAssetLimit: "40",
    maxUploadMegabytes: "10",
    placeSearchResultLimit: "5",
    analyticsDefaultWindowDays: "30",
  };

  for (const [name, value] of Object.entries({ ...entries, ...overrides })) {
    if (value !== undefined) {
      data.set(name, value);
    }
  }

  return data;
}

describe("parseSettingsForm", () => {
  it("reads the seven integers, in whatever order the form sent them", () => {
    assert.deepEqual(parseSettingsForm(form()), { settings: VALUES, note: undefined });

    const shuffled = new FormData();
    shuffled.set("analyticsDefaultWindowDays", "45");
    shuffled.set("rsvpMaxPartyLimit", "8");
    shuffled.set("rsvpDefaultPartyLimit", "2");
    shuffled.set("galleryPhotoLimit", "6");
    shuffled.set("storedAssetLimit", "20");
    shuffled.set("maxUploadMegabytes", "5");
    shuffled.set("placeSearchResultLimit", "3");

    assert.deepEqual(parseSettingsForm(shuffled), {
      settings: {
        rsvpDefaultPartyLimit: 2,
        rsvpMaxPartyLimit: 8,
        galleryPhotoLimit: 6,
        storedAssetLimit: 20,
        maxUploadMegabytes: 5,
        placeSearchResultLimit: 3,
        analyticsDefaultWindowDays: 45,
      },
      note: undefined,
    });
  });

  it("trims the note and reads a blank one as none", () => {
    const withNote = form();
    withNote.set("note", "  Ajuste de temporada  ");
    assert.deepEqual(parseSettingsForm(withNote)?.note, "Ajuste de temporada");

    const blank = form();
    blank.set("note", "   ");
    assert.deepEqual(parseSettingsForm(blank)?.note, undefined);
  });

  it("refuses anything it cannot turn into seven integers", () => {
    const broken: Array<Record<string, string | undefined>> = [
      { rsvpMaxPartyLimit: "diez" },
      { rsvpMaxPartyLimit: "10.5" },
      { rsvpMaxPartyLimit: "" },
      { rsvpMaxPartyLimit: "1e1" },
      { rsvpMaxPartyLimit: undefined },
      { galleryPhotoLimit: "-1" },
      { storedAssetLimit: "99999999999999999999" },
      // A repeated field names two values, so it names none.
      { maxUploadMegabytes: undefined },
    ];

    for (const overrides of broken) {
      const data = form(overrides);
      if (overrides.maxUploadMegabytes === undefined) {
        data.append("maxUploadMegabytes", "11");
        data.append("maxUploadMegabytes", "12");
      }
      assert.equal(parseSettingsForm(data), undefined, JSON.stringify(overrides));
    }
  });

  it("refuses a note longer than 200 characters, and accepts exactly 200", () => {
    const long = form();
    long.set("note", "x".repeat(201));
    assert.equal(parseSettingsForm(long), undefined);

    const bound = form();
    bound.set("note", `  ${"x".repeat(200)}  `);
    assert.deepEqual(parseSettingsForm(bound)?.note?.length, 200);
  });

  it("refuses a repeated note", () => {
    const data = form();
    data.append("note", "uno");
    data.append("note", "dos");

    assert.equal(parseSettingsForm(data), undefined);
  });
});

describe("saveSettings", () => {
  it("saves the seven fields and the note, then announces the save", async () => {
    const { api, calls } = fakeClient();
    const data = form();
    data.set("note", "  Subimos el máximo de acompañantes  ");

    assert.equal(await saveSettings(api, data), `${SETTINGS_PATHS.index}?notice=saved`);
    assert.deepEqual(calls, [{ settings: VALUES, note: "Subimos el máximo de acompañantes" }]);
  });

  it("sends no note when the field is blank", async () => {
    const { api, calls } = fakeClient();
    const data = form();
    data.set("note", "   ");

    assert.equal(await saveSettings(api, data), `${SETTINGS_PATHS.index}?notice=saved`);
    assert.deepEqual(calls, [{ settings: VALUES, note: undefined }]);
  });

  it("never calls the API for a form it cannot read", async () => {
    const { api, calls } = fakeClient();
    const data = form();
    data.set("galleryPhotoLimit", "docena");

    assert.equal(await saveSettings(api, data), `${SETTINGS_PATHS.index}?error=invalid-form`);
    assert.deepEqual(calls, []);

    const longNote = form();
    longNote.set("note", "x".repeat(201));
    assert.equal(await saveSettings(api, longNote), `${SETTINGS_PATHS.index}?error=invalid-form`);
    assert.deepEqual(calls, []);
  });

  it("names each refused field with its own notice", async () => {
    const cases: Array<[string, string]> = [
      ["rsvpDefaultPartyLimit", "invalid-rsvp-default-party-limit"],
      ["rsvpMaxPartyLimit", "invalid-rsvp-max-party-limit"],
      ["galleryPhotoLimit", "invalid-gallery-photo-limit"],
      ["storedAssetLimit", "invalid-stored-asset-limit"],
      ["maxUploadMegabytes", "invalid-max-upload-megabytes"],
      ["placeSearchResultLimit", "invalid-place-search-result-limit"],
      ["analyticsDefaultWindowDays", "invalid-analytics-default-window-days"],
    ];

    for (const [field, code] of cases) {
      for (const rule of ["min", "max", "cross-field"]) {
        const { api } = fakeClient({
          ok: false,
          failure: "validation",
          issues: [{ field: field as keyof OperationalSettings, rule }],
        });

        assert.equal(
          await saveSettings(api, form()),
          `${SETTINGS_PATHS.index}?error=${code}`,
          `${field}/${rule}`,
        );
        // The code names a Spanish message of this page, whose text names the field's own label.
        const message = SETTINGS_ERROR_COPY[code as keyof typeof SETTINGS_ERROR_COPY];
        assert.ok(message.length > 0);
        assert.ok(message.includes(SETTINGS_FIELD_COPY[field as keyof OperationalSettings].label));
      }
    }
  });

  it("names the first refused field when the API answers several", async () => {
    const { api } = fakeClient({
      ok: false,
      failure: "validation",
      issues: [
        { field: "storedAssetLimit", rule: "cross-field" },
        { field: "rsvpDefaultPartyLimit", rule: "min" },
      ],
    });

    assert.equal(
      await saveSettings(api, form()),
      `${SETTINGS_PATHS.index}?error=invalid-stored-asset-limit`,
    );
  });

  it("answers a refusal the API did not name with the generic invalid notice", async () => {
    const { api } = fakeClient({ ok: false, failure: "validation", issues: [] });

    assert.equal(await saveSettings(api, form()), `${SETTINGS_PATHS.index}?error=invalid-settings`);
  });

  it("answers a refused save with its own code", async () => {
    const cases: Array<[SettingsSaveResult, string]> = [
      [{ ok: false, failure: "forbidden" }, "/cuenta"],
      [{ ok: false, failure: "signed-out" }, "/admin/ingresar"],
      [{ ok: false, failure: "unavailable" }, `${SETTINGS_PATHS.index}?error=unavailable`],
    ];

    for (const [result, target] of cases) {
      const { api } = fakeClient(result);
      assert.equal(await saveSettings(api, form()), target);
    }
  });

  it("reads an unexpected failure as unavailable, without keeping it", async () => {
    const api: AdminSettingsClient = {
      read: async () => ({ ok: true, value: VIEW }),
      update: async () => {
        throw new Error("cookie: better-auth.session_token=abc");
      },
    };

    assert.equal(await saveSettings(api, form()), `${SETTINGS_PATHS.index}?error=unavailable`);
  });
});

describe("settingsPageNotices", () => {
  it("shows the message of a known code", () => {
    assert.deepEqual(settingsPageNotices({ notice: "saved" }), {
      notice: SETTINGS_NOTICE_COPY.saved,
    });
    assert.deepEqual(settingsPageNotices({ error: "invalid-stored-asset-limit" }), {
      error: {
        code: "invalid-stored-asset-limit",
        message: SETTINGS_ERROR_COPY["invalid-stored-asset-limit"],
      },
    });
  });

  it("shows nothing for an unknown, repeated, or absent value", () => {
    assert.deepEqual(settingsPageNotices({}), {});
    assert.deepEqual(settingsPageNotices({ notice: "forged" }), {});
    assert.deepEqual(settingsPageNotices({ error: "invalid" }), {});
    assert.deepEqual(settingsPageNotices({ error: ["saved", "unavailable"] }), {});
    assert.deepEqual(settingsPageNotices({ error: "saved" }), {});
  });
});
