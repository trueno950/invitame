import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_ACTION_NOTE_MAX_LENGTH } from "../../admin/admin-action-recorder";
import {
  changedSettings,
  INITIAL_OPERATIONAL_SETTINGS,
  megabytesInBytes,
  OPERATIONAL_SETTINGS_BOUNDS,
  OPERATIONAL_SETTINGS_FIELDS,
  OPERATIONAL_SETTINGS_NOTE_MAX_LENGTH,
  OPERATIONAL_SETTINGS_RULE,
  type OperationalSettings,
  type OperationalSettingsIssue,
  settingsAuditNote,
  validateOperationalSettings,
} from "./operational-settings";

// The operational settings domain (M9 T13; S5, S8, L15). It is pure: no framework, no ORM, no clock, and no table. The
// bounds below are the ones the migration's CHECK constraints restate, so a value this file accepts is a value the
// row can store, and the two cross-field rules are the ones the migration states as its two cross-field checks.

/** One complete request, so a case changes exactly the field it is about; a case may put anything in that field. */
function settings(
  overrides: Partial<Record<keyof OperationalSettings, unknown>> = {},
): OperationalSettings {
  return { ...INITIAL_OPERATIONAL_SETTINGS, ...overrides } as OperationalSettings;
}

function issuesOf(input: unknown): OperationalSettingsIssue[] | null {
  const result = validateOperationalSettings(input);

  return result.ok ? null : [...result.issues];
}

function issue(field: string, rule: string): OperationalSettingsIssue {
  return {
    field: field as OperationalSettingsIssue["field"],
    rule: rule as OperationalSettingsIssue["rule"],
  };
}

