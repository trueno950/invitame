import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { createInvitationAccessTokens } from "../application/invitation-access-token";
import { InvitationPasswordGate } from "../application/invitation-lock";
import {
  hashInvitationPassword,
  verifyInvitationPassword,
} from "../application/invitation-password";
import {
  ClearInvitationPasswordUseCase,
  SetInvitationPasswordUseCase,
} from "../application/invitation-password.use-cases";
import type { CatalogPackageEntitlements } from "../application/invitation-catalog";
import type { InvitationCatalog } from "../application/invitation-catalog";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { PrismaInvitationLockRepository } from "./prisma-invitation-lock.repository";
import { PrismaInvitationRepository } from "./prisma-invitation.repository";

// The access code on real PostgreSQL (F13; S2.13, L18.1, L18.2, L18.5): the two additive columns of the migration, the
// CHECK constraints that keep a row written around the API from storing a value no verifier can read, the writes that
// raise the version inside their own statement, the owner scoping and the archived refusal, the lock read by current and
// previous address, and the catalog key the migration and the seed grant to Deluxe.
//
// Runs only through `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is shared with
// parallel suites: every row here carries a key made from this run's id, and only those rows are removed.

const RENDERER = "birthday-poster-01";

/** A catalog that grants `PASSWORD_PROTECTION` (or not), so the use case's gate is exercised against a real invitation. */
class FixedCatalog implements InvitationCatalog {
  constructor(private readonly keys: readonly string[]) {}

  async findPackageEntitlements(): Promise<CatalogPackageEntitlements | null> {
    return { status: "ACTIVE", includedFeatureKeys: this.keys, durationDays: 180 };
  }

  findPublishedVersion = async () => null;
  findVersionSchema = async () => null;
  findVersionRenderData = async () => null;
  isRendererRegistered = (): boolean => false;
}

