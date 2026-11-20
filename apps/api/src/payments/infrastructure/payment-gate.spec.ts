import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InvitationRecord } from "../../invitations/application/invitation.repository";
import type { PaymentRecord, PaymentRepository } from "../application/payment.repository";
import type { CatalogPackagePrice, PaymentCatalog } from "../application/payment-catalog";
import { PAYMENT_STATUS } from "../domain/payment";
import { PaymentGate } from "./payment-gate";

// The publication gate in each mode (M7 S3, S4). `free` keeps Milestone 5's answer for every invitation, without a
// query. `simulated` (and every mode that will charge) grants publication only from a `paid` payment for this
// invitation and its current package, or from a package whose current price is 0; a price the catalog cannot answer
// fails closed. The gate answers data, so presentation maps it and the publish use case keeps its own error.

const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
const PACKAGE = "44444444-4444-4444-8444-444444444444";
const OTHER_PACKAGE = "55555555-5555-4555-8555-555555555555";

function invitationOf(): InvitationRecord {
  return {
    id: INVITATION_ID,
    ownerId: "11111111-1111-4111-8111-111111111111",
    templateVersionId: "66666666-6666-4666-8666-666666666666",
    packageId: PACKAGE,
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
    createdAt: new Date("2026-11-21T10:00:00.000Z"),
    updatedAt: new Date("2026-11-21T10:00:00.000Z"),
  };
}

class CountingCatalog implements PaymentCatalog {
  price: CatalogPackagePrice | null = { amountMinor: 25_000, currency: "MXN" };
  reads = 0;

  async findCurrentPackagePrice(): Promise<CatalogPackagePrice | null> {
    this.reads += 1;
    return this.price;
  }
}

class CountingRepository implements PaymentRepository {
  payments: Array<Pick<PaymentRecord, "packageId" | "status">> = [];
  reads = 0;

  async listForInvitation(): Promise<PaymentRecord[]> {
    this.reads += 1;
    return this.payments as PaymentRecord[];
  }

  async findOwnedInvitation(): Promise<null> {
    return null;
  }

  async findOwnedPayment(): Promise<null> {
    return null;
  }

  async createOrReusePending(): Promise<PaymentRecord> {
    throw new Error("the gate never writes");
  }

  async attachProviderReference(): Promise<null> {
    return null;
  }

  async transaction<T>(): Promise<T> {
    throw new Error("the gate never opens a transaction");
  }
}

function gate(
  options: {
    mode?: "free" | "simulated";
    catalog?: CountingCatalog;
    repository?: CountingRepository;
  } = {},
) {
  const catalog = options.catalog ?? new CountingCatalog();
  const repository = options.repository ?? new CountingRepository();

  return {
    catalog,
    repository,
    gate: new PaymentGate(options.mode ?? "simulated", catalog, repository),
  };
}

describe("publication payment gate (M7 S3, S4)", () => {
  it("keeps Milestone 5's answer in free mode without reading the catalog or the payments", async () => {
    const { gate: paymentGate, catalog, repository } = gate({ mode: "free" });

    assert.deepEqual(await paymentGate.publicationPaymentRequired(invitationOf()), {
      required: false,
    });
    assert.equal(catalog.reads, 0);
    assert.equal(repository.reads, 0);
  });

  it("requires a payment when the package has a price and nothing is paid", async () => {
    const { gate: paymentGate } = gate();

    assert.deepEqual(await paymentGate.publicationPaymentRequired(invitationOf()), {
      required: true,
      reason: "PAYMENT_REQUIRED",
    });
  });

  it("grants publication from a paid payment for this invitation and package", async () => {
    const repository = new CountingRepository();
    repository.payments = [{ packageId: PACKAGE, status: PAYMENT_STATUS.PAID }];
    const { gate: paymentGate } = gate({ repository });

    assert.deepEqual(await paymentGate.publicationPaymentRequired(invitationOf()), {
      required: false,
    });
  });

  it("does not grant publication from a paid payment for another package", async () => {
    const repository = new CountingRepository();
    repository.payments = [{ packageId: OTHER_PACKAGE, status: PAYMENT_STATUS.PAID }];
    const { gate: paymentGate } = gate({ repository });

    assert.deepEqual(await paymentGate.publicationPaymentRequired(invitationOf()), {
      required: true,
      reason: "PAYMENT_REQUIRED",
    });
  });

  it("does not grant publication from a pending, failed, expired, or refunded payment", async () => {
    for (const status of [
      PAYMENT_STATUS.PENDING,
      PAYMENT_STATUS.FAILED,
      PAYMENT_STATUS.EXPIRED,
      PAYMENT_STATUS.REFUNDED,
    ]) {
      const repository = new CountingRepository();
      repository.payments = [{ packageId: PACKAGE, status }];
      const { gate: paymentGate } = gate({ repository });

      assert.deepEqual(
        await paymentGate.publicationPaymentRequired(invitationOf()),
        { required: true, reason: "PAYMENT_REQUIRED" },
        status,
      );
    }
  });

  it("grants publication for a package whose current price is zero", async () => {
    const catalog = new CountingCatalog();
    catalog.price = { amountMinor: 0, currency: "MXN" };
    const { gate: paymentGate } = gate({ catalog });

    assert.deepEqual(await paymentGate.publicationPaymentRequired(invitationOf()), {
      required: false,
    });
  });

  it("fails closed when the catalog cannot answer the price", async () => {
    const catalog = new CountingCatalog();
    catalog.price = null;
    const { gate: paymentGate } = gate({ catalog });

    assert.deepEqual(await paymentGate.publicationPaymentRequired(invitationOf()), {
      required: true,
      reason: "PAYMENT_PRICE_UNAVAILABLE",
    });
  });
});
