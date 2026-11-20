import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { type INestApplication, Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { MemoryPaymentRepository } from "../../../test/memory-payments";
import { createApp } from "../../app.setup";
import { AccessControlModule } from "../../auth/access-control/access-control.module";
import { createAuth } from "../../auth/auth.factory";
import { BackgroundTasks } from "../../auth/sign-in-code/background-tasks";
import { SignInCodeSender } from "../../auth/sign-in-code/sign-in-code-sender";
import { createConfigModule } from "../../config/config.module";
import { EmailDeliveryService } from "../../email/application/email-delivery.service";
import { InMemoryEmailSender } from "../../email/infrastructure/in-memory-email-sender";
import { SystemEmailDeliveryRuntime } from "../../email/infrastructure/system-email-delivery-runtime";
import type {
  AdminPaymentRow,
  PaymentRefundRepository,
  RefundTarget,
} from "../application/payment.repository";
import { PAYMENT_REFUND_REPOSITORY } from "../application/payment.repository";
import { PaymentInvitationAlreadyPublishedError } from "../application/payment.errors";
import type {
  CheckoutIntent,
  CheckoutSession,
  PaymentProvider,
  RefundResult,
  WebhookVerification,
} from "../application/payment-provider.port";
import { PAYMENT_PROVIDER } from "../application/payment-provider.port";
import { ListAdminPaymentsUseCase, RefundPaymentUseCase } from "../application/refund.use-cases";
import type { PaymentStatus } from "../domain/payment";
import { AdminPaymentsController } from "./admin-payments.controller";

// The administrator refund routes (T2, S3, S4) through the shared `createApp` boundary, the project-owned guard, and
// Better Auth on the in-memory adapter. What this suite owns is the HTTP contract: 401 without a session, 403 for a
// signed-in customer, 400 for an unvalidated id, limit, or status, 404/409/503 for the refund refusals, and 200 for
// the read and the accepted refund command. The provider is a fake, so no network and no credentials are involved;
// PostgreSQL behavior is proved in the `*.db-spec.ts` suite.

const TRUSTED_ORIGIN = "http://localhost:3000";
const AUTH_BASE_URL = "http://localhost:3000";
const SESSION_COOKIE = "better-auth.session_token";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const PATH = "/admin/payments";
const PAID_AT = new Date("2026-11-23T09:00:00.000Z");

type Row = Record<string, unknown>;

/** The refund persistence port over the same in-memory payments the other suites use. */
class RefundRepository extends MemoryPaymentRepository implements PaymentRefundRepository {
  private readonly firstPublishedAt = new Map<string, Date>();
  private readonly slugs = new Map<string, string>();
  readonly requestedAt = new Map<string, Date>();

  setSlug(invitationId: string, slug: string): void {
    this.slugs.set(invitationId, slug);
  }

  markPublished(invitationId: string): void {
    this.firstPublishedAt.set(invitationId, new Date("2026-11-24T10:00:00.000Z"));
  }

  seed(options: { status?: PaymentStatus; published?: boolean } = {}) {
    const invitation = this.seedInvitation();
    this.setSlug(invitation.id, "cumple-ana");
    if (options.published === true) {
      this.markPublished(invitation.id);
    }
    const status = options.status ?? "paid";
    const payment = this.seedPayment({
      invitationId: invitation.id,
      packageId: invitation.packageId,
      status,
      providerReference: `ref-${invitation.id}`,
      paidAt: status === "paid" || status === "refunded" ? PAID_AT : null,
      provider: "mercadopago",
    });

    return { invitation, payment };
  }

  async findRefundTarget(paymentId: string): Promise<RefundTarget | null> {
    const payment = this.payments.find((stored) => stored.id === paymentId);
    if (payment === undefined) {
      return null;
    }

    return {
      paymentId: payment.id,
      invitationId: payment.invitationId,
      provider: payment.provider,
      providerReference: payment.providerReference,
      status: payment.status,
      firstPublishedAt: this.firstPublishedAt.get(payment.invitationId) ?? null,
    };
  }

  async claimRefund(paymentId: string, at: Date): Promise<void> {
    const payment = this.payments.find((stored) => stored.id === paymentId);
    if (payment === undefined) {
      return;
    }
    if (this.firstPublishedAt.has(payment.invitationId)) {
      throw new PaymentInvitationAlreadyPublishedError();
    }
    this.requestedAt.set(payment.invitationId, at);
  }

  async listPaidForAdmin(limit: number): Promise<AdminPaymentRow[]> {
    return this.payments
      .filter((payment) => payment.status === "paid")
      .sort((left, right) => (right.paidAt?.getTime() ?? 0) - (left.paidAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((payment) => ({
        paymentId: payment.id,
        invitationId: payment.invitationId,
        invitationSlug: this.slugs.get(payment.invitationId) ?? "",
        status: payment.status,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paidAt: payment.paidAt,
        firstPublishedAt: this.firstPublishedAt.get(payment.invitationId) ?? null,
        refundRequestedAt: this.requestedAt.get(payment.invitationId) ?? null,
      }));
  }
}

class FakeRefundProvider implements PaymentProvider {
  readonly key = "mercadopago";
  readonly refunds: Array<{ providerReference: string; idempotencyKey: string }> = [];
  result: RefundResult = { ok: true };

  async createCheckout(intent: CheckoutIntent): Promise<CheckoutSession> {
    throw new Error(`createCheckout is not this suite's boundary (${intent.paymentId})`);
  }

  async verifyWebhook(): Promise<WebhookVerification> {
    return { ok: false };
  }

  async refund(providerReference: string, idempotencyKey: string): Promise<RefundResult> {
    this.refunds.push({ providerReference, idempotencyKey });

    return this.result;
  }
}

interface Harness {
  app: INestApplication;
  repository: RefundRepository;
  provider: FakeRefundProvider;
  signIn(role: "CUSTOMER" | "ADMIN"): Promise<string>;
  send(method: string, path: string, options?: { cookie?: string }): Promise<Response>;
}

async function startHarness(): Promise<Harness> {
  const database: Record<string, Row[]> = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const secret = randomBytes(32).toString("base64url");
  const auth = createAuth({
    secret,
    baseURL: AUTH_BASE_URL,
    trustedOrigins: [TRUSTED_ORIGIN],
    database: memoryAdapter(database),
    signInCodes: new SignInCodeSender(
      new EmailDeliveryService(new InMemoryEmailSender(), new SystemEmailDeliveryRuntime()),
      new BackgroundTasks(() => {}),
    ),
    clientIp: { header: "x-forwarded-for", trustedProxies: [] },
    requireClientIp: false,
    requireProxySecret: false,
    log: () => {},
  });

  const repository = new RefundRepository();
  const provider = new FakeRefundProvider();

  @Module({
    imports: [
      createConfigModule({
        NODE_ENV: "development",
        CORS_ORIGIN: TRUSTED_ORIGIN,
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        BETTER_AUTH_SECRET: secret,
        AUTH_BASE_URL,
        PAYMENTS_MODE: "mercadopago",
        MERCADOPAGO_ACCESS_TOKEN: "test-access-token",
        MERCADOPAGO_WEBHOOK_SECRET: "test-webhook-secret",
        PAYMENTS_WEBHOOK_BASE_URL: "https://api.example.test",
      }),
      AuthModule.forRoot({ auth, disableTrustedOriginsCors: true, disableGlobalAuthGuard: true }),
      AccessControlModule,
    ],
    controllers: [AdminPaymentsController],
    providers: [
      { provide: PAYMENT_REFUND_REPOSITORY, useValue: repository },
      { provide: PAYMENT_PROVIDER, useValue: provider },
      {
        provide: RefundPaymentUseCase,
        useValue: new RefundPaymentUseCase(repository, provider),
      },
      {
        provide: ListAdminPaymentsUseCase,
        useValue: new ListAdminPaymentsUseCase(repository),
      },
    ],
  })
  class AdminPaymentsTestModule {}

  const app = await createApp(AdminPaymentsTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  let counter = 0;

  return {
    app,
    repository,
    provider,
    async signIn(role): Promise<string> {
      counter += 1;
      const context = await auth.$context;
      const created = await context.internalAdapter.createUser(
        {
          email: `t2-payments-${counter}-${randomBytes(4).toString("hex")}@example.test`,
          name: "",
          emailVerified: true,
        },
        { method: "email-otp" },
      );
      const session = await context.internalAdapter.createSession(created.id);
      const signature = createHmac("sha256", secret).update(session.token).digest("base64");
      const user = database.user?.find((row) => row.id === created.id);
      assert.ok(user);

      if (role === "ADMIN") {
        // An enrolled administrator whose session passed the second factor (S21, S52).
        user.role = "ADMIN";
        user.twoFactorEnabled = true;
        for (const row of database.session?.filter((stored) => stored.userId === created.id) ??
          []) {
          row.secondFactorVerified = true;
        }
      }

      return `${SESSION_COOKIE}=${encodeURIComponent(`${session.token}.${signature}`)}`;
    },
    send(method, path, options = {}) {
      return fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
      });
    },
  };
}

describe("admin payment routes (T2, S3, S4)", () => {
  let harness: Harness;
  let adminCookie: string;
  let customerCookie: string;

  before(async () => {
    harness = await startHarness();
    adminCookie = await harness.signIn("ADMIN");
    customerCookie = await harness.signIn("CUSTOMER");
  });

  after(async () => {
    await harness?.app.close();
  });

  describe("authorization", () => {
    it("answers 401 without a session and reaches no port", async () => {
      for (const [method, path] of [
        ["GET", `${PATH}?status=paid&limit=10`],
        ["POST", `${PATH}/${UNKNOWN_ID}/refund`],
      ] as const) {
        const response = await harness.send(method, path);

        assert.equal(response.status, 401, `${method} ${path}`);
      }
      assert.deepEqual(harness.provider.refunds, []);
      assert.equal(harness.repository.payments.length, 0);
    });

    it("answers 403 to a signed-in customer", async () => {
      for (const [method, path] of [
        ["GET", `${PATH}?status=paid&limit=10`],
        ["POST", `${PATH}/${UNKNOWN_ID}/refund`],
      ] as const) {
        const response = await harness.send(method, path, { cookie: customerCookie });

        assert.equal(response.status, 403, `${method} ${path}`);
      }
      assert.deepEqual(harness.provider.refunds, []);
    });

    it("answers 400 for an id that is not a UUID, before reaching a port", async () => {
      const response = await harness.send("POST", `${PATH}/not-a-uuid/refund`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 400);
      assert.deepEqual(harness.provider.refunds, []);
    });

    it("answers 400 for a limit outside 1..50 and for a status this read does not list", async () => {
      for (const query of ["limit=0", "limit=51", "limit=abc", "status=pending", "unknown=1"]) {
        const response = await harness.send("GET", `${PATH}?${query}`, { cookie: adminCookie });

        assert.equal(response.status, 400, query);
      }
    });
  });

  describe("refund command", () => {
    it("asks the provider for the refund and answers 200 requested without moving the payment", async () => {
      const { payment } = harness.repository.seed();

      const response = await harness.send("POST", `${PATH}/${payment.id}/refund`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { outcome: "requested" });
      assert.deepEqual(harness.provider.refunds, [
        {
          providerReference: `ref-${payment.invitationId}`,
          idempotencyKey: `refund-${payment.id}`,
        },
      ]);
      assert.equal(harness.repository.payments[0]?.status, "paid");
    });

    it("answers 404 PAYMENT_NOT_FOUND for an unknown payment", async () => {
      const response = await harness.send("POST", `${PATH}/${UNKNOWN_ID}/refund`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { code: "PAYMENT_NOT_FOUND" });
    });

    it("answers 409 PAYMENT_NOT_REFUNDABLE unless the payment is paid", async () => {
      const { payment } = harness.repository.seed({ status: "pending" });
      const asked = harness.provider.refunds.length;

      const response = await harness.send("POST", `${PATH}/${payment.id}/refund`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "PAYMENT_NOT_REFUNDABLE" });
      assert.equal(harness.provider.refunds.length, asked);
    });

    it("answers 409 INVITATION_ALREADY_PUBLISHED for a paid invitation that was ever published", async () => {
      const { payment } = harness.repository.seed({ published: true });
      const asked = harness.provider.refunds.length;

      const response = await harness.send("POST", `${PATH}/${payment.id}/refund`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { code: "INVITATION_ALREADY_PUBLISHED" });
      assert.equal(harness.provider.refunds.length, asked);
    });

    it("answers 503 PAYMENT_PROVIDER_UNAVAILABLE when the provider refuses", async () => {
      const { payment } = harness.repository.seed();
      harness.provider.result = { ok: false };

      try {
        const response = await harness.send("POST", `${PATH}/${payment.id}/refund`, {
          cookie: adminCookie,
        });

        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { code: "PAYMENT_PROVIDER_UNAVAILABLE" });
        assert.equal(harness.repository.payments[0]?.status, "paid");
      } finally {
        harness.provider.result = { ok: true };
      }
    });
  });

  describe("bounded paid read", () => {
    it("lists the newest paid payments with the invitation slug and the refundable flag", async () => {
      const first = harness.repository.seed();
      const second = harness.repository.seed({ published: true });

      const response = await harness.send("GET", `${PATH}?status=paid&limit=50`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 200);
      const rows = (await response.json()) as Row[];
      assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), [
        "amountMinor",
        "currency",
        "invitationId",
        "invitationSlug",
        "paidAt",
        "paymentId",
        "refundable",
        "status",
      ]);
      const byPayment = new Map(rows.map((row) => [row.paymentId, row]));
      assert.deepEqual(byPayment.get(first.payment.id), {
        paymentId: first.payment.id,
        invitationId: first.invitation.id,
        invitationSlug: "cumple-ana",
        status: "paid",
        amountMinor: first.payment.amountMinor,
        currency: "MXN",
        paidAt: PAID_AT.toISOString(),
        refundable: true,
      });
      assert.equal(byPayment.get(second.payment.id)?.refundable, false);
    });

    it("answers at most the requested bound", async () => {
      const response = await harness.send("GET", `${PATH}?status=paid&limit=1`, {
        cookie: adminCookie,
      });

      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as Row[]).length, 1);
    });
  });
});
