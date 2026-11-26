import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { guestTokenHash, mintGuestToken } from "../application/guest-token";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import { GuestNotConfirmedError, GuestNotFoundError } from "../application/invitation-guest.errors";
import {
  CheckInGuestUseCase,
  CreateGuestUseCase,
  DeleteGuestUseCase,
  GetAttendanceExportUseCase,
  GetPublicGuestUseCase,
  ListGuestsUseCase,
  RotateGuestTokenUseCase,
  SubmitGuestRsvpUseCase,
  UpdateGuestUseCase,
} from "../application/invitation-guest.use-cases";
import { RsvpNotOpenError } from "../application/invitation-rsvp.errors";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { CatalogInvitationReader } from "./catalog-invitation-reader";
import { PrismaGuestRepository } from "./prisma-guest.repository";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";
import { PrismaRsvpRepository } from "./prisma-rsvp.repository";
import { PrismaRsvpRateLimiter } from "./prisma-rsvp-rate-limiter";

// The guest list on real PostgreSQL (M6 G2; S1, S3, S4): the additive migration's table, columns, checks, unique
// indexes, and RESTRICT references; the guarded creator writes under another owner and under an archive; the token
// digest's unique index and the rotation that invalidates the previous link; the idempotent personal answer under a
// retry and under concurrent submissions; the owner's idempotent check-in; the public personal page, which carries
// no other guest; and the guest-list CSV export. Runs only through `pnpm --filter @invitame/api test:db` with an
// explicit DATABASE_URL. The database is shared with parallel suites: every row here carries a key made from this
// run's id, and only those rows are removed.

const RENDERER = "birthday-poster-01";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const AT = new Date("2026-11-20T10:00:00.000Z");

