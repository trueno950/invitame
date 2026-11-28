import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import {
  AcceptCollaborationUseCase,
  InviteCollaboratorUseCase,
  ListInvitationCollaboratorsUseCase,
  RevokeCollaboratorUseCase,
  UpdateCollaboratorPermissionsUseCase,
} from "../application/collaborator.use-cases";
import {
  CollaboratorAlreadyInvitedError,
  CollaboratorFeatureNotAvailableError,
  CollaboratorLimitReachedError,
  CollaborationRefusedError,
} from "../application/collaborator.errors";
import { StoredInvitationAccessResolver } from "../application/invitation-access";
import { collaboratorTokenHash } from "../application/collaborator-token";
import { PrismaInvitationCollaboratorRepository } from "./prisma-invitation-collaborator.repository";

// The co-host table on real PostgreSQL (F12; S2.12, L17.1): the columns and defaults of the additive migration, the
// CHECK constraints Prisma cannot express, the partial unique index over (invitationId, email) among non-revoked rows,
// the trigger that refuses a sixth non-revoked collaborator of one invitation, the `CO_HOSTS` catalog key the same
// migration inserts, and — through the API's own adapter and use cases — the acceptance that burns a token and the
// refusal every unusable link shares. Runs only through `pnpm --filter @invitame/api test:db` with an explicit
// DATABASE_URL. The database is shared with parallel suites: every row here carries a key made from this run's id, and
// only those rows are removed.

const RENDERER = "birthday-poster-01";
/** The instant every command of this suite reads as "now": one fixed moment, so expiry is observable. */
const NOW = new Date("2026-12-14T12:00:00.000Z");

