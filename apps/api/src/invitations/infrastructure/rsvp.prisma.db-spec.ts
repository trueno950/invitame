import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import {
  GetRsvpResponsesUseCase,
  SubmitPublicRsvpUseCase,
} from "../application/invitation-rsvp.use-cases";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { CatalogInvitationReader } from "./catalog-invitation-reader";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";
import { PrismaRsvpRepository } from "./prisma-rsvp.repository";
import { PrismaRsvpRateLimiter } from "./prisma-rsvp-rate-limiter";

// RSVP on real PostgreSQL (M6 G1; S1, S3, S4): the additive migration's columns, defaults, and CHECK constraints;
// the `RsvpResponse` table's unique index and RESTRICT reference; the dedupe upsert under a retry and under two
// concurrent identical submissions; the per-invitation and per-address rate limit on the shared `RateLimit` table;
// the creator read's owner scope; and the public read, which carries the RSVP settings and none of the answers.
// Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is shared with
// parallel suites: every row here carries a key made from this run's id, and only those rows are removed.

const RENDERER = "birthday-poster-01";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const SUBMISSION = {
  name: "  Ana   Pérez ",
  attending: true,
  partySize: 2,
  phone: "55 1234 5678",
  message: "  ¡Con gusto! ",
  honeypot: "",
};

