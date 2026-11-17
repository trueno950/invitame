import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  Checkout,
  InvitationPayment,
  InvitationResult,
  PaymentEmit,
} from "../server/invitations-api.ts";
import { INVITATION_ERROR_COPY, PAYMENT_COPY } from "./copy.ts";
import {
  checkoutRedirectPath,
  emitSimulatedPayment,
  formatPaymentAmount,
  PAYMENT_PATHS,
  type PaymentClient,
  paymentPanelView,
  paymentReturnView,
  simulatedPaymentView,
  startCheckout,
} from "./invitation-payment.ts";
import { INVITATION_PATHS } from "./invitations.ts";

// The creator's payment panel, the checkout redirect allow-list, and the two payment commands (M7 T2; S1, S4).
// The payment state is always the API's: nothing here reads a query parameter, a cookie, or a client value to
// decide whether the invitation is paid.

const ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";
const OTHER_ID = "1b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e11";
const PAYMENT_ID = "2b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e12";
const ORIGIN = "http://localhost:3000";
const PAID_AT = "2026-11-12T10:00:00.000Z";

const CHECKOUT: Checkout = {
  paymentId: PAYMENT_ID,
  redirectUrl: `${ORIGIN}${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}`,
  amountMinor: 150000,
  currency: "MXN",
};

/** The API's answer for a package that costs `$1,500.00` and has no payment yet (S4). */
const UNPAID: InvitationPayment = {
  paymentRequired: true,
  status: null,
  amountMinor: 150000,
  currency: "MXN",
  paidAt: null,
};

/** The same invitation once the provider confirmed the payment; the entitlement rule flips with it (S4). */
const PAID: InvitationPayment = {
  ...UNPAID,
  paymentRequired: false,
  status: "paid",
  paidAt: PAID_AT,
};

/** What a free deployment answers: nothing is sold and the panel is not rendered (S4). */
const FREE: InvitationPayment = {
  paymentRequired: false,
  status: null,
  amountMinor: null,
  currency: null,
  paidAt: null,
};

const PROCESSED: InvitationResult<PaymentEmit> = { ok: true, value: { outcome: "processed" } };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [name, value] of Object.entries(entries)) {
    data.set(name, value);
  }

  return data;
}

interface Recorded {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

/**
 * The client calls this module makes, recorded, so a test sees exactly what was sent. Only the answer the test
 * exercises must be named; a call a test does not expect fails the run through `notExpected`.
 */
function fakeClient(
  answers: {
    checkout?: InvitationResult<Checkout>;
    payment?: InvitationResult<InvitationPayment>;
    emit?: InvitationResult<PaymentEmit>;
  },
  calls: Recorded[] = [],
): { calls: Recorded[]; client: PaymentClient } {
  const notExpected = (): never => {
    throw new Error("unexpected client call");
  };
  const record = (method: string, path: string, body: unknown) => {
    calls.push({ method, path, body });
  };

  return {
    calls,
    client: {
      checkout: (id: string) => {
        record("POST", `/invitations/${id}/checkout`, undefined);
        return Promise.resolve(answers.checkout ?? notExpected());
      },
      payment: (id: string) => {
        record("GET", `/invitations/${id}/payment`, undefined);
        return Promise.resolve(answers.payment ?? notExpected());
      },
      emitSimulatedPayment: (paymentId: string, outcome: "paid" | "failed") => {
        record("POST", `/payments/simulated/${paymentId}/emit`, { outcome });
        return Promise.resolve(answers.emit ?? notExpected());
      },
    },
  };
}

describe("formatPaymentAmount", () => {
  it("formats minor units as money in es-MX", () => {
    assert.equal(formatPaymentAmount(150000, "MXN"), "$1,500.00");
    assert.equal(formatPaymentAmount(0, "MXN"), "$0.00");
    assert.equal(formatPaymentAmount(1050, "USD"), "USD\u00A010.50");
  });

  it("refuses an amount or a currency it cannot format instead of printing something else", () => {
    assert.equal(formatPaymentAmount(-1, "MXN"), undefined);
    assert.equal(formatPaymentAmount(10.5, "MXN"), undefined);
    assert.equal(formatPaymentAmount(Number.MAX_SAFE_INTEGER + 2, "MXN"), undefined);
    assert.equal(formatPaymentAmount(150000, "not-a-currency"), undefined);
    assert.equal(formatPaymentAmount(150000, ""), undefined);
  });
});

describe("the checkout redirect allow-list", () => {
  it("answers the relative path of the simulated page of that same invitation and origin", () => {
    assert.equal(
      checkoutRedirectPath(CHECKOUT.redirectUrl, ID, ORIGIN),
      PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID),
    );
  });

  it("accepts the request's origin whatever its case, because a URL lower-cases its host", () => {
    assert.equal(
      checkoutRedirectPath(
        `http://LOCALHOST:3000${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}`,
        ID,
        ORIGIN,
      ),
      PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID),
    );
  });

