import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { GetPublicInvitationUseCase } from "../application/invitation.use-cases";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { CatalogInvitationReader } from "./catalog-invitation-reader";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";

// The invitation feature data on real PostgreSQL (F1; S3, S4): the additive migration gives every existing row the
// default time zone and keeps the column NOT NULL; the one-to-one `InvitationFeatureSettings` table is keyed by the
// invitation, stores an E.164 phone or NULL, and refuses to lose its invitation silently; the repository round trip
// keeps the owner scope and the archived refusal of every other invitation write; and the public read returns the
// gated features in a bounded number of queries. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is shared with parallel
// suites: every row here carries a key made from this run's id, and only those rows are removed.

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

const PHONE_FORMAT = /InvitationFeatureSettings_whatsappPhone_format/;
const TIME_ZONE_FORMAT = /Invitation_timeZone_format/;
const PLAYLIST_URL_HTTPS = /InvitationFeatureSettings_playlistUrl_https/;
const PLAYLIST_COVER_URL_HTTPS = /InvitationFeatureSettings_playlistCoverUrl_https/;
const PLAYLIST_COVER = "https://i.scdn.co/image/ab67706f00000002f04528c743e20039ac4eff07";
const PLAYLIST_TITLE = "Today’s Top Hits";
const PHONE = "+525512345678";
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

/** The feature keys of every seeded package (prisma/catalog-seed.ts), which is what gating intersects with S4. */
const SEEDED_PACKAGE_FEATURES = {
  basic: ["COUNTDOWN", "MAP", "WHATSAPP"],
  premium: ["COUNTDOWN", "MUSIC", "GALLERY", "MAP", "RSVP", "WHATSAPP"],
  deluxe: [
    "COUNTDOWN",
    "MUSIC",
    "GALLERY",
    "MAP",
    "RSVP",
    "WHATSAPP",
    "GIFT_REGISTRY",
    "GUEST_LIST",
    "QR_PASS",
  ],
} as const;

const RENDERER = "birthday-poster-01";