describe("invitation collaborators on real PostgreSQL (F12; L17.1)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const collaborators = new PrismaInvitationCollaboratorRepository(prisma);
  const resolver = new StoredInvitationAccessResolver(collaborators);
  const emails = new InMemoryEmailSender();
  const delivery = new EmailDeliveryService(emails, new SystemEmailDeliveryRuntime());
  const links: string[] = [];
  const inviteCollaborator = new InviteCollaboratorUseCase(
    collaborators,
    delivery,
    (token) => {
      const url = `https://invitame.mx/colaboraciones/aceptar?token=${encodeURIComponent(token)}`;
      links.push(url);
      return url;
    },
    () => NOW,
  );
  const accept = new AcceptCollaborationUseCase(collaborators, () => NOW);
  const list = new ListInvitationCollaboratorsUseCase(collaborators);
  const updatePermissions = new UpdateCollaboratorPermissionsUseCase(collaborators);
  const revoke = new RevokeCollaboratorUseCase(collaborators, () => NOW);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      // Collaborators reference invitations with ON DELETE RESTRICT, so they go first.
      await prisma.invitationCollaborator.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.packageFeature.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newUser(label: string, email?: string): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: email ?? `f12-${label}-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  /** A PUBLISHED version of a PUBLISHED template and an ACTIVE package that grants `CO_HOSTS`. */
  async function newInvitation(ownerId?: string, featureKeys: readonly string[] = ["CO_HOSTS"]) {
    sequence += 1;
    const owner = ownerId ?? (await newUser("owner"));
    const category = await prisma.category.create({
      data: { key: `f12-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `f12-template-${sequence}-${runId}`,
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
    const granted = [];
    for (const key of featureKeys) {
      granted.push({
        featureId: (await prisma.feature.findUniqueOrThrow({ where: { key } })).id,
      });
    }
    const createdPackage = await prisma.package.create({
      data: {
        key: `f12-package-${sequence}-${runId}`,
        name: "Paquete",
        status: "ACTIVE",
        packageFeatures: { create: granted },
      },
    });
    packageIds.push(createdPackage.id);
    const invitation = await prisma.invitation.create({
      data: {
        ownerId: owner,
        templateVersionId: version.id,
        packageId: createdPackage.id,
        slug: `f12-${runId.slice(0, 8)}-${sequence}`,
      },
    });
    invitationIds.push(invitation.id);
    return { invitationId: invitation.id, ownerId: owner };
  }

  async function invite(
    invitationId: string,
    overrides: {
      email?: string;
      permissions?: readonly ("EDIT_CONTENT" | "VIEW_ATTENDANCE" | "PUBLISH")[];
      revokedAt?: Date | null;
      invitedAt?: Date;
      tokenHash?: string | null;
    } = {},
  ) {
    const invitedAt = overrides.invitedAt ?? new Date("2026-12-14T12:00:00.000Z");

    return prisma.invitationCollaborator.create({
      data: {
        invitationId,
        email: overrides.email ?? `f12-cohost-${randomUUID()}@example.test`,
        permissions: [...(overrides.permissions ?? ["EDIT_CONTENT"])],
        invitedAt,
        tokenHash:
          overrides.tokenHash === undefined
            ? randomUUID().replaceAll("-", "")
            : overrides.tokenHash,
        tokenExpiresAt: new Date(invitedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: overrides.revokedAt ?? null,
      },
    });
  }

  describe("the additive migration", () => {
    it("stores an invited row pending, with the address, permissions, and the seven-day token window", async () => {
      const { invitationId } = await newInvitation();
      const invitedAt = new Date("2026-12-14T12:00:00.000Z");

      const stored = await prisma.invitationCollaborator.create({
        data: {
          invitationId,
          email: "ana@example.test",
          permissions: ["EDIT_CONTENT", "PUBLISH"],
          invitedAt,
          tokenHash: "a".repeat(64),
          tokenExpiresAt: new Date("2026-12-21T12:00:00.000Z"),
        },
      });

      assert.equal(stored.email, "ana@example.test");
      assert.deepEqual(stored.permissions, ["EDIT_CONTENT", "PUBLISH"]);
      assert.equal(stored.userId, null);
      assert.equal(stored.acceptedAt, null);
      assert.equal(stored.revokedAt, null);
      assert.equal(stored.invitedAt.toISOString(), invitedAt.toISOString());
    });

    it("refuses an upper-case address, an empty permission set, and a token without a live window", async () => {
      const { invitationId } = await newInvitation();
      const invitedAt = new Date("2026-12-14T12:00:00.000Z");
      const base = {
        invitationId,
        email: "ana@example.test",
        permissions: ["EDIT_CONTENT"] as ["EDIT_CONTENT"],
        invitedAt,
        tokenHash: "b".repeat(64),
        tokenExpiresAt: new Date("2026-12-21T12:00:00.000Z"),
      };

      for (const data of [
        { ...base, email: "Ana@example.test" },
        { ...base, permissions: [] as [] },
        { ...base, tokenExpiresAt: null },
        { ...base, tokenExpiresAt: invitedAt },
      ]) {
        await assert.rejects(
          prisma.invitationCollaborator.create({ data }),
          /InvitationCollaborator_(email_lowercase|permissions_granted|token_expiry)|null constraint/i,
        );
      }
      assert.equal(await prisma.invitationCollaborator.count({ where: { invitationId } }), 0);
    });

    it("refuses an acceptance instant without the account that accepted, and the reverse", async () => {
      const { invitationId } = await newInvitation();

      await assert.rejects(
        invite(invitationId).then((row) =>
          prisma.invitationCollaborator.update({
            where: { id: row.id },
            data: { acceptedAt: new Date() },
          }),
        ),
        /InvitationCollaborator_acceptedAt_matches_user/,
      );

      const pending = await invite(invitationId);
      await assert.rejects(
        prisma.invitationCollaborator.update({
          where: { id: pending.id },
          data: { userId: await newUser("accepted") },
        }),
        /InvitationCollaborator_acceptedAt_matches_user/,
      );
    });

    it("invites one address once per invitation, and lets a revoked address be invited again", async () => {
      const { invitationId } = await newInvitation();
      const email = "repetida@example.test";
      const first = await invite(invitationId, { email });

      await assert.rejects(
        invite(invitationId, { email }),
        /InvitationCollaborator_invitationId_email_key|Unique constraint/,
      );

      await prisma.invitationCollaborator.update({
        where: { id: first.id },
        data: { revokedAt: new Date(), tokenHash: null, tokenExpiresAt: null },
      });

      // The revoked row left the partial index, so the same address may be invited again.
      const second = await invite(invitationId, { email });
      assert.notEqual(second.id, first.id);
      assert.equal(
        await prisma.invitationCollaborator.count({ where: { invitationId, revokedAt: null } }),
        1,
      );
    });

    it("keeps at most five non-revoked collaborators, and a revoked one frees its place", async () => {
      const { invitationId } = await newInvitation();
      const stored = [];

      for (let index = 0; index < 5; index += 1) {
        stored.push(await invite(invitationId));
      }

      await assert.rejects(
        invite(invitationId),
        /An invitation keeps at most five non-revoked collaborators/,
      );
      await expectCount(invitationId, 5);

      const [first] = stored;
      assert.ok(first);
      await prisma.invitationCollaborator.update({
        where: { id: first.id },
        data: { revokedAt: new Date(), tokenHash: null, tokenExpiresAt: null },
      });

      // The sixth is now the fifth, and the cap holds again.
      await invite(invitationId);
      await expectCount(invitationId, 5);
      await assert.rejects(
        invite(invitationId),
        /An invitation keeps at most five non-revoked collaborators/,
      );
    });

    it("inserts the CO_HOSTS catalog key and grants it to Premium and Deluxe", async () => {
      const key = await prisma.feature.findUniqueOrThrow({ where: { key: "CO_HOSTS" } });
      assert.equal(key.isActive, true);

      const links = await prisma.packageFeature.findMany({
        where: { featureId: key.id, package: { key: { in: ["premium", "deluxe"] } } },
        select: { package: { select: { key: true } } },
      });
      assert.deepEqual(links.map((link) => link.package.key).sort(), ["deluxe", "premium"]);
    });
  });

  /** The token one sent message carried, read back out of the link the message body prints. */
  function sentToken(message: { text: string }): string {
    const match = /token=([A-Za-z0-9_-]{22})/u.exec(message.text);
    assert.ok(match?.[1], "the message carries a token");

    return match[1];
  }

  describe("the invitation and the acceptance (L17.3)", () => {
    it("invites an address, stores only the digest, and emails the one link", async () => {
      const { invitationId, ownerId } = await newInvitation();
      emails.clear();

      const stored = await inviteCollaborator.execute({
        ownerId,
        invitationId,
        email: "  Ana.Martinez@Example.TEST ",
        permissions: ["PUBLISH", "EDIT_CONTENT"],
      });

      assert.ok(stored);
      assert.equal(stored.email, "ana.martinez@example.test");
      assert.deepEqual(stored.permissions, ["EDIT_CONTENT", "PUBLISH"]);
      assert.equal(stored.acceptedAt, null);
      assert.equal(stored.revokedAt, null);

      const row = await prisma.invitationCollaborator.findUniqueOrThrow({
        where: { id: stored.id },
      });
      assert.equal(emails.delivered.length, 1);
      const [message] = emails.delivered;
      assert.ok(message);
      assert.equal(message.to, "ana.martinez@example.test");
      // The link carries the plain token; the row carries its digest and nothing else, and the record the owner reads
      // never carries either.
      assert.equal(row.tokenHash, collaboratorTokenHash(sentToken(message)));
      assert.equal(row.tokenHash?.length, 64);
      assert.equal(message.text.includes(row.tokenHash ?? "no-digest"), false);
      assert.deepEqual(Object.keys(stored).sort(), [
        "acceptedAt",
        "email",
        "id",
        "invitationId",
        "invitedAt",
        "permissions",
        "revokedAt",
      ]);
      assert.equal(row.invitedAt.toISOString(), NOW.toISOString());
      assert.equal(
        row.tokenExpiresAt?.toISOString(),
        "2026-12-21T12:00:00.000Z",
        "seven days after the invitation",
      );
    });

    it("refuses an address and a permission set the domain does not accept, storing nothing", async () => {
      const { invitationId, ownerId } = await newInvitation();

      for (const input of [
        { email: "not-an-address", permissions: ["PUBLISH"] },
        { email: "ana@example.test", permissions: [] },
        { email: "ana@example.test", permissions: ["PAY"] },
      ]) {
        await assert.rejects(
          inviteCollaborator.execute({ ownerId, invitationId, ...input }),
          /invalid/u,
        );
      }
      assert.equal(await prisma.invitationCollaborator.count({ where: { invitationId } }), 0);
    });

    it("answers nothing for another owner's invitation and for an unknown one, storing nothing", async () => {
      const { invitationId } = await newInvitation();
      const other = await newUser("other");

      assert.equal(
        await inviteCollaborator.execute({
          ownerId: other,
          invitationId,
          email: "ana@example.test",
          permissions: ["PUBLISH"],
        }),
        null,
      );
      assert.equal(
        await inviteCollaborator.execute({
          ownerId: other,
          invitationId: randomUUID(),
          email: "ana@example.test",
          permissions: ["PUBLISH"],
        }),
        null,
      );
      assert.equal(await prisma.invitationCollaborator.count({ where: { invitationId } }), 0);
      assert.deepEqual(await list.execute(other, invitationId), null);
    });

    it("refuses a pinned package that does not grant CO_HOSTS (L17.5)", async () => {
      const { invitationId, ownerId } = await newInvitation(undefined, ["ITINERARY"]);

      await assert.rejects(
        inviteCollaborator.execute({
          ownerId,
          invitationId,
          email: "ana@example.test",
          permissions: ["PUBLISH"],
        }),
        CollaboratorFeatureNotAvailableError,
      );
      assert.equal(await prisma.invitationCollaborator.count({ where: { invitationId } }), 0);
    });

    it("refuses the same address twice and the sixth collaborator (L17.1)", async () => {
      const { invitationId, ownerId } = await newInvitation();
      const first = { ownerId, invitationId, permissions: ["PUBLISH"] };

      await inviteCollaborator.execute({ ...first, email: "ana@example.test" });
      await assert.rejects(
        inviteCollaborator.execute({ ...first, email: "ANA@example.test" }),
        CollaboratorAlreadyInvitedError,
      );

      for (let index = 1; index < 5; index += 1) {
        await inviteCollaborator.execute({ ...first, email: `cohost-${index}@example.test` });
      }
      await assert.rejects(
        inviteCollaborator.execute({ ...first, email: "sexta@example.test" }),
        CollaboratorLimitReachedError,
      );
      assert.equal(
        await prisma.invitationCollaborator.count({ where: { invitationId, revokedAt: null } }),
        5,
      );
    });

    it("accepts with the invited account, grants its permissions, and burns the token", async () => {
      const { invitationId, ownerId } = await newInvitation();
      const email = `f12-accept-${runId}@example.test`;
      const accepting = await newUser("accept", email);
      emails.clear();
      await inviteCollaborator.execute({
        ownerId,
        invitationId,
        email,
        permissions: ["VIEW_ATTENDANCE"],
      });
      const [message] = emails.delivered;
      assert.ok(message);
      const token = sentToken(message);

      assert.deepEqual(await accept.execute({ userId: accepting, token }), { invitationId });

      const row = await prisma.invitationCollaborator.findFirstOrThrow({
        where: { invitationId, userId: accepting },
      });
      assert.equal(row.acceptedAt?.toISOString(), NOW.toISOString());
      // The token is burned: the stored digest is gone, so the same link matches nothing again.
      assert.equal(row.tokenHash, null);
      assert.equal(row.tokenExpiresAt, null);
      assert.deepEqual(await resolver.resolve(accepting, invitationId), {
        invitationId,
        ownerId,
        role: "COLLABORATOR",
        permissions: ["VIEW_ATTENDANCE"],
      });
      assert.deepEqual(await resolver.resolve(ownerId, invitationId), {
        invitationId,
        ownerId,
        role: "OWNER",
        permissions: [],
      });
      assert.equal(await resolver.resolve(await newUser("stranger"), invitationId), null);
      await assert.rejects(accept.execute({ userId: accepting, token }), CollaborationRefusedError);
    });

    it("refuses a wrong account without consuming the link the right one still holds", async () => {
      const { invitationId, ownerId } = await newInvitation();
      const email = `f12-wrong-${runId}@example.test`;
      const accepting = await newUser("right", email);
      const wrong = await newUser("wrong", `f12-wrong-account-${runId}@example.test`);
      emails.clear();
      await inviteCollaborator.execute({ ownerId, invitationId, email, permissions: ["PUBLISH"] });
      const [message] = emails.delivered;
      assert.ok(message);
      const token = sentToken(message);

      await assert.rejects(accept.execute({ userId: wrong, token }), CollaborationRefusedError);
      const still = await prisma.invitationCollaborator.findFirstOrThrow({
        where: { invitationId },
      });
      assert.equal(still.acceptedAt, null);
      assert.equal(still.revokedAt, null);
      assert.ok(still.tokenHash);

      assert.deepEqual(await accept.execute({ userId: accepting, token }), { invitationId });
    });

    it("refuses an expired link, a revoked collaborator, and a token that names nothing", async () => {
      const { invitationId, ownerId } = await newInvitation();
      const inviting = await newUser("expiring");
      const link = `https://invitame.mx/colaboraciones/aceptar?token=${"a".repeat(22)}`;
      assert.ok(link);

      // An invitation sent nine days ago is already past its seven-day window at NOW.
      const expiredAt = new Date(NOW.getTime() - 9 * 24 * 60 * 60 * 1000);
      const stale = await inviteCollaborator.execute({
        ownerId,
        invitationId,
        email: `f12-stale-${runId}@example.test`,
        permissions: ["PUBLISH"],
      });
      assert.ok(stale);
      await prisma.invitationCollaborator.update({
        where: { id: stale.id },
        data: {
          invitedAt: expiredAt,
          tokenExpiresAt: new Date(expiredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      const staleToken = "b".repeat(22);
      await prisma.invitationCollaborator.update({
        where: { id: stale.id },
        data: { tokenHash: collaboratorTokenHash(staleToken) },
      });
      await assert.rejects(
        accept.execute({ userId: inviting, token: staleToken }),
        CollaborationRefusedError,
      );

      // A revoked collaborator's link is refused too, and its acceptance changes nothing.
      const revoked = await inviteCollaborator.execute({
        ownerId,
        invitationId,
        email: `f12-revoked-${runId}@example.test`,
        permissions: ["PUBLISH"],
      });
      assert.ok(revoked);
      const revokedToken = "c".repeat(22);
      await prisma.invitationCollaborator.update({
        where: { id: revoked.id },
        data: { tokenHash: collaboratorTokenHash(revokedToken) },
      });
      assert.ok(await revoke.execute(ownerId, invitationId, revoked.id));
      await assert.rejects(
        accept.execute({ userId: inviting, token: revokedToken }),
        CollaborationRefusedError,
      );

      // And a token that names nothing at all is the same refusal.
      await assert.rejects(
        accept.execute({ userId: inviting, token: "d".repeat(22) }),
        CollaborationRefusedError,
      );
      await assert.rejects(
        accept.execute({ userId: inviting, token: "not-a-token" }),
        CollaborationRefusedError,
      );
    });

    it("lists, changes, and revokes for the owner alone, and a revoke ends the access at once", async () => {
      const { invitationId, ownerId } = await newInvitation();
      const email = `f12-revoke-${runId}@example.test`;
      const accepting = await newUser("revokable", email);
      emails.clear();
      const invited = await inviteCollaborator.execute({
        ownerId,
        invitationId,
        email,
        permissions: ["EDIT_CONTENT"],
      });
      assert.ok(invited);
      const [message] = emails.delivered;
      assert.ok(message);
      await accept.execute({ userId: accepting, token: sentToken(message) });

      const listed = await list.execute(ownerId, invitationId);
      assert.equal(listed?.maxCollaborators, 5);
      assert.equal(listed?.collaborators.length, 1);
      assert.equal(listed?.collaborators[0]?.email, email);
      assert.equal(await list.execute(accepting, invitationId), null);

      const changed = await updatePermissions.execute({
        ownerId,
        invitationId,
        collaboratorId: invited.id,
        permissions: ["PUBLISH", "VIEW_ATTENDANCE"],
      });
      assert.deepEqual(changed?.permissions, ["VIEW_ATTENDANCE", "PUBLISH"]);
      assert.equal(
        await updatePermissions.execute({
          ownerId: accepting,
          invitationId,
          collaboratorId: invited.id,
          permissions: ["PUBLISH"],
        }),
        null,
      );

      assert.ok(await revoke.execute(ownerId, invitationId, invited.id));
      assert.equal(await resolver.resolve(accepting, invitationId), null);
      // Revoked rows are history: the owner's screen no longer lists them, and a second revoke changes nothing.
      assert.equal((await list.execute(ownerId, invitationId))?.collaborators.length, 0);
      assert.equal(await revoke.execute(ownerId, invitationId, invited.id), null);
      // The place is free again, so the same address may be invited (and accepted) later.
      assert.ok(
        await inviteCollaborator.execute({
          ownerId,
          invitationId,
          email,
          permissions: ["EDIT_CONTENT"],
        }),
      );
    });
  });

  async function expectCount(invitationId: string, expected: number): Promise<void> {
    assert.equal(
      await prisma.invitationCollaborator.count({
        where: { invitationId, revokedAt: null },
      }),
      expected,
    );
  }
});