  it("refuses another origin, a protocol-relative URL, another scheme, and a relative path", () => {
    for (const redirect of [
      `https://evil.example${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}`,
      `http://localhost:3001${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}`,
      `//localhost:3000${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}`,
      "javascript:alert(1)",
      "data:text/html,<p>hola</p>",
      PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID),
      "",
      "not a url",
    ]) {
      assert.equal(checkoutRedirectPath(redirect, ID, ORIGIN), undefined, redirect);
    }
  });

  it("refuses an unknown request origin, so a page that cannot name its own origin never redirects", () => {
    assert.equal(checkoutRedirectPath(CHECKOUT.redirectUrl, ID, undefined), undefined);
    assert.equal(checkoutRedirectPath(CHECKOUT.redirectUrl, ID, ""), undefined);
    assert.equal(checkoutRedirectPath(CHECKOUT.redirectUrl, ID, "localhost:3000"), undefined);
  });

  it("refuses a query, a fragment, a trailing slash, credentials, and another invitation's page", () => {
    const path = PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID);

    for (const redirect of [
      `${ORIGIN}${path}?next=https://evil.example`,
      `${ORIGIN}${path}#pagar`,
      `${ORIGIN}${path}/`,
      `http://user:secret@localhost:3000${path}`,
      `${ORIGIN}${PAYMENT_PATHS.simulatedPage(OTHER_ID, PAYMENT_ID)}`,
      `${ORIGIN}/cuenta/invitaciones/${ID}/pago`,
      `${ORIGIN}${path}/extra`,
      `${ORIGIN}${path.replace(PAYMENT_ID, "no-es-un-uuid")}`,
    ]) {
      assert.equal(checkoutRedirectPath(redirect, ID, ORIGIN), undefined, redirect);
    }
  });
});

describe("the payment panel of a draft", () => {
  it("is hidden in a deployment that sells nothing", () => {
    assert.deepEqual(paymentPanelView(FREE), { kind: "hidden" });
  });

  it("offers «Pagar y publicar» with the amount of the package", () => {
    const view = paymentPanelView(UNPAID);

    assert.equal(view.kind, "pay");
    assert.equal(view.kind === "pay" && view.heading, PAYMENT_COPY.payHeading);
    assert.equal(view.kind === "pay" && view.action, PAYMENT_COPY.pay);
    assert.equal(view.kind === "pay" && view.hint, PAYMENT_COPY.payHint);
    assert.equal(view.kind === "pay" && view.amount, "$1,500.00 MXN");
  });

  it("offers the same button while a payment awaits the provider", () => {
    const view = paymentPanelView({ ...UNPAID, status: "pending" });

    assert.equal(view.kind, "pay");
  });

  it("offers a retry when the payment failed or expired", () => {
    for (const status of ["failed", "expired", "refunded"] as const) {
      const view = paymentPanelView({ ...UNPAID, status });

      assert.equal(view.kind, "retry", status);
      assert.equal(view.kind === "retry" && view.heading, PAYMENT_COPY.retryHeading);
      assert.equal(view.kind === "retry" && view.action, PAYMENT_COPY.retry);
      assert.equal(view.kind === "retry" && view.hint, PAYMENT_COPY.retryHint);
      assert.equal(view.kind === "retry" && view.amount, "$1,500.00 MXN");
    }
  });

  it("confirms the payment with its date once the API says paid", () => {
    const view = paymentPanelView(PAID);

    assert.equal(view.kind, "paid");
    assert.equal(view.kind === "paid" && view.heading, PAYMENT_COPY.paidHeading);
    assert.equal(view.kind === "paid" && view.hint, PAYMENT_COPY.paidHint);
    assert.equal(view.kind === "paid" && view.amount, "$1,500.00 MXN");
    assert.match(view.kind === "paid" ? view.paidOn : "", /12 nov 2026/);
  });

  it("never offers a checkout whose amount it could not read", () => {
    for (const payment of [
      { ...UNPAID, amountMinor: null },
      { ...UNPAID, currency: null },
      { ...UNPAID, currency: "not-a-currency" },
    ]) {
      const view = paymentPanelView(payment);

      assert.equal(view.kind, "amount-unavailable");
      assert.equal(
        view.kind === "amount-unavailable" && view.note,
        PAYMENT_COPY.amountUnavailableNote,
      );
    }
  });
});