describe("the access code on real PostgreSQL (F13; S2.13, L18.1, L18.2)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const invitations = new PrismaInvitationRepository(prisma);
  const locks = new PrismaInvitationLockRepository(prisma);
  const tokens = createInvitationAccessTokens(randomUUID());
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
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitationSlugAlias.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.feature.deleteMany({ where: { id: { in: featureIds } } });
      await prisma.rateLimit.deleteMany({
        where: {
          OR: invitationIds.map((id) => ({ key: { startsWith: `unlock|invitation:${id}|` } })),
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
      data: { email: `f13-password-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);

    return created.id;
  }

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
      data: { key: `f13-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `f13-template-${sequence}-${runId}`,
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
        key: `f13-package-${sequence}-${runId}`,
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

    return `f13-${runId.slice(0, 8)}-${sequence}`;
  }

  /** An invitation created through the repository, published unless the case says otherwise. */
  async function newInvitation(
    options: {
      featureKeys?: readonly string[];
      publish?: boolean;
      content?: Record<string, unknown>;
    } = {},
  ) {
    const ownerId = await newOwner();
    const catalogState = await newCatalog(options.featureKeys ?? ["PASSWORD_PROTECTION"]);
    const created = await invitations.create({
      ownerId,
      templateVersionId: catalogState.versionId,
      packageId: catalogState.packageId,
      slug: newSlug(),
      content: options.content ?? { coupleNameOne: "Ana", coupleNameTwo: "Luis" },
      rsvpPartyLimit: 4,
    });
    invitationIds.push(created.id);
    if (options.publish !== false) {
      assert.ok(
        await invitations.publish(ownerId, created.id, new Date("2026-12-01T10:00:00.000Z")),
      );
    }

    return { invitation: created, ownerId, ...catalogState };
  }

  describe("the additive migration", () => {
    it("starts every invitation with no access code and version zero", async () => {
      const { invitation, ownerId } = await newInvitation({ publish: false });

      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });

      assert.equal(stored.passwordHash, null);
      assert.equal(stored.passwordVersion, 0);
      // The owned read states it without carrying the hash.
      const read = await invitations.findOwned(ownerId, invitation.id);
      assert.equal(read?.passwordProtected, false);
      assert.equal(JSON.stringify(read).includes("passwordHash"), false);
    });

    it("refuses a stored value that is not the encoded scrypt form, and a negative version", async () => {
      const { invitation } = await newInvitation({ publish: false });

      await assert.rejects(
        () =>
          prisma.invitation.update({
            where: { id: invitation.id },
            data: { passwordHash: "clave-familiar" },
          }),
        /Invitation_password_hash_format/,
      );
      await assert.rejects(
        () =>
          prisma.invitation.update({
            where: { id: invitation.id },
            data: { passwordVersion: -1 },
          }),
        /Invitation_password_version/,
      );
    });

    it("grants the new catalog key to the seeded Deluxe package and to no other seeded package", async () => {
      // The migration inserts the key and the Deluxe link; the seed declares them for a fresh database (L16).
      const granted = await prisma.packageFeature.findMany({
        where: {
          feature: { key: "PASSWORD_PROTECTION" },
          package: { key: { in: ["basic", "premium", "deluxe"] } },
        },
        select: { package: { select: { key: true } } },
      });

      assert.deepEqual(
        granted.map((link) => link.package.key).sort(),
        ["deluxe"],
        "only Deluxe grants PASSWORD_PROTECTION",
      );
    });
  });

  describe("the owner's two writes", () => {
    it("stores only the hash, raises the version on every set, and answers the state", async () => {
      const { invitation, ownerId } = await newInvitation({ publish: false });
      const set = new SetInvitationPasswordUseCase(
        invitations,
        new FixedCatalog(["PASSWORD_PROTECTION"]),
      );

      assert.deepEqual(await set.execute({ ownerId, id: invitation.id, password: "primera" }), {
        passwordProtected: true,
        passwordVersion: 1,
      });
      assert.deepEqual(await set.execute({ ownerId, id: invitation.id, password: "segunda" }), {
        passwordProtected: true,
        passwordVersion: 2,
      });

      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
      assert.ok(stored.passwordHash);
      assert.equal(stored.passwordHash.startsWith("scrypt$"), true);
      assert.equal(stored.passwordHash.includes("primera"), false);
      assert.equal(stored.passwordHash.includes("segunda"), false);
      // Only the last code opens the invitation, and only through the stored hash.
      assert.equal(await verifyInvitationPassword(stored.passwordHash, "segunda"), true);
      assert.equal(await verifyInvitationPassword(stored.passwordHash, "primera"), false);
      assert.equal((await invitations.findOwned(ownerId, invitation.id))?.passwordProtected, true);
    });

    it("refuses a package without the key, and stores nothing (L18.5)", async () => {
      const { invitation, ownerId } = await newInvitation({
        publish: false,
        featureKeys: ["ITINERARY"],
      });

      await assert.rejects(
        () =>
          new SetInvitationPasswordUseCase(invitations, new FixedCatalog(["ITINERARY"])).execute({
            ownerId,
            id: invitation.id,
            password: "clave-familiar",
          }),
        { name: "InvitationPasswordNotAvailableError" },
      );
      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
      assert.equal(stored.passwordHash, null);
      assert.equal(stored.passwordVersion, 0);
    });

    it("removes the code and raises the version, and a package that withdrew the key still allows it", async () => {
      const { invitation, ownerId } = await newInvitation({ publish: false });
      await new SetInvitationPasswordUseCase(
        invitations,
        new FixedCatalog(["PASSWORD_PROTECTION"]),
      ).execute({ ownerId, id: invitation.id, password: "clave-familiar" });

      const removed = await new ClearInvitationPasswordUseCase(invitations).execute({
        ownerId,
        id: invitation.id,
      });

      assert.deepEqual(removed, { passwordProtected: false, passwordVersion: 2 });
      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
      assert.equal(stored.passwordHash, null);
      assert.equal(stored.passwordVersion, 2);
    });

    it("refuses an archived invitation and another owner's invitation", async () => {
      const { invitation, ownerId } = await newInvitation({ publish: false });
      const foreignOwner = await newOwner();
      const set = new SetInvitationPasswordUseCase(
        invitations,
        new FixedCatalog(["PASSWORD_PROTECTION"]),
      );

      assert.equal(
        await set.execute({ ownerId: foreignOwner, id: invitation.id, password: "clave-familiar" }),
        null,
      );
      assert.equal(
        await new ClearInvitationPasswordUseCase(invitations).execute({
          ownerId: foreignOwner,
          id: invitation.id,
        }),
        null,
      );

      assert.ok(await invitations.archive(ownerId, invitation.id));
      await assert.rejects(
        () => set.execute({ ownerId, id: invitation.id, password: "clave-familiar" }),
        InvitationNotEditableError,
      );
      await assert.rejects(
        () =>
          new ClearInvitationPasswordUseCase(invitations).execute({ ownerId, id: invitation.id }),
        InvitationNotEditableError,
      );
    });
  });

  describe("the lock read and the gate (L18.2)", () => {
    it("reads the lock by current address and by a previous one, and only while the invitation is published", async () => {
      const { invitation, ownerId } = await newInvitation();
      const hash = await hashInvitationPassword("clave-familiar");
      await invitations.setPassword(ownerId, invitation.id, hash);

      const byCurrent = await locks.findLockBySlug(invitation.slug);
      assert.equal(byCurrent?.invitationId, invitation.id);
      assert.equal(byCurrent?.passwordHash, hash);
      assert.equal(byCurrent?.passwordVersion, 1);
      assert.deepEqual(byCurrent?.content, { coupleNameOne: "Ana", coupleNameTwo: "Luis" });

      // A previous address of the same invitation answers the same lock (F11; L15.2).
      const previousSlug = newSlug();
      assert.ok(await invitations.renameSlug(ownerId, invitation.id, previousSlug));
      const byPrevious = await locks.findLockBySlug(invitation.slug);
      assert.equal(byPrevious?.invitationId, invitation.id);
      assert.equal((await locks.findLockBySlug(previousSlug))?.invitationId, invitation.id);

      // A draft is not visible, so it has no lock to read, and neither does an unknown address.
      const { invitation: draft } = await newInvitation({ publish: false });
      assert.equal(await locks.findLockBySlug(draft.slug), null);
      assert.equal(await locks.findLockBySlug(`f13-unknown-${runId}`), null);
    });

    it("locks a stored code and opens it with a token minted for the stored version", async () => {
      const { invitation, ownerId } = await newInvitation();
      await invitations.setPassword(ownerId, invitation.id, await hashInvitationPassword("clave"));

      const gate = new InvitationPasswordGate(locks, tokens);
      assert.deepEqual(await gate.check(invitation.slug, undefined), {
        locked: true,
        displayName: "Ana y Luis",
      });
      assert.deepEqual(await gate.check(invitation.slug, tokens.mint(invitation.id, 1).token), {
        locked: false,
      });

      // A replacement raises the version, so the token minted for the first code stops opening it.
      await invitations.setPassword(ownerId, invitation.id, await hashInvitationPassword("otra"));
      assert.deepEqual(await gate.check(invitation.slug, tokens.mint(invitation.id, 1).token), {
        locked: true,
        displayName: "Ana y Luis",
      });

      // And a removal opens it again, because there is no code to enforce.
      await invitations.clearPassword(ownerId, invitation.id);
      assert.deepEqual(await gate.check(invitation.slug, undefined), { locked: false });
    });

    it("keeps a code that is stored protecting after the catalog withdrew the key (L18.5)", async () => {
      const { invitation, ownerId } = await newInvitation();
      await invitations.setPassword(ownerId, invitation.id, await hashInvitationPassword("clave"));
      // The package no longer grants the key: the gate never reads the catalog, so the stored code still protects.
      await prisma.packageFeature.deleteMany({ where: { packageId: invitation.packageId } });

      const gate = new InvitationPasswordGate(locks, tokens);
      assert.deepEqual(await gate.check(invitation.slug, undefined), {
        locked: true,
        displayName: "Ana y Luis",
      });
    });
  });
});
