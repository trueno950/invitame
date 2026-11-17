import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireLocalDatabaseUrl } from "../../../test/database";
import { PrismaCatalogPublicReader } from "../../catalog/infrastructure/prisma-catalog-public-reader";
import { PAYMENTS_MODE } from "../../config/environment";
import type { InvitationRecord } from "../../invitations/application/invitation.repository";
import {
  InvitationPackageLockedByPaymentError,
  PaymentAlreadyPaidError,
} from "../application/payment.errors";
import {
  GetInvitationPaymentUseCase,
  StartCheckoutUseCase,
} from "../application/payment.use-cases";
import { HandlePaymentWebhookUseCase } from "../application/payment-webhook.use-case";
import { CatalogPaymentPrices } from "./catalog-payment-prices";
import { PaymentGate } from "./payment-gate";
import { PrismaPaymentRepository } from "./prisma-payment.repository";
import { SimulatedPaymentProvider } from "./simulated-payment-provider";

// Checkout and payments on real PostgreSQL (M7 S1, S4): the additive migration's enum, columns, CHECK constraints,
// unique indexes, partial unique index, and RESTRICT references; the price snapshot surviving a catalog change; two
// simultaneous checkouts converging on one pending payment; the verified intake under duplicate, concurrent,
// out-of-order, and mismatching deliveries; the publication gate over stored rows; and the package-change refusal
// the pinned-package trigger and the application both enforce. Runs only through
// `pnpm --filter @invitame/api test:db` with an explicit DATABASE_URL. The database is shared with parallel suites:
// every row here carries a key made from this run's id, and only those rows are removed.

const RENDERER = "birthday-poster-01";
const SECRET = randomBytes(32).toString("base64url");
const PRICE = { amountMinor: 25_000, currency: "MXN" };