describe("the return page of one payment", () => {
  it("confirms a paid payment and sends the owner back to publish", () => {
    const view = paymentReturnView(PAID);

    assert.equal(view.kind, "paid");
    assert.equal(view.kind === "paid" && view.heading, PAYMENT_COPY.paidHeading);
    assert.equal(view.kind === "paid" && view.body, PAYMENT_COPY.paidReturnBody);
    assert.equal(view.kind === "paid" && view.amount, "$1,500.00 MXN");
    assert.match(view.kind === "paid" ? view.paidOn : "", /12 nov 2026/);
  });

  it("waits for the provider while the payment is pending or absent", () => {
    for (const status of [null, "pending"] as const) {
      const view = paymentReturnView({ ...UNPAID, status });

      assert.equal(view.kind, "pending", String(status));
      assert.equal(view.kind === "pending" && view.heading, PAYMENT_COPY.pendingHeading);
      assert.equal(view.kind === "pending" && view.body, PAYMENT_COPY.pendingBody);
      assert.equal(view.kind === "pending" && view.refresh, PAYMENT_COPY.refresh);
    }
  });

  it("offers a retry after a failed, expired, or refunded payment", () => {
    for (const status of ["failed", "expired", "refunded"] as const) {
      const view = paymentReturnView({ ...UNPAID, status });

      assert.equal(view.kind, "failed", status);
      assert.equal(view.kind === "failed" && view.heading, PAYMENT_COPY.failedHeading);
      assert.equal(view.kind === "failed" && view.body, PAYMENT_COPY.failedBody);
      assert.equal(view.kind === "failed" && view.retry, PAYMENT_COPY.retry);
      assert.equal(view.kind === "failed" && view.amount, "$1,500.00 MXN");
    }
  });

  it("sends a package that needs no payment straight back to the invitation", () => {
    const view = paymentReturnView(FREE);

    assert.equal(view.kind, "not-required");
    assert.equal(view.kind === "not-required" && view.heading, PAYMENT_COPY.notRequiredHeading);
    assert.equal(view.kind === "not-required" && view.body, PAYMENT_COPY.notRequiredBody);
  });
});

describe("the simulated payment page", () => {
  it("offers «Pagar» and «Simular rechazo» only while the API asks for that payment", () => {
    const view = simulatedPaymentView({ ...UNPAID, status: "pending" });

    assert.equal(view.kind, "available");
    assert.equal(view.kind === "available" && view.heading, PAYMENT_COPY.simulatedHeading);
    assert.equal(view.kind === "available" && view.note, PAYMENT_COPY.simulatedNote);
    assert.equal(view.kind === "available" && view.pay, PAYMENT_COPY.simulatePay);
    assert.equal(view.kind === "available" && view.reject, PAYMENT_COPY.simulateFail);
    assert.equal(view.kind === "available" && view.amount, "$1,500.00 MXN");
  });

  it("is unavailable for a payment that cannot be read, is already paid, or is not required", () => {
    for (const payment of [undefined, PAID, FREE, { ...UNPAID, amountMinor: null }]) {
      const view = simulatedPaymentView(payment);

      assert.equal(view.kind, "unavailable", JSON.stringify(payment));
      assert.equal(
        view.kind === "unavailable" && view.heading,
        PAYMENT_COPY.simulatedUnavailableHeading,
      );
    }
  });
});

