import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { MEDIA_MIME, storageKeyFor } from "../../media/domain/media-asset";
import { PrismaInvitationMediaCountReader } from "../../media/infrastructure/prisma-invitation-media-count-reader";
import { PrismaInvitationPaymentReader } from "../../payments/infrastructure/prisma-invitation-payment-reader";
import { PrismaInvitationOwnerEmailReader } from "../../users/infrastructure/prisma-invitation-owner-email-reader";
import type { AdminInvitationRow } from "../application/admin-invitation.repository";
import {
  GetAdminInvitationUseCase,
  ListAdminInvitationsUseCase,
} from "../application/admin-invitation.use-cases";
import type { InvitationStatus } from "../domain/invitation-lifecycle";
import { PrismaAdminInvitationRepository } from "./prisma-admin-invitation.repository";

// The administrator's invitation status view on real PostgreSQL (M9 T2; S1): the index the migration adds, key-set
// paging across rows that share one `createdAt`, the case-insensitive slug prefix with `%` and `_` read literally, the
// status filter, the batched payment, media, and owner reads a page performs, and the contract's field set — no
// `content`, no owner display name, no provider datum. Runs only through `pnpm --filter @invitame/api test:db` with an
// explicit DATABASE_URL. The database is shared with parallel suites, so every test scopes its reads by a slug prefix
// made from this run's id, and cleanup removes exactly the rows created here.

const RENDERER = "birthday-poster-01";

