import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SettingsView } from "../../server/admin-settings-client.ts";
import { SETTINGS_COPY } from "./copy.ts";
import { formatSettingsUpdatedAt, settingsPageView } from "./view.ts";

// The settings page's view (M9 T14; S5, S8): the four groups of the owner's decision, each field with the label and the
// help text of its own copy and with the bounds the API answered (never a constant of the page), the value the form
// starts from, and the last update instant in Mexico City time.

const VIEW: SettingsView = {
  settings: {
    rsvpDefaultPartyLimit: 3,
    rsvpMaxPartyLimit: 8,
    galleryPhotoLimit: 6,
    storedAssetLimit: 20,
    maxUploadMegabytes: 5,
    placeSearchResultLimit: 4,
    analyticsDefaultWindowDays: 45,
  },
  bounds: {
    rsvpDefaultPartyLimit: { min: 2, max: 9 },
    rsvpMaxPartyLimit: { min: 2, max: 9 },
    galleryPhotoLimit: { min: 3, max: 24 },
    storedAssetLimit: { min: 4, max: 80 },
    maxUploadMegabytes: { min: 1, max: 15 },
    placeSearchResultLimit: { min: 1, max: 10 },
    analyticsDefaultWindowDays: { min: 7, max: 90 },
  },
  updatedAt: "2026-11-20T16:30:00.000Z",
};

describe("settingsPageView", () => {
  it("groups the seven settings as the owner decided", () => {
    const page = settingsPageView(VIEW);

    assert.deepEqual(
      page.groups.map((group) => [group.title, group.fields.map((field) => field.field)]),
      [
        ["Acompañantes RSVP", ["rsvpDefaultPartyLimit", "rsvpMaxPartyLimit"]],
        ["Fotos por invitación", ["galleryPhotoLimit", "storedAssetLimit"]],
        ["Tamaño de foto", ["maxUploadMegabytes"]],
        ["Búsqueda y analítica", ["placeSearchResultLimit", "analyticsDefaultWindowDays"]],
      ],
    );
  });

  it("labels each field as the owner decided, with its own help text", () => {
    const fields = settingsPageView(VIEW).groups.flatMap((group) => group.fields);

    assert.deepEqual(
      fields.map((field) => field.label),
      [
        "Acompañantes por defecto",
        "Máximo de acompañantes",
        "Fotos de galería",
        "Archivos guardados",
        "Peso máximo por foto (MB)",
        "Resultados al buscar un lugar",
        "Rango por defecto de la analítica (días)",
      ],
    );
    for (const field of fields) {
      assert.ok(field.hint.length > 0, field.field);
      assert.ok(field.boundsHint.length > 0, field.field);
    }
  });

  it("takes the value and the bounds from the API's answer, not from a constant", () => {
    const fields = settingsPageView(VIEW).groups.flatMap((group) => group.fields);
    const byField = new Map(fields.map((field) => [field.field, field]));

    assert.deepEqual(byField.get("rsvpDefaultPartyLimit"), {
      field: "rsvpDefaultPartyLimit",
      label: "Acompañantes por defecto",
      hint: "Cuántos acompañantes se proponen al confirmar la asistencia.",
      value: 3,
      min: 2,
      max: 9,
      boundsHint: "De 2 a 9.",
    });
    assert.equal(byField.get("storedAssetLimit")?.min, 4);
    assert.equal(byField.get("storedAssetLimit")?.max, 80);
    assert.equal(byField.get("analyticsDefaultWindowDays")?.value, 45);
  });

  it("formats the last update in Mexico City time and keeps the instant", () => {
    const page = settingsPageView(VIEW);

    assert.equal(page.updatedAt, "2026-11-20T16:30:00.000Z");
    assert.equal(page.updated, formatSettingsUpdatedAt(VIEW.updatedAt));
    assert.deepEqual(page.updated, "20 nov 2026, 10:30");
    assert.equal(page.updatedLabel, SETTINGS_COPY.updatedAt(page.updated));
  });

  it("shows no invented date when the API's instant cannot be read", () => {
    assert.equal(formatSettingsUpdatedAt("20/11/2026"), "");

    const page = settingsPageView({ ...VIEW, updatedAt: "20/11/2026" });
    assert.equal(page.updated, "");
    assert.equal(page.updatedLabel, SETTINGS_COPY.updatedAtUnknown);
  });
});
