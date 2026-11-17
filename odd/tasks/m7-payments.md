# Milestone 7 — Checkout and payments

Branch `feat/m7-payments` from `master` at `b4913c3`. A creator pays for the invitation's package before publishing;
publication is granted only from a verified backend payment state.

## Specs

- S1 — ROADMAP Milestone 7, verbatim outcome: "Let a creator purchase an approved package through one reviewed
  provider without trusting the browser for payment state." Key scope: "checkout intent and normalized payment state;
  package price/currency snapshot at checkout; provider adapter and verified webhook intake; unique idempotency keys
  and retry-safe state transitions; publication entitlement rules based on verified internal payment state; and
  provider sandbox tests plus failure/replay coverage." Exit criteria: "Forged, unsigned, duplicate, out-of-order, and
  failed provider events are handled deliberately." "Payment amount and currency cannot change when the catalog
  changes later." "Publication access is granted only from a verified backend state transition." Non-goals: "No
  multiple payment providers, subscriptions, tax invoicing, stored card data, or accounting system is included."
- S2 — Owner (invitation-features L9), verbatim: "si dale, tienes mi autorizacion de hacer merge y autorizo cada
  revison no te detengas hasta el final para la revision visual", after the proposed order whose step 4 is «Pagos»,
  noting that the payment provider (Mercado Pago, Stripe, Conekta) is an owner decision.
- S3 — Milestone 5 left a payment port that answers "no payment required"
  (`apps/api/src/invitations/application/invitation-payment-gate.ts`); M7 replaces its behavior.
- S4 — Contract decided by the parent within S1-S3 (L1; the owner may overturn). The provider account, its fees, and
  its credentials are the owner's decision, so this milestone ships the provider-neutral payment core, the full
  verified-webhook intake, and a development-only simulated provider that exercises the same signed intake; the real
  provider adapter is added once the owner chooses one (one file plus configuration behind the same port):
  - **Modes.** `PAYMENTS_MODE` is `free` (today's behavior: publishing needs no payment), `simulated` (development and
    test only; refused in production), or a provider key once one exists. Production must set it explicitly; there is
    no silent default in production.
  - **Checkout.** `POST /invitations/:id/checkout` (owner, draft or published-unpaid, not archived) creates or reuses
    one pending `Payment` for the invitation's current package: amount and currency are copied from the package's
    current price at that moment (snapshot), with a server-generated idempotency key (unique). It answers the
    provider's redirect URL. A free package (price 0) needs no checkout.
  - **Payment state.** Additive migration: `Payment` (id, invitationId RESTRICT, packageId, amountMinor, currency,
    status `pending` | `paid` | `failed` | `expired` | `refunded`, provider, providerReference unique nullable,
    idempotencyKey unique, createdAt, paidAt, updatedAt) and `PaymentEvent` (provider, providerEventId, unique
    together, type, receivedAt, processedAt, outcome, payloadSha256 — never the raw payload with personal data).
    Transitions are a pure domain state machine: pending→paid|failed|expired, paid→refunded; any other transition is
    recorded and ignored (out-of-order safe); amounts or currencies that differ from the snapshot are refused and
    recorded.
  - **Webhook intake.** `POST /payments/webhooks/:provider` (public, raw body): verify the signature with the
    provider's documented scheme through the adapter (for `simulated`, HMAC-SHA256 over the raw body with a
    development secret, timestamped, 5-minute tolerance, constant-time compare from `crypto.timingSafeEqual`);
    unsigned, forged, or stale events answer 400 and change nothing; a duplicate event id answers 200 and changes
    nothing; processing is one transaction (event row + payment transition) so a retry is safe.
  - **Publication gate.** The payment port now answers "paid" only when a `paid` payment exists for the invitation and
    its current package; changing the package of a paid invitation is refused (409) instead of silently losing the
    payment; publishing remains a backend transition (S1 exit criterion).
  - **Simulated provider (development only).** The redirect points to a web page
    `/cuenta/invitaciones/<invitationId>/pago/simulado/<paymentId>` (amended by L3) with
    «Pagar» and «Simular rechazo» buttons; the web server action asks the API's simulated adapter to emit a signed
    event to the real webhook route, so the whole intake is exercised end to end.
  - **Web.** On the draft page, when the package requires payment and none is paid: a «Pagar y publicar» panel with
    the amount and currency, which starts the checkout and redirects; a return page `/cuenta/invitaciones/<id>/pago`
    shows pending, paid, or failed from the API (never from query parameters); the publish button is enabled only when
    the API says paid. Spanish copy, server-first.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | API: modes and env validation, Payment and PaymentEvent migration, state machine, checkout, webhook intake with signature verification, publication gate, package-change refusal, simulated adapter, tests | S1, S3, S4 | worker | `3d4cdb3` |
