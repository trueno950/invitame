import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { GetAdminPaymentDetailUseCase } from "./admin-payment-detail.use-cases";
import { PaymentNotFoundError } from "./payment.errors";
import {
  ADMIN_PAYMENT_EVENT_LIMIT,
  type AdminPaymentDetail,
  type AdminPaymentDetailReader,
} from "./payment.repository";

// The administrator's payment detail rule (M9 T7; S4, S6): «Ver el detalle de un pago» is a read of one stored payment
// and the events the verified intake kept for it, and it is never audited (L9). The use case owns only two rules the
// suite asserts: an unknown payment is `PaymentNotFoundError` (404 `PAYMENT_NOT_FOUND`), and the read is passed
// through unchanged — the order, the bound of fifty events, and the absence of a provider reference are the
// adapter's, proved on real PostgreSQL in `payments.prisma.db-spec.ts`.

const CREATED_AT = new Date("2026-11-23T08:30:00.000Z");
const PAID_AT = new Date("2026-11-23T09:00:00.000Z");
const RECEIVED_AT = new Date("2026-11-23T09:00:01.000Z");

/** The administrator detail port over one stored payment, recording what the use case asked for. */
class DetailRepository implements AdminPaymentDetailReader {
  readonly calls: string[] = [];
  stored: AdminPaymentDetail | null = null;

  async findForAdmin(paymentId: string): Promise<AdminPaymentDetail | null> {
    this.calls.push(paymentId);

    return this.stored?.paymentId === paymentId ? this.stored : null;
  }
}

function detailOf(events: AdminPaymentDetail["events"]): AdminPaymentDetail {
  return {
    paymentId: randomUUID(),
    invitationId: randomUUID(),
    invitationSlug: "ana-y-daniel",
    status: "paid",
    amountMinor: 25_000,
    currency: "MXN",
    provider: "mercadopago",
    createdAt: CREATED_AT,
    paidAt: PAID_AT,
    events,
  };
}

describe("GetAdminPaymentDetailUseCase", () => {
  it("answers the stored payment with the events the port read, unchanged and newest first", () => {
    const repository = new DetailRepository();
    const stored = detailOf([
      {
        type: "refunded",
        outcome: "refused_currency",
        receivedAt: new Date("2026-11-23T10:00:00.000Z"),
        processedAt: new Date("2026-11-23T10:00:02.000Z"),
      },
      { type: "paid", outcome: "applied", receivedAt: RECEIVED_AT, processedAt: RECEIVED_AT },
    ]);
    repository.stored = stored;
    const useCase = new GetAdminPaymentDetailUseCase(repository);

    return useCase.execute({ paymentId: stored.paymentId }).then((read) => {
      assert.deepEqual(read, stored);
      assert.deepEqual(
        read.events.map((event) => [event.type, event.outcome]),
        [
          ["refunded", "refused_currency"],
          ["paid", "applied"],
        ],
      );
      assert.deepEqual(repository.calls, [stored.paymentId]);
    });
  });

  it("passes through every field the pages render and nothing else", () => {
    const repository = new DetailRepository();
    const stored = detailOf([
      { type: "paid", outcome: "applied", receivedAt: RECEIVED_AT, processedAt: null },
    ]);
    repository.stored = stored;

    return new GetAdminPaymentDetailUseCase(repository)
      .execute({ paymentId: stored.paymentId })
      .then((read) => {
        assert.deepEqual(Object.keys(read).sort(), [
          "amountMinor",
          "createdAt",
          "currency",
          "events",
          "invitationId",
          "invitationSlug",
          "paidAt",
          "paymentId",
          "provider",
          "status",
        ]);
        assert.deepEqual(Object.keys(read.events[0] ?? {}).sort(), [
          "outcome",
          "processedAt",
          "receivedAt",
          "type",
        ]);
      });
  });

  it("refuses an unknown payment with PaymentNotFoundError and reads no event", async () => {
    const repository = new DetailRepository();
    repository.stored = detailOf([]);
    const useCase = new GetAdminPaymentDetailUseCase(repository);

    await assert.rejects(useCase.execute({ paymentId: randomUUID() }), {
      name: PaymentNotFoundError.name,
    });
    // The port was asked exactly once: the use case never reads a payment it already knows is absent.
    assert.equal(repository.calls.length, 1);
  });

  it("needs no limit: the port's own bound is the fifty newest events", () => {
    assert.equal(ADMIN_PAYMENT_EVENT_LIMIT, 50);
  });
});
