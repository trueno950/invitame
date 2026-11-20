import "reflect-metadata";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { Global, type INestApplication, Module } from "@nestjs/common";

import { AppModule } from "../app.module";
import { createApp } from "../app.setup";
import { PrismaService } from "../database/prisma.service";
import { INVITATION_PAYMENT_READER } from "../invitations/application/invitation-payment-summary";
import { INVITATION_REPOSITORY } from "../invitations/application/invitation.repository";
import type { InvitationPaymentGate } from "../invitations/application/invitation-payment-gate";
import { INVITATION_PAYMENT_GATE } from "../invitations/application/invitation-payment-gate";
import { PAYMENT_REPOSITORY } from "./application/payment.repository";
import { PAYMENT_CATALOG } from "./application/payment-catalog";
import { PAYMENT_PROVIDER } from "./application/payment-provider.port";
import { CatalogPaymentPrices } from "./infrastructure/catalog-payment-prices";
import { DisabledPaymentProvider } from "./infrastructure/disabled-payment-provider";
import { MercadoPagoPaymentProvider } from "./infrastructure/mercadopago-payment-provider";
import { PaymentGate } from "./infrastructure/payment-gate";
import { PrismaInvitationPaymentReader } from "./infrastructure/prisma-invitation-payment-reader";
import { PrismaPaymentRepository } from "./infrastructure/prisma-payment.repository";
import { PaymentsModule } from "./payments.module";
import { AdminPaymentsController } from "./presentation/admin-payments.controller";

// PaymentsModule composition (M7 S1, S3, S4): the module provides the provider, the payment repository, the catalog
// price read, and the publication gate, exports the gate the invitations module asks, and registers the owner and
// public routes. A Prisma stub stands in for the database, so the suite never connects to one; no adapter is
// exercised here beyond the free-mode answers. It also proves the development default: with no `PAYMENTS_MODE`,
// `PAYMENTS_SIMULATED_SECRET`, or `PAYMENTS_RETURN_BASE_URL`, the real `AppModule` starts and serves the payment
// routes in `free` mode, which is what keeps the running development server healthy without a migration or a secret.

@Global()
@Module({ providers: [{ provide: PrismaService, useValue: {} }], exports: [PrismaService] })
class StubDatabaseModule {}

describe("PaymentsModule wiring", () => {
  it("binds the ports of the free mode and exports the publication gate", async () => {
    const app = await createApp(
      AppModule.forRoot({
        environment: {
          NODE_ENV: "development",
          CORS_ORIGIN: "http://localhost:3000",
          // Syntactically valid and never connected: the stub replaces the Prisma client.
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
          AUTH_BASE_URL: "http://localhost:3000",
        },
        database: StubDatabaseModule,
      }),
      { logger: false, abortOnError: false },
    );

    try {
      assert.ok(app.get(PAYMENT_REPOSITORY, { strict: false }) instanceof PrismaPaymentRepository);
      assert.ok(app.get(PAYMENT_CATALOG, { strict: false }) instanceof CatalogPaymentPrices);
      assert.ok(app.get(PAYMENT_PROVIDER, { strict: false }) instanceof DisabledPaymentProvider);
      // The payment facet of the administrator's invitation status view (M9 T2; S1) is its own port and adapter.
      assert.ok(
        app.get(INVITATION_PAYMENT_READER, { strict: false }) instanceof
          PrismaInvitationPaymentReader,
      );

      const gate = app.get<InvitationPaymentGate>(INVITATION_PAYMENT_GATE, { strict: false });
      assert.ok(gate instanceof PaymentGate);
      // The development default is `free`: publishing needs no payment, exactly like Milestone 5 (S3, S4).
      assert.deepEqual(
        await gate.publicationPaymentRequired({
          id: "00000000-0000-4000-8000-000000000000",
          ownerId: "00000000-0000-4000-8000-000000000001",
          templateVersionId: "00000000-0000-4000-8000-000000000002",
          packageId: "00000000-0000-4000-8000-000000000003",
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
          firstPublishedAt: null,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        { required: false },
      );
      // The invitations module still binds its own repository; the gate is the payments module's, not a second one.
      assert.ok(app.get(INVITATION_REPOSITORY, { strict: false }) !== undefined);
    } finally {
      await app.close();
    }
  });

  it("registers the owner, public, and administrator payment controllers", () => {
    const controllers: unknown = Reflect.getMetadata("controllers", PaymentsModule) ?? [];

    assert.equal((controllers as unknown[]).length, 3);
    assert.ok((controllers as unknown[]).includes(AdminPaymentsController));
  });

  it("binds the Mercado Pago adapter when the mode selects it (T1)", async () => {
    const app = await createApp(
      AppModule.forRoot({
        environment: {
          NODE_ENV: "development",
          CORS_ORIGIN: "http://localhost:3000",
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
          AUTH_BASE_URL: "http://localhost:3000",
          PAYMENTS_MODE: "mercadopago",
          MERCADOPAGO_ACCESS_TOKEN: "test-access-token-not-a-real-credential",
          MERCADOPAGO_WEBHOOK_SECRET: "test-webhook-secret-not-a-real-credential",
          PAYMENTS_WEBHOOK_BASE_URL: "https://api.example.test",
        },
        database: StubDatabaseModule,
      }),
      { logger: false, abortOnError: false },
    );

    try {
      assert.ok(app.get(PAYMENT_PROVIDER, { strict: false }) instanceof MercadoPagoPaymentProvider);
    } finally {
      await app.close();
    }
  });
});

describe("AppModule payment routes in a development default", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    app = await createApp(
      AppModule.forRoot({
        environment: {
          NODE_ENV: "development",
          CORS_ORIGIN: "http://localhost:3000",
          DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
          BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
          AUTH_BASE_URL: "http://localhost:3000",
        },
        database: StubDatabaseModule,
      }),
      { logger: false, abortOnError: false },
    );
    await app.listen(0, "127.0.0.1");
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await app?.close();
  });

  it("serves the payment routes: owner routes behind the guard, the webhook public but refusing", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const ownerRoutes: Array<[string, string]> = [
      ["POST", `/invitations/${id}/checkout`],
      ["GET", `/invitations/${id}/payment`],
      ["POST", `/payments/simulated/${id}/emit`],
      ["GET", "/admin/payments?status=paid&limit=10"],
      ["GET", `/admin/payments/${id}`],
      ["POST", `/admin/payments/${id}/refund`],
    ];

    for (const [method, path] of ownerRoutes) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "POST" && path.includes("/emit")
          ? { body: JSON.stringify({ outcome: "paid" }) }
          : {}),
      });
      assert.equal(response.status, 401, `${method} ${path}`);
    }

    // No provider is configured in `free` mode, so the public route answers 404 for any provider key and writes
    // nothing; it is registered, and it never needs a session.
    const webhook = await fetch(`${baseUrl}/payments/webhooks/simulated`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(webhook.status, 404);
    assert.deepEqual(await webhook.json(), { code: "PAYMENT_PROVIDER_NOT_FOUND" });
  });
});