describe("admin invitation status view on real PostgreSQL (M9 T2; S1)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaAdminInvitationRepository(prisma);
  const payments = new PrismaInvitationPaymentReader(prisma);
  const media = new PrismaInvitationMediaCountReader(prisma);
  const owners = new PrismaInvitationOwnerEmailReader(prisma);
  const list = new ListAdminInvitationsUseCase(repository, payments, media, owners);
  const detail = new GetAdminInvitationUseCase(repository, payments, media, owners);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const versionIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;
  let versionId = "";
  let packageId = "";

  before(async () => {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `m9-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m9-template-${sequence}-${runId}`,
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
    versionIds.push(version.id);
    versionId = version.id;

    const createdPackage = await prisma.package.create({
      data: { key: `m9-package-${sequence}-${runId}`, name: "Paquete", status: "ACTIVE" },
    });
    packageIds.push(createdPackage.id);
    packageId = createdPackage.id;
  });

  after(async () => {
    try {
      await prisma.paymentEvent.deleteMany({
        where: { payment: { invitationId: { in: invitationIds } } },
      });
      await prisma.payment.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.mediaAsset.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await prisma.invitationFeatureSettings.deleteMany({
        where: { invitationId: { in: invitationIds } },
      });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.templateVersion.deleteMany({ where: { id: { in: versionIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newOwner(options: { displayName?: string } = {}): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: {
        email: `m9-admin-${sequence}-${runId}@example.test`,
        ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
      },
    });
    userIds.push(created.id);
    return created.id;
  }

  async function newInvitation(options: {
    ownerId?: string;
    slug: string;
    status?: InvitationStatus;
    createdAt?: Date;
    /** The bounded content the view must never answer; the adapter's own select decides that. */
    content?: Prisma.InputJsonValue;
  }): Promise<string> {
    const ownerId = options.ownerId ?? (await newOwner());
    const status = options.status ?? "DRAFT";
    const createdAt = options.createdAt ?? new Date();
    const created = await prisma.invitation.create({
      data: {
        ownerId,
        templateVersionId: versionId,
        packageId,
        slug: options.slug,
        status,
        content: options.content ?? {},
        createdAt,
        updatedAt: createdAt,
        // The CHECK constraints pair each status with its own marker column.
        publishedAt: status === "PUBLISHED" ? createdAt : null,
        firstPublishedAt: status === "DRAFT" ? null : createdAt,
        archivedAt: status === "ARCHIVED" ? createdAt : null,
      },
    });
    invitationIds.push(created.id);

    return created.id;
  }

  async function newPayment(
    invitationId: string,
    options: { status?: "pending" | "paid"; createdAt?: Date; amountMinor?: number } = {},
  ): Promise<string> {
    sequence += 1;
    const status = options.status ?? "paid";
    const createdAt = options.createdAt ?? new Date();
    const created = await prisma.payment.create({
      data: {
        invitationId,
        packageId,
        amountMinor: options.amountMinor ?? 25_000,
        currency: "MXN",
        status,
        provider: "simulated",
        providerReference: `m9-ref-${sequence}-${runId}`,
        idempotencyKey: `m9-key-${sequence}-${runId}`,
        createdAt,
        updatedAt: createdAt,
        // The CHECK constraint pairs a receipt instant with the paid and refunded statuses.
        paidAt: status === "paid" ? createdAt : null,
      },
    });

    return created.id;
  }

  async function newAsset(
    invitationId: string,
    options: { kind: "main-photo" | "gallery"; position?: number; status?: "stored" | "deleted" },
  ): Promise<void> {
    const assetId = randomUUID();
    await prisma.mediaAsset.create({
      data: {
        id: assetId,
        invitationId,
        // The Prisma client names the enum members; `@map` makes the stored labels `main-photo` and `stored`.
        kind: options.kind === "main-photo" ? "MAIN_PHOTO" : "GALLERY",
        storageKey: storageKeyFor(invitationId, assetId),
        mime: MEDIA_MIME,
        byteSize: 1024,
        width: 800,
        height: 1000,
        position: options.kind === "main-photo" ? null : (options.position ?? 0),
        status: options.status === "deleted" ? "DELETED" : "STORED",
      },
    });
  }

  it("applies the index the status view reads", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT "indexname" FROM "pg_indexes"
      WHERE "tablename" = 'Invitation' AND "indexname" = 'Invitation_status_createdAt_idx'
    `;

    assert.equal(rows.length, 1);
  });

  it("pages newest first across rows that share one createdAt instant", async () => {
    const owner = await newOwner();
    const prefix = `m9-page-${runId}-`;
    const shared = new Date("2026-11-25T12:00:00.000Z");
    const seeded = [
      await newInvitation({ ownerId: owner, slug: `${prefix}uno`, createdAt: shared }),
      await newInvitation({ ownerId: owner, slug: `${prefix}dos`, createdAt: shared }),
      await newInvitation({ ownerId: owner, slug: `${prefix}tres`, createdAt: shared }),
      await newInvitation({
        ownerId: owner,
        slug: `${prefix}cuatro`,
        createdAt: new Date("2026-11-24T12:00:00.000Z"),
      }),
    ];

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list.execute({ slug: prefix, status: null, limit: 2, cursor });
      assert.ok(page.items.length <= 2);
      seen.push(...page.items.map((item) => item.invitationId));
      cursor = page.nextCursor;
    } while (cursor !== null);

    assert.equal(new Set(seen).size, 4, "no row is repeated across pages");
    assert.deepEqual([...seen].sort(), [...seeded].sort(), "no row is skipped across pages");
    const ordered = await prisma.invitation.findMany({
      where: { id: { in: seeded } },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    assert.deepEqual(
      seen,
      ordered.map((row) => row.id),
    );
  });

  it("matches a case-insensitive slug prefix and reads % and _ literally", async () => {
    const owner = await newOwner();
    const prefix = `m9-slug-${runId}`;
    const created = [
      await newInvitation({ ownerId: owner, slug: `${prefix}-boda-ana` }),
      await newInvitation({ ownerId: owner, slug: `${prefix}-boda-luis` }),
      await newInvitation({ ownerId: owner, slug: `${prefix}-xv-maria` }),
    ];

    const insensitive = await list.execute({
      slug: `M9-SLUG-${runId.toUpperCase()}`,
      status: null,
      limit: 50,
      cursor: null,
    });
    assert.deepEqual(
      insensitive.items.map((item) => item.invitationId).sort(),
      [...created].sort(),
      "the prefix is matched case-insensitively",
    );

    const narrow = await list.execute({
      slug: `${prefix}-boda`,
      status: null,
      limit: 50,
      cursor: null,
    });
    assert.equal(narrow.items.length, 2);

    // `_` is one arbitrary character in SQL LIKE: escaped, it only matches a stored underscore, and a slug has none.
    const underscore = prefix.replaceAll("-", "_");
    const escapedUnderscore = await list.execute({
      slug: underscore,
      status: null,
      limit: 50,
      cursor: null,
    });
    assert.equal(
      escapedUnderscore.items.length,
      0,
      "a `_` in the prefix matches no other character",
    );

    // `%` is any run of characters: escaped, it only matches a stored percent sign, and a slug has none.
    const percent = await list.execute({
      slug: `${prefix}%`,
      status: null,
      limit: 50,
      cursor: null,
    });
    assert.equal(percent.items.length, 0, "a `%` in the prefix matches nothing on its own");
  });

  it("filters one status and never the other two", async () => {
    const owner = await newOwner();
    const prefix = `m9-status-${runId}-`;
    await newInvitation({ ownerId: owner, slug: `${prefix}draft`, status: "DRAFT" });
    const published = await newInvitation({
      ownerId: owner,
      slug: `${prefix}published`,
      status: "PUBLISHED",
    });
    await newInvitation({ ownerId: owner, slug: `${prefix}archived`, status: "ARCHIVED" });

    for (const [status, expected] of [
      ["DRAFT", 1],
      ["PUBLISHED", 1],
      ["ARCHIVED", 1],
    ] as const) {
      const page = await list.execute({ slug: prefix, status, limit: 50, cursor: null });
      assert.equal(page.items.length, expected, status);
      assert.ok(page.items.every((item) => item.status === status));
    }
    const publishedPage = await list.execute({
      slug: prefix,
      status: "PUBLISHED",
      limit: 50,
      cursor: null,
    });
    assert.equal(publishedPage.items[0]?.invitationId, published);
  });

  it("answers the contract's field set and never content or the owner's display name", async () => {
    const ownerId = await newOwner({ displayName: "Ana Dueña" });
    const invitationId = await newInvitation({
      ownerId,
      slug: `m9-fields-${runId}`,
      content: { title: "Contenido privado" },
    });

    const [row] = await repository.listForAdmin({
      slugPrefix: `m9-fields-${runId}`,
      status: null,
      after: null,
      limit: 10,
    });
    assert.ok(row);
    assert.deepEqual(Object.keys(row).sort(), [
      "archivedAt",
      "createdAt",
      "firstPublishedAt",
      "invitationId",
      "ownerId",
      "packageId",
      "publishedAt",
      "refundRequestedAt",
      "slug",
      "status",
      "templateVersionId",
    ]);
    assert.deepEqual(row, await repository.findForAdmin(invitationId));

    const stored = await detail.execute(invitationId);
    assert.ok(stored);
    const serialized = JSON.stringify(stored);
    assert.equal("content" in stored, false);
    assert.equal(serialized.includes("Contenido privado"), false);
    assert.equal(serialized.includes("Ana Dueña"), false);
    assert.equal(serialized.includes(ownerId), false);
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { email: true },
    });
    assert.equal(stored.ownerEmail, owner.email);
  });

  it("reads the newest payment of a whole page in one batched read", async () => {
    const owner = await newOwner();
    const prefix = `m9-pay-${runId}-`;
    const withPayments = await newInvitation({ ownerId: owner, slug: `${prefix}con-pagos` });
    const withoutPayments = await newInvitation({ ownerId: owner, slug: `${prefix}sin-pagos` });
    const newest = await newPayment(withPayments, {
      status: "pending",
      createdAt: new Date("2026-11-25T11:00:00.000Z"),
      amountMinor: 30_000,
    });
    await newPayment(withPayments, {
      status: "paid",
      createdAt: new Date("2026-11-24T11:00:00.000Z"),
    });

    const page = await payments.latestFor([withPayments, withoutPayments]);

    assert.equal(page.size, 1, "an invitation with no payment is absent, not a null row");
    const latest = page.get(withPayments);
    assert.ok(latest);
    assert.deepEqual(Object.keys(latest).sort(), [
      "amountMinor",
      "createdAt",
      "currency",
      "paidAt",
      "paymentId",
      "status",
    ]);
    assert.equal(latest.paymentId, newest);
    assert.equal(latest.status, "pending");
    assert.equal(latest.amountMinor, 30_000);
    assert.equal(latest.paidAt, null);
    assert.deepEqual(await payments.latestFor([]), new Map());
  });

  it("bounds the detail's payment list to the newest twenty", async () => {
    const ownerId = await newOwner();
    const invitationId = await newInvitation({ ownerId, slug: `m9-many-${runId}` });
    const start = Date.UTC(2026, 10, 1, 10, 0, 0);
    await prisma.payment.createMany({
      data: Array.from({ length: 22 }, (_, index) => ({
        invitationId,
        packageId,
        amountMinor: 1000 + index,
        currency: "MXN",
        status: "paid" as const,
        provider: "simulated",
        providerReference: `m9-many-ref-${index}-${runId}`,
        idempotencyKey: `m9-many-key-${index}-${runId}`,
        createdAt: new Date(start + index * 60_000),
        updatedAt: new Date(start + index * 60_000),
        paidAt: new Date(start + index * 60_000),
      })),
    });

    const stored = await detail.execute(invitationId);

    assert.ok(stored);
    assert.equal(stored.payments.length, 20);
    assert.equal(stored.payments[0]?.amountMinor, 1000 + 21);
    assert.equal(stored.latestPayment?.amountMinor, 1000 + 21);
    assert.deepEqual(
      stored.payments.map((payment) => payment.amountMinor),
      Array.from({ length: 20 }, (_, index) => 1000 + 21 - index),
    );
  });

  it("counts the stored main photo and gallery assets of a whole page in one batched read", async () => {
    const owner = await newOwner();
    const prefix = `m9-media-${runId}-`;
    const counted = await newInvitation({ ownerId: owner, slug: `${prefix}con-fotos` });
    const empty = await newInvitation({ ownerId: owner, slug: `${prefix}sin-fotos` });
    await newAsset(counted, { kind: "main-photo" });
    await newAsset(counted, { kind: "gallery", position: 0 });
    await newAsset(counted, { kind: "gallery", position: 1 });
    await newAsset(counted, { kind: "gallery", position: 2, status: "deleted" });

    const counts = await media.countsFor([counted, empty]);

    assert.equal(counts.size, 1);
    assert.deepEqual(counts.get(counted), { mainPhoto: true, galleryCount: 2 });
    assert.deepEqual(await media.countsFor([]), new Map());
  });

  it("reads the owner emails of a whole page in one batched read", async () => {
    const first = await newOwner();
    const second = await newOwner();
    const firstEmail = await prisma.user.findUniqueOrThrow({
      where: { id: first },
      select: { email: true },
    });
    const secondEmail = await prisma.user.findUniqueOrThrow({
      where: { id: second },
      select: { email: true },
    });

    const emails = await owners.emailsFor([first, second, randomUUID()]);

    assert.equal(emails.size, 2);
    assert.equal(emails.get(first), firstEmail.email);
    assert.equal(emails.get(second), secondEmail.email);
    assert.deepEqual(await owners.emailsFor([]), new Map());
  });

  it("answers one page with its payment, media, and owner facets in three reads", async () => {
    const ownerId = await newOwner();
    const prefix = `m9-page-facets-${runId}-`;
    const invitationId = await newInvitation({
      ownerId,
      slug: `${prefix}uno`,
      status: "PUBLISHED",
    });
    await newPayment(invitationId, { status: "paid" });
    await newAsset(invitationId, { kind: "main-photo" });
    const email = await prisma.user.findUniqueOrThrow({
      where: { id: ownerId },
      select: { email: true },
    });

    const page = await list.execute({ slug: prefix, status: "PUBLISHED", limit: 20, cursor: null });

    assert.equal(page.items.length, 1);
    const [item] = page.items;
    assert.ok(item);
    assert.equal(item.invitationId, invitationId);
    assert.equal(item.status, "PUBLISHED");
    assert.equal(item.ownerEmail, email.email);
    assert.equal(item.latestPayment?.status, "paid");
    assert.deepEqual(item.media, { mainPhoto: true, galleryCount: 0 });
    assert.equal(item.firstPublishedAt?.getTime(), item.createdAt.getTime());
  });

  it("answers null for an invitation no row has", async () => {
    assert.equal(await repository.findForAdmin(randomUUID()), null);
    assert.equal(await detail.execute(randomUUID()), null);
  });

  it("keeps the admin row shape the list answers free of content", async () => {
    const rows: AdminInvitationRow[] = await repository.listForAdmin({
      slugPrefix: `m9-fields-${runId}`,
      status: null,
      after: null,
      limit: 10,
    });

    assert.ok(rows.every((row) => !Object.keys(row).includes("content")));
  });
});