describe("invitation feature data (real PostgreSQL)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaInvitationRepository(prisma);
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
      // The settings rows reference invitations with ON DELETE RESTRICT, so they go first.
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
      data: { email: `f1-features-${sequence}-${runId}@example.test` },
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

  /** A PUBLISHED version of a PUBLISHED template and an ACTIVE package that includes the given feature keys. */
  async function newCatalog(featureKeys: readonly string[]) {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `f1-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `f1-template-${sequence}-${runId}`,
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
        key: `f1-package-${sequence}-${runId}`,
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

  /** A slug unique to this run, shaped like the generator's output. */
  function newSlug(): string {
    sequence += 1;
    return `f1-${runId.slice(0, 8)}-${sequence}`;
  }

  /** An invitation created through the repository, as the create use case does (defaults only). */
  async function newDraft(featureKeys: readonly string[], ownerId?: string) {
    const owner = ownerId ?? (await newOwner());
    const catalogState = await newCatalog(featureKeys);
    const created = await repository.create({
      ownerId: owner,
      templateVersionId: catalogState.versionId,
      packageId: catalogState.packageId,
      slug: newSlug(),
      content: {},
      // The settings row's default party limit, stated explicitly like the use case does (M9 T13).
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    return { invitation: created, ownerId: owner, ...catalogState };
  }

  const stored = (id: string) => prisma.invitation.findUniqueOrThrow({ where: { id } });

  describe("the additive migration", () => {
    it("makes timeZone NOT NULL with the S4 default, so every existing row reads it", async () => {
      const columns = await prisma.$queryRaw<
        Array<{ is_nullable: string; column_default: string | null; data_type: string }>
      >`
        SELECT is_nullable, column_default, data_type
        FROM information_schema.columns
        WHERE table_name = 'Invitation' AND column_name = 'timeZone'
      `;

      assert.equal(columns.length, 1);
      assert.equal(columns[0]?.is_nullable, "NO");
      assert.match(String(columns[0]?.column_default), /America\/Mexico_City/);
      assert.equal(columns[0]?.data_type, "character varying");
    });

    it("gives the default to a row inserted without naming a zone, as a pre-migration row would", async () => {
      const ownerId = await newOwner();
      const catalogState = await newCatalog(SEEDED_PACKAGE_FEATURES.basic);
      const id = randomUUID();
      const slug = newSlug();
      invitationIds.push(id);

      const inserted = await prisma.$queryRaw<Array<{ timeZone: string }>>`
        INSERT INTO "Invitation" ("id", "ownerId", "templateVersionId", "packageId", "slug", "updatedAt")
        VALUES (${id}::uuid, ${ownerId}::uuid, ${catalogState.versionId}::uuid,
                ${catalogState.packageId}::uuid, ${slug}, CURRENT_TIMESTAMP)
        RETURNING "timeZone"
      `;

      assert.deepEqual(inserted, [{ timeZone: "America/Mexico_City" }]);
      assert.equal((await stored(id)).timeZone, "America/Mexico_City");
    });

    it("stores an allow-listed zone and refuses a value that is not zone-shaped", async () => {
      const { invitation } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);

      const changed = await prisma.invitation.update({
        where: { id: invitation.id },
        data: { timeZone: "America/Tijuana" },
      });
      assert.equal(changed.timeZone, "America/Tijuana");

      for (const bad of [
        "Mexico_City",
        "America/",
        "/Tijuana",
        "America//Tijuana",
        " America/Tijuana",
      ]) {
        await assert.rejects(
          prisma.invitation.update({ where: { id: invitation.id }, data: { timeZone: bad } }),
          TIME_ZONE_FORMAT,
          bad,
        );
      }
      assert.equal((await stored(invitation.id)).timeZone, "America/Tijuana");
    });

    it("adds nothing to an invitation until feature data is written, and keeps one settings row per invitation", async () => {
      const { invitation } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);
      assert.equal(
        await prisma.invitationFeatureSettings.count({ where: { invitationId: invitation.id } }),
        0,
      );

      await prisma.invitationFeatureSettings.create({
        data: { invitationId: invitation.id, whatsappPhone: PHONE },
      });

      await assert.rejects(
        prisma.invitationFeatureSettings.create({
          data: { invitationId: invitation.id, whatsappPhone: null },
        }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
      );
      assert.equal(
        await prisma.invitationFeatureSettings.count({ where: { invitationId: invitation.id } }),
        1,
      );
    });

    it("stores an E.164 phone or NULL and refuses every other shape", async () => {
      const { invitation } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);
      await prisma.invitationFeatureSettings.create({
        data: { invitationId: invitation.id, whatsappPhone: PHONE },
      });

      for (const bad of [
        "5512345678",
        "525512345678",
        "+0123456789",
        "+1234567",
        "+52 55 1234 5678",
        "",
      ]) {
        await assert.rejects(
          prisma.invitationFeatureSettings.update({
            where: { invitationId: invitation.id },
            data: { whatsappPhone: bad },
          }),
          PHONE_FORMAT,
          bad,
        );
      }
      // Seventeen characters: too wide for the column as well as not E.164.
      await assert.rejects(
        prisma.invitationFeatureSettings.update({
          where: { invitationId: invitation.id },
          data: { whatsappPhone: "+1234567890123456" },
        }),
        /too long|22001|InvitationFeatureSettings_whatsappPhone_format/,
      );

      const cleared = await prisma.invitationFeatureSettings.update({
        where: { invitationId: invitation.id },
        data: { whatsappPhone: null },
      });
      assert.equal(cleared.whatsappPhone, null);
      assert.ok(cleared.createdAt instanceof Date);
      assert.ok(cleared.updatedAt instanceof Date);
    });

    it("adds a nullable playlistUrl bounded to 500 characters with an https check", async () => {
      const columns = await prisma.$queryRaw<
        Array<{
          is_nullable: string;
          character_maximum_length: number | null;
          data_type: string;
        }>
      >`
        SELECT is_nullable, character_maximum_length, data_type
        FROM information_schema.columns
        WHERE table_name = 'InvitationFeatureSettings' AND column_name = 'playlistUrl'
      `;

      assert.equal(columns.length, 1);
      assert.equal(columns[0]?.is_nullable, "YES");
      assert.equal(columns[0]?.character_maximum_length, 500);
      assert.equal(columns[0]?.data_type, "character varying");

      // The domain refuses every non-https link; the column refuses one too, so a stored value is always https.
      const invitation = await newDraft(SEEDED_PACKAGE_FEATURES.premium);
      const created = await prisma.invitationFeatureSettings.create({
        data: { invitationId: invitation.invitation.id, playlistUrl: PLAYLIST },
      });
      assert.equal(created.playlistUrl, PLAYLIST);

      for (const bad of [
        "http://open.spotify.com/playlist/abc",
        "ftp://open.spotify.com/playlist/abc",
        "open.spotify.com/playlist/abc",
        "//open.spotify.com/playlist/abc",
        "HTTPS://open.spotify.com/playlist/abc",
        "",
      ]) {
        await assert.rejects(
          prisma.invitationFeatureSettings.update({
            where: { invitationId: invitation.invitation.id },
            data: { playlistUrl: bad },
          }),
          PLAYLIST_URL_HTTPS,
          bad,
        );
      }

      // 501 characters: too wide for the column as well as outside the contract.
      const tooLong = `https://open.spotify.com/${"a".repeat(480)}`;
      await assert.rejects(
        prisma.invitationFeatureSettings.update({
          where: { invitationId: invitation.invitation.id },
          data: { playlistUrl: tooLong },
        }),
        /too long|22001|InvitationFeatureSettings_playlistUrl_https/,
      );

      const cleared = await prisma.invitationFeatureSettings.update({
        where: { invitationId: invitation.invitation.id },
        data: { playlistUrl: null },
      });
      assert.equal(cleared.playlistUrl, null);
      assert.equal(cleared.whatsappPhone, null);
    });

    it("adds a nullable playlistTitle of 200 characters and a nullable playlistCoverUrl with an https check (S2)", async () => {
      const columns = await prisma.$queryRaw<
        Array<{
          column_name: string;
          is_nullable: string;
          character_maximum_length: number | null;
          data_type: string;
        }>
      >`
        SELECT column_name, is_nullable, character_maximum_length, data_type
        FROM information_schema.columns
        WHERE table_name = 'InvitationFeatureSettings'
          AND column_name IN ('playlistTitle', 'playlistCoverUrl')
        ORDER BY column_name
      `;

      // Both are additive and nullable: every row written before the migration reads NULL and renders today's card.
      assert.deepEqual(
        columns.map((column) => ({
          column_name: column.column_name,
          is_nullable: column.is_nullable,
          character_maximum_length: column.character_maximum_length,
          data_type: column.data_type,
        })),
        [
          {
            column_name: "playlistCoverUrl",
            is_nullable: "YES",
            character_maximum_length: 500,
            data_type: "character varying",
          },
          {
            column_name: "playlistTitle",
            is_nullable: "YES",
            character_maximum_length: 200,
            data_type: "character varying",
          },
        ],
      );

      const invitation = await newDraft(SEEDED_PACKAGE_FEATURES.premium);
      const created = await prisma.invitationFeatureSettings.create({
        data: {
          invitationId: invitation.invitation.id,
          playlistUrl: PLAYLIST,
          playlistTitle: PLAYLIST_TITLE,
          playlistCoverUrl: PLAYLIST_COVER,
        },
      });
      assert.equal(created.playlistTitle, PLAYLIST_TITLE);
      assert.equal(created.playlistCoverUrl, PLAYLIST_COVER);

      // The domain refuses a cover that is not https on an allow-listed host; the column refuses the scheme.
      for (const bad of [
        "http://i.scdn.co/image/abc",
        "i.scdn.co/image/abc",
        "//i.scdn.co/image/abc",
        "HTTPS://i.scdn.co/image/abc",
        "",
      ]) {
        await assert.rejects(
          prisma.invitationFeatureSettings.update({
            where: { invitationId: invitation.invitation.id },
            data: { playlistCoverUrl: bad },
          }),
          PLAYLIST_COVER_URL_HTTPS,
          bad,
        );
      }

      // 201 characters: too wide for the column, and wider than the domain would store.
      await assert.rejects(
        prisma.invitationFeatureSettings.update({
          where: { invitationId: invitation.invitation.id },
          data: { playlistTitle: "a".repeat(201) },
        }),
        /too long|22001/,
      );

      // The repository writes both columns through the same upsert as the link, and a clear removes them together.
      const { invitation: draft, ownerId } = await newDraft(SEEDED_PACKAGE_FEATURES.premium);
      const stored = await repository.updateFeatures(ownerId, draft.id, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: PLAYLIST,
        playlistTitle: PLAYLIST_TITLE,
        playlistCoverUrl: PLAYLIST_COVER,
      });
      assert.equal(stored?.playlistTitle, PLAYLIST_TITLE);
      assert.equal(stored?.playlistCoverUrl, PLAYLIST_COVER);
      assert.deepEqual(
        await prisma.invitationFeatureSettings.findUniqueOrThrow({
          where: { invitationId: draft.id },
          select: { playlistTitle: true, playlistCoverUrl: true },
        }),
        { playlistTitle: PLAYLIST_TITLE, playlistCoverUrl: PLAYLIST_COVER },
      );

      const cleared = await repository.updateFeatures(ownerId, draft.id, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: null,
        playlistTitle: null,
        playlistCoverUrl: null,
      });
      assert.equal(cleared?.playlistTitle, null);
      assert.equal(cleared?.playlistCoverUrl, null);
    });

    it("refuses to delete an invitation that still carries feature settings", async () => {
      const { invitation, ownerId } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);
      await prisma.invitationFeatureSettings.create({
        data: { invitationId: invitation.id, whatsappPhone: PHONE },
      });

      await assert.rejects(
        prisma.invitation.delete({ where: { id: invitation.id } }),
        (error: unknown) =>
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
      );
      assert.ok(await prisma.invitation.findUnique({ where: { id: invitation.id } }));

      // The explicit order a recovery or a test cleanup uses.
      await prisma.invitationFeatureSettings.delete({ where: { invitationId: invitation.id } });
      await prisma.invitation.delete({ where: { id: invitation.id } });
      invitationIds.splice(invitationIds.indexOf(invitation.id), 1);
      assert.equal(await prisma.invitation.count({ where: { ownerId } }), 0);
    });
  });

  describe("the repository round trip", () => {
    it("stores the zone and the normalized phone, and reads them back", async () => {
      const { invitation } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);
      assert.equal(invitation.timeZone, "America/Mexico_City");
      assert.equal(invitation.whatsappPhone, null);

      const updated = await repository.updateFeatures(invitation.ownerId, invitation.id, {
        timeZone: "America/Ojinaga",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
        playlistTitle: null,
        playlistCoverUrl: null,
      });

      assert.equal(updated?.timeZone, "America/Ojinaga");
      assert.equal(updated?.whatsappPhone, PHONE);
      assert.equal(updated?.playlistUrl, PLAYLIST);
      const row = await stored(invitation.id);
      assert.equal(row.timeZone, "America/Ojinaga");
      assert.deepEqual(
        await prisma.invitationFeatureSettings.findUniqueOrThrow({
          where: { invitationId: invitation.id },
          select: { whatsappPhone: true, playlistUrl: true },
        }),
        { whatsappPhone: PHONE, playlistUrl: PLAYLIST },
      );
      assert.equal(
        (await repository.findOwned(invitation.ownerId, invitation.id))?.whatsappPhone,
        PHONE,
      );
      assert.equal(
        (await repository.findOwned(invitation.ownerId, invitation.id))?.playlistUrl,
        PLAYLIST,
      );
    });

    it("clears the phone and the playlist link and keeps the settings row", async () => {
      const { invitation } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);
      await repository.updateFeatures(invitation.ownerId, invitation.id, {
        timeZone: "America/Merida",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
        playlistTitle: null,
        playlistCoverUrl: null,
      });

      const cleared = await repository.updateFeatures(invitation.ownerId, invitation.id, {
        timeZone: "America/Merida",
        whatsappPhone: null,
        playlistUrl: null,
        playlistTitle: null,
        playlistCoverUrl: null,
      });

      assert.equal(cleared?.whatsappPhone, null);
      assert.equal(cleared?.playlistUrl, null);
      const settings = await prisma.invitationFeatureSettings.findUniqueOrThrow({
        where: { invitationId: invitation.id },
      });
      assert.equal(settings.whatsappPhone, null);
      assert.equal(settings.playlistUrl, null);
    });

    it("refuses an archived invitation and leaves its stored feature data unchanged", async () => {
      const { invitation } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);
      await repository.updateFeatures(invitation.ownerId, invitation.id, {
        timeZone: "America/Cancun",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
        playlistTitle: null,
        playlistCoverUrl: null,
      });
      await repository.archive(invitation.ownerId, invitation.id);

      await assert.rejects(
        repository.updateFeatures(invitation.ownerId, invitation.id, {
          timeZone: "America/Tijuana",
          whatsappPhone: null,
          playlistUrl: null,
          playlistTitle: null,
          playlistCoverUrl: null,
        }),
        InvitationNotEditableError,
      );
      const row = await stored(invitation.id);
      assert.equal(row.timeZone, "America/Cancun");
      assert.deepEqual(
        await prisma.invitationFeatureSettings.findUniqueOrThrow({
          where: { invitationId: invitation.id },
          select: { whatsappPhone: true, playlistUrl: true },
        }),
        { whatsappPhone: PHONE, playlistUrl: PLAYLIST },
      );
    });

    it("answers null for another owner's invitation and changes nothing", async () => {
      const { invitation } = await newDraft(SEEDED_PACKAGE_FEATURES.basic);
      const otherOwner = await newOwner();

      for (const id of [invitation.id, UNKNOWN_ID]) {
        assert.equal(
          await repository.updateFeatures(otherOwner, id, {
            timeZone: "America/Tijuana",
            whatsappPhone: PHONE,
            playlistUrl: PLAYLIST,
            playlistTitle: null,
            playlistCoverUrl: null,
          }),
          null,
        );
      }
      assert.equal((await stored(invitation.id)).timeZone, "America/Mexico_City");
      assert.equal(
        await prisma.invitationFeatureSettings.count({ where: { invitationId: invitation.id } }),
        0,
      );
    });
  });

  describe("the gated public read", () => {
    const useCase = new GetPublicInvitationUseCase(repository, catalog);

    async function publish(
      featureKeys: readonly string[],
      features: {
        timeZone: string;
        whatsappPhone: string | null;
        playlistUrl: string | null;
        playlistTitle?: string | null;
        playlistCoverUrl?: string | null;
      } | null,
    ) {
      const draft = await newDraft(featureKeys);
      if (features !== null) {
        await repository.updateFeatures(draft.ownerId, draft.invitation.id, {
          playlistTitle: null,
          playlistCoverUrl: null,
          ...features,
        });
      }
      const published = await repository.publish(
        draft.ownerId,
        draft.invitation.id,
        new Date("2026-11-12T09:30:00.000Z"),
      );
      assert.ok(published);
      return draft.invitation.slug;
    }

    it("answers the stored time zone and the gated features of each seeded package", async () => {
      for (const [packageKey, featureKeys] of Object.entries(SEEDED_PACKAGE_FEATURES)) {
        const slug = await publish(featureKeys, {
          timeZone: "America/Tijuana",
          whatsappPhone: PHONE,
          playlistUrl: PLAYLIST,
        });

        const page = await useCase.execute(slug);

        assert.equal(page?.timeZone, "America/Tijuana", packageKey);
        // Basic grants no MUSIC and no GIFT_REGISTRY, Premium grants MUSIC, Deluxe grants both (S7).
        assert.deepEqual(
          page?.features,
          {
            countdown: true,
            map: true,
            calendar: true,
            whatsapp: { phone: PHONE },
            music:
              packageKey === "basic"
                ? null
                : { url: PLAYLIST, provider: "spotify", title: null, coverUrl: null },
            giftRegistry: packageKey === "deluxe",
            gallery: [],
            // Premium grants RSVP and no guest list; Deluxe grants the guest list, which replaces the form.
            rsvp: {
              mode:
                packageKey === "deluxe" ? "guest-list" : packageKey === "premium" ? "open" : null,
              deadline: null,
              partyLimit: 4,
              // Deluxe also grants the guest list's access pass (M6 G2).
              qrPass: packageKey === "deluxe",
            },
          },
          packageKey,
        );
      }
    });

    it("drops WhatsApp while no phone is stored and keeps the music the package grants", async () => {
      const slug = await publish(SEEDED_PACKAGE_FEATURES.premium, {
        timeZone: "America/Mexico_City",
        whatsappPhone: null,
        playlistUrl: PLAYLIST,
      });

      const page = await useCase.execute(slug);

      assert.deepEqual(page?.features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: null,
        music: { url: PLAYLIST, provider: "spotify", title: null, coverUrl: null },
        giftRegistry: false,
        gallery: [],
        rsvp: { mode: "open", deadline: null, partyLimit: 4, qrPass: false },
      });
    });

    it("drops music while no playlist link is stored, whatever the package includes", async () => {
      const slug = await publish(SEEDED_PACKAGE_FEATURES.deluxe, {
        timeZone: "America/Mexico_City",
        whatsappPhone: PHONE,
        playlistUrl: null,
      });

      const page = await useCase.execute(slug);

      assert.deepEqual(page?.features, {
        countdown: true,
        map: true,
        calendar: true,
        whatsapp: { phone: PHONE },
        music: null,
        giftRegistry: true,
        gallery: [],
        rsvp: { mode: "guest-list", deadline: null, partyLimit: 4, qrPass: true },
      });
    });

    it("keeps a stored phone and a stored link private when the package grants neither", async () => {
      const slug = await publish(["COUNTDOWN"], {
        timeZone: "America/Cancun",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
        playlistTitle: null,
        playlistCoverUrl: null,
      });

      const page = await useCase.execute(slug);

      assert.equal(page?.timeZone, "America/Cancun");
      assert.deepEqual(page?.features, {
        countdown: true,
        map: false,
        calendar: true,
        whatsapp: null,
        music: null,
        giftRegistry: false,
        gallery: [],
        rsvp: { mode: null, deadline: null, partyLimit: 4, qrPass: false },
      });
      assert.equal(JSON.stringify(page).includes(PHONE), false);
      assert.equal(JSON.stringify(page).includes(PLAYLIST), false);
    });

    it("answers only the gated feature keys when the package includes everything", async () => {
      const slug = await publish(SEEDED_PACKAGE_FEATURES.deluxe, {
        timeZone: "America/Mazatlan",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      });

      const page = await useCase.execute(slug);

      // Nothing about the package leaks: no key list, no package id, no name (S4, A7).
      assert.deepEqual(Object.keys(page?.features ?? {}).sort(), [
        "calendar",
        "countdown",
        "gallery",
        "giftRegistry",
        "map",
        "music",
        "rsvp",
        "whatsapp",
      ]);
      assert.deepEqual(Object.keys(page ?? {}).sort(), [
        "componentKey",
        "configuration",
        "content",
        "features",
        // The stored id is the application's own field (M9 T11; S7), so the public read can count one opening; the REST
        // mapper builds the guest's body field by field and never answers it (the presentation suite asserts the body's
        // exact key set).
        "invitationId",
        "places",
        "publishedAt",
        "slug",
        "timeZone",
      ]);
    });

    it("resolves a public page in a bounded number of queries, whatever the package includes", async () => {
      const slug = await publish(SEEDED_PACKAGE_FEATURES.deluxe, {
        timeZone: "America/Tijuana",
        whatsappPhone: PHONE,
        playlistUrl: PLAYLIST,
      });
      const counted = new PrismaClient({
        datasources: { db: { url: requireLocalDatabaseUrl() } },
        log: [{ emit: "event", level: "query" }],
      });
      const queries: string[] = [];
      counted.$on("query", (event) => queries.push(event.query));

      try {
        const page = await new GetPublicInvitationUseCase(
          new PrismaInvitationRepository(counted),
          new CatalogInvitationReader(new PrismaCatalogPublicReader(counted)),
        ).execute(slug);

        assert.equal(page?.slug, slug);
        // Seven bounded reads and not one more, whatever the package includes: the slug read (the invitation and
        // its one-to-one settings plus its stored points, each one relation query regardless of how many points or
        // feature keys the row has), the pinned version's render data, and the package entitlements (the package,
        // its feature links, and their feature keys). Nothing here grows with the number of feature keys.
        assert.equal(queries.length, 7, queries.join("\n---\n"));
        for (const table of [
          "Invitation",
          "InvitationFeatureSettings",
          "InvitationPlace",
          "TemplateVersion",
          "Package",
          "PackageFeature",
          "Feature",
        ]) {
          assert.equal(
            queries.filter((query) => query.includes(`FROM "public"."${table}"`)).length,
            1,
            table,
          );
        }
      } finally {
        await counted.$disconnect();
      }
    });
  });
});