describe("startCheckout", () => {
  it("starts the checkout and redirects to the payment page the API answered", async () => {
    const { client, calls } = fakeClient({ checkout: { ok: true, value: CHECKOUT } });

    assert.equal(
      await startCheckout(client, form({ id: ID }), ORIGIN),
      PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID),
    );
    assert.deepEqual(calls, [
      { method: "POST", path: `/invitations/${ID}/checkout`, body: undefined },
    ]);
  });

  it("fails closed with an error notice when the redirect leaves the web's own origin", async () => {
    for (const redirectUrl of [
      `https://evil.example${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}`,
      "javascript:alert(1)",
      `${ORIGIN}${PAYMENT_PATHS.simulatedPage(OTHER_ID, PAYMENT_ID)}`,
    ]) {
      const { client } = fakeClient({
        checkout: { ok: true, value: { ...CHECKOUT, redirectUrl } },
      });

      assert.equal(
        await startCheckout(client, form({ id: ID }), ORIGIN),
        `${INVITATION_PATHS.detail(ID)}?error=payment-redirect-refused`,
        redirectUrl,
      );
    }
  });

  it("refuses to redirect when the request's own origin is unknown", async () => {
    const { client } = fakeClient({ checkout: { ok: true, value: CHECKOUT } });

    assert.equal(
      await startCheckout(client, form({ id: ID }), undefined),
      `${INVITATION_PATHS.detail(ID)}?error=payment-redirect-refused`,
    );
  });

  it("reports every checkout refusal on the invitation page", async () => {
    for (const failure of [
      "payments-disabled",
      "payment-not-required",
      "payment-price-unavailable",
      "payment-already-paid",
      "payment-package-locked",
      "payment-provider-unavailable",
      "not-editable",
      "not-found",
    ] as const) {
      const { client } = fakeClient({ checkout: { ok: false, failure } });

      assert.equal(
        await startCheckout(client, form({ id: ID }), ORIGIN),
        `${INVITATION_PATHS.detail(ID)}?error=${failure}`,
        failure,
      );
    }
  });

  it("sends an ended session to sign in and an unreadable form to the list", async () => {
    const signedOut = fakeClient({ checkout: { ok: false, failure: "signed-out" } });
    assert.equal(await startCheckout(signedOut.client, form({ id: ID }), ORIGIN), "/ingresar");

    const unreadable = fakeClient({ checkout: { ok: true, value: CHECKOUT } });
    for (const id of ["", "no-es-un-uuid", `${ID}/../x`]) {
      assert.equal(
        await startCheckout(unreadable.client, form({ id }), ORIGIN),
        `${INVITATION_PATHS.list}?error=not-found`,
        id,
      );
    }
    assert.deepEqual(unreadable.calls, []);
  });
});

describe("emitSimulatedPayment", () => {
  it("emits the chosen outcome and returns to the payment's own page", async () => {
    for (const outcome of ["paid", "failed"] as const) {
      const { client, calls } = fakeClient({ emit: PROCESSED });

      assert.equal(
        await emitSimulatedPayment(client, form({ id: ID, paymentId: PAYMENT_ID, outcome })),
        PAYMENT_PATHS.returnPage(ID),
        outcome,
      );
      assert.deepEqual(calls, [
        { method: "POST", path: `/payments/simulated/${PAYMENT_ID}/emit`, body: { outcome } },
      ]);
    }
  });

  it("keeps the owner on the simulated page with the refusal, and sends an ended session to sign in", async () => {
    const refused = fakeClient({ emit: { ok: false, failure: "simulated-payment-disabled" } });
    assert.equal(
      await emitSimulatedPayment(
        refused.client,
        form({ id: ID, paymentId: PAYMENT_ID, outcome: "paid" }),
      ),
      `${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}?error=simulated-payment-disabled`,
    );

    const missing = fakeClient({ emit: { ok: false, failure: "payment-not-found" } });
    assert.equal(
      await emitSimulatedPayment(
        missing.client,
        form({ id: ID, paymentId: PAYMENT_ID, outcome: "failed" }),
      ),
      `${PAYMENT_PATHS.simulatedPage(ID, PAYMENT_ID)}?error=payment-not-found`,
    );

    const signedOut = fakeClient({ emit: { ok: false, failure: "signed-out" } });
    assert.equal(
      await emitSimulatedPayment(
        signedOut.client,
        form({ id: ID, paymentId: PAYMENT_ID, outcome: "paid" }),
      ),
      "/ingresar",
    );
  });

  it("makes no request for a form whose ids or outcome it cannot trust", async () => {
    const { client, calls } = fakeClient({ emit: PROCESSED });

    assert.equal(
      await emitSimulatedPayment(
        client,
        form({ id: ID, paymentId: "no-es-un-uuid", outcome: "paid" }),
      ),
      `${PAYMENT_PATHS.returnPage(ID)}?error=invalid-form`,
    );
    assert.equal(
      await emitSimulatedPayment(
        client,
        form({ id: ID, paymentId: PAYMENT_ID, outcome: "refunded" }),
      ),
      `${PAYMENT_PATHS.returnPage(ID)}?error=invalid-form`,
    );
    assert.equal(
      await emitSimulatedPayment(
        client,
        form({ id: "no-es-un-uuid", paymentId: PAYMENT_ID, outcome: "paid" }),
      ),
      `${INVITATION_PATHS.list}?error=not-found`,
    );
    assert.deepEqual(calls, []);
  });
});

describe("the copy of the panel", () => {
  it("points a refused publication at the payment button instead of at a missing capability", () => {
    assert.match(INVITATION_ERROR_COPY["payment-required"], /Pagar y publicar/);
    assert.doesNotMatch(INVITATION_ERROR_COPY["payment-required"], /todavía no podemos procesar/);
  });
});