describe("payments on real PostgreSQL (M7 S1, S4)", () => {
  const prisma = new PrismaClient({ datasources: { db: { url: requireLocalDatabaseUrl() } } });
  const repository = new PrismaPaymentRepository(prisma);
  const catalog = new CatalogPaymentPrices(new PrismaCatalogPublicReader(prisma));
  const provider = new SimulatedPaymentProvider({
    secret: SECRET,
    returnBaseUrl: "http://localhost:3000",
  });
  const webhook = new HandlePaymentWebhookUseCase(repository, provider);
  const checkout = new StartCheckoutUseCase(repository, catalog, provider, PAYMENTS_MODE.SIMULATED);
  const read = new GetInvitationPaymentUseCase(repository, catalog, PAYMENTS_MODE.SIMULATED);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const templateIds: string[] = [];
  const versionIds: string[] = [];
  const packageIds: string[] = [];
  const invitationIds: string[] = [];
  let sequence = 0;

  after(async () => {
    try {
      const payments = await prisma.payment.findMany({
        where: { invitationId: { in: invitationIds } },
        select: { id: true },
      });
      const paymentIds = payments.map((payment) => payment.id);
      await prisma.paymentEvent.deleteMany({
        where: {
          OR: [{ paymentId: { in: paymentIds } }, { providerEventId: { startsWith: runId } }],
        },
      });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await prisma.invitation.deleteMany({ where: { id: { in: invitationIds } } });
      await prisma.packagePrice.deleteMany({ where: { packageId: { in: packageIds } } });
      await prisma.templateVersion.deleteMany({ where: { id: { in: versionIds } } });
      await prisma.template.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.package.deleteMany({ where: { id: { in: packageIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function newOwner(): Promise<string> {
    sequence += 1;
    const created = await prisma.user.create({
      data: { email: `m7-payments-${sequence}-${runId}@example.test` },
    });
    userIds.push(created.id);
    return created.id;
  }

  /** A category, template, and PUBLISHED version a draft can pin. */
  async function newCatalog(): Promise<{ versionId: string }> {
    sequence += 1;
    const category = await prisma.category.create({
      data: { key: `m7-category-${sequence}-${runId}`, name: "Categoría" },
    });
    categoryIds.push(category.id);
    const template = await prisma.template.create({
      data: {
        categoryId: category.id,
        key: `m7-template-${sequence}-${runId}`,
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

    return { versionId: version.id };
  }

  async function newPackage(price: { amountMinor: number; currency: string } | null = PRICE) {
    sequence += 1;
    const created = await prisma.package.create({
      data: { key: `m7-package-${sequence}-${runId}`, name: "Paquete", status: "ACTIVE" },
    });
    packageIds.push(created.id);
    if (price !== null) {
      await prisma.packagePrice.create({
        data: { packageId: created.id, amountMinor: price.amountMinor, currency: price.currency },
      });
    }

    return created.id;
  }

  /** Retires the price in force and publishes another one, the way the catalog's admin route does. */
  async function changePrice(packageId: string, next: { amountMinor: number; currency: string }) {
    await prisma.packagePrice.updateMany({
      where: { packageId, retiredAt: null },
      data: { retiredAt: new Date() },
    });
    await prisma.packagePrice.create({ data: { packageId, ...next } });
  }

  async function newInvitation(overrides: { packageId?: string } = {}) {
    const ownerId = await newOwner();
    const { versionId } = await newCatalog();
    const packageId = overrides.packageId ?? (await newPackage());
    const created = await prisma.invitation.create({
      data: {
        ownerId,
        templateVersionId: versionId,
        packageId,
        slug: `m7-invitacion-${randomUUID().slice(0, 8)}`,
        content: {},
      },
    });
    invitationIds.push(created.id);

    return { id: created.id, ownerId, packageId };
  }

  function invitationRecordOf(row: {
    id: string;
    ownerId: string;
    packageId: string;
  }): InvitationRecord {
    return {
      id: row.id,
      ownerId: row.ownerId,
      templateVersionId: "00000000-0000-4000-8000-000000000000",
      packageId: row.packageId,
      slug: "invitacion-abcdef",
      status: "DRAFT",
      content: {},
      timeZone: "America/Mexico_City",
      whatsappPhone: null,
      playlistUrl: null,
      rsvpDeadline: null,
      rsvpPartyLimit: 4,
      archivedAt: null,
      publishedAt: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  function eventId(): string {
    return `${runId}-${randomUUID()}`;
  }

  /** A signed delivery built by the simulated adapter, then verified by the real intake. */
  function signedDelivery(payment: {
    id: string;
    amountMinor: number;
    currency: string;
    providerReference: string | null;
  }) {
    return provider.buildEvent({ payment, type: "paid", at: new Date() });
  }

  describe("schema and constraints", () => {
    it("stores a pending payment with its snapshot and no reference", async () => {
      const invitation = await newInvitation();
      const row = await prisma.payment.create({
        data: {
          invitationId: invitation.id,
          packageId: invitation.packageId,
          amountMinor: PRICE.amountMinor,
          currency: PRICE.currency,
          provider: "simulated",
          idempotencyKey: `${runId}-${randomUUID()}`,
        },
      });

      assert.equal(row.status, "pending");
      assert.equal(row.providerReference, null);
      assert.equal(row.paidAt, null);
      assert.equal(row.amountMinor, PRICE.amountMinor);
    });

    it("refuses a negative amount and a currency that is not three upper-case letters", async () => {
      const invitation = await newInvitation();
      const base = {
        invitationId: invitation.id,
        packageId: invitation.packageId,
        provider: "simulated",
        idempotencyKey: `${runId}-${randomUUID()}`,
      };

      await assert.rejects(
        prisma.payment.create({
          data: { ...base, amountMinor: -1, currency: "MXN" },
        }),
        /Payment_amountMinor_non_negative/,
      );
      await assert.rejects(
        prisma.payment.create({
          data: { ...base, amountMinor: 100, currency: "mxn" },
        }),
        /Payment_currency_format/,
      );
    });

    it("refuses a second payment with the same idempotency key", async () => {
      const invitation = await newInvitation();
      const key = `${runId}-${randomUUID()}`;
      const data = {
        invitationId: invitation.id,
        packageId: invitation.packageId,
        amountMinor: PRICE.amountMinor,
        currency: PRICE.currency,
        provider: "simulated",
        idempotencyKey: key,
      };
      await prisma.payment.create({ data });

      await assert.rejects(prisma.payment.create({ data }), { code: "P2002" });
    });

    it("keeps provider references unique per provider and lets many be null", async () => {
      const reference = `simulated-${randomUUID()}`;
      const base = {
        amountMinor: PRICE.amountMinor,
        currency: PRICE.currency,
        provider: "simulated",
      };
      // One invitation per row: the partial unique index allows a single `pending` payment per invitation, which
      // is the other rule this suite asserts.
      const first = await newInvitation();
      const second = await newInvitation();
      const third = await newInvitation();
      await prisma.payment.create({
        data: {
          ...base,
          invitationId: first.id,
          packageId: first.packageId,
          providerReference: reference,
          idempotencyKey: `${runId}-a`,
        },
      });
      await assert.rejects(
        prisma.payment.create({
          data: {
            ...base,
            invitationId: second.id,
            packageId: second.packageId,
            providerReference: reference,
            idempotencyKey: `${runId}-b`,
          },
        }),
        { code: "P2002" },
      );
      // Another provider may use the same reference string, and any number of rows may carry none.
      await prisma.payment.create({
        data: {
          ...base,
          invitationId: second.id,
          packageId: second.packageId,
          provider: "other",
          providerReference: reference,
          idempotencyKey: `${runId}-c`,
        },
      });
      await prisma.payment.create({
        data: {
          ...base,
          invitationId: third.id,
          packageId: third.packageId,
          idempotencyKey: `${runId}-d`,
        },
      });
    });

    it("allows one pending payment per invitation", async () => {
      const invitation = await newInvitation();
      const base = {
        invitationId: invitation.id,
        packageId: invitation.packageId,
        amountMinor: PRICE.amountMinor,
        currency: PRICE.currency,
        provider: "simulated",
      };
      await prisma.payment.create({
        data: { ...base, idempotencyKey: `${runId}-pending-1` },
      });

      await assert.rejects(
        prisma.payment.create({ data: { ...base, idempotencyKey: `${runId}-pending-2` } }),
        { code: "P2002" },
      );
    });

    it("keeps paidAt set exactly while the payment is paid or refunded", async () => {
      const invitation = await newInvitation();
      const base = {
        invitationId: invitation.id,
        packageId: invitation.packageId,
        amountMinor: PRICE.amountMinor,
        currency: PRICE.currency,
        provider: "simulated",
        idempotencyKey: `${runId}-${randomUUID()}`,
      };

      await assert.rejects(
        prisma.payment.create({ data: { ...base, status: "paid" } }),
        /Payment_paidAt_matches_status/,
      );
      await assert.rejects(
        prisma.payment.create({
          data: { ...base, status: "pending", paidAt: new Date() },
        }),
        /Payment_paidAt_matches_status/,
      );
      const paid = await prisma.payment.create({
        data: { ...base, status: "paid", paidAt: new Date() },
      });
      assert.equal(paid.status, "paid");
    });

    it("records an event with a digest and only the closed set of types and outcomes", async () => {
      const invitation = await newInvitation();
      const payment = await prisma.payment.create({
        data: {
          invitationId: invitation.id,
          packageId: invitation.packageId,
          amountMinor: PRICE.amountMinor,
          currency: PRICE.currency,
          provider: "simulated",
          idempotencyKey: `${runId}-${randomUUID()}`,
        },
      });
      const base = {
        paymentId: payment.id,
        provider: "simulated",
        providerEventId: eventId(),
        type: "paid",
        outcome: "applied",
        payloadSha256: "a".repeat(64),
      };

      const stored = await prisma.paymentEvent.create({ data: base });
      assert.equal(stored.type, "paid");

      await assert.rejects(
        prisma.paymentEvent.create({
          data: { ...base, providerEventId: eventId(), type: "approved" },
        }),
        /PaymentEvent_type_allowed/,
      );
      await assert.rejects(
        prisma.paymentEvent.create({
          data: { ...base, providerEventId: eventId(), outcome: "maybe" },
        }),
        /PaymentEvent_outcome_allowed/,
      );
      await assert.rejects(
        prisma.paymentEvent.create({
          data: { ...base, providerEventId: eventId(), payloadSha256: "not-a-digest" },
        }),
        /PaymentEvent_payloadSha256_format/,
      );
    });

    it("refuses a duplicate (provider, providerEventId) and keeps the raw payload out of the schema", async () => {
      const invitation = await newInvitation();
      const payment = await prisma.payment.create({
        data: {
          invitationId: invitation.id,
          packageId: invitation.packageId,
          amountMinor: PRICE.amountMinor,
          currency: PRICE.currency,
          provider: "simulated",
          idempotencyKey: `${runId}-${randomUUID()}`,
        },
      });
      const data = {
        paymentId: payment.id,
        provider: "simulated",
        providerEventId: eventId(),
        type: "paid",
        outcome: "applied",
        payloadSha256: "b".repeat(64),
      };
      await prisma.paymentEvent.create({ data });

      await assert.rejects(prisma.paymentEvent.create({ data }), { code: "P2002" });
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'PaymentEvent'
      `;
      const names = columns.map((column) => column.column_name);
      assert.ok(names.includes("payloadSha256"));
      assert.equal(names.includes("payload"), false);
    });

    it("refuses deleting the invitation, the package, or the payment rows a payment depends on", async () => {
      const invitation = await newInvitation();
      const payment = await prisma.payment.create({
        data: {
          invitationId: invitation.id,
          packageId: invitation.packageId,
          amountMinor: PRICE.amountMinor,
          currency: PRICE.currency,
          provider: "simulated",
          idempotencyKey: `${runId}-${randomUUID()}`,
        },
      });
      await prisma.paymentEvent.create({
        data: {
          paymentId: payment.id,
          provider: "simulated",
          providerEventId: eventId(),
          type: "paid",
          outcome: "applied",
          payloadSha256: "c".repeat(64),
        },
      });

      await assert.rejects(prisma.invitation.delete({ where: { id: invitation.id } }));
      await assert.rejects(prisma.package.delete({ where: { id: invitation.packageId } }));
      await assert.rejects(prisma.payment.delete({ where: { id: payment.id } }));
    });
  });

  describe("checkout", () => {
    it("keeps the snapshot when the catalog price changes later (S1 exit criterion)", async () => {
      const invitation = await newInvitation();

      const first = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(first);
      await changePrice(invitation.packageId, { amountMinor: 90_000, currency: "MXN" });

      const second = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(second);
      assert.equal(second.paymentId, first.paymentId);
      assert.equal(second.amountMinor, PRICE.amountMinor);

      const status = await read.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.equal(status?.amountMinor, PRICE.amountMinor);
      assert.equal(status?.status, "pending");
    });

    it("converges two simultaneous checkouts on one pending payment", async () => {
      const invitation = await newInvitation();

      const [left, right] = await Promise.all([
        checkout.execute({ ownerId: invitation.ownerId, invitationId: invitation.id }),
        checkout.execute({ ownerId: invitation.ownerId, invitationId: invitation.id }),
      ]);

      assert.ok(left && right);
      assert.equal(left.paymentId, right.paymentId);
      const stored = await prisma.payment.findMany({ where: { invitationId: invitation.id } });
      assert.equal(stored.length, 1);
      assert.equal(stored[0]?.status, "pending");
      assert.equal(stored[0]?.amountMinor, PRICE.amountMinor);
    });

    it("refuses a checkout for a package whose price the catalog cannot answer", async () => {
      const invitation = await newInvitation({ packageId: await newPackage(null) });

      await assert.rejects(
        checkout.execute({ ownerId: invitation.ownerId, invitationId: invitation.id }),
        { name: "PaymentPriceUnavailableError" },
      );
      assert.equal(await prisma.payment.count({ where: { invitationId: invitation.id } }), 0);
    });

    it("refuses to buy the same invitation twice", async () => {
      const invitation = await newInvitation();
      const result = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(result);
      const [payment] = await prisma.payment.findMany({ where: { invitationId: invitation.id } });
      assert.ok(payment);
      await webhook.execute({
        provider: "simulated",
        ...signedDelivery(payment),
        receivedAt: new Date(),
      });

      await assert.rejects(
        checkout.execute({ ownerId: invitation.ownerId, invitationId: invitation.id }),
        { name: PaymentAlreadyPaidError.name },
      );
    });

    it("refuses a paid payment made for another package, and the pinned package cannot change", async () => {
      const invitation = await newInvitation();
      const otherPackageId = await newPackage();
      // An out-of-band repair is the only way this state can exist: the trigger refuses a normal change.
      const paid = await prisma.payment.create({
        data: {
          invitationId: invitation.id,
          packageId: otherPackageId,
          amountMinor: PRICE.amountMinor,
          currency: PRICE.currency,
          status: "paid",
          paidAt: new Date(),
          provider: "simulated",
          providerReference: `simulated-${randomUUID()}`,
          idempotencyKey: `${runId}-${randomUUID()}`,
        },
      });

      await assert.rejects(
        checkout.execute({ ownerId: invitation.ownerId, invitationId: invitation.id }),
        { name: InvitationPackageLockedByPaymentError.name },
      );

      await assert.rejects(
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { packageId: otherPackageId },
        }),
        /pinned fields are immutable/,
      );
      const [stored] = await prisma.payment.findMany({ where: { invitationId: invitation.id } });
      assert.equal(stored?.id, paid.id);
      assert.equal(stored?.status, "paid");
    });
  });

  describe("webhook intake", () => {
    it("applies a verified event and records a verified digest", async () => {
      const invitation = await newInvitation();
      const checkoutResult = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(checkoutResult);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: checkoutResult.paymentId },
      });

      const delivery = signedDelivery(payment);
      const result = await webhook.execute({
        provider: "simulated",
        ...delivery,
        receivedAt: new Date(),
      });

      assert.deepEqual(result, { outcome: "processed" });
      const paid = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      assert.equal(paid.status, "paid");
      assert.ok(paid.paidAt);
      const event = await prisma.paymentEvent.findFirstOrThrow({
        where: { paymentId: payment.id },
      });
      assert.equal(event.outcome, "applied");
      assert.deepEqual(event.paymentId, payment.id);
      assert.equal(event.payloadSha256.length, 64);
    });

    it("inserts nothing for a repeated delivery, so a provider retry is safe", async () => {
      const invitation = await newInvitation();
      const checkoutResult = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(checkoutResult);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: checkoutResult.paymentId },
      });
      const delivery = signedDelivery(payment);

      const first = await webhook.execute({
        provider: "simulated",
        ...delivery,
        receivedAt: new Date(),
      });
      const second = await webhook.execute({
        provider: "simulated",
        ...delivery,
        receivedAt: new Date(),
      });

      assert.deepEqual(first, { outcome: "processed" });
      assert.deepEqual(second, { outcome: "duplicate" });
      assert.equal(await prisma.paymentEvent.count({ where: { paymentId: payment.id } }), 1);
    });

    it("applies exactly one transition for two concurrent identical deliveries", async () => {
      const invitation = await newInvitation();
      const checkoutResult = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(checkoutResult);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: checkoutResult.paymentId },
      });
      const delivery = signedDelivery(payment);

      const results = await Promise.all([
        webhook.execute({ provider: "simulated", ...delivery, receivedAt: new Date() }),
        webhook.execute({ provider: "simulated", ...delivery, receivedAt: new Date() }),
      ]);

      assert.deepEqual(results.map((result) => result.outcome).sort(), ["duplicate", "processed"]);
      assert.equal(await prisma.paymentEvent.count({ where: { paymentId: payment.id } }), 1);
      const paid = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      assert.equal(paid.status, "paid");
    });

    it("records an out-of-order failure as ignored and keeps the payment paid", async () => {
      const invitation = await newInvitation();
      const checkoutResult = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(checkoutResult);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: checkoutResult.paymentId },
      });

      await webhook.execute({
        provider: "simulated",
        ...provider.buildEvent({ payment, type: "paid", at: new Date() }),
        receivedAt: new Date(),
      });
      const failed = provider.buildEvent({ payment, type: "failed", at: new Date() });
      const result = await webhook.execute({
        provider: "simulated",
        ...failed,
        receivedAt: new Date(),
      });

      assert.deepEqual(result, { outcome: "processed" });
      const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      assert.equal(stored.status, "paid");
      const events = await prisma.paymentEvent.findMany({
        where: { paymentId: payment.id },
        orderBy: { receivedAt: "asc" },
      });
      assert.deepEqual(
        events.map((event) => event.outcome),
        ["applied", "ignored_transition"],
      );
    });

    it("refuses an amount that differs from the snapshot and records the refusal", async () => {
      const invitation = await newInvitation();
      const checkoutResult = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(checkoutResult);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: checkoutResult.paymentId },
      });

      await webhook.execute({
        provider: "simulated",
        ...provider.buildEvent({
          payment: { ...payment, amountMinor: payment.amountMinor + 1 },
          type: "paid",
          at: new Date(),
        }),
        receivedAt: new Date(),
      });

      const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      assert.equal(stored.status, "pending");
      const event = await prisma.paymentEvent.findFirstOrThrow({
        where: { paymentId: payment.id },
      });
      assert.equal(event.outcome, "refused_amount");
    });

    it("writes nothing at all for a delivery whose signature does not verify", async () => {
      const invitation = await newInvitation();
      const checkoutResult = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(checkoutResult);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: checkoutResult.paymentId },
      });
      const delivery = signedDelivery(payment);

      await assert.rejects(
        webhook.execute({
          provider: "simulated",
          rawBody: delivery.rawBody,
          headers: { "x-invitame-signature": `t=1,v1=${"0".repeat(64)}` },
          receivedAt: new Date(),
        }),
        { name: "PaymentWebhookRejectedError" },
      );

      assert.equal(await prisma.paymentEvent.count({ where: { paymentId: payment.id } }), 0);
      const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      assert.equal(stored.status, "pending");
    });
  });

  describe("publication gate", () => {
    const gate = new PaymentGate(PAYMENTS_MODE.SIMULATED, catalog, repository);

    it("requires a payment for a priced package with nothing paid", async () => {
      const invitation = await newInvitation();

      assert.deepEqual(await gate.publicationPaymentRequired(invitationRecordOf(invitation)), {
        required: true,
        reason: "PAYMENT_REQUIRED",
      });
    });

    it("grants publication after the verified paid event", async () => {
      const invitation = await newInvitation();
      const checkoutResult = await checkout.execute({
        ownerId: invitation.ownerId,
        invitationId: invitation.id,
      });
      assert.ok(checkoutResult);
      const payment = await prisma.payment.findUniqueOrThrow({
        where: { id: checkoutResult.paymentId },
      });
      await webhook.execute({
        provider: "simulated",
        ...signedDelivery(payment),
        receivedAt: new Date(),
      });

      assert.deepEqual(await gate.publicationPaymentRequired(invitationRecordOf(invitation)), {
        required: false,
      });
    });

    it("needs no payment for a package whose current price is zero", async () => {
      const invitation = await newInvitation({
        packageId: await newPackage({ amountMinor: 0, currency: "MXN" }),
      });

      assert.deepEqual(await gate.publicationPaymentRequired(invitationRecordOf(invitation)), {
        required: false,
      });
    });

    it("stays free in a free deployment, whatever the rows say", async () => {
      const freeGate = new PaymentGate(PAYMENTS_MODE.FREE, catalog, repository);
      const invitation = await newInvitation();

      assert.deepEqual(await freeGate.publicationPaymentRequired(invitationRecordOf(invitation)), {
        required: false,
      });
    });
  });
});