describe("guest list on real PostgreSQL (M6 G2)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const invitations = new PrismaInvitationRepository(prisma);
  const rsvp = new PrismaRsvpRepository(prisma);
  const guests = new PrismaGuestRepository(prisma);
  const rateLimiter = new PrismaRsvpRateLimiter(prisma);
  const catalog = new CatalogInvitationReader(new PrismaCatalogPublicReader(prisma));
  const publicInvitations = new GetPublicInvitationUseCase(invitations, catalog);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const featureIds: string[] = [];
  const invitationIds: string[] = [];
  const guestIds: string[] = [];
  let sequence = 0;

  const list = new ListGuestsUseCase(invitations, catalog, guests);
  const create = new CreateGuestUseCase(invitations, catalog, guests, () => AT);
  const update = new UpdateGuestUseCase(invitations, catalog, guests, () => AT);
  const remove = new DeleteGuestUseCase(invitations, catalog, guests);
  const rotate = new RotateGuestTokenUseCase(invitations, catalog, guests, () => AT);
  const readGuest = new GetPublicGuestUseCase(invitations, guests, publicInvitations);
  const submit = new SubmitGuestRsvpUseCase(invitations, catalog, guests, rateLimiter, () => AT);
  const checkIn = new CheckInGuestUseCase(invitations, catalog, guests, () => AT);
  const exportAttendance = new GetAttendanceExportUseCase(invitations, catalog, guests, rsvp);

  after(async () => {
    try {
      // Responses reference invitations and guests with ON DELETE RESTRICT, so they go first.
      await prisma.rsvpResponse.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.rsvpResponse.deleteMany({ where: { guestId: { in: guestIds } } });
      await prisma.guest.deleteMany({ where: { id: { in: guestIds } } });
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
      data: { email: `m6-g2-guests-${sequence}-${runId}@example.test` },
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
      data: { key: `m6-g2-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m6-g2-template-${sequence}-${runId}`,
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
        schema: { type: "object", required: [], properties: { title: { type: "string" } } },
        configuration: { componentKey: RENDERER },
      },
    });
    const createdPackage = await prisma.package.create({
      data: {
        key: `m6-g2-package-${sequence}-${runId}`,
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
    return `m6g2-${runId.slice(0, 8)}-${sequence}`;
  }

  /** An invitation with the given catalog keys, published unless a test says otherwise. */
  async function newInvitation(
    featureKeys: readonly string[],
    options: { ownerId?: string; publish?: boolean; rsvpDeadline?: Date | null } = {},
  ) {
    const ownerId = options.ownerId ?? (await newOwner());
    const catalogState = await newCatalog(featureKeys);
    const created = await invitations.create({
      ownerId,
      templateVersionId: catalogState.versionId,
      packageId: catalogState.packageId,
      slug: newSlug(),
      content: {},
      // The settings row's default party limit, stated explicitly like the use case does (M9 T13).
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    if (options.rsvpDeadline !== undefined) {
      await rsvp.saveSettings(ownerId, created.id, {
        deadline: options.rsvpDeadline,
        partyLimit: 4,
      });
    }
    if (options.publish !== false) {
      assert.ok(await invitations.publish(ownerId, created.id, AT));
    }
    return { invitation: created, ownerId, ...catalogState };
  }

  /** A guest created through the use case, with the plain token the test keeps. */
  async function newGuest(
    invitation: { id: string; ownerId: string },
    overrides: { name?: string; seats?: number; phone?: string | null; note?: string | null } = {},
  ) {
    const created = await create.execute({
      ownerId: invitation.ownerId,
      id: invitation.id,
      name: overrides.name ?? "Ana Pérez",
      seats: overrides.seats ?? 3,
      phone: overrides.phone === undefined ? "5512345678" : overrides.phone,
      note: overrides.note === undefined ? "Mesa 4" : overrides.note,
    });
    assert.ok(created !== null, "the guest is created");
    guestIds.push(created.guest.id);
    return created;
  }

  const storedGuest = (id: string) => prisma.guest.findUniqueOrThrow({ where: { id } });

  describe("the additive migration", () => {
    it("adds the Guest table with bounded columns and the checks the domain repeats", async () => {
      const columns = await prisma.$queryRaw<
        Array<{
          column_name: string;
          is_nullable: string;
          data_type: string;
          character_maximum_length: number | null;
        }>
      >`
        SELECT column_name, is_nullable, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'Guest'
        ORDER BY column_name
      `;

      assert.deepEqual(
        columns.map((column) => [
          column.column_name,
          column.is_nullable,
          column.character_maximum_length,
        ]),
        [
          ["checkedInAt", "YES", null],
          ["createdAt", "NO", null],
          ["id", "NO", null],
          ["invitationId", "NO", null],
          ["name", "NO", 80],
          ["note", "YES", 200],
          ["phone", "YES", 16],
          ["seats", "NO", null],
          ["tokenHash", "NO", 64],
          ["tokenIssuedAt", "NO", null],
          ["updatedAt", "NO", null],
        ],
      );

      // A nullable guest reference on the response, with a unique index: one answer per guest (S4).
      const responseColumns = await prisma.$queryRaw<
        Array<{ column_name: string; is_nullable: string }>
      >`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'RsvpResponse' AND column_name = 'guestId'
      `;
      assert.deepEqual(responseColumns, [{ column_name: "guestId", is_nullable: "YES" }]);

      const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename IN ('Guest', 'RsvpResponse')
          AND indexname IN ('Guest_tokenHash_key', 'Guest_invitationId_idx', 'RsvpResponse_guestId_key')
        ORDER BY indexname
      `;
      assert.deepEqual(
        indexes.map((index) => index.indexname),
        ["Guest_invitationId_idx", "Guest_tokenHash_key", "RsvpResponse_guestId_key"],
      );
      assert.match(
        indexes.find((index) => index.indexname === "Guest_tokenHash_key")?.indexdef ?? "",
        /UNIQUE INDEX .*\("tokenHash"\)/,
      );
    });

    it("refuses a name, a seat count, a phone, a note, and a token digest the domain would never store", async () => {
      const { invitation } = await newInvitation(["RSVP", "GUEST_LIST"]);
      const base = {
        invitationId: invitation.id,
        name: "Ana",
        seats: 2,
        phone: null,
        note: null,
        tokenHash: guestTokenHash(mintGuestToken()),
        tokenIssuedAt: AT,
        updatedAt: AT,
      };

      for (const [data, pattern] of [
        [{ ...base, name: "" }, /Guest_name_length/],
        [{ ...base, name: "A".repeat(81) }, /Guest_name_length|too long/],
        [{ ...base, seats: 0 }, /Guest_seats_range/],
        [{ ...base, seats: 11 }, /Guest_seats_range/],
        [{ ...base, phone: "5512345678" }, /Guest_phone_format/],
        [{ ...base, note: "" }, /Guest_note_length/],
        [{ ...base, note: "n".repeat(201) }, /Guest_note_length|too long/],
        [{ ...base, tokenHash: "not-a-digest" }, /Guest_tokenHash_format/],
        [{ ...base, tokenHash: "A".repeat(64) }, /Guest_tokenHash_format/],
      ] as const) {
        await assert.rejects(prisma.guest.create({ data }), pattern, JSON.stringify(data));
      }
      assert.equal(await prisma.guest.count({ where: { invitationId: invitation.id } }), 0);
    });

    it("holds one guest per token digest and refuses to delete an invitation or a guest that still has data", async () => {
      const { invitation } = await newInvitation(["RSVP", "GUEST_LIST", "QR_PASS"]);
      const first = await newGuest(invitation);
      const hash = (await storedGuest(first.guest.id)).tokenHash;

      await assert.rejects(
        prisma.guest.create({
          data: {
            invitationId: invitation.id,
            name: "Otra",
            seats: 1,
            tokenHash: hash,
            tokenIssuedAt: AT,
            updatedAt: AT,
          },
        }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
      );
      await assert.rejects(
        prisma.invitation.delete({ where: { id: invitation.id } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      );

      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token: first.token,
          attending: true,
          partySize: 2,
          message: null,
        }),
        true,
      );
      await assert.rejects(
        prisma.guest.delete({ where: { id: first.guest.id } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      );
    });
  });

  describe("the guarded creator writes", () => {
    it("creates the guest only for the owning invitation and only while it is editable", async () => {
      const first = await newInvitation(["RSVP", "GUEST_LIST"]);
      const other = await newInvitation(["RSVP", "GUEST_LIST"]);

      // Another owner's id stores nothing and answers null, exactly like an unknown id.
      assert.equal(
        await create.execute({
          ownerId: other.ownerId,
          id: first.invitation.id,
          name: "Intruso",
          seats: 1,
          phone: null,
          note: null,
        }),
        null,
      );
      assert.equal(
        await create.execute({
          ownerId: first.ownerId,
          id: UNKNOWN_ID,
          name: "Fantasma",
          seats: 1,
          phone: null,
          note: null,
        }),
        null,
      );
      assert.equal(await prisma.guest.count({ where: { invitationId: first.invitation.id } }), 0);

      // An archived invitation is refused after the row exists, with the archived refusal.
      await invitations.archive(first.ownerId, first.invitation.id);
      await assert.rejects(
        create.execute({
          ownerId: first.ownerId,
          id: first.invitation.id,
          name: "Tarde",
          seats: 1,
          phone: null,
          note: null,
        }),
        InvitationNotEditableError,
      );
      assert.equal(await prisma.guest.count({ where: { invitationId: first.invitation.id } }), 0);
    });

    it("reads, edits, and rotates only inside the owning invitation", async () => {
      const first = await newInvitation(["RSVP", "GUEST_LIST"]);
      const other = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(first.invitation);
      await newGuest(other.invitation, { name: "De la otra" });

      const read = await list.execute(first.ownerId, first.invitation.id);
      assert.deepEqual(
        read?.guests.map((row) => row.name),
        ["Ana Pérez"],
      );
      assert.deepEqual(read?.totals, {
        guests: 1,
        seats: 3,
        attendingGuests: 0,
        attendingPeople: 0,
        attendingAdults: 0,
        attendingChildren: 0,
        declinedCount: 0,
        pendingCount: 1,
        checkedInCount: 0,
      });
      // A foreign owner reads nothing and cannot touch the guest.
      assert.equal(await list.execute(other.ownerId, first.invitation.id), null);
      assert.equal(
        await update.execute({
          ownerId: other.ownerId,
          id: first.invitation.id,
          guestId: guest.guest.id,
          name: "Intruso",
          seats: 1,
          phone: null,
          note: null,
        }),
        null,
      );
      assert.equal(await remove.execute(other.ownerId, first.invitation.id, guest.guest.id), false);
      assert.equal(await rotate.execute(other.ownerId, first.invitation.id, guest.guest.id), null);
      // The guest of the sibling invitation is not reachable through this invitation id either.
      await assert.rejects(
        update.execute({
          ownerId: first.ownerId,
          id: first.invitation.id,
          guestId: UNKNOWN_ID,
          name: "Fantasma",
          seats: 1,
          phone: null,
          note: null,
        }),
        GuestNotFoundError,
      );
      assert.equal((await storedGuest(guest.guest.id)).name, "Ana Pérez");
    });

    it("edits a guest and rotates its token, so the previous link stops resolving", async () => {
      const { invitation, ownerId } = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(invitation, { seats: 3 });

      const edited = await update.execute({
        ownerId,
        id: invitation.id,
        guestId: guest.guest.id,
        name: "Ana María",
        seats: 5,
        phone: "+5215512345678",
        note: null,
      });
      assert.equal(edited?.name, "Ana María");
      assert.equal(edited?.seats, 5);
      assert.equal(edited?.note, null);

      const rotated = await rotate.execute(ownerId, invitation.id, guest.guest.id);
      assert.ok(rotated !== null);
      assert.equal((await storedGuest(guest.guest.id)).tokenHash, guestTokenHash(rotated.token));
      assert.equal(await readGuest.execute(invitation.slug, guest.token), null);
      assert.equal(
        (await readGuest.execute(invitation.slug, rotated.token))?.guest.name,
        "Ana María",
      );
    });

    it("removes the guest and the answer together, in one statement", async () => {
      const { invitation, ownerId } = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(invitation);
      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token: guest.token,
          attending: true,
          partySize: 2,
          message: null,
        }),
        true,
      );
      assert.equal(await prisma.rsvpResponse.count({ where: { guestId: guest.guest.id } }), 1);

      assert.equal(await remove.execute(ownerId, invitation.id, guest.guest.id), true);

      assert.equal(await prisma.guest.count({ where: { id: guest.guest.id } }), 0);
      assert.equal(await prisma.rsvpResponse.count({ where: { guestId: guest.guest.id } }), 0);
      await assert.rejects(
        remove.execute(ownerId, invitation.id, guest.guest.id),
        GuestNotFoundError,
      );
    });
  });

  describe("the personal answer", () => {
    it("stores and reads the companion names, the child marks, and the dietary notes (F3; L6.1)", async () => {
      const { invitation } = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(invitation, { seats: 3 });

      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token: guest.token,
          attending: true,
          partySize: 3,
          companions: [
            { name: "Jorge", child: false },
            { name: "Sofía", child: true },
          ],
          dietaryNotes: "Sin nueces",
          message: null,
        }),
        true,
      );

      const read = await guests.findByToken(invitation.id, guestTokenHash(guest.token));
      assert.deepEqual(read?.response?.companions, [
        { name: "Jorge", child: false },
        { name: "Sofía", child: true },
      ]);
      assert.equal(read?.response?.dietaryNotes, "Sin nueces");

      // The stored party size stays the source of the count: a list that does not match it is refused and stored never.
      await assert.rejects(
        submit.execute({
          slug: invitation.slug,
          token: guest.token,
          attending: true,
          partySize: 2,
          companions: [
            { name: "Jorge", child: false },
            { name: "Sofía", child: true },
          ],
          message: null,
        }),
      );
      const rows = await prisma.rsvpResponse.findMany({ where: { guestId: guest.guest.id } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.partySize, 3);
    });

    it("stores one answer per guest, updates a change of mind, and keeps the first answer instant", async () => {
      const { invitation } = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(invitation, { seats: 4 });

      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token: guest.token,
          attending: true,
          partySize: 3,
          message: "  Vamos ",
        }),
        true,
      );
      const later = new SubmitGuestRsvpUseCase(invitations, catalog, guests, rateLimiter, () => {
        return new Date("2026-11-20T11:00:00.000Z");
      });
      assert.equal(
        await later.execute({
          slug: invitation.slug,
          token: guest.token,
          attending: true,
          partySize: 4,
          message: null,
        }),
        true,
      );

      const rows = await prisma.rsvpResponse.findMany({ where: { guestId: guest.guest.id } });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.partySize, 4);
      assert.equal(rows[0]?.message, null);
      assert.equal(rows[0]?.name, "Ana Pérez");
      assert.equal(rows[0]?.phone, null);
      assert.equal(rows[0]?.createdAt.getTime(), AT.getTime());
      assert.equal(rows[0]?.updatedAt.getTime(), new Date("2026-11-20T11:00:00.000Z").getTime());
      // The client sent no companions, so the party size itself counts one unnamed adult per extra person (F3; L6.1).
      assert.deepEqual(rows[0]?.companions, [
        { name: "", child: false },
        { name: "", child: false },
        { name: "", child: false },
      ]);
      assert.equal(rows[0]?.dietaryNotes, null);
      // The dedupe key names the guest, so it stays unique per invitation without storing the name.
      assert.equal(rows[0]?.dedupeKey, `guest|${guest.guest.id}`);
    });

    it("ends two concurrent identical submissions in exactly one row", async () => {
      const { invitation } = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(invitation);

      const answers = await Promise.all([
        guests.upsertResponse(
          invitation.id,
          guest.guest.id,
          {
            attending: true,
            partySize: 2,
            companions: [{ name: "", child: false }],
            dietaryNotes: null,
            message: "uno",
          },
          AT,
        ),
        guests.upsertResponse(
          invitation.id,
          guest.guest.id,
          {
            attending: true,
            partySize: 2,
            companions: [{ name: "", child: false }],
            dietaryNotes: null,
            message: "dos",
          },
          AT,
        ),
        guests.upsertResponse(
          invitation.id,
          guest.guest.id,
          { attending: false, partySize: 0, companions: [], dietaryNotes: null, message: null },
          AT,
        ),
      ]);

      assert.deepEqual(answers, [true, true, true]);
      assert.equal(await prisma.rsvpResponse.count({ where: { guestId: guest.guest.id } }), 1);
    });

    it("refuses the write when the invitation is not published, expired, or past its deadline", async () => {
      const draft = await newInvitation(["RSVP", "GUEST_LIST"], { publish: false });
      const draftGuest = await newGuest(draft.invitation);

      assert.equal(
        await submit.execute({
          slug: draft.invitation.slug,
          token: draftGuest.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        false,
      );

      const closed = await newInvitation(["RSVP", "GUEST_LIST"], {
        rsvpDeadline: new Date("2026-11-19T00:00:00.000Z"),
      });
      const closedGuest = await newGuest(closed.invitation);
      // A visible invitation whose deadline passed answers the same "not open" refusal the open form answers.
      await assert.rejects(
        submit.execute({
          slug: closed.invitation.slug,
          token: closedGuest.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        RsvpNotOpenError,
      );
      assert.equal(
        await guests.upsertResponse(
          closed.invitation.id,
          closedGuest.guest.id,
          {
            attending: true,
            partySize: 1,
            companions: [],
            dietaryNotes: null,
            message: null,
          },
          AT,
        ),
        false,
      );
      // An invitation whose expiry passed is visible read-only, so its personal answers close too (S2, T4).
      const expired = await newInvitation(["RSVP", "GUEST_LIST"]);
      await prisma.invitation.update({
        where: { id: expired.invitation.id },
        data: { expiresAt: new Date("2026-11-19T00:00:00.000Z") },
      });
      const expiredGuest = await newGuest(expired.invitation);
      await assert.rejects(
        submit.execute({
          slug: expired.invitation.slug,
          token: expiredGuest.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        RsvpNotOpenError,
      );
      assert.equal(
        await guests.upsertResponse(
          expired.invitation.id,
          expiredGuest.guest.id,
          {
            attending: true,
            partySize: 1,
            companions: [],
            dietaryNotes: null,
            message: null,
          },
          AT,
        ),
        false,
      );

      assert.equal(
        await prisma.rsvpResponse.count({
          where: {
            guestId: {
              in: [draftGuest.guest.id, closedGuest.guest.id, expiredGuest.guest.id],
            },
          },
        }),
        0,
      );
    });

    it("answers the invisible 404 for a token of another invitation and for a revoked one", async () => {
      const first = await newInvitation(["RSVP", "GUEST_LIST"]);
      const second = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(first.invitation);
      const sibling = await newGuest(second.invitation);

      assert.equal(await readGuest.execute(first.invitation.slug, sibling.token), null);
      assert.equal(await readGuest.execute(first.invitation.slug, "A".repeat(22)), null);
      assert.equal(
        await submit.execute({
          slug: first.invitation.slug,
          token: sibling.token,
          attending: true,
          partySize: 1,
          message: null,
        }),
        false,
      );

      const rotated = await rotate.execute(first.ownerId, first.invitation.id, guest.guest.id);
      assert.ok(rotated !== null);
      assert.equal(await readGuest.execute(first.invitation.slug, guest.token), null);
      assert.equal(await readGuest.execute("invitacion-never01", rotated.token), null);
    });
  });

  describe("the public personal page", () => {
    it("carries the published page plus this guest, and nothing about another guest", async () => {
      const { invitation } = await newInvitation(["COUNTDOWN", "RSVP", "GUEST_LIST", "QR_PASS"]);
      const guest = await newGuest(invitation, { name: "Ana", seats: 3 });
      await newGuest(invitation, { name: "Beto", seats: 2 });
      assert.equal(
        await submit.execute({
          slug: invitation.slug,
          token: guest.token,
          attending: true,
          partySize: 2,
          message: "Vamos",
        }),
        true,
      );

      const page = await readGuest.execute(invitation.slug, guest.token);

      assert.equal(page?.page.slug, invitation.slug);
      assert.equal(page?.page.features.countdown, true);
      assert.deepEqual(page?.page.features.rsvp, {
        mode: "guest-list",
        deadline: null,
        partyLimit: 4,
        qrPass: true,
      });
      assert.deepEqual(page?.guest, {
        name: "Ana",
        seats: 3,
        response: {
          attending: true,
          partySize: 2,
          // The answer named no companion, so the party size itself counts one unnamed adult (F3; L6.1).
          companions: [{ name: "", child: false }],
          dietaryNotes: null,
          message: "Vamos",
        },
        qrPass: true,
      });
      // The stored id is the application's own field (M9 T11; S7), so the guest read can count one opening; the REST
      // mapper never answers it.
      assert.equal(page?.page.invitationId, invitation.id);
      const text = JSON.stringify(page);
      for (const secret of ["Beto", guest.token, invitation.ownerId]) {
        assert.equal(text.includes(secret), false, secret);
      }
      // The other guest's own link is not this guest's page.
      assert.notEqual((await readGuest.execute(invitation.slug, guest.token))?.guest.name, "Beto");
    });
  });

  describe("the owner's check-in", () => {
    it("checks a confirmed guest in once, keeping the first instant", async () => {
      const { invitation, ownerId } = await newInvitation(["RSVP", "GUEST_LIST", "QR_PASS"]);
      const guest = await newGuest(invitation, { seats: 3 });
      await submit.execute({
        slug: invitation.slug,
        token: guest.token,
        attending: true,
        partySize: 2,
        message: null,
      });

      const first = await checkIn.execute({ ownerId, id: invitation.id, token: guest.token });
      assert.deepEqual(first, {
        id: guest.guest.id,
        name: "Ana Pérez",
        seats: 3,
        partySize: 2,
        checkedInAt: AT,
      });

      const later = new CheckInGuestUseCase(invitations, catalog, guests, () => {
        return new Date("2026-11-21T20:00:00.000Z");
      });
      const second = await later.execute({ ownerId, id: invitation.id, token: guest.token });
      assert.equal(second?.checkedInAt.getTime(), AT.getTime());
      assert.equal((await storedGuest(guest.guest.id)).checkedInAt?.getTime(), AT.getTime());
    });

    it("refuses a guest who has not confirmed and a token of another invitation", async () => {
      const first = await newInvitation(["RSVP", "GUEST_LIST", "QR_PASS"]);
      const second = await newInvitation(["RSVP", "GUEST_LIST", "QR_PASS"]);
      const pending = await newGuest(first.invitation);
      const sibling = await newGuest(second.invitation, { name: "De la otra" });
      await submit.execute({
        slug: second.invitation.slug,
        token: sibling.token,
        attending: true,
        partySize: 1,
        message: null,
      });

      await assert.rejects(
        checkIn.execute({ ownerId: first.ownerId, id: first.invitation.id, token: pending.token }),
        GuestNotConfirmedError,
      );
      await assert.rejects(
        checkIn.execute({ ownerId: first.ownerId, id: first.invitation.id, token: sibling.token }),
        GuestNotFoundError,
      );
      assert.equal(
        await checkIn.execute({
          ownerId: second.ownerId,
          id: first.invitation.id,
          token: sibling.token,
        }),
        null,
      );
      assert.equal((await storedGuest(pending.guest.id)).checkedInAt, null);
      assert.equal((await storedGuest(sibling.guest.id)).checkedInAt, null);
    });
  });

  describe("the guest-list export", () => {
    it("exports every guest, pending ones included, and never the token", async () => {
      const { invitation, ownerId } = await newInvitation(["RSVP", "GUEST_LIST"]);
      const guest = await newGuest(invitation, { name: "Ana", seats: 3, note: "Mesa 4" });
      await newGuest(invitation, { name: "Beto", seats: 1, phone: null, note: null });
      await submit.execute({
        slug: invitation.slug,
        token: guest.token,
        attending: true,
        partySize: 2,
        message: "Vamos",
      });

      const exported = await exportAttendance.execute(ownerId, invitation.id);

      assert.equal(exported?.filename, `asistencia-${invitation.slug}.csv`);
      const lines = exported?.body.split("\r\n") ?? [];
      assert.equal(
        lines[0],
        "Nombre,Lugares,Asistencia,Personas,Acompañantes,Niños,Restricciones alimentarias,Teléfono,Nota,Mensaje,Primer check-in,Primera respuesta,Última actualización",
      );
      // Both guests are exported, whatever order the read answered them in; only Ana has an answer.
      assert.deepEqual(lines.slice(1, 3).sort(), [
        "Ana,3,Sí,2,,0,,'+525512345678,Mesa 4,Vamos,,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z",
        "Beto,1,Pendiente,,,,,,,,,,2026-11-20T10:00:00.000Z",
      ]);
      assert.equal(exported?.body.includes(guest.token), false);
      assert.equal(exported?.body.includes("tokenHash"), false);
    });

    it("keeps the open form's response export when the package grants no guest list", async () => {
      const { invitation, ownerId } = await newInvitation(["RSVP"]);
      await prisma.rsvpResponse.create({
        data: {
          invitationId: invitation.id,
          dedupeKey: `ana|${runId}`,
          name: "Ana",
          attending: true,
          partySize: 2,
          updatedAt: AT,
        },
      });

      const exported = await exportAttendance.execute(ownerId, invitation.id);

      assert.equal(
        exported?.body.split("\r\n")[0],
        "Nombre,Asistencia,Personas,Acompañantes,Niños,Restricciones alimentarias,Teléfono,Mensaje,Primera respuesta,Última actualización",
      );
      assert.equal(exported?.body.split("\r\n")[1]?.startsWith("Ana,Sí,2,"), true);
    });
  });
});
