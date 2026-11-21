import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaClient, type Prisma } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { ADMIN_ACTION, ADMIN_ACTION_REASON } from "../../admin/admin-action-recorder";
import { InvalidAdminActionError } from "../../admin/domain/admin-action.errors";
import { PrismaAdminActionRecorder } from "../../admin/infrastructure/prisma-admin-action-recorder";
import { UpdateOperationalSettingsUseCase } from "../application/operational-settings.use-cases";
import { INITIAL_OPERATIONAL_SETTINGS } from "../domain/operational-settings";
import { PrismaOperationalSettingsRepository } from "./prisma-operational-settings.repository";

// The operational settings on real PostgreSQL (M9 T13; S5, S8, L15): the additive migration's single-row table, every
// CHECK it states, the one seeded row, and the save as one transaction — the row and its audit row commit together, and
// an audit entry the domain refuses rolls the update back. Runs only through `pnpm --filter @invitame/api test:db` with
// an explicit DATABASE_URL.
//
// This suite is the one place that writes the settings row, and it puts the seeded values back in `after`, so a later run
// starts where the migration left it. The one committed audit row cannot be removed — `AdminAction` refuses UPDATE and
// DELETE by trigger, and its actor reference is RESTRICT — so the fixture administrator it names stays in the
// disposable database, and no cleanup here deletes an audit row.

const ROLLBACK = Symbol("rollback");
const NOT_REFUSED = Symbol("not refused");
const AT = new Date("2026-11-29T10:00:00.000Z");