describe("RSVP on real PostgreSQL (M6 G1)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const invitations = new PrismaInvitationRepository(prisma);
  const rsvp = new PrismaRsvpRepository(prisma);
  const rateLimiter = new PrismaRsvpRateLimiter(prisma);
  const catalog = new CatalogInvitationReader(new PrismaCatalogPublicReader(prisma));
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const featureIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      // Responses reference invitations with ON DELETE RESTRICT, so they go first.
      await prisma.rsvpResponse.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
      // Every RSVP count this suite wrote is keyed by one of its own invitations.
      await prisma.rateLimit.deleteMany({
        where: { OR: invitationIds.map((id) => ({ key: { startsWith: `rsvp|${id}|` } })) },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `m6-g1-rsvp-${sequence}-${runId}@example.test` },
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
      data: { key: `m6-g1-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m6-g1-template-${sequence}-${runId}`,
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
    const createdPackage = await prisma.package.create({
      data: {
        key: `m6-g1-package-${sequence}-${runId}`,
        name: "Paquete",
        status: "ACTIVE",
        packageFeatures: {
          create: await Promise.all(
            featureKeys.map(async (key) => ({ featureId: await feature(key) })),
          ),
        },
      },
    });
    packageIds.push(createdPackage.id);
    return { versionId: version.id, packageId: createdPackage.id };
  }

  function newSlug(): string {
    sequence += 1;
    return `m6-${runId.slice(0, 8)}-${sequence}`;
  }

  /** A published invitation created through the repository, as the owner routes leave it. */
  async function newPublished(
    featureKeys: readonly string[],
    options: {
      ownerId?: string;
      publish?: boolean;
      rsvpDeadline?: Date | null;
      rsvpPartyLimit?: number;
    } = {},
  ) {
    const ownerId = options.ownerId ?? (await newOwner());
    const catalogState = await newCatalog(featureKeys);
    const created = await invitations.create({
      ownerId,
      templateVersionId: catalogState.versionId,
      packageId: catalogState.packageId,
      slug: newSlug(),
      content: {},
    });
    invitationIds.push(created.id);
    if (options.rsvpDeadline !== undefined || options.rsvpPartyLimit !== undefined) {
      await rsvp.saveSettings(ownerId, created.id, {
        deadline: options.rsvpDeadline ?? null,
        partyLimit: options.rsvpPartyLimit ?? 4,
      });
    }
    if (options.publish !== false) {
      assert.ok(
        await invitations.publish(ownerId, created.id, new Date("2026-11-20T10:00:00.000Z")),
      );
    }
    return { invitation: created, ownerId, ...catalogState };
  }

  const stored = (id: string) => prisma.invitation.findUniqueOrThrow({ where: { id } });

  describe("the additive migration", () => {
    it("gives every invitation a party limit of 4 and no deadline, and refuses limits outside 1 to 10", async () => {
      const columns = await prisma.$queryRaw<
        Array<{ column_name: string; is_nullable: string; column_default: string | null }>
      >`
        SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'Invitation' AND column_name IN ('rsvpDeadline', 'rsvpPartyLimit')
        ORDER BY column_name
      `;

      assert.deepEqual(columns, [
        { column_name: "rsvpDeadline", is_nullable: "YES", column_default: null },
        { column_name: "rsvpPartyLimit", is_nullable: "NO", column_default: "4" },
      ]);

      const { invitation } = await newPublished(["COUNTDOWN"]);
      assert.equal(invitation.rsvpPartyLimit, 4);
      assert.equal(invitation.rsvpDeadline, null);

      for (const partyLimit of [0, 11, -1]) {
        await assert.rejects(
          prisma.invitation.update({
            where: { id: invitation.id },
            data: { rsvpPartyLimit: partyLimit },
          }),
          /Invitation_rsvpPartyLimit_range/,
          String(partyLimit),
        );
      }
      assert.equal((await stored(invitation.id)).rsvpPartyLimit, 4);
    });

    it("keeps no guest column yet: the guest table arrives with the guest list (M6 G2)", async () => {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'RsvpResponse'
        ORDER BY column_name
      `;

      assert.deepEqual(
        columns.map((column) => column.column_name),
        [
          "attending",
          "createdAt",
          "dedupeKey",
          "id",
          "invitationId",
          "message",
          "name",
          "partySize",
          "phone",
          "updatedAt",
        ],
      );
    });

    it("refuses a name, a party size, a phone, and a message the domain would never store", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const base = {
        invitationId: invitation.id,
        dedupeKey: `guest-${runId}`,
        name: "Ana",
        attending: true,
        partySize: 1,
        phone: null,
        message: null,
      };

      for (const [data, pattern] of [
        [{ ...base, name: "" }, /RsvpResponse_name_length/],
        [{ ...base, name: "A".repeat(81) }, /RsvpResponse_name_length|too long/],
        [{ ...base, partySize: 11 }, /RsvpResponse_partySize_range/],
        [
          { ...base, partySize: -1 },
          /RsvpResponse_partySize_range|RsvpResponse_partySize_matches_attending/,
        ],
        [{ ...base, partySize: 0 }, /RsvpResponse_partySize_matches_attending/],
        [{ ...base, attending: false, partySize: 1 }, /RsvpResponse_partySize_matches_attending/],
        [{ ...base, phone: "5512345678" }, /RsvpResponse_phone_format/],
        [{ ...base, message: "" }, /RsvpResponse_message_length/],
        [{ ...base, message: "x".repeat(281) }, /RsvpResponse_message_length|too long/],
      ] as const) {
        await assert.rejects(prisma.rsvpResponse.create({ data }), pattern, JSON.stringify(data));
      }
      assert.equal(await prisma.rsvpResponse.count({ where: { invitationId: invitation.id } }), 0);
    });

    it("holds one response per normalized guest per invitation and refuses to delete an answered invitation", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const data = {
        invitationId: invitation.id,
        dedupeKey: `ana perez|${runId}`,
        name: "Ana Pérez",
        attending: true,
        partySize: 2,
        phone: null,
        message: null,
      };
      await prisma.rsvpResponse.create({ data });

      await assert.rejects(
        prisma.rsvpResponse.create({ data: { ...data, name: "Ana P." } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
      );
      await assert.rejects(
        prisma.invitation.delete({ where: { id: invitation.id } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      );
      assert.equal(await prisma.rsvpResponse.count({ where: { invitationId: invitation.id } }), 1);
    });
  });

  describe("the dedupe upsert", () => {
    it("inserts once and updates the same row on a retry, keeping the first createdAt", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const write = {
        name: "Ana Pérez",
        dedupeKey: "ana perez|+525512345678",
        attending: true,
        partySize: 2,
        phone: "+525512345678",
        message: null,
      };
      const first = new Date("2026-11-20T10:00:00.000Z");
      const later = new Date("2026-11-20T10:05:00.000Z");

      assert.equal(await rsvp.upsertResponse(invitation.id, write, first), true);
      const created = await prisma.rsvpResponse.findFirstOrThrow({
        where: { invitationId: invitation.id },
      });
      assert.equal(
        await rsvp.upsertResponse(invitation.id, { ...write, partySize: 3 }, later),
        true,
      );

      const rows = await prisma.rsvpResponse.findMany({
        where: { invitationId: invitation.id },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.id, created.id);
      assert.equal(rows[0]?.partySize, 3);
      assert.equal(rows[0]?.createdAt.getTime(), first.getTime());
      assert.equal(rows[0]?.updatedAt.getTime(), later.getTime());
    });

    it("ends two concurrent identical submissions in exactly one row", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const write = {
        name: "Ana Pérez",
        dedupeKey: "ana perez|",
        attending: true,
        partySize: 2,
        phone: null,
        message: null,
      };
      const at = new Date("2026-11-20T10:00:00.000Z");

      const answers = await Promise.all([
        rsvp.upsertResponse(invitation.id, write, at),
        rsvp.upsertResponse(invitation.id, write, at),
        rsvp.upsertResponse(invitation.id, write, at),
      ]);

      assert.deepEqual(answers, [true, true, true]);
      const rows = await prisma.rsvpResponse.findMany({
        where: { invitationId: invitation.id },
      });
      assert.equal(rows.length, 1);
    });

    it("keeps two different guests of one invitation as two rows", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const at = new Date("2026-11-20T10:00:00.000Z");

      await rsvp.upsertResponse(
        invitation.id,
        {
          name: "Ana",
          dedupeKey: "ana|",
          attending: true,
          partySize: 1,
          phone: null,
          message: null,
        },
        at,
      );
      await rsvp.upsertResponse(
        invitation.id,
        {
          name: "Beto",
          dedupeKey: "beto|",
          attending: false,
          partySize: 0,
          phone: null,
          message: null,
        },
        at,
      );

      assert.equal(await prisma.rsvpResponse.count({ where: { invitationId: invitation.id } }), 2);
    });

    it("refuses the write when the invitation is unpublished, archived, or past its deadline", async () => {
      const draft = await newPublished(["RSVP"], { publish: false });
      const write = {
        name: "Ana",
        dedupeKey: "ana|",
        attending: true,
        partySize: 1,
        phone: null,
        message: null,
      };
      const at = new Date("2026-11-20T10:00:00.000Z");

      assert.equal(await rsvp.upsertResponse(draft.invitation.id, write, at), false);

      const archived = await newPublished(["RSVP"]);
      await invitations.archive(archived.ownerId, archived.invitation.id);
      assert.equal(await rsvp.upsertResponse(archived.invitation.id, write, at), false);

      const closed = await newPublished(["RSVP"], {
        rsvpDeadline: new Date("2026-11-19T00:00:00.000Z"),
      });
      assert.equal(await rsvp.upsertResponse(closed.invitation.id, write, at), false);
      // The same row accepts a response before the deadline it carries.
      const open = await newPublished(["RSVP"], {
        rsvpDeadline: new Date("2026-11-21T00:00:00.000Z"),
      });
      assert.equal(await rsvp.upsertResponse(open.invitation.id, write, at), true);

      assert.equal(
        await prisma.rsvpResponse.count({
          where: {
            invitationId: {
              in: [draft.invitation.id, archived.invitation.id, closed.invitation.id],
            },
          },
        }),
        0,
      );
    });
  });

  describe("the creator's read and settings", () => {
    it("stores settings through the repository, refusing an archived invitation", async () => {
      const { invitation, ownerId } = await newPublished(["RSVP"], { publish: false });

      assert.deepEqual(
        await rsvp.saveSettings(ownerId, invitation.id, {
          deadline: new Date("2026-12-31T23:59:59.000Z"),
          partyLimit: 6,
        }),
        { deadline: new Date("2026-12-31T23:59:59.000Z"), partyLimit: 6 },
      );
      const row = await stored(invitation.id);
      assert.equal(row.rsvpPartyLimit, 6);
      assert.equal(row.rsvpDeadline?.toISOString(), "2026-12-31T23:59:59.000Z");

      await invitations.archive(ownerId, invitation.id);
      await assert.rejects(
        rsvp.saveSettings(ownerId, invitation.id, { deadline: null, partyLimit: 9 }),
        InvitationNotEditableError,
      );
      assert.equal((await stored(invitation.id)).rsvpPartyLimit, 6);
    });

    it("answers the settings, the responses newest first, and the totals of one owner only", async () => {
      const first = await newPublished(["RSVP"], { rsvpPartyLimit: 6 });
      const second = await newPublished(["RSVP"]);
      const at = new Date("2026-11-20T10:00:00.000Z");
      const write = (name: string, attending: boolean, partySize: number, dedupe: string) => ({
        name,
        dedupeKey: dedupe,
        attending,
        partySize,
        phone: null,
        message: null,
      });

      await rsvp.upsertResponse(first.invitation.id, write("Ana", true, 3, "ana|"), at);
      await rsvp.upsertResponse(
        first.invitation.id,
        write("Beto", false, 0, "beto|"),
        new Date(at.getTime() + 1000),
      );
      await rsvp.upsertResponse(second.invitation.id, write("Carla", true, 2, "carla|"), at);

      const read = await new GetRsvpResponsesUseCase(invitations, rsvp).execute(
        first.ownerId,
        first.invitation.id,
      );

      assert.equal(read?.slug, first.invitation.slug);
      assert.deepEqual(read?.settings, { deadline: null, partyLimit: 6 });
      assert.deepEqual(
        read?.responses.map((response) => response.name),
        ["Beto", "Ana"],
      );
      assert.deepEqual(read?.totals, { attendingPeople: 3, declinedCount: 1, responses: 2 });

      // The other creator reads their own answer and nothing of the first invitation.
      const otherRead = await new GetRsvpResponsesUseCase(invitations, rsvp).execute(
        second.ownerId,
        second.invitation.id,
      );
      assert.deepEqual(
        otherRead?.responses.map((response) => response.name),
        ["Carla"],
      );
      assert.equal(JSON.stringify(otherRead).includes("Ana"), false);

      // A foreign id answers null, exactly like an unknown one.
      assert.equal(
        await new GetRsvpResponsesUseCase(invitations, rsvp).execute(
          second.ownerId,
          first.invitation.id,
        ),
        null,
      );
      assert.equal(
        await new GetRsvpResponsesUseCase(invitations, rsvp).execute(first.ownerId, UNKNOWN_ID),
        null,
      );
      assert.equal(
        await rsvp.saveSettings(second.ownerId, first.invitation.id, {
          deadline: null,
          partyLimit: 9,
        }),
        null,
      );
    });
  });

  describe("the rate limit on the shared store", () => {
    it("admits ten submissions per address and invitation, and refuses the eleventh", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const address = `203.0.113.${(sequence % 250) + 1}`;

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        assert.equal(await rateLimiter.consume(invitation.id, address), true, String(attempt));
      }
      assert.equal(await rateLimiter.consume(invitation.id, address), false);

      // Another address has its own bucket, and so does another invitation for the same address.
      assert.equal(await rateLimiter.consume(invitation.id, "203.0.113.250"), true);
      const other = await newPublished(["RSVP"]);
      assert.equal(await rateLimiter.consume(other.invitation.id, address), true);
    });

    it("stores a hashed key: the address never appears in the RateLimit row", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const address = "198.51.100.7";

      assert.equal(await rateLimiter.consume(invitation.id, address), true);

      const rows = await prisma.rateLimit.findMany({
        where: { key: { startsWith: `rsvp|${invitation.id}|` } },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.key.includes(address), false);
      assert.match(String(rows[0]?.key), /^rsvp\|[0-9a-f-]{36}\|[0-9a-f]{64}$/);
      assert.equal(Number(rows[0]?.count), 1);
    });
  });

  describe("the public read", () => {
    it("carries the RSVP mode and settings and none of the answers", async () => {
      const open = await newPublished(["COUNTDOWN", "RSVP"], {
        rsvpDeadline: new Date("2026-12-31T23:59:59.000Z"),
        rsvpPartyLimit: 6,
      });
      const submit = new SubmitPublicRsvpUseCase(invitations, catalog, rsvp, rateLimiter);
      assert.equal(
        await submit.execute({
          ...SUBMISSION,
          slug: open.invitation.slug,
          clientAddress: "198.51.100.9",
        }),
        true,
      );

      const page = await new GetPublicInvitationUseCase(invitations, catalog).execute(
        open.invitation.slug,
      );

      assert.deepEqual(page?.features.rsvp, {
        mode: "open",
        deadline: new Date("2026-12-31T23:59:59.000Z"),
        partyLimit: 6,
      });
      // No guest answer, no owner, no id: the page a guest receives carries the settings only (S4, A7).
      const text = JSON.stringify(page);
      for (const secret of ["Ana", "+525512345678", "gusto", open.ownerId, open.invitation.id]) {
        assert.equal(text.includes(secret), false, secret);
      }
      assert.equal(text.includes("RSVP"), false, "the package's key list stays private");
    });

    it("answers the guest-list mode instead of the open form when the package grants it", async () => {
      const guestList = await newPublished(["RSVP", "GUEST_LIST"]);
      const submit = new SubmitPublicRsvpUseCase(invitations, catalog, rsvp, rateLimiter);

      const page = await new GetPublicInvitationUseCase(invitations, catalog).execute(
        guestList.invitation.slug,
      );
      assert.equal(page?.features.rsvp.mode, "guest-list");
      // The open form refuses the submission for this invitation.
      await assert.rejects(
        submit.execute({
          ...SUBMISSION,
          slug: guestList.invitation.slug,
          clientAddress: "198.51.100.10",
        }),
        /not accepting RSVP responses/,
      );
      assert.equal(
        await prisma.rsvpResponse.count({ where: { invitationId: guestList.invitation.id } }),
        0,
      );
    });

    it("stores one guest's response through the use case, deduping a retry", async () => {
      const { invitation } = await newPublished(["RSVP"]);
      const submit = new SubmitPublicRsvpUseCase(invitations, catalog, rsvp, rateLimiter);

      assert.equal(
        await submit.execute({
          ...SUBMISSION,
          slug: invitation.slug,
          clientAddress: "198.51.100.11",
        }),
        true,
      );
      assert.equal(
        await submit.execute({
          ...SUBMISSION,
          name: "ANA PEREZ",
          partySize: 3,
          slug: invitation.slug,
          clientAddress: "198.51.100.11",
        }),
        true,
      );

      const rows = await prisma.rsvpResponse.findMany({ where: { invitationId: invitation.id } });
      assert.equal(rows.length, 1);
      // The latest submission owns the row: the newest spelling, party size, and phone are what the creator reads.
      assert.equal(rows[0]?.name, "ANA PEREZ");
      assert.equal(rows[0]?.partySize, 3);
      assert.equal(rows[0]?.phone, "+525512345678");
    });
  });
});