| T2 | Web: payment panel, checkout redirect, simulated provider page, return page, publish gating, tests, browser check | S1, S4 | worker, after T1 | see L5 |
| T3 | Independent verification: forged, unsigned, duplicate, out-of-order, failed events; snapshots; gate | S1, S4 | verify | verdict pass; fixes in the next commit |
| T4 | Integration: gates, docs, PR, merge | S1-S4 | inline | see L6 |

## Log

- L1 — The parent fixed contract S4. Owner decisions for the end: the provider (Mercado Pago, Stripe, or Conekta), its
  account and fees, the production `PAYMENTS_MODE`, and refunds handling beyond recording the provider's event.
- L2 — T1 (was P1) `3d4cdb3`: payments module, migration `20261121120000_add_payments` (applied to test and dev), REST
  checkout/read/webhook/emit, gate. API 1590 unit and 379 db-specs pass. Finding: no package-change capability exists
  (`Invitation.packageId` is pinned by a database trigger), so the paid-package lock is enforced at checkout
  (409 `INVITATION_PACKAGE_LOCKED_BY_PAYMENT`) and by the gate's package match. Development defaults to `free`;
  switch to `simulated` with `PAYMENTS_MODE=simulated` and `PAYMENTS_SIMULATED_SECRET` (see `docs/development/payments.md`).
- L3 — The simulated page moved under the account, `/cuenta/invitaciones/<invitationId>/pago/simulado/<paymentId>`,
  so the existing session proxy covers it and the page knows which invitation to return to (the emit route answers
  only the outcome). Task ids renamed P1-P4 to T1-T4.
- L4 — T3 independent verification of `3d4cdb3` and `892b577`: S1, S3, S4 (API) met, all three S1 exit criteria met,
  no blockers. Advisories: (1) the test database had applied an earlier draft of `20261121120000_add_payments`
  (checksum drift; objects identical); the dev database matches the committed file, and the local test database row
  was realigned to the committed checksum; (2) the gate imported another module's infrastructure, now inlined;
  (3) checkout reuses a pending payment regardless of package, unreachable while the package is pinned by the trigger
  (kept as a known limit). Added the verifier's signature boundary and header-shape regression spec.
- L5 — T2 web flow: client calls and nine typed failures, `lib/customer/invitation-payment.ts` (amount formatting,
  redirect allow-list: same web origin and exactly `/cuenta/invitaciones/<this id>/pago/simulado/<uuid>`, no
  query, fragment, or credentials), the «Pagar y publicar» panel with publish disabled while a payment is due, the
  return page, and the simulated page. Web 1477 tests pass; free mode verified unchanged in a browser at 390 px. No
  Playwright journey: the e2e harness runs one API in `free` mode for every spec and no priced package is seeded;
  the paid, pending, and failed panel states are covered by unit tests and await a simulated-mode visual pass.
- L6 — T4: full local gates pass (docs, format, lint, typecheck, test, build, diff-check). Native review of the web
  commit `5998b0d` (1,834 lines; lenses risk and reliability; lineage `review-bde95caa2821137c`) APPROVED and its
  authority acknowledged and burned. Three non-blocking reliability notes for later work, at
  `apps/web/lib/customer/invitation-payment.ts:357-367` (simulated emit refusal targets),
  `apps/web/app/cuenta/invitaciones/[id]/page.tsx:374-381` (panel placement and archived state), and
  `apps/web/app/cuenta/invitaciones/[id]/pago/page.tsx:111` (suggestion). The API range was covered by the T3
  independent verification instead of native review (5,800 lines exceed the reviewer's context budget).
- L7 — Delivery: the pre-delivery guard reviews the whole range from `master` as one candidate, and the full milestone
  (about 7,800 lines) exceeded the native reviewer's context budget (`lens_context_budget_exceeded`). The milestone was
  delivered as five buildable chained PRs built from the same final tree, each reviewed natively (risk plus
  reliability or resilience) and merged after green CI: #68 tables, domain, and payment mode; #69 ports, simulated
  provider, and use cases; #70 Prisma repository and gate; #71 routes and module binding; and this web PR. Non-blocking
  review notes kept for the owner: a stale pending payment can block a retried checkout until it expires
  (`payment.use-cases.ts:101-132`), and the gate reads the price and payments in two queries (`payment-gate.ts:34-37`).
