import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, beforeEach, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { SendDueRemindersUseCase } from "../application/send-due-reminders.use-case";
import { NotConfiguredReminderSender } from "./not-configured-reminder-sender";
import { PrismaReminderRepository } from "./prisma-reminder.repository";
import { PrismaInvitationRepository } from "../../invitations/infrastructure/prisma-invitation.repository";

// WhatsApp reminders on real PostgreSQL (F6; S2.6, S6, L9.2, L9.3, L9.4): the additive migration's column, table,
// unique index, and catalog key; the command's whole public entry point over the real port and the default adapter; and
// the idempotency that makes a second run of the same day record nothing new and send nothing twice.
//
// Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is shared with
// other suites, so every row here carries a key made from this run's id and only those rows are removed.

const RENDERER = "birthday-poster-01";
/** The celebration: the content a layout stores, with the day and the start time the message names. */
const CONTENT = { date: "2026-09-12", time: "19:30" };
/** Two hours past midnight in UTC, which is still the previous evening in Mexico City: the run's own «today» differs. */
const NOW = new Date("2026-08-01T05:30:00.000Z");
/** A deadline stored as an instant: 23:00 in Mexico City on August 2nd, so the two-day reminder is July 31st there. */
const DEADLINE = new Date("2026-08-02T23:00:00.000Z");
const PUBLIC_BASE_URL = "https://invitame.mx";