describe("the operational settings domain (M9 T13; S5, S8, L15)", () => {
  it("states the seven fields, their bounds, and the values the migration seeds, in one place", () => {
    assert.deepEqual(
      [...OPERATIONAL_SETTINGS_FIELDS],
      [
        "rsvpDefaultPartyLimit",
        "rsvpMaxPartyLimit",
        "galleryPhotoLimit",
        "storedAssetLimit",
        "maxUploadMegabytes",
        "placeSearchResultLimit",
        "analyticsDefaultWindowDays",
      ],
    );
    assert.deepEqual(OPERATIONAL_SETTINGS_BOUNDS, {
      rsvpDefaultPartyLimit: { min: 1, max: 10 },
      rsvpMaxPartyLimit: { min: 1, max: 10 },
      galleryPhotoLimit: { min: 1, max: 24 },
      storedAssetLimit: { min: 1, max: 80 },
      maxUploadMegabytes: { min: 1, max: 15 },
      placeSearchResultLimit: { min: 1, max: 10 },
      analyticsDefaultWindowDays: { min: 7, max: 90 },
    });
    assert.deepEqual(INITIAL_OPERATIONAL_SETTINGS, {
      rsvpDefaultPartyLimit: 4,
      rsvpMaxPartyLimit: 10,
      galleryPhotoLimit: 12,
      storedAssetLimit: 40,
      maxUploadMegabytes: 10,
      placeSearchResultLimit: 5,
      analyticsDefaultWindowDays: 30,
    });
    assert.equal(OPERATIONAL_SETTINGS_NOTE_MAX_LENGTH, 200);
    // Every rule identifier is short enough for the web client's own bound on a rule name.
    for (const rule of Object.values(OPERATIONAL_SETTINGS_RULE)) {
      assert.ok(rule.length > 0 && rule.length <= 40, `${rule} is ${rule.length} characters`);
    }
    assert.deepEqual(issuesOf(settings()), null, "the seeded values are valid");
  });

  it("accepts both ends of every bound and refuses one below or one above", () => {
    for (const field of OPERATIONAL_SETTINGS_FIELDS) {
      const bounds = OPERATIONAL_SETTINGS_BOUNDS[field];

      // The stored-asset floor is the cross-field rule, not the column's own lower bound (asserted below), so only its
      // upper bound can be measured on its own.
      const accepted = field === "storedAssetLimit" ? [bounds.max] : [bounds.min, bounds.max];

      for (const value of accepted) {
        // Both cross-field rules must hold while one field is measured, so the case that sets the RSVP maximum also
        // moves the default, and the stored-asset case leaves room for the gallery.
        const companions =
          field === "rsvpMaxPartyLimit"
            ? { rsvpDefaultPartyLimit: value }
            : field === "storedAssetLimit"
              ? {
                  galleryPhotoLimit: Math.min(
                    OPERATIONAL_SETTINGS_BOUNDS.galleryPhotoLimit.max,
                    value - 1,
                  ),
                }
              : {};
        assert.equal(
          issuesOf(settings({ [field]: value, ...companions })),
          null,
          `${field} accepts ${value}`,
        );
      }

      const below = issuesOf(settings({ [field]: bounds.min - 1 }));
      assert.deepEqual(below, [issue(field, OPERATIONAL_SETTINGS_RULE.MIN)], `${field} below min`);

      const above = issuesOf(settings({ [field]: bounds.max + 1 }));
      assert.deepEqual(above, [issue(field, OPERATIONAL_SETTINGS_RULE.MAX)], `${field} above max`);
    }

    // The stored-asset floor is the cross-field rule, not the column's own lower bound: one stored asset cannot hold
    // the main photo and a gallery, so the effective minimum is `galleryPhotoLimit + 1`.
    assert.deepEqual(issuesOf(settings({ storedAssetLimit: 1 })), [
      issue("storedAssetLimit", OPERATIONAL_SETTINGS_RULE.STORED_ASSET_ABOVE_GALLERY),
    ]);
  });

  it("refuses a value that is not an integer at all, field by field and in field order", () => {
    const refused = [1.5, "4", null, undefined, true, Number.NaN, Number.POSITIVE_INFINITY];

    for (const field of OPERATIONAL_SETTINGS_FIELDS) {
      for (const value of refused) {
        assert.deepEqual(
          issuesOf(settings({ [field]: value })),
          [issue(field, OPERATIONAL_SETTINGS_RULE.INTEGER)],
          `${field} refuses ${String(value)}`,
        );
      }
    }

    const missing = settings();
    for (const field of OPERATIONAL_SETTINGS_FIELDS) {
      assert.deepEqual(
        issuesOf({ ...missing, [field]: undefined }),
        [issue(field, OPERATIONAL_SETTINGS_RULE.INTEGER)],
        `${field} is required`,
      );
    }
  });

  it("reports every field issue once, in field order, so the client can show them together", () => {
    assert.deepEqual(issuesOf({ ...settings(), rsvpMaxPartyLimit: 0, galleryPhotoLimit: 99 }), [
      issue("rsvpMaxPartyLimit", OPERATIONAL_SETTINGS_RULE.MIN),
      issue("galleryPhotoLimit", OPERATIONAL_SETTINGS_RULE.MAX),
    ]);
  });

  it("refuses a default party limit above the maximum, and accepts equality", () => {
    assert.deepEqual(issuesOf(settings({ rsvpDefaultPartyLimit: 7, rsvpMaxPartyLimit: 6 })), [
      issue("rsvpDefaultPartyLimit", OPERATIONAL_SETTINGS_RULE.RSVP_DEFAULT_AT_MOST_MAX),
    ]);
    assert.equal(
      issuesOf(settings({ rsvpDefaultPartyLimit: 6, rsvpMaxPartyLimit: 6 })),
      null,
      "a default equal to the maximum is the boundary the rule allows",
    );
  });

  it("refuses a stored-asset limit that leaves no room for the gallery, and accepts gallery + 1", () => {
    assert.deepEqual(issuesOf(settings({ galleryPhotoLimit: 10, storedAssetLimit: 10 })), [
      issue("storedAssetLimit", OPERATIONAL_SETTINGS_RULE.STORED_ASSET_ABOVE_GALLERY),
    ]);
    assert.equal(
      issuesOf(settings({ galleryPhotoLimit: 10, storedAssetLimit: 11 })),
      null,
      "one more stored asset than a full gallery is the boundary the rule allows",
    );
  });

  it("checks the bounds before the cross-field rules, so the client fixes one layer at a time", () => {
    // A gallery bound violation would also break the stored-asset rule; only the bound is reported.
    assert.deepEqual(issuesOf(settings({ galleryPhotoLimit: 99, storedAssetLimit: 20 })), [
      issue("galleryPhotoLimit", OPERATIONAL_SETTINGS_RULE.MAX),
    ]);
  });

  it("answers exactly the seven fields, ignoring anything else a caller passes", () => {
    const result = validateOperationalSettings({ ...settings(), ownerId: "nope", extra: 1 });

    assert.ok(result.ok);
    assert.deepEqual(Object.keys(result.value).sort(), [...OPERATIONAL_SETTINGS_FIELDS].sort());
  });

  it("refuses a value that is not an object at all", () => {
    for (const value of [null, undefined, "settings", 42, []]) {
      const issues = issuesOf(value);
      assert.ok(issues !== null && issues.length > 0, String(value));
      assert.ok(
        issues.every((entry) => OPERATIONAL_SETTINGS_FIELDS.includes(entry.field)),
        "every issue names a known field",
      );
    }
  });

  it("lists only the fields a save changed, in field order, with the old and the new value", () => {
    assert.deepEqual(changedSettings(INITIAL_OPERATIONAL_SETTINGS, settings()), []);
    assert.deepEqual(
      changedSettings(
        INITIAL_OPERATIONAL_SETTINGS,
        settings({ galleryPhotoLimit: 8, rsvpDefaultPartyLimit: 2 }),
      ),
      [
        { field: "rsvpDefaultPartyLimit", from: 4, to: 2 },
        { field: "galleryPhotoLimit", from: 12, to: 8 },
      ],
    );
  });

  it("writes the generated note as `field: old → new; …` and appends the optional note after a dash", () => {
    const changes = changedSettings(
      INITIAL_OPERATIONAL_SETTINGS,
      settings({ galleryPhotoLimit: 8, rsvpDefaultPartyLimit: 2 }),
    );

    assert.equal(
      settingsAuditNote(changes, null),
      "rsvpDefaultPartyLimit: 4 → 2; galleryPhotoLimit: 12 → 8",
    );
    assert.equal(
      settingsAuditNote(changes, "  Ajuste de temporada.  "),
      "rsvpDefaultPartyLimit: 4 → 2; galleryPhotoLimit: 12 → 8 — Ajuste de temporada.",
    );
    assert.equal(settingsAuditNote([], null), "");
    assert.equal(settingsAuditNote([], "Solo una nota."), "Solo una nota.");
  });

  it("keeps the whole note inside the audit column, even with every field changed and a long note", () => {
    const widest = validateOperationalSettings({
      rsvpDefaultPartyLimit: 1,
      rsvpMaxPartyLimit: 1,
      galleryPhotoLimit: 1,
      storedAssetLimit: 2,
      maxUploadMegabytes: 1,
      placeSearchResultLimit: 1,
      analyticsDefaultWindowDays: 7,
    });
    assert.ok(widest.ok);

    const note = settingsAuditNote(
      changedSettings(INITIAL_OPERATIONAL_SETTINGS, widest.value),
      "n".repeat(OPERATIONAL_SETTINGS_NOTE_MAX_LENGTH),
    );
    assert.ok(
      note.length <= ADMIN_ACTION_NOTE_MAX_LENGTH,
      `the note is ${note.length} characters, inside ${ADMIN_ACTION_NOTE_MAX_LENGTH}`,
    );
    assert.ok(note.startsWith("rsvpDefaultPartyLimit: 4 → 1; "), "the changes are never truncated");
    assert.ok(note.includes("analyticsDefaultWindowDays: 30 → 7"), "every change is kept");

    // A note that is somehow wider than the whole column is truncated rather than refused.
    const overlong = settingsAuditNote([], "x".repeat(ADMIN_ACTION_NOTE_MAX_LENGTH + 50));
    assert.equal(overlong.length, ADMIN_ACTION_NOTE_MAX_LENGTH);
  });

  it("converts the upload bound from megabytes to the bytes the upload check reads", () => {
    assert.equal(megabytesInBytes(1), 1024 * 1024);
    assert.equal(megabytesInBytes(10), 10 * 1024 * 1024);
    assert.equal(megabytesInBytes(15), 15 * 1024 * 1024);
  });
});
