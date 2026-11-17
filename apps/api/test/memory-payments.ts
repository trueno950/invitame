import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type {
  InsertEventResult,
  NewPaymentEvent,
  NewPendingPayment,
  PaymentEventTransaction,
  PaymentRecord,
  PaymentRepository,
  PaymentTarget,
} from "../src/payments/application/payment.repository";
import type {
  CatalogPackagePrice,
  PaymentCatalog,
} from "../src/payments/application/payment-catalog";
import { PAYMENT_STATUS } from "../src/payments/domain/payment";

// Harness fakes of the payments ports (M7 S4) for the `*.spec.ts` suites, which run with no database: the payment
// repository, its intake transaction, and the catalog price read. They implement the same contract as the Prisma
// adapters, including the parts the real ones get from the database — one pending payment per invitation and one
// stored row per `(provider, eventId)` — so a use case can be observed without PostgreSQL. The SQL, the partial
// unique indexes, and the real transaction are proved in `src/payments/infrastructure/*.db-spec.ts`.

/** The invitation table the repository reads, owner-scoped, exactly like the Prisma adapter. */
export interface StoredInvitation extends PaymentTarget {
  ownerId: string;
}

/** One stored event, with the decision the intake wrote on it. */
export type StoredPaymentEvent = NewPaymentEvent & {
  id: string;
  processedAt: Date | null;
};

export class MemoryPaymentRepository implements PaymentRepository {
  readonly invitations: StoredInvitation[] = [];
  readonly payments: PaymentRecord[] = [];
  readonly events: StoredPaymentEvent[] = [];
  /** How many intake transactions ran, so a test can assert that a refused delivery opened none. */
  transactions = 0;

  seedInvitation(overrides: Partial<StoredInvitation> = {}): StoredInvitation {
    const invitation: StoredInvitation = {
      id: randomUUID(),
      ownerId: randomUUID(),
      packageId: randomUUID(),
      status: "DRAFT",
      ...overrides,
    };
    this.invitations.push(invitation);
    return invitation;
  }

  seedPayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
    const created = new Date(Date.UTC(2026, 10, 21, 10, this.payments.length));
    const payment: PaymentRecord = {
      id: randomUUID(),
      invitationId: this.invitations[0]?.id ?? randomUUID(),
      packageId: this.invitations[0]?.packageId ?? randomUUID(),
      amountMinor: 25_000,
      currency: "MXN",
      status: PAYMENT_STATUS.PENDING,
      provider: "simulated",
      providerReference: `ref-${this.payments.length}`,
      idempotencyKey: `key-${this.payments.length}`,
      createdAt: created,
      paidAt: null,
      updatedAt: created,
      ...overrides,
    };
    this.payments.push(payment);
    return payment;
  }

  async findOwnedInvitation(ownerId: string, invitationId: string): Promise<PaymentTarget | null> {
    const stored = this.invitations.find(
      (invitation) => invitation.id === invitationId && invitation.ownerId === ownerId,
    );
    return stored ? { id: stored.id, packageId: stored.packageId, status: stored.status } : null;
  }

  async findOwnedPayment(ownerId: string, paymentId: string): Promise<PaymentRecord | null> {
    const payment = this.payments.find((stored) => stored.id === paymentId);
    if (!payment) {
      return null;
    }
    const invitation = this.invitations.find((stored) => stored.id === payment.invitationId);

    return invitation?.ownerId === ownerId ? structuredClone(payment) : null;
  }

  async listForInvitation(invitationId: string): Promise<PaymentRecord[]> {
    return this.payments
      .filter((payment) => payment.invitationId === invitationId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map((payment) => structuredClone(payment));
  }

  async createOrReusePending(input: NewPendingPayment): Promise<PaymentRecord> {
    // The real adapter relies on the partial unique index for this; the fake states the same rule in one step.
    const pending = this.payments.find(
      (payment) =>
        payment.invitationId === input.invitationId && payment.status === PAYMENT_STATUS.PENDING,
    );
    if (pending) {
      return structuredClone(pending);
    }

    const created: PaymentRecord = {
      id: randomUUID(),
      invitationId: input.invitationId,
      packageId: input.packageId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: PAYMENT_STATUS.PENDING,
      provider: input.provider,
      providerReference: null,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date(Date.UTC(2026, 10, 21, 10, this.payments.length)),
      paidAt: null,
      updatedAt: new Date(Date.UTC(2026, 10, 21, 10, this.payments.length)),
    };
    this.payments.push(created);

    return structuredClone(created);
  }

  async attachProviderReference(
    paymentId: string,
    provider: string,
    providerReference: string,
  ): Promise<PaymentRecord | null> {
    const payment = this.payments.find((stored) => stored.id === paymentId);
    if (!payment) {
      return null;
    }
    if (payment.providerReference === null) {
      payment.provider = provider;
      payment.providerReference = providerReference;
    }

    return structuredClone(payment);
  }

  async transaction<T>(work: (transaction: PaymentEventTransaction) => Promise<T>): Promise<T> {
    this.transactions += 1;
    const transaction: PaymentEventTransaction = {
      findPaymentByProviderReference: async (provider, providerReference) => {
        const payment = this.payments.find(
          (stored) =>
            stored.provider === provider && stored.providerReference === providerReference,
        );
        return payment ? structuredClone(payment) : null;
      },
      insertEvent: async (event): Promise<InsertEventResult> => {
        const duplicate = this.events.some(
          (stored) =>
            stored.provider === event.provider && stored.providerEventId === event.providerEventId,
        );
        if (duplicate) {
          return { created: false };
        }
        const id = randomUUID();
        this.events.push({ ...event, id, processedAt: null });
        return { created: true, eventId: id };
      },
      transition: async ({ paymentId, from, to, at }) => {
        const payment = this.payments.find((stored) => stored.id === paymentId);
        if (!payment || payment.status !== from) {
          return false;
        }
        payment.status = to;
        if (to === PAYMENT_STATUS.PAID) {
          payment.paidAt = at;
        }
        return true;
      },
      completeEvent: async ({ eventId, paymentId, outcome, processedAt }) => {
        const event = this.events.find((stored) => stored.id === eventId);
        assert.ok(event, "the event is stored before it is completed");
        event.paymentId = paymentId;
        event.outcome = outcome;
        event.processedAt = processedAt;
      },
    };

    return work(transaction);
  }
}

export class MemoryPaymentCatalog implements PaymentCatalog {
  readonly prices = new Map<string, CatalogPackagePrice | null>();

  async findCurrentPackagePrice(packageId: string): Promise<CatalogPackagePrice | null> {
    return this.prices.get(packageId) ?? null;
  }
}
