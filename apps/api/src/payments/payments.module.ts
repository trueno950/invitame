import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  CATALOG_PUBLIC_READER,
  type CatalogPublicContract,
} from "../catalog/application/public/catalog-public-reader";
import { CatalogModule } from "../catalog/catalog.module";
import {
  PAYMENTS_MODE,
  type PaymentsEnvironment,
  type RuntimeEnvironment,
} from "../config/environment";
import { PrismaService } from "../database/prisma.service";
import { INVITATION_PAYMENT_GATE } from "../invitations/application/invitation-payment-gate";
import { PAYMENT_REFUND_REPOSITORY, PAYMENT_REPOSITORY } from "./application/payment.repository";
import {
  EmitSimulatedPaymentUseCase,
  GetInvitationPaymentUseCase,
  StartCheckoutUseCase,
} from "./application/payment.use-cases";
import { PAYMENT_CATALOG } from "./application/payment-catalog";
import { PAYMENT_PROVIDER, type PaymentProvider } from "./application/payment-provider.port";
import { HandlePaymentWebhookUseCase } from "./application/payment-webhook.use-case";
import { PAYMENTS_MODE_TOKEN, type PaymentsModeSetting } from "./application/payments-mode";
import { ListAdminPaymentsUseCase, RefundPaymentUseCase } from "./application/refund.use-cases";
import { CatalogPaymentPrices } from "./infrastructure/catalog-payment-prices";
import { DisabledPaymentProvider } from "./infrastructure/disabled-payment-provider";
import { MercadoPagoPaymentProvider } from "./infrastructure/mercadopago-payment-provider";
import { PaymentGate } from "./infrastructure/payment-gate";
import { PrismaPaymentRepository } from "./infrastructure/prisma-payment.repository";
import { SimulatedPaymentProvider } from "./infrastructure/simulated-payment-provider";
import { AdminPaymentsController } from "./presentation/admin-payments.controller";
import { InvitationPaymentsController } from "./presentation/invitation-payments.controller";
import { PaymentsController } from "./presentation/payments.controller";

/**
 * The provider adapter of the validated mode (M7 S4; Mercado Pago T1). `free` binds an adapter that refuses to charge,
 * `simulated` binds the development provider with its validated secret and return origin, and `mercadopago` binds the
 * real provider with its validated credentials and origins. Nothing else in the application branches on the mode.
 */
function createPaymentProvider(payments: PaymentsEnvironment): PaymentProvider {
  switch (payments.mode) {
    case PAYMENTS_MODE.FREE:
      return new DisabledPaymentProvider();
    case PAYMENTS_MODE.SIMULATED:
      return new SimulatedPaymentProvider({
        secret: payments.secret,
        returnBaseUrl: payments.returnBaseUrl,
      });
    case PAYMENTS_MODE.MERCADOPAGO:
      return new MercadoPagoPaymentProvider({
        accessToken: payments.accessToken,
        webhookSecret: payments.webhookSecret,
        // Checkout Pro returns the browser to the web's own return page, under the invitation it pays for.
        returnBaseUrl: payments.returnBaseUrl,
        webhookBaseUrl: payments.webhookBaseUrl,
        apiBaseUrl: payments.apiBaseUrl,
      });
  }
}

/**
 * Checkout and payments (M7 S1, S3, S4): the `Payment`/`PaymentEvent` persistence port and its Prisma adapter, the
 * provider port and the adapters the mode selects, the catalog price read through the catalog's public contract, the
 * publication gate the invitations module asks (it exports `INVITATION_PAYMENT_GATE`), the owner routes at
 * `/invitations/:id/checkout` and `/invitations/:id/payment`, the public webhook plus the development emit under
 * `/payments`, and the administrator refund routes under `/admin/payments` (T2, S3). The module owns no invitation
 * table logic of its own beyond the owner-scoped reads its adapter runs, which is the same rule the media module
 * follows: the owner travels in the query (A4, S9).
 *
 * The gate lives here because the payments module owns the entitlement rule, and the invitations module imports this
 * module instead of binding an adapter of its own — the one seam Milestone 5 left for exactly this (S3).
 */
