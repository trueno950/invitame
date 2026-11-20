import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@prisma/client";

import { PrismaInvitationPaymentReader } from "./prisma-invitation-payment-reader";

// The detail read's payment bound (M9 T2, T5; S1). The port documents at most twenty payments, so the adapter is where
// that bound holds whatever a caller asks: the status view asks for twenty, and a later caller that asks for a hundred
// must not widen the read. The floor is one row, because asking for zero is a wasted round trip, not an empty answer.

const INVITATION_ID = "33333333-3333-4333-8333-333333333333";
/** The port's documented maximum, stated here as the number the contract promises. */
const PORT_MAXIMUM = 20;

/** A Prisma client whose only used method records the `take` it was given and answers that many stored rows. */
function fakePrisma(): { client: PrismaClient; takes: number[] } {
  const takes: number[] = [];
  const rows = Array.from({ length: 30 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    status: "paid",
    amountMinor: 1000 + index,
    currency: "MXN",
    createdAt: new Date(Date.UTC(2026, 10, 25, 10, 0, index)),
    paidAt: null,
  }));

  const client = {
    payment: {
      findMany: async (args: { take?: number }) => {
        const take = args.take ?? 0;
        takes.push(take);
        return rows.slice(0, take);
      },
    },
  } as unknown as PrismaClient;

  return { client, takes };
}

describe("PrismaInvitationPaymentReader (M9 T2, T5; S1)", () => {
  it("clamps a larger requested limit to the port's maximum of twenty", async () => {
    const { client, takes } = fakePrisma();
    const reader = new PrismaInvitationPaymentReader(client);

    const payments = await reader.listForInvitation(INVITATION_ID, 100);

    assert.deepEqual(takes, [PORT_MAXIMUM]);
    assert.equal(payments.length, PORT_MAXIMUM);
    assert.equal(payments[0]?.amountMinor, 1000);
    assert.equal(payments.at(-1)?.amountMinor, 1000 + PORT_MAXIMUM - 1);
  });

  it("keeps a request inside the bound unchanged and never asks for fewer than one row", async () => {
    const { client, takes } = fakePrisma();
    const reader = new PrismaInvitationPaymentReader(client);

    assert.equal((await reader.listForInvitation(INVITATION_ID, 5)).length, 5);
    assert.equal(
      (await reader.listForInvitation(INVITATION_ID, PORT_MAXIMUM)).length,
      PORT_MAXIMUM,
    );
    assert.equal((await reader.listForInvitation(INVITATION_ID, 0)).length, 1);
    assert.equal((await reader.listForInvitation(INVITATION_ID, -3)).length, 1);

    assert.deepEqual(takes, [5, PORT_MAXIMUM, 1, 1]);
  });
});
