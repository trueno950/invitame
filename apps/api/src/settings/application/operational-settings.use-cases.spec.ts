import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { ADMIN_ACTION, ADMIN_ACTION_REASON } from "../../admin/admin-action-recorder";
import {
  INITIAL_OPERATIONAL_SETTINGS,
  OPERATIONAL_SETTINGS_BOUNDS,
  OPERATIONAL_SETTINGS_RULE,
  type OperationalSettings,
} from "../domain/operational-settings";
import {
  type OperationalSettingsSnapshot,
  INITIAL_OPERATIONAL_SETTINGS_READER,
} from "./operational-settings";
import { InvalidOperationalSettingsError } from "./operational-settings.errors";
import type {
  OperationalSettingsRepository,
  OperationalSettingsUnitOfWork,
} from "./operational-settings.repository";
import {
  GetOperationalSettingsUseCase,
  UpdateOperationalSettingsUseCase,
} from "./operational-settings.use-cases";

// The settings use cases (M9 T13; S5, S8, L15). The repository is a fake, so the decisions this layer owns are the ones
// under test: a save that changes nothing writes nothing at all, a real save writes the row and exactly one audit row
// whose note is generated from the changes, and a refused request never opens the transaction. What the SQL does — one
// transaction, the row lock, the audit row committing or rolling back with the update — is proved in the db-spec.

const AT = new Date("2026-11-29T10:00:00.000Z");
const ADMIN = "0f1c7f0e-8c3e-4c1f-9d43-5b0f2c4a6e11";

class FakeRepository implements OperationalSettingsRepository {
  snapshot: OperationalSettingsSnapshot = {
    ...INITIAL_OPERATIONAL_SETTINGS,
    updatedAt: new Date("2026-11-29T09:00:00.000Z"),
  };
  transactions = 0;
  updates: OperationalSettings[] = [];
  records: Array<Record<string, unknown>> = [];

  async current(): Promise<OperationalSettingsSnapshot> {
    return this.snapshot;
  }

  async transaction<T>(work: (unit: OperationalSettingsUnitOfWork) => Promise<T>): Promise<T> {
    this.transactions += 1;

    return work({
      current: async () => this.snapshot,
      update: async (values, at) => {
        this.updates.push(values);
        this.snapshot = { ...values, updatedAt: at };
        return this.snapshot;
      },
      record: async (entry) => {
        this.records.push({ ...entry });
      },
    });
  }
}

function settings(overrides: Partial<Record<keyof OperationalSettings, number>> = {}) {
  return { ...INITIAL_OPERATIONAL_SETTINGS, ...overrides };
}

describe("the operational settings use cases (M9 T13; S5, S8, L15)", () => {
  it("answers the seven settings, their bounds, and the instant the row was last written", async () => {
    const repository = new FakeRepository();
    const get = new GetOperationalSettingsUseCase(repository);

    const first = await get.execute();
    const second = await get.execute();

    assert.deepEqual(first.settings, INITIAL_OPERATIONAL_SETTINGS);
    assert.deepEqual(first.bounds, OPERATIONAL_SETTINGS_BOUNDS);
    assert.equal(first.updatedAt, repository.snapshot.updatedAt);
    assert.notEqual(first, second, "each call is a fresh read, never a cached answer");
    assert.equal(second.updatedAt.toISOString(), "2026-11-29T09:00:00.000Z");
  });

  it("writes nothing at all when the save changes nothing", async () => {
    const repository = new FakeRepository();
    const update = new UpdateOperationalSettingsUseCase(repository, () => AT);

    const view = await update.execute({ adminUserId: ADMIN, settings: settings() });

    assert.deepEqual(view.settings, INITIAL_OPERATIONAL_SETTINGS);
    assert.equal(view.updatedAt.toISOString(), "2026-11-29T09:00:00.000Z");
    assert.deepEqual(repository.updates, [], "no UPDATE statement runs");
    assert.deepEqual(repository.records, [], "no audit row is written");
  });

  it("writes one audit row whose note records every change, with no target", async () => {
    const repository = new FakeRepository();
    const update = new UpdateOperationalSettingsUseCase(repository, () => AT);

    const view = await update.execute({
      adminUserId: ADMIN,
      settings: settings({ galleryPhotoLimit: 8, maxUploadMegabytes: 15 }),
    });

    assert.deepEqual(repository.updates, [
      settings({ galleryPhotoLimit: 8, maxUploadMegabytes: 15 }),
    ]);
    assert.deepEqual(repository.records, [
      {
        adminUserId: ADMIN,
        action: ADMIN_ACTION.SETTINGS_UPDATED,
        reason: ADMIN_ACTION_REASON.OTHER,
        note: "galleryPhotoLimit: 12 → 8; maxUploadMegabytes: 10 → 15",
        targetUserId: null,
        invitationId: null,
      },
    ]);
    assert.equal(view.settings.galleryPhotoLimit, 8);
    assert.equal(view.settings.maxUploadMegabytes, 15);
    assert.equal(view.updatedAt.toISOString(), AT.toISOString());
  });

  it("appends the optional administrator note after the generated changes", async () => {
    const repository = new FakeRepository();
    const update = new UpdateOperationalSettingsUseCase(repository, () => AT);

    await update.execute({
      adminUserId: ADMIN,
      settings: settings({ galleryPhotoLimit: 8 }),
      note: "  Temporada baja.  ",
    });

    assert.deepEqual(
      repository.records.map((entry) => entry.note),
      ["galleryPhotoLimit: 12 → 8 — Temporada baja."],
    );
  });

  it("refuses a value outside its bounds with every issue, before any transaction opens", async () => {
    const repository = new FakeRepository();
    const update = new UpdateOperationalSettingsUseCase(repository, () => AT);

    await assert.rejects(
      update.execute({
        adminUserId: ADMIN,
        settings: settings({ rsvpMaxPartyLimit: 11, galleryPhotoLimit: 0 }),
      }),
      (error: unknown) =>
        error instanceof InvalidOperationalSettingsError &&
        JSON.stringify(error.issues) ===
          JSON.stringify([
            { field: "rsvpMaxPartyLimit", rule: OPERATIONAL_SETTINGS_RULE.MAX },
            { field: "galleryPhotoLimit", rule: OPERATIONAL_SETTINGS_RULE.MIN },
          ]),
    );
    assert.equal(repository.transactions, 0, "a refused request writes nothing");
  });

  it("refuses a cross-field rule the bounds alone cannot state", async () => {
    const repository = new FakeRepository();
    const update = new UpdateOperationalSettingsUseCase(repository, () => AT);

    await assert.rejects(
      update.execute({
        adminUserId: ADMIN,
        settings: settings({ galleryPhotoLimit: 20, storedAssetLimit: 20 }),
      }),
      (error: unknown) =>
        error instanceof InvalidOperationalSettingsError &&
        JSON.stringify(error.issues) ===
          JSON.stringify([
            {
              field: "storedAssetLimit",
              rule: OPERATIONAL_SETTINGS_RULE.STORED_ASSET_ABOVE_GALLERY,
            },
          ]),
    );
    assert.equal(repository.transactions, 0);
  });

  it("reads the initial values through the default reader a test composes without one", async () => {
    const snapshot = await INITIAL_OPERATIONAL_SETTINGS_READER.current();

    assert.deepEqual(snapshot, {
      ...INITIAL_OPERATIONAL_SETTINGS,
      updatedAt: new Date(0),
    });
    assert.equal(typeof randomUUID(), "string");
  });
});