describe("the operational settings on PostgreSQL (M9 T13; S5, S8, L15)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const recorder = new PrismaAdminActionRecorder();
  const repository = new PrismaOperationalSettingsRepository(prisma, recorder);
  const update = new UpdateOperationalSettingsUseCase(repository, () => AT);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  let adminUserId = "";

  before(async () => {
    const admin = await prisma.user.create({
      data: { email: `m9-settings-admin-${runId}@example.test`, role: "ADMIN" },
    });
    adminUserId = admin.id;

    // A run that ended inside a save would leave the row changed; start from the values the migration seeds.
    await prisma.operationalSettings.update({
      where: { id: "default" },
      data: { ...INITIAL_OPERATIONAL_SETTINGS, updatedAt: AT },
    });
  });

  after(async () => {
    try {
      // The row is restored, never deleted: it is the one row the product addresses by id.
      await prisma.operationalSettings.update({
        where: { id: "default" },
        data: { ...INITIAL_OPERATIONAL_SETTINGS },
      });
      // The committed audit row keeps its actor by RESTRICT, so the fixture administrator stays with it.
    } finally {
      await prisma.$disconnect();
    }
  });

  /** The number of SETTINGS_UPDATED rows stored right now, so a case measures what it added. */
  async function settingsAuditRows() {
    return prisma.adminAction.findMany({
      where: { action: "SETTINGS_UPDATED" },
      select: {
        id: true,
        reason: true,
        note: true,
        targetUserId: true,
        invitationId: true,
        adminUserId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** One scenario inside a transaction of its own, rolled back afterwards: the audit table accepts no DELETE. */
  async function rolledBack<T>(scenario: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    let result: T | undefined;
    await prisma
      .$transaction(async (tx) => {
        result = await scenario(tx);
        throw ROLLBACK;
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) {
          throw error;
        }
      });

    return result as T;
  }

  /** The error one statement refuses with, in its own rolled-back transaction. */
  async function refusalOf(
    scenario: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<unknown> {
    let refusal: unknown = NOT_REFUSED;
    await prisma
      .$transaction(async (tx) => {
        try {
          await scenario(tx);
        } catch (error) {
          refusal = error;
          throw error;
        }
      })
      .catch(() => undefined);

    assert.notEqual(refusal, NOT_REFUSED, "the database accepted what it must refuse");
    return refusal;
  }

  describe("the additive migration", () => {
    it("creates OperationalSettings with its columns, its checks, and the one seeded row", async () => {
      const columns = await prisma.$queryRaw<
        Array<{ column_name: string; is_nullable: string; data_type: string }>
      >`
        SELECT column_name, is_nullable, data_type
        FROM information_schema.columns
        WHERE table_name = 'OperationalSettings'
      `;
      const byName = new Map(columns.map((column) => [column.column_name, column]));

      for (const name of [
        "id",
        "rsvpDefaultPartyLimit",
        "rsvpMaxPartyLimit",
        "galleryPhotoLimit",
        "storedAssetLimit",
        "maxUploadMegabytes",
        "placeSearchResultLimit",
        "analyticsDefaultWindowDays",
        "updatedAt",
      ]) {
        assert.equal(byName.get(name)?.is_nullable, "NO", name);
      }
      assert.equal(byName.get("id")?.data_type, "character varying");
      for (const name of [
        "rsvpDefaultPartyLimit",
        "rsvpMaxPartyLimit",
        "galleryPhotoLimit",
        "storedAssetLimit",
        "maxUploadMegabytes",
        "placeSearchResultLimit",
        "analyticsDefaultWindowDays",
      ]) {
        assert.equal(byName.get(name)?.data_type, "integer", name);
      }
      assert.equal(byName.get("updatedAt")?.data_type, "timestamp with time zone");

      const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname FROM pg_constraint
        WHERE conrelid = '"OperationalSettings"'::regclass AND contype = 'c'
      `;
      const names = constraints.map((constraint) => constraint.conname);
      for (const expected of [
        "OperationalSettings_single_row",
        "OperationalSettings_rsvpDefaultPartyLimit_range",
        "OperationalSettings_rsvpMaxPartyLimit_range",
        "OperationalSettings_galleryPhotoLimit_range",
        "OperationalSettings_storedAssetLimit_range",
        "OperationalSettings_maxUploadMegabytes_range",
        "OperationalSettings_placeSearchResultLimit_range",
        "OperationalSettings_analyticsDefaultWindowDays_range",
        "OperationalSettings_rsvp_default_within_max",
        "OperationalSettings_stored_assets_above_gallery",
      ]) {
        assert.ok(names.includes(expected), `${expected} exists in ${names.join(", ")}`);
      }

      // The one seeded row carries the values the code had before this slice, so nothing changed on deploy (L15).
      const rows = await prisma.operationalSettings.findMany();
      assert.equal(rows.length, 1);
      assert.deepEqual(
        rows.map(({ updatedAt, ...settings }) => settings),
        [{ id: "default", ...INITIAL_OPERATIONAL_SETTINGS }],
      );
      assert.ok(rows[0]?.updatedAt instanceof Date);
    });

    it("refuses a second row, every out-of-bounds value, and both broken cross-field rules", async () => {
      const initial = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });

      await assert.rejects(
        prisma.operationalSettings.create({
          data: { ...INITIAL_OPERATIONAL_SETTINGS, id: "other" },
        }),
        /OperationalSettings_single_row/,
      );

      // A value can break its own bound and a cross-field rule at once, and PostgreSQL reports whichever constraint it
      // reached first, so each field accepts either of the two that can refuse it.
      const refusalFor: Array<[string, RegExp]> = [
        [
          "rsvpDefaultPartyLimit",
          /OperationalSettings_(rsvpDefaultPartyLimit_range|rsvp_default_within_max)/,
        ],
        ["rsvpMaxPartyLimit", /OperationalSettings_rsvpMaxPartyLimit_range/],
        [
          "galleryPhotoLimit",
          /OperationalSettings_(galleryPhotoLimit_range|stored_assets_above_gallery)/,
        ],
        [
          "storedAssetLimit",
          /OperationalSettings_(storedAssetLimit_range|stored_assets_above_gallery)/,
        ],
        ["maxUploadMegabytes", /OperationalSettings_maxUploadMegabytes_range/],
        ["placeSearchResultLimit", /OperationalSettings_placeSearchResultLimit_range/],
        ["analyticsDefaultWindowDays", /OperationalSettings_analyticsDefaultWindowDays_range/],
      ];
      for (const [field, refusal] of refusalFor) {
        for (const value of [-1, 1000]) {
          await assert.rejects(
            prisma.operationalSettings.update({
              where: { id: "default" },
              data: { [field]: value },
            }),
            refusal,
            `${field} ${value}`,
          );
        }
      }

      // The two rules a column's own bound cannot state (S5). Both values here are inside their own bounds, so only
      // the cross-field rule can refuse the statement.
      await assert.rejects(
        prisma.operationalSettings.update({
          where: { id: "default" },
          data: { rsvpDefaultPartyLimit: 4, rsvpMaxPartyLimit: 3 },
        }),
        /OperationalSettings_rsvp_default_within_max/,
      );
      await assert.rejects(
        prisma.operationalSettings.update({
          where: { id: "default" },
          data: {
            galleryPhotoLimit: 24,
            storedAssetLimit: 24,
          },
        }),
        /OperationalSettings_stored_assets_above_gallery/,
      );

      // Every refused statement left the row exactly as it was.
      const stored = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      assert.deepEqual({ ...stored, updatedAt: initial.updatedAt }, initial);
    });
  });

  describe("the save", () => {
    it("writes nothing at all when the values equal the stored row", async () => {
      const before = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      const audits = await settingsAuditRows();

      const view = await update.execute({
        adminUserId,
        settings: { ...INITIAL_OPERATIONAL_SETTINGS },
        note: "sin cambios",
      });

      const after = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      assert.equal(view.updatedAt.getTime(), before.updatedAt.getTime());
      assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), "no UPDATE ran");
      assert.deepEqual(after, before);
      assert.equal((await settingsAuditRows()).length, audits.length, "no audit row was written");
    });

    it("commits the changed row and its audit row together", async () => {
      const audits = await settingsAuditRows();
      const stored = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      const galleryPhotoLimit = stored.galleryPhotoLimit - 2;
      const maxUploadMegabytes = stored.maxUploadMegabytes;

      const view = await update.execute({
        adminUserId,
        settings: {
          ...INITIAL_OPERATIONAL_SETTINGS,
          galleryPhotoLimit,
          storedAssetLimit: INITIAL_OPERATIONAL_SETTINGS.storedAssetLimit,
          maxUploadMegabytes,
          analyticsDefaultWindowDays: 7,
        },
        note: "Temporada baja.",
      });

      const after = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      assert.equal(after.galleryPhotoLimit, galleryPhotoLimit, "the row committed");
      assert.equal(after.analyticsDefaultWindowDays, 7);
      assert.equal(after.updatedAt.getTime(), AT.getTime());
      assert.equal(view.updatedAt.getTime(), AT.getTime());
      assert.equal(view.settings.galleryPhotoLimit, galleryPhotoLimit);

      const written = await settingsAuditRows();
      assert.equal(written.length, audits.length + 1, "one audit row, and only one");
      const audit = written.at(-1);
      assert.ok(audit);
      assert.equal(audit.adminUserId, adminUserId);
      assert.equal(audit.reason, "OTHER");
      assert.equal(audit.targetUserId, null, "the settings change names no account");
      assert.equal(audit.invitationId, null, "and no invitation");
      assert.equal(
        audit.note,
        `galleryPhotoLimit: ${stored.galleryPhotoLimit} → ${galleryPhotoLimit}; analyticsDefaultWindowDays: ${stored.analyticsDefaultWindowDays} → 7 — Temporada baja.`,
      );

      // The next save removes the change from the note, so the audit records only what differs.
      const noop = await update.execute({
        adminUserId,
        settings: {
          ...INITIAL_OPERATIONAL_SETTINGS,
          galleryPhotoLimit,
          analyticsDefaultWindowDays: 7,
        },
      });
      assert.equal(noop.settings.galleryPhotoLimit, galleryPhotoLimit);
      assert.equal(
        (await settingsAuditRows()).length,
        written.length,
        "an unchanged save still writes nothing",
      );
    });

    it("rolls the update back when the audit entry is refused", async () => {
      const before = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      const audits = await settingsAuditRows();

      await assert.rejects(
        repository.transaction(async (unit) => {
          await unit.update({ ...INITIAL_OPERATIONAL_SETTINGS, galleryPhotoLimit: 3 }, AT);
          // `OTHER` requires a note, so the recorder refuses after the update statement ran.
          await unit.record({
            adminUserId,
            action: ADMIN_ACTION.SETTINGS_UPDATED,
            reason: ADMIN_ACTION_REASON.OTHER,
            note: null,
          });
        }),
        InvalidAdminActionError,
      );

      const after = await prisma.operationalSettings.findUniqueOrThrow({
        where: { id: "default" },
      });
      assert.deepEqual(after, before, "the update rolled back with the refused audit row");
      assert.equal((await settingsAuditRows()).length, audits.length);
    });
  });

  describe("the relaxed audit target checks", () => {
    it("accepts the settings change with no target and refuses one that names a target", async () => {
      const invitationless = { adminUserId, reason: "OTHER", note: "límites" } as const;

      await rolledBack(async (tx) => {
        const row = await tx.adminAction.create({
          data: { ...invitationless, action: ADMIN_ACTION.SETTINGS_UPDATED },
          select: { id: true, targetUserId: true, invitationId: true },
        });
        assert.equal(row.targetUserId, null);
        assert.equal(row.invitationId, null);
      });

      const unrelatedUser = randomUUID();
      await assert.rejects(
        prisma.adminAction.create({
          data: {
            ...invitationless,
            action: ADMIN_ACTION.SETTINGS_UPDATED,
            targetUserId: unrelatedUser,
          },
        }),
        /AdminAction_(target_matches_action|exactly_one_target)/,
      );
    });

    it("still refuses a target-less action of every other type", async () => {
      for (const action of [
        ADMIN_ACTION.INVITATION_UNPUBLISHED,
        ADMIN_ACTION.ACCOUNT_DISABLED,
        ADMIN_ACTION.ACCOUNT_REACTIVATED,
        ADMIN_ACTION.SIGN_IN_CODE_RESENT,
      ] as const) {
        const refusal = await refusalOf((tx) =>
          tx.adminAction.create({
            data: {
              adminUserId,
              action,
              reason: ADMIN_ACTION_REASON.ABUSE,
              note: null,
            },
          }),
        );

        assert.match(
          refusal instanceof Error ? refusal.message : String(refusal),
          /AdminAction_exactly_one_target/,
          action,
        );
      }
    });

    it("stores no settings row that names a target", async () => {
      assert.equal(
        (await settingsAuditRows()).filter((row) => row.targetUserId !== null).length,
        0,
        "no stored settings row names a target",
      );
    });
  });
});