@Module({
  imports: [CatalogModule],
  controllers: [InvitationPaymentsController, PaymentsController, AdminPaymentsController],
  providers: [
    {
      provide: PAYMENTS_MODE_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeEnvironment, true>): PaymentsModeSetting =>
        config.get("PAYMENTS", { infer: true }).mode,
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<RuntimeEnvironment, true>): PaymentProvider =>
        createPaymentProvider(config.get("PAYMENTS", { infer: true })),
    },
    {
      provide: PAYMENT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaPaymentRepository(prisma),
    },
    {
      // The administrator refund port (T2, S3): the same adapter, bound separately so no owner-scoped use case can
      // reach the global paid read or the first-publication history by accident. The adapter is stateless.
      provide: PAYMENT_REFUND_REPOSITORY,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaPaymentRepository(prisma),
    },
    {
      provide: PAYMENT_CATALOG,
      inject: [CATALOG_PUBLIC_READER],
      useFactory: (catalog: CatalogPublicContract) => new CatalogPaymentPrices(catalog),
    },
    {
      provide: HandlePaymentWebhookUseCase,
      inject: [PAYMENT_REPOSITORY, PAYMENT_PROVIDER],
      useFactory: (payments: PrismaPaymentRepository, provider: PaymentProvider) =>
        new HandlePaymentWebhookUseCase(payments, provider),
    },
    {
      provide: StartCheckoutUseCase,
      inject: [PAYMENT_REPOSITORY, PAYMENT_CATALOG, PAYMENT_PROVIDER, PAYMENTS_MODE_TOKEN],
      useFactory: (
        payments: PrismaPaymentRepository,
        catalog: CatalogPaymentPrices,
        provider: PaymentProvider,
        mode: PaymentsModeSetting,
      ) => new StartCheckoutUseCase(payments, catalog, provider, mode),
    },
    {
      provide: GetInvitationPaymentUseCase,
      inject: [PAYMENT_REPOSITORY, PAYMENT_CATALOG, PAYMENTS_MODE_TOKEN],
      useFactory: (
        payments: PrismaPaymentRepository,
        catalog: CatalogPaymentPrices,
        mode: PaymentsModeSetting,
      ) => new GetInvitationPaymentUseCase(payments, catalog, mode),
    },
    {
      provide: EmitSimulatedPaymentUseCase,
      inject: [
        PAYMENT_REPOSITORY,
        PAYMENT_PROVIDER,
        PAYMENTS_MODE_TOKEN,
        HandlePaymentWebhookUseCase,
      ],
      useFactory: (
        payments: PrismaPaymentRepository,
        provider: PaymentProvider,
        mode: PaymentsModeSetting,
        webhook: HandlePaymentWebhookUseCase,
      ) => new EmitSimulatedPaymentUseCase(payments, provider, mode, webhook),
    },
    {
      provide: RefundPaymentUseCase,
      inject: [PAYMENT_REFUND_REPOSITORY, PAYMENT_PROVIDER],
      useFactory: (payments: PrismaPaymentRepository, provider: PaymentProvider) =>
        new RefundPaymentUseCase(payments, provider),
    },
    {
      provide: ListAdminPaymentsUseCase,
      inject: [PAYMENT_REFUND_REPOSITORY],
      useFactory: (payments: PrismaPaymentRepository) => new ListAdminPaymentsUseCase(payments),
    },
    {
      provide: INVITATION_PAYMENT_GATE,
      inject: [PAYMENTS_MODE_TOKEN, PAYMENT_CATALOG, PAYMENT_REPOSITORY],
      useFactory: (
        mode: PaymentsModeSetting,
        catalog: CatalogPaymentPrices,
        payments: PrismaPaymentRepository,
      ) => new PaymentGate(mode, catalog, payments),
    },
  ],
  exports: [INVITATION_PAYMENT_GATE],
})
export class PaymentsModule {}
