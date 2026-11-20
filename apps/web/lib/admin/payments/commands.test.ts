import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AdminPaymentsClient,
  PaymentsFailure,
  PaymentsResult,
} from "../../server/admin-payments-client.ts";
import { ApiClientError } from "../../server/api-client.ts";
import { SIGN_IN_PATH } from "../catalog/commands.ts";
import { refundPayment } from "./commands.ts";
import { PAYMENTS_PATHS } from "./copy.ts";

// The refund server action's logic (M7 T3; S3): read the submitted payment id, call the API client at most once, and
// answer the path to redirect to (303 after POST). The API decides every refusal; a refused refund changes nothing
// and returns to the list with a code the page turns into its own Spanish message.

const PAYMENT_ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const OK: PaymentsResult<{ outcome: "requested" }> = {
  ok: true,
  value: { outcome: "requested" },
};

type Call = { method: string; args: unknown[] };

function stub(answer: PaymentsResult<unknown> | Error = OK) {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    async (...args: unknown[]) => {
      calls.push({ method, args });
      if (answer instanceof Error) {
        throw answer;
      }
      return answer;
    };
  const api = { list: record("list"), refund: record("refund") } as unknown as AdminPaymentsClient;

  return { api, calls };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const failure = (value: PaymentsFailure): PaymentsResult<never> => ({ ok: false, failure: value });

describe("refundPayment", () => {
  it("asks for the refund and tells the administrator it was requested", async () => {
    const { api, calls } = stub();

    assert.equal(
      await refundPayment(api, form({ paymentId: PAYMENT_ID })),
      `${PAYMENTS_PATHS.index}?notice=refund-requested`,
    );
    assert.deepEqual(calls, [{ method: "refund", args: [PAYMENT_ID] }]);
  });

  it("reports each refusal of the API back to the list with its code", async () => {
    for (const code of [
      "not-found",
      "not-refundable",
      "already-published",
      "provider-unavailable",
      "validation",
    ] as const) {
      const { api } = stub(failure(code));

      assert.equal(
        await refundPayment(api, form({ paymentId: PAYMENT_ID })),
        `${PAYMENTS_PATHS.index}?error=${code}`,
        code,
      );
    }
  });

  it("sends an ended session to sign in and a customer away from the panel", async () => {
    assert.equal(
      await refundPayment(stub(failure("signed-out")).api, form({ paymentId: PAYMENT_ID })),
      SIGN_IN_PATH,
    );
    assert.equal(
      await refundPayment(stub(failure("forbidden")).api, form({ paymentId: PAYMENT_ID })),
      "/cuenta",
    );
  });

  it("reports an unexpected failure as unavailable instead of pretending it succeeded", async () => {
    assert.equal(
      await refundPayment(
        stub(new ApiClientError("unavailable", 503)).api,
        form({ paymentId: PAYMENT_ID }),
      ),
      `${PAYMENTS_PATHS.index}?error=unavailable`,
    );
  });

  it("never calls the API for an id that is missing, repeated, or not a UUID", async () => {
    const { api, calls } = stub();
    const repeated = new FormData();
    repeated.append("paymentId", PAYMENT_ID);
    repeated.append("paymentId", PAYMENT_ID);

    for (const data of [
      form({}),
      form({ paymentId: "" }),
      form({ paymentId: "no-es-un-uuid" }),
      form({ paymentId: `${PAYMENT_ID}/refund` }),
      repeated,
    ]) {
      assert.equal(await refundPayment(api, data), `${PAYMENTS_PATHS.index}?error=invalid-form`);
    }
    assert.deepEqual(calls, []);
  });
});
