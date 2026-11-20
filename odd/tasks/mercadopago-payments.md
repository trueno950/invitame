# Mercado Pago payments and the refund rule (plan, awaiting owner approval)

Status: design only. AGENTS.md requires a human review of security-sensitive design before implementation; this
document is that proposal. Nothing here is implemented yet. Owner decisions: `odd/tasks/owner-followups.md` L2.

## Specs

- S1 — A paid package checks out through Mercado Pago Checkout Pro in MXN; the browser never decides payment state.
- S2 — The publication gate opens only after a verified Mercado Pago notification whose payment the API re-reads from
  Mercado Pago and finds `approved` with the snapshot amount and currency.
- S3 — Refunds: «Sin reembolso tras publicar». An admin may issue a full refund only for a paid invitation that was
  never published; a published (or once-published) invitation is refused. A refund closes the gate again.
- S4 — Forged, unsigned, stale, duplicate, and out-of-order notifications are handled deliberately; nothing about the
  provider payload becomes the domain model; no secret, token, or payer data is logged or stored.

## Design

- **Mode and configuration.** `PAYMENTS_MODE=mercadopago` (production-allowed; `simulated` stays refused there).
  New env: `MERCADOPAGO_ACCESS_TOKEN` (server-only), `MERCADOPAGO_WEBHOOK_SECRET` (the signature secret from the
  Mercado Pago panel), `PAYMENTS_WEBHOOK_BASE_URL` (public HTTPS API origin for `notification_url`). Both secrets are
  validated at startup, must differ from the auth secrets, and the app fails closed when they are missing.
- **Checkout.** `createCheckout` posts a preference (`items` with the snapshot amount in MXN, `external_reference` =
  our `paymentId`, `back_urls` to `/cuenta/invitaciones/<id>/pago`, `auto_return: "approved"`, `notification_url` =
  `<PAYMENTS_WEBHOOK_BASE_URL>/payments/webhooks/mercadopago`, `X-Idempotency-Key` = our idempotency key) and
  redirects to `init_point`. `providerReference` stores our `paymentId`, the only identifier both sides echo back.
- **Notification intake.** The port's `WebhookRequest` gains the query string (Mercado Pago signs `data.id` from it).
  The adapter verifies `x-signature` (`ts`, `v1`) as HMAC-SHA256 over `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
  with a constant-time compare and a ±5 minute window, then re-reads `GET /v1/payments/<data.id>` with the access
  token and normalizes only `external_reference`, `status`, `transaction_amount`, `currency_id`, and the event time.
  `eventId` = `mercadopago-<mpPaymentId>-<status>`, so a redelivery is a duplicate. `approved` → `paid`,
  `rejected`/`cancelled` → `failed`, `refunded` → `refunded`; other statuses are recorded and ignored. The existing
  transaction, guarded transitions, amount/currency checks, and `sha256` of the raw body stay as they are.
- **Refund.** New port method `refund(providerPaymentId, idempotencyKey)` (`POST /v1/payments/<id>/refunds`, no amount =
  full). New admin-only route that refuses unless the payment is `paid` and the invitation has never been published
  (reads the publication timestamp the M5 lifecycle stores); the state becomes `refunded` only from the verified
  notification, never from the admin click.
- **Tests.** Adapter specs against a fake HTTP server (signature vectors, stale/forged/duplicate cases, status
  mapping, timeouts); use-case and db specs for the refund rule; an optional manual sandbox pass with the owner's
  test credentials.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Env + port changes (query on webhook, refund method) + Mercado Pago adapter with fake-HTTP specs | S1, S2, S4 | worker | |
| T2 | Refund rule: admin route, never-published check, provider refund call | S3, S4 | worker | |
| T3 | Web: Checkout Pro redirect and return page states; admin refund button | S1, S3 | worker | |
| T4 | Docs (README env rows, payments docs, ROADMAP M7), native review, PRs, CI, merge | S1-S4 | inline | |

## Needs the owner

- Approval of this design (security-sensitive per AGENTS.md).
- A Mercado Pago account with test credentials put in the API environment as `MERCADOPAGO_ACCESS_TOKEN` and
  `MERCADOPAGO_WEBHOOK_SECRET` (never in the repository) for the sandbox pass.

## Log

- L1 — Owner decisions: «Mercado Pago (recomendado)» and «Sin reembolso tras publicar» (`odd/tasks/owner-followups.md`
  L2). Map of the current payment core and Mercado Pago docs: explorer handoff in this session (port
  `apps/api/src/payments/application/payment-provider.port.ts`, intake `payment-webhook.use-case.ts`, sources:
  mercadopago.com.mx developers docs for preferences, webhooks, payments, and refunds).
