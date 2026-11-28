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
import {
  INVITATION_UNLOCK_CLIENT_RATE_LIMIT,
  INVITATION_UNLOCK_CLIENT_SCOPE,
  INVITATION_UNLOCK_RATE_LIMIT,
  INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX,
  INVITATION_UNLOCK_VERIFICATION_RATE_LIMIT,
  INVITATION_UNLOCK_VERIFICATION_SCOPE,
  invitationUnlockRateLimitKey,
  invitationUnlockScope,
} from "../application/invitation-unlock-rate-limiter";
import type { CatalogPackageEntitlements } from "../application/invitation-catalog";
import type { InvitationCatalog } from "../application/invitation-catalog";
import { InvitationNotEditableError } from "../domain/invitation.errors";
import { PrismaInvitationLockRepository } from "./prisma-invitation-lock.repository";
import { PrismaInvitationUnlockRateLimiter } from "./prisma-invitation-unlock-rate-limiter";
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
  const rateLimitKeys: string[] = [];
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
          OR: [
            ...(rateLimitKeys.length === 0 ? [] : [{ key: { in: rateLimitKeys } }]),
            ...invitationIds.map((id) => ({ key: { startsWith: `unlock|invitation:${id}|` } })),
          ],
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
      // The hash the row stores is the hash the lock answers, and the version travels with it.
      assert.equal(byCurrent?.passwordHash, hash);
      assert.equal(byCurrent?.passwordVersion, 1);
      assert.deepEqual(byCurrent?.content, { coupleNameOne: "Ana", coupleNameTwo: "Luis" });
      // The current address needs no redirect.
      assert.equal(byCurrent?.redirectTo, null);

      // A previous address of the same invitation answers the same lock and carries the current address to redirect to
      // before the lock screen (F11; L15.2, L15.3).
      const previousSlug = newSlug();
      assert.ok(await invitations.renameSlug(ownerId, invitation.id, previousSlug));
      const byCurrentAfterRename = await locks.findLockBySlug(previousSlug);
      assert.equal(byCurrentAfterRename?.invitationId, invitation.id);
      assert.equal(byCurrentAfterRename?.passwordHash, hash);
      assert.equal(byCurrentAfterRename?.redirectTo, null);
      const byPrevious = await locks.findLockBySlug(invitation.slug);
      assert.equal(byPrevious?.invitationId, invitation.id);
      assert.equal(byPrevious?.passwordHash, hash);
      assert.equal(byPrevious?.redirectTo, previousSlug);

      // An archived invitation keeps no visible lock, exactly like the public read.
      const { invitation: archived, ownerId: archivedOwner } = await newInvitation();
      await invitations.setPassword(
        archivedOwner,
        archived.id,
        await hashInvitationPassword("clave"),
      );
      assert.ok(await invitations.archive(archivedOwner, archived.id));
      assert.equal(await locks.findLockBySlug(archived.slug), null);

      // A draft is not visible, so it has no lock to read, and neither does an unknown address.
      const { invitation: draft } = await newInvitation({ publish: false });
      assert.equal(await locks.findLockBySlug(draft.slug), null);
      assert.equal(await locks.findLockBySlug(`f13-unknown-${runId}`), null);

      // A previous address whose invitation was unpublished answers no lock either, exactly like the public read: the
      // alias is kept, and the status alone decides whether anything is served.
      const { invitation: reopened, ownerId: reopenedOwner } = await newInvitation();
      await invitations.setPassword(
        reopenedOwner,
        reopened.id,
        await hashInvitationPassword("clave"),
      );
      const leftBehind = reopened.slug;
      assert.ok(await invitations.renameSlug(reopenedOwner, reopened.id, newSlug()));
      assert.ok(await invitations.unpublish(reopenedOwner, reopened.id));
      assert.equal(await locks.findLockBySlug(leftBehind), null);
    });

    it("locks a stored code and opens it with a token minted for the stored version", async () => {
      const { invitation, ownerId } = await newInvitation();
      await invitations.setPassword(ownerId, invitation.id, await hashInvitationPassword("clave"));

      const gate = new InvitationPasswordGate(locks, tokens);
      assert.deepEqual(await gate.check(invitation.slug, undefined), {
        locked: true,
        displayName: "Ana y Luis",
        redirectTo: null,
      });
      assert.deepEqual(await gate.check(invitation.slug, tokens.mint(invitation.id, 1).token), {
        locked: false,
      });

      // A replacement raises the version, so the token minted for the first code stops opening it.
      await invitations.setPassword(ownerId, invitation.id, await hashInvitationPassword("otra"));
      assert.deepEqual(await gate.check(invitation.slug, tokens.mint(invitation.id, 1).token), {
        locked: true,
        displayName: "Ana y Luis",
        redirectTo: null,
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
        redirectTo: null,
      });
    });
  });

  describe("the unlock limiter on the shared RateLimit table (L18.3)", () => {
    const limiter = new PrismaInvitationUnlockRateLimiter(prisma);

    it("counts 10 failures per client address and requested address, and gives a success back", async () => {
      assert.deepEqual(INVITATION_UNLOCK_RATE_LIMIT, { window: 900, max: 10 });
      assert.deepEqual(INVITATION_UNLOCK_CLIENT_RATE_LIMIT, { window: 900, max: 30 });
      const scope = invitationUnlockScope(`f13-limit-${runId}`);
      const address = `f13-limit-address-a-${runId}`;
      const key = invitationUnlockRateLimitKey(scope, address);
      rateLimitKeys.push(key);

      for (let attempt = 0; attempt < INVITATION_UNLOCK_RATE_LIMIT.max; attempt += 1) {
        assert.equal(await limiter.consume(scope, address), true, `attempt ${attempt + 1}`);
      }
      // Over the cap the store answers false and writes nothing.
      assert.equal(await limiter.consume(scope, address), false);
      assert.equal((await prisma.rateLimit.findUniqueOrThrow({ where: { key } })).count, 10);

      // A successful unlock refunds its own count, so only failures stay counted.
      await limiter.refund(scope, address);
      assert.equal((await prisma.rateLimit.findUniqueOrThrow({ where: { key } })).count, 9);
      assert.equal(await limiter.consume(scope, address), true);

      // The key holds the prefix and no plain address or slug.
      assert.equal(key.startsWith(INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX), true);
      assert.equal(key.includes(address), false);
      assert.equal(key.includes("f13-limit-"), false);
    });

    it("counts 30 failures across every address under the shared scope", async () => {
      const address = `f13-limit-address-b-${runId}`;
      const key = invitationUnlockRateLimitKey(INVITATION_UNLOCK_CLIENT_SCOPE, address);
      rateLimitKeys.push(key);

      for (let attempt = 0; attempt < INVITATION_UNLOCK_CLIENT_RATE_LIMIT.max; attempt += 1) {
        assert.equal(await limiter.consume(INVITATION_UNLOCK_CLIENT_SCOPE, address), true);
      }
      assert.equal(await limiter.consume(INVITATION_UNLOCK_CLIENT_SCOPE, address), false);
      assert.equal(key.startsWith(`${INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX}all|`), true);
      assert.equal((await prisma.rateLimit.findUniqueOrThrow({ where: { key } })).count, 30);
    });

    it("counts 300 verifications across every address under the ceiling scope (L33)", async () => {
      assert.deepEqual(INVITATION_UNLOCK_VERIFICATION_RATE_LIMIT, { window: 900, max: 300 });
      const address = `f13-ceiling-address-${runId}`;
      const key = invitationUnlockRateLimitKey(INVITATION_UNLOCK_VERIFICATION_SCOPE, address);
      rateLimitKeys.push(key);

      for (let attempt = 0; attempt < INVITATION_UNLOCK_VERIFICATION_RATE_LIMIT.max; attempt += 1) {
        assert.equal(
          await limiter.consume(INVITATION_UNLOCK_VERIFICATION_SCOPE, address),
          true,
          `verification ${attempt + 1}`,
        );
      }
      // The three-hundred-first verification is refused before the hasher, and writes nothing.
      assert.equal(await limiter.consume(INVITATION_UNLOCK_VERIFICATION_SCOPE, address), false);
      assert.equal(key.startsWith(`${INVITATION_UNLOCK_RATE_LIMIT_KEY_PREFIX}verification|`), true);
      assert.equal(key.includes(address), false);
      assert.equal((await prisma.rateLimit.findUniqueOrThrow({ where: { key } })).count, 300);
    });

    it("leaves no row behind when a refund reaches zero, so an empty window never anchors the next attempt", async () => {
      const scope = invitationUnlockScope(`f13-refund-${runId}`);
      const address = `f13-refund-address-${runId}`;
      const key = invitationUnlockRateLimitKey(scope, address);
      rateLimitKeys.push(key);

      assert.equal(await limiter.consume(scope, address), true);
      await limiter.refund(scope, address);

      // A row left at count 0 keeps the window start of the attempt it no longer counts, so the next attempt inside that
      // window would inherit the old anchor instead of opening a fresh one: the refund of the last count removes it.
      assert.equal(await prisma.rateLimit.findUnique({ where: { key } }), null);

      // And the address still counts normally afterwards, from a window of its own.
      assert.equal(await limiter.consume(scope, address), true);
      assert.equal((await prisma.rateLimit.findUniqueOrThrow({ where: { key } })).count, 1);
    });
  });

  describe("the owner's writes close the archive race (A2, F13)", () => {
    it("refuses a code whose statement lost a race to an archive, leaving the archived row without one", async () => {
      const { invitation, ownerId } = await newInvitation({ publish: false });
      const hash = await hashInvitationPassword("clave-familiar");
      let markArchived!: () => void;
      const archivedRowWritten = new Promise<void>((resolve) => {
        markArchived = resolve;
      });
      let releaseArchive!: () => void;
      const hold = new Promise<void>((resolve) => {
        releaseArchive = resolve;
      });
      // The archive holds the row lock until the write has reached it; the write then re-checks its own `WHERE` against
      // the committed status, which is exactly the race the previous read-then-write left open.
      const archiving = prisma.$transaction(
        async (tx) => {
          await tx.invitation.updateMany({
            where: { id: invitation.id },
            data: { status: "ARCHIVED", archivedAt: new Date() },
          });
          markArchived();
          await hold;
        },
        { timeout: 15_000 },
      );

      await archivedRowWritten;
      const writing = invitations.setPassword(ownerId, invitation.id, hash);
      await new Promise((resolve) => setTimeout(resolve, 100));
      releaseArchive();
      await archiving;

      await assert.rejects(writing, InvitationNotEditableError);
      const stored = await prisma.invitation.findUniqueOrThrow({
        where: { id: invitation.id },
        select: { status: true, passwordHash: true, passwordVersion: true },
      });
      assert.equal(stored.status, "ARCHIVED");
      assert.equal(stored.passwordHash, null, "no code lands on an archived invitation");
      assert.equal(stored.passwordVersion, 0);
    });
  });
});
