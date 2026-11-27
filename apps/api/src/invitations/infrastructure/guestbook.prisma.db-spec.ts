import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import {
  GetGuestbookEntriesUseCase,
  SetGuestbookEntryHiddenUseCase,
  SubmitPublicGuestbookEntryUseCase,
} from "../application/invitation-guestbook.use-cases";
import { CatalogInvitationReader } from "./catalog-invitation-reader";
import { PrismaGuestbookRepository } from "./prisma-guestbook.repository";
import { PrismaGuestbookRateLimiter } from "./prisma-guestbook-rate-limiter";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";

// The guestbook on real PostgreSQL (F7; S2.7, L10.1, L10.3, L10.4, L10.6): the additive table's columns, default, and
// CHECK constraints; the RESTRICT reference the convention states (L24); the visible-only wall and its bound; the
// owner's moderation scope; the insert that refuses an unpublished or expired invitation in the statement itself; the
// public read that carries the wall only while the package grants `GUESTBOOK`; and the rate limit on the shared
// `RateLimit` table. Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database
// is shared with parallel suites: every row here carries a key made from this run's id, and only those rows are removed.

const RENDERER = "birthday-poster-01";

describe("the guestbook on real PostgreSQL (F7; S2.7)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const invitations = new PrismaInvitationRepository(prisma);
  const guestbook = new PrismaGuestbookRepository(prisma);
  const rateLimiter = new PrismaGuestbookRateLimiter(prisma);
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
      // Entries reference invitations with ON DELETE RESTRICT, so they go first.
      await prisma.guestbookEntry.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
      // Every signature count this suite wrote is keyed by one of its own invitations.
      await prisma.rateLimit.deleteMany({
        where: {
          OR: invitationIds.map((id) => ({ key: { startsWith: `guestbook|${id}|` } })),
        },
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
      data: { email: `f7-guestbook-${sequence}-${runId}@example.test` },
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
      data: { key: `f7-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `f7-template-${sequence}-${runId}`,
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
        key: `f7-package-${sequence}-${runId}`,
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
    return `f7-${runId.slice(0, 8)}-${sequence}`;
  }

  /** A published invitation created through the repository, as the owner routes leave it. */
  async function newPublished(
    featureKeys: readonly string[] = ["GUESTBOOK"],
    options: { ownerId?: string; publish?: boolean; expiresAt?: Date | null } = {},
  ) {
    const ownerId = options.ownerId ?? (await newOwner());
    const catalogState = await newCatalog(featureKeys);
    const created = await invitations.create({
      ownerId,
      templateVersionId: catalogState.versionId,
      packageId: catalogState.packageId,
      slug: newSlug(),
      content: {},
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    if (options.publish !== false) {
      assert.ok(
        await invitations.publish(ownerId, created.id, new Date("2026-12-01T10:00:00.000Z")),
      );
    }
    if (options.expiresAt !== undefined) {
      // The publication sets the package's own expiry; a test that needs an elapsed one writes it directly, as the
      // clock would have done.
      await prisma.invitation.update({
        where: { id: created.id },
        data: { expiresAt: options.expiresAt },
      });
    }
    return { invitation: created, ownerId, ...catalogState };
  }

  const ENTRY = {
    authorName: "Tía Rosa",
    message: "¡Que este día sea tan hermoso como tú! Te queremos mucho.",
  };

  describe("the additive migration", () => {
    it("stores the signature, the message, and the default state of an entry", async () => {
      const { invitation } = await newPublished();

      await prisma.guestbookEntry.create({
        data: { invitationId: invitation.id, ...ENTRY },
      });

      const stored = await prisma.guestbookEntry.findFirstOrThrow({
        where: { invitationId: invitation.id },
      });
      assert.equal(stored.authorName, ENTRY.authorName);
      assert.equal(stored.message, ENTRY.message);
      // A new entry is published at once (L10.6).
      assert.equal(stored.hidden, false);
      assert.ok(stored.createdAt instanceof Date);
    });

    it("refuses a blank, an empty, and an over-wide signature or message", async () => {
      const { invitation } = await newPublished();

      for (const data of [
        { ...ENTRY, authorName: "" },
        { ...ENTRY, authorName: "x".repeat(61) },
        { ...ENTRY, message: "" },
        { ...ENTRY, message: "x".repeat(501) },
      ]) {
        // A blank value is refused by the CHECK the migration adds; a value past the bound is refused by the column's
        // own width before the CHECK can run, and both are refusals of the same row.
        await assert.rejects(
          prisma.guestbookEntry.create({ data: { invitationId: invitation.id, ...data } }),
          /GuestbookEntry_(authorName|message)_length|too long for the column/,
        );
      }
      assert.equal(
        await prisma.guestbookEntry.count({ where: { invitationId: invitation.id } }),
        0,
      );

      // The bounds themselves are accepted, counted in characters.
      await prisma.guestbookEntry.create({
        data: {
          invitationId: invitation.id,
          authorName: "á".repeat(60),
          message: "é".repeat(500),
        },
      });
      assert.equal(
        await prisma.guestbookEntry.count({ where: { invitationId: invitation.id } }),
        1,
      );
    });

    it("keeps the invitation reference RESTRICT, so an invitation with entries is never deleted (L24)", async () => {
      const { invitation } = await newPublished();
      await prisma.guestbookEntry.create({
        data: { invitationId: invitation.id, ...ENTRY },
      });

      await assert.rejects(
        prisma.invitation.delete({ where: { id: invitation.id } }),
        /GuestbookEntry_invitationId_fkey/,
      );
    });
  });

  describe("the wall of messages", () => {
    it("answers the visible entries newest first, at most 50, and never one the owner hid", async () => {
      const { invitation } = await newPublished();
      for (let index = 0; index < 52; index += 1) {
        await prisma.guestbookEntry.create({
          data: {
            invitationId: invitation.id,
            authorName: `Invitado ${index}`,
            message: `Mensaje ${index}`,
            createdAt: new Date(Date.UTC(2026, 11, 1, 10, index)),
          },
        });
      }
      await prisma.guestbookEntry.create({
        data: {
          invitationId: invitation.id,
          authorName: "Oculto",
          message: "No debe verse",
          hidden: true,
          createdAt: new Date(Date.UTC(2026, 11, 1, 23, 0)),
        },
      });

      const visible = await guestbook.findVisible(invitation.id);

      assert.equal(visible.length, 50);
      assert.equal(visible[0]?.authorName, "Invitado 51");
      assert.equal(visible[49]?.authorName, "Invitado 2");
      assert.equal(
        visible.some((entry) => entry.authorName === "Oculto"),
        false,
      );
      assert.deepEqual(await guestbook.readVisibleEntries(invitation.id), [
        { authorName: "Invitado 51", message: "Mensaje 51" },
        { authorName: "Invitado 50", message: "Mensaje 50" },
        ...visible
          .slice(2)
          .map((entry) => ({ authorName: entry.authorName, message: entry.message })),
      ]);
    });

    it("never writes an entry of an unpublished or an expired invitation", async () => {
      const draft = await newPublished(["GUESTBOOK"], { publish: false });
      const expired = await newPublished(["GUESTBOOK"], {
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      });

      for (const invitation of [draft.invitation, expired.invitation]) {
        assert.equal(
          await guestbook.insert(invitation.id, ENTRY, new Date("2026-12-01T10:00:00.000Z")),
          false,
        );
        assert.equal(
          await prisma.guestbookEntry.count({ where: { invitationId: invitation.id } }),
          0,
        );
      }

      // The published one writes at the same instant.
      const published = await newPublished();
      assert.equal(
        await guestbook.insert(
          published.invitation.id,
          ENTRY,
          new Date("2026-12-01T10:00:00.000Z"),
        ),
        true,
      );
      assert.equal(
        await prisma.guestbookEntry.count({ where: { invitationId: published.invitation.id } }),
        1,
      );
    });

    it("signs through the use case, and answers the public read with the wall only while the package grants it", async () => {
      const granted = await newPublished();
      const basic = await newPublished([]);
      const submit = new SubmitPublicGuestbookEntryUseCase(
        invitations,
        catalog,
        guestbook,
        rateLimiter,
      );
      const publicRead = new GetPublicInvitationUseCase(
        invitations,
        catalog,
        undefined,
        undefined,
        guestbook,
      );

      assert.equal(
        await submit.execute({
          slug: granted.invitation.slug,
          authorName: "  Tía   Rosa ",
          message: "  ¡Felicidades!  ",
          honeypot: "",
          clientAddress: "198.18.0.41",
        }),
        true,
      );
      const page = await publicRead.execute(granted.invitation.slug);
      assert.deepEqual(page?.features.guestbook, [
        { authorName: "Tía   Rosa", message: "¡Felicidades!" },
      ]);

      // A package without the key answers no wall at all, and its write is refused without touching the store.
      const basicPage = await publicRead.execute(basic.invitation.slug);
      assert.equal(basicPage?.features.guestbook, null);
      await assert.rejects(
        submit.execute({
          slug: basic.invitation.slug,
          authorName: "Rosa",
          message: "Hola",
          honeypot: "",
          clientAddress: "198.18.0.41",
        }),
        /not accepting guestbook entries/,
      );
      assert.equal(
        await prisma.guestbookEntry.count({ where: { invitationId: basic.invitation.id } }),
        0,
      );
    });

    it("hides and shows an entry again through the owner's use cases, and answers null for a stranger", async () => {
      const { invitation, ownerId } = await newPublished();
      const stored = await prisma.guestbookEntry.create({
        data: { invitationId: invitation.id, ...ENTRY },
      });
      const read = new GetGuestbookEntriesUseCase(invitations, guestbook);
      const setHidden = new SetGuestbookEntryHiddenUseCase(invitations, guestbook);

      const before = await read.execute(ownerId, invitation.id);
      assert.deepEqual(
        { visible: before?.visibleCount, hidden: before?.hiddenCount },
        { visible: 1, hidden: 0 },
      );

      const hidden = await setHidden.execute({
        ownerId,
        id: invitation.id,
        entryId: stored.id,
        hidden: true,
      });
      assert.equal(hidden.status, "ok");
      assert.equal(
        await prisma.guestbookEntry.count({
          where: { invitationId: invitation.id, hidden: true },
        }),
        1,
      );
      assert.equal(await prisma.guestbookEntry.count({ where: { id: stored.id } }), 1);

      const shown = await setHidden.execute({
        ownerId,
        id: invitation.id,
        entryId: stored.id,
        hidden: false,
      });
      assert.equal(shown.status, "ok");
      // Idempotent: showing a visible entry keeps it visible, and hiding it twice keeps it hidden.
      assert.equal(
        (
          await setHidden.execute({
            ownerId,
            id: invitation.id,
            entryId: stored.id,
            hidden: false,
          })
        ).status,
        "ok",
      );

      // A stranger reads nothing and changes nothing.
      const stranger = await newOwner();
      assert.equal(await read.execute(stranger, invitation.id), null);
      assert.equal(
        (
          await setHidden.execute({
            ownerId: stranger,
            id: invitation.id,
            entryId: stored.id,
            hidden: true,
          })
        ).status,
        "invitation-not-found",
      );
      assert.equal(
        (
          await setHidden.execute({
            ownerId,
            id: invitation.id,
            entryId: randomUUID(),
            hidden: true,
          })
        ).status,
        "entry-not-found",
      );
      assert.equal(
        (await prisma.guestbookEntry.findUniqueOrThrow({ where: { id: stored.id } })).hidden,
        false,
      );
    });
  });

  describe("the rate limit on the shared store", () => {
    it("admits ten signatures per address and invitation, and refuses the eleventh", async () => {
      const { invitation } = await newPublished();
      const address = "198.18.0.51";

      for (let attempt = 1; attempt <= 10; attempt += 1) {
        assert.equal(await rateLimiter.consume(invitation.id, address), true, String(attempt));
      }
      assert.equal(await rateLimiter.consume(invitation.id, address), false);
      // Another address and another invitation keep their own budget.
      assert.equal(await rateLimiter.consume(invitation.id, "198.18.0.52"), true);
      const other = await newPublished();
      assert.equal(await rateLimiter.consume(other.invitation.id, address), true);
    });

    it("stores a hashed key: the address never appears in the RateLimit row", async () => {
      const { invitation } = await newPublished();
      await rateLimiter.consume(invitation.id, "198.18.0.61");

      const rows = await prisma.rateLimit.findMany({
        where: { key: { startsWith: `guestbook|${invitation.id}|` } },
      });

      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.key.includes("198.18.0.61"), false);
      assert.match(rows[0]?.key ?? "", /^guestbook\|[0-9a-f-]{36}\|[0-9a-f]{64}$/);
    });
  });
});
