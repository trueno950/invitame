import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  INITIAL_OPERATIONAL_SETTINGS,
  OPERATIONAL_SETTINGS_BOUNDS,
  OPERATIONAL_SETTINGS_FIELDS,
  type OperationalSettingsField,
} from "./operational-settings";

// The drift guard between the settings domain and the migration that stores it (M9 T13; S5, S8). The domain states the
// bounds and the seeded values once; the migration restates them as CHECK constraints and as the row it inserts, so the
// two files can silently disagree: a domain bound widened past its column would answer 200 and then fail the UPDATE,
// and a seed that drifted would change the product's behaviour on deploy (L15 «Los actuales»). This suite reads the
// migration as text — no database, no migration run — and compares both restatements with the domain.

/** The one migration that creates the row, read the way the database reads it: as SQL text. */
const MIGRATION = readFileSync(
  join(
    __dirname,
    "../../../prisma/migrations/20261129120000_add_operational_settings/migration.sql",
  ),
  "utf8",
);

/** The migration with its comments removed and its whitespace collapsed, so a statement can be matched literally. */
const SQL = MIGRATION.replace(/--[^\n]*/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** One `ADD CONSTRAINT "OperationalSettings_<field>_range" CHECK (...)` statement, as its column and its two bounds. */
const RANGE_CONSTRAINT =
  /ADD CONSTRAINT "OperationalSettings_([A-Za-z]+)_range" CHECK \("([A-Za-z]+)" >= (\d+) AND "\2" <= (\d+)\);/g;

/** The bounds a column's own CHECK constraint states, keyed by the column it guards. */
function columnBounds(sql: string = SQL): Record<string, { min: number; max: number }> {
  const bounds: Record<string, { min: number; max: number }> = {};

  for (const match of sql.matchAll(RANGE_CONSTRAINT)) {
    const [, field, column, min, max] = match;
    assert.equal(column, field, `the constraint is named after the column it checks: ${match[0]}`);
    assert.ok(field !== undefined, "every range constraint is named");
    bounds[field] = { min: Number(min), max: Number(max) };
  }

  return bounds;
}

/** The `INSERT INTO "OperationalSettings" (…) VALUES (…)` the migration runs, as its column names and its values. */
function seededRow(sql: string = SQL): { columns: string[]; values: string[] } {
  const match = /INSERT INTO "OperationalSettings" \(([^)]*)\) VALUES \(([^)]*)\);/.exec(sql);

  assert.ok(match, "the migration seeds the one settings row");
  const list = (text: string | undefined): string[] =>
    (text ?? "")
      .split(",")
      .map((entry) => entry.trim().replace(/^"|"$/g, "").replace(/^'|'$/g, ""))
      .filter((entry) => entry !== "");

  return { columns: list(match[1]), values: list(match[2]) };
}

/** The seeded row as `field → value`, which is what the domain's initial settings must equal. */
function seededSettings(sql: string = SQL): Record<string, number> {
  const { values } = seededRow(sql);

  return Object.fromEntries(
    OPERATIONAL_SETTINGS_FIELDS.map((field, index) => [field, Number(values[index + 1])]),
  );
}

describe("the operational settings migration (M9 T13; S5, S8)", () => {
  it("states the same CHECK bounds per column as the domain, for every column and only those", () => {
    const bounds = columnBounds();

    assert.deepEqual(
      Object.keys(bounds).sort(),
      [...OPERATIONAL_SETTINGS_FIELDS].sort(),
      "every settings column has one bound check, and no other column has one",
    );
    for (const field of OPERATIONAL_SETTINGS_FIELDS) {
      assert.deepEqual(bounds[field], OPERATIONAL_SETTINGS_BOUNDS[field], field);
    }
    assert.deepEqual(
      bounds,
      Object.fromEntries(
        OPERATIONAL_SETTINGS_FIELDS.map((field: OperationalSettingsField) => [
          field,
          OPERATIONAL_SETTINGS_BOUNDS[field],
        ]),
      ),
      "the migration's bounds are the domain's whole table",
    );
  });

  it("restates the two cross-field rules the domain applies", () => {
    assert.ok(
      SQL.includes(
        'ADD CONSTRAINT "OperationalSettings_rsvp_default_within_max" CHECK ("rsvpDefaultPartyLimit" <= "rsvpMaxPartyLimit");',
      ),
      "a default party limit above the maximum is refused by the row too",
    );
    assert.ok(
      SQL.includes(
        'ADD CONSTRAINT "OperationalSettings_stored_assets_above_gallery" CHECK ("storedAssetLimit" >= "galleryPhotoLimit" + 1);',
      ),
      "a stored-asset allowance a full gallery could fill is refused by the row too",
    );
  });

  it("seeds the one row with the initial settings, in the domain's field order", () => {
    const { columns, values } = seededRow();

    assert.equal(columns[0], "id");
    assert.deepEqual(
      columns.slice(1),
      [...OPERATIONAL_SETTINGS_FIELDS],
      "the seed names every setting, in the order the domain stores them",
    );
    assert.equal(values.length, OPERATIONAL_SETTINGS_FIELDS.length + 1);
    assert.equal(values[0], "default", "the row is the one the single-row check pins");

    const seeded = Object.fromEntries(
      OPERATIONAL_SETTINGS_FIELDS.map((field, index) => [field, Number(values[index + 1])]),
    );
    assert.deepEqual(seeded, INITIAL_OPERATIONAL_SETTINGS);
    assert.deepEqual(seededSettings(), INITIAL_OPERATIONAL_SETTINGS);
  });

  it("fails on a migration whose bound or seed drifted from the domain", () => {
    // The guard is only worth its cost if it would catch the drift it exists for, so the same parsers run over two
    // edited copies of the text. Nothing here reads or writes the migration: only the parsed string differs.
    const widened = SQL.replace('"maxUploadMegabytes" <= 15', '"maxUploadMegabytes" <= 16');

    assert.notDeepEqual(columnBounds(widened), columnBounds(), "a widened bound is caught");
    assert.equal(
      columnBounds(widened).maxUploadMegabytes?.max,
      INITIAL_OPERATIONAL_SETTINGS.maxUploadMegabytes + 6,
    );

    const reseeded = SQL.replace(
      "VALUES ('default', 4, 10, 12, 40, 10, 5, 30)",
      "VALUES ('default', 4, 10, 12, 40, 12, 5, 30)",
    );
    assert.deepEqual(
      Object.keys(seededSettings(reseeded)).filter(
        (field) =>
          seededSettings(reseeded)[field] !==
          INITIAL_OPERATIONAL_SETTINGS[field as OperationalSettingsField],
      ),
      ["maxUploadMegabytes"],
      "a drifted seed is caught on exactly the field that drifted",
    );
  });
});