describe("WhatsApp reminders on real PostgreSQL (F6)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const invitations = new PrismaInvitationRepository(prisma);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const featureIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  /** The command, composed exactly as `scripts/reminders-send.ts` composes it. */
  function command(now: Date = NOW): SendDueRemindersUseCase {
    return new SendDueRemindersUseCase(
      new PrismaReminderRepository(prisma),
      new NotConfiguredReminderSender(),
      { publicBaseUrl: PUBLIC_BASE_URL, now: () => now },
    );
  }

  // The command reads every scheduled invitation, so each test starts from only its own: the switches of the rows an
  // earlier test created are cleared, which is exactly the state a database with nothing due has.
  beforeEach(async () => {
    await prisma.invitationFeatureSettings.updateMany({
      where: { invitationId: { in: invitationIds } },
      data: { reminders: Prisma.DbNull },
    });
  });

  after(async () => {
    try {
      // A delivery references its invitation and guest with ON DELETE RESTRICT, so the attempts go first.
      await prisma.reminderDelivery.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.rsvpResponse.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.guest.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `f6-reminders-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  /** A seeded feature key, reused when the catalog already has it and removed only when this suite created it. */
  async function feature(key: string): Promise<string> {
    const stored = await prisma.feature.findUnique({ where: { key } });
    if (stored !== null) {
      return stored.id;
    }
    const created = await prisma.feature.create({ data: { key, name: key } });
    featureIds.push(created.id);
    return created.id;
  }

  /** A PUBLISHED version of a PUBLISHED template and an ACTIVE package with the given feature keys. */
  async function newCatalog(featureKeys: readonly string[]) {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `f6-category-${sequence}-${runId}`, name: "XV años" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `f6-template-${sequence}-${runId}`,
        name: "Plantilla",
        status: "PUBLISHED",
      },
    });
    templateIds.push(template.id);
    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        status: "PUBLISHED",
        componentKey: RENDERER,
        schema: { type: "object", required: [], properties: {} },
        configuration: { componentKey: RENDERER },
      },
    });
    const created = await prisma.package.create({
      data: {
        key: `f6-package-${sequence}-${runId}`,
        name: "Paquete",
        status: "ACTIVE",
        packageFeatures: {
          create: await Promise.all(
            featureKeys.map(async (key) => ({ featureId: await feature(key) })),
          ),
        },
      },
    });
    packageIds.push(created.id);
    return { versionId: version.id, packageId: created.id };
  }

  function newSlug(): string {
    sequence += 1;
    return `f6-${runId.slice(0, 8)}-${sequence}`;
  }

  /** One guest of the list, with the phone the owner stored (or none, which makes the guest not reachable). */
  async function newGuest(
    invitationId: string,
    name: string,
    phone: string | null,
    answer: boolean | null = null,
  ): Promise<string> {
    sequence += 1;
    const guest = await prisma.guest.create({
      data: {
        invitationId,
        name,
        seats: 1,
        phone,
        tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
        tokenIssuedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
    });
    if (answer !== null) {
      await prisma.rsvpResponse.create({
        data: {
          invitationId,
          guestId: guest.id,
          dedupeKey: `${name.toLowerCase()}|${phone ?? ""}`,
          name,
          attending: answer,
          partySize: answer ? 1 : 0,
        },
      });
    }
    return guest.id;
  }

  /** A published invitation whose owner switched the pending-RSVP reminder on. */
  async function newScheduled(options: { featureKeys?: readonly string[] } = {}) {
    const ownerId = await newOwner();
    const catalog = await newCatalog(options.featureKeys ?? ["WHATSAPP_REMINDERS", "GUEST_LIST"]);
    const created = await invitations.create({
      ownerId,
      templateVersionId: catalog.versionId,
      packageId: catalog.packageId,
      slug: newSlug(),
      content: CONTENT,
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    await invitations.updateFeatures(ownerId, created.id, {
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      playlistTitle: null,
      playlistCoverUrl: null,
      itinerary: null,
      giftRegistry: null,
      lodging: null,
      reminders: { version: 1, pendingRsvp: true, eventEve: false },
    });
    await prisma.invitation.update({
      where: { id: created.id },
      data: { rsvpDeadline: DEADLINE },
    });
    assert.ok(await invitations.publish(ownerId, created.id, new Date("2026-07-15T10:00:00.000Z")));
    return created.id;
  }

  describe("the additive migration", () => {
    it("adds the nullable switches and the attempt table with its unique key (L9.1, L9.2, L9.4)", async () => {
      const column = await prisma.$queryRaw<
        Array<{ is_nullable: string; column_default: string | null }>
      >`
        SELECT is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'InvitationFeatureSettings' AND column_name = 'reminders'
      `;

      assert.deepEqual(column, [{ is_nullable: "YES", column_default: null }]);

      const rows = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'ReminderDelivery'
        ORDER BY column_name
      `;

      assert.deepEqual(
        rows.map((row) => row.column_name),
        [
          "attemptedAt",
          "createdAt",
          "dueDate",
          "guestId",
          "id",
          "invitationId",
          "kind",
          "reason",
          "status",
          "updatedAt",
        ],
      );

      const unique = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'ReminderDelivery' AND indexdef LIKE '%UNIQUE%'
      `;

      // The primary key is unique too, so the attempt's own index is the one named after its four columns.
      assert.deepEqual(
        unique.map((row) => row.indexname).filter((name) => name !== "ReminderDelivery_pkey"),
        ["ReminderDelivery_invitationId_guestId_kind_dueDate_key"],
      );

      // The new gated capability is catalog data granted to Deluxe (L9.2), inserted by the migration by key.
      const key = await prisma.feature.findUnique({ where: { key: "WHATSAPP_REMINDERS" } });
      assert.ok(key, "the migration inserts WHATSAPP_REMINDERS");
      const deluxe = await prisma.package.findUnique({ where: { key: "deluxe" } });
      if (deluxe !== null) {
        const granted = await prisma.packageFeature.count({
          where: { packageId: deluxe.id, featureId: key.id, included: true },
        });
        assert.equal(granted, 1, "Deluxe grants WHATSAPP_REMINDERS");
      }
    });
  });

  describe("the command against the real tables (L9.3, L9.4)", () => {
    it("records one not-configured attempt per reachable guest and sends nothing twice on a second run", async () => {
      const invitationId = await newScheduled();
      const pending = await newGuest(invitationId, "Familia Gómez", "+525512345678", null);
      const answered = await newGuest(invitationId, "Ana", "+525587654321", true);
      const unreachable = await newGuest(invitationId, "Luis", null, null);

      const first = await command().execute({ dryRun: false });

      assert.deepEqual(
        {
          mode: first.mode,
          due: first.due,
          sent: first.sent,
          skipped: first.skipped,
          failed: first.failed,
          unreachable: first.unreachable,
        },
        { mode: "send", due: 1, sent: 0, skipped: 1, failed: 0, unreachable: 1 },
      );

      const stored = await prisma.reminderDelivery.findMany({
        where: { invitationId },
        select: { guestId: true, kind: true, dueDate: true, status: true, reason: true },
      });

      // July 31st in Mexico City, which is the day this instant is in the invitation's own zone (L9.4).
      assert.deepEqual(
        stored.map((row) => [
          row.guestId,
          row.kind,
          row.dueDate.toISOString().slice(0, 10),
          row.status,
          row.reason,
        ]),
        [[pending, "PENDING_RSVP_2D", "2026-07-31", "skipped", "not_configured"]],
      );
      // A guest who already answered and a guest without a phone have no attempt.
      for (const notWritten of [answered, unreachable]) {
        assert.equal(
          await prisma.reminderDelivery.count({ where: { invitationId, guestId: notWritten } }),
          0,
        );
      }

      // The second run of the same day plans the same reminder and records nothing new (L9.4).
      const second = await command().execute({ dryRun: false });

      assert.deepEqual(
        {
          due: second.due,
          sent: second.sent,
          skipped: second.skipped,
          alreadyRecorded: second.alreadyRecorded,
        },
        { due: 1, sent: 0, skipped: 0, alreadyRecorded: 1 },
      );
      assert.equal(await prisma.reminderDelivery.count({ where: { invitationId } }), 1);

      // The unique index itself is the guard, so a row for the same attempt cannot be written twice.
      const duplicate = prisma.reminderDelivery.create({
        data: {
          invitationId,
          guestId: pending,
          kind: "PENDING_RSVP_2D",
          dueDate: new Date("2026-07-31T00:00:00.000Z"),
          attemptedAt: NOW,
        },
      });

      await assert.rejects(duplicate, (error: unknown) => {
        assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
        return error.code === "P2002";
      });
    });

    it("writes nothing in a dry run and reports what it would do", async () => {
      const invitationId = await newScheduled();
      await newGuest(invitationId, "Familia Gómez", "+525512345678", null);

      const report = await command().execute({ dryRun: true });

      assert.equal(report.mode, "dry-run");
      assert.equal(report.due, 1);
      assert.equal(report.sent, 0);
      assert.equal(report.skipped, 0);
      assert.equal(await prisma.reminderDelivery.count({ where: { invitationId } }), 0);
    });

    it("sends nothing for a package that does not grant reminders or for an invitation no longer published", async () => {
      const granted = await newScheduled({ featureKeys: ["GUEST_LIST"] });
      await newGuest(granted, "Familia Gómez", "+525512345678", null);

      const notGranted = await command().execute({ dryRun: false });

      assert.equal(notGranted.due, 0);
      assert.equal(notGranted.notGranted, 1);
      assert.equal(await prisma.reminderDelivery.count({ where: { invitationId: granted } }), 0);

      // An expired invitation still renders read-only and takes no answers, so nothing is due for it (S2, T3).
      const expired = await newScheduled();
      await newGuest(expired, "Familia Gómez", "+525512345678", null);
      await prisma.invitation.update({
        where: { id: expired },
        data: { expiresAt: new Date("2026-07-20T10:00:00.000Z") },
      });

      const nothingDue = await command().execute({ dryRun: false });

      assert.equal(await prisma.reminderDelivery.count({ where: { invitationId: expired } }), 0);
      assert.equal(nothingDue.sent, 0);
    });

    it("records nothing for an invitation whose stored switches are not the payload the rules accept", async () => {
      const invitationId = await newScheduled();
      await newGuest(invitationId, "Familia Gómez", "+525512345678", null);
      await prisma.invitationFeatureSettings.update({
        where: { invitationId },
        data: { reminders: { version: 9, pendingRsvp: true, eventEve: true } },
      });

      const report = await command().execute({ dryRun: false });

      assert.equal(report.due, 0);
      assert.equal(await prisma.reminderDelivery.count({ where: { invitationId } }), 0);
    });

    it("reports counts only: no phone, name, or invitation id leaves the run", async () => {
      const invitationId = await newScheduled();
      await newGuest(invitationId, "Familia Gómez", "+525512345678", null);

      const printed = JSON.stringify((await command().execute({ dryRun: false })) as unknown);

      for (const secret of ["+525512345678", "Familia Gómez", invitationId]) {
        assert.equal(printed.includes(secret), false, secret);
      }
    });
  });
});
