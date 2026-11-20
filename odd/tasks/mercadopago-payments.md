# Mercado Pago payments and the refund rule

Status: design approved by the owner (L2); implementation pending. AGENTS.md requires a human review of
security-sensitive design before implementation; this document is that reviewed design. Owner decisions: `odd/tasks/owner-followups.md` L2.

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
| T1 | Env + port changes (query on webhook, refund method) + Mercado Pago adapter with fake-HTTP specs | S1, S2, S4 | worker | see L4 |
| T2 | Refund rule: admin route, never-published check, provider refund call | S3, S4 | worker | see L5 |
| T3 | Web: Checkout Pro redirect and return page states; admin refund button | S1, S3 | worker | see L6 |
| T4 | Docs (README env rows, payments docs, ROADMAP M7), native review, PRs, CI, merge | S1-S4 | inline | see L6 |

## Needs the owner

- Approval of this design (security-sensitive per AGENTS.md).
- A Mercado Pago account with test credentials put in the API environment as `MERCADOPAGO_ACCESS_TOKEN` and
  `MERCADOPAGO_WEBHOOK_SECRET` (never in the repository) for the sandbox pass.

## Log

- L1 — Owner decisions: «Mercado Pago (recomendado)» and «Sin reembolso tras publicar» (`odd/tasks/owner-followups.md`
  L2). Map of the current payment core and Mercado Pago docs: explorer handoff in this session (port
  `apps/api/src/payments/application/payment-provider.port.ts`, intake `payment-webhook.use-case.ts`, sources:
  mercadopago.com.mx developers docs for preferences, webhooks, payments, and refunds).
- L2 — Owner approval of the design: «Sí, impleméntalo» (build it against a fake HTTP server; production keeps
  charging nothing until the owner sets the Mercado Pago credentials; no sandbox credentials yet).
- L3 — Implementation decisions inside the approved design: (a) `providerReference` keeps our `paymentId` (the
  `external_reference` Mercado Pago echoes), so the refund finds the Mercado Pago payment through
  `GET /v1/payments/search?external_reference=<paymentId>` instead of a new column; (b) "never published" needs
  history the schema lacks — `Invitation.publishedAt` is cleared on unpublish and archive — so T2 adds an additive,
  never-cleared `firstPublishedAt`, backfilled from `publishedAt` (the product is pre-launch, so no once-published,
  now-unpublished row exists outside development data); (c) T1 runs as one worker on `apps/api/src/payments/**` and
  the environment, T2 follows on its result, T3 (web) last.
- L4 — T1 (worker): `PAYMENTS_MODE=mercadopago` with fail-closed startup validation of the access token, the
  notification signature key, `PAYMENTS_WEBHOOK_BASE_URL`, and the optional `MERCADOPAGO_API_BASE_URL` (https in
  production; the two credentials distinct and never echoed). The port gains the webhook query, an async
  `verifyWebhook`, an authentic-but-ignored answer (`event: null` → 200 `{ outcome: "ignored" }`, nothing written),
  and `refund`. The adapter creates the Checkout Pro preference, verifies `x-signature`, re-reads the payment, maps
  statuses, converts exact cents, and refunds in full; specs run against an in-process fake server. RED observed per
  rule; API 1730 unit and 24 payments db-specs pass; a differential run against the base showed the simulated and
  free modes unchanged.
- L5 — T2: additive `Invitation.firstPublishedAt` (migration `20261124120000_add_invitation_first_published_at`,
  backfilled from `publishedAt`, CHECK `Invitation_firstPublishedAt_when_published`), set by the first publish and
  never cleared; a separate `PaymentRefundRepository` port; admin-only `GET /admin/payments` (bounded paid read with
  a `refundable` flag) and `POST /admin/payments/:paymentId/refund` (409 unless `paid` and never published, 503 when
  the provider refuses; `refunded` only from the verified notification). Evidence: typecheck, lint, format pass; API
  1751 unit and 401 db-specs (disposable database) pass.
- L6 — T3 (worker): the checkout redirect allow-list follows a Mercado Pago `init_point`; the return page drops the
  provider's return query and renders only the API's state, with its own `refunded` view; `/admin/pagos` lists paid
  payments and requests a refund where `refundable`. The parent found the provider host pattern (web and the T1 API
  adapter) accepted `www.mercadopago.evil.com`; both now allow only `mercadopago`/`mercadolibre` on `.com` or
  `.com.mx` (RED observed in both specs). T4: `docs/development/payments.md` and `ROADMAP.md` M7. Evidence: API 1751
  and web 1655 tests, typecheck, lint, format, docs:check, and diff-check pass.
- L7 — Delivery shape: three chained PRs — `feat/mercadopago-1-adapter` (4a1636c), `feat/mercadopago-2-refund`
  (87a6b4f, d16d776, 67840dd), `feat/mercadopago-3-web` (70a7964, 562c154). Slice 1 native review
  `review-a3aaf74ba7e41093` approved and acknowledged; advisories kept for a follow-up: refund events carry the approval
  time, a refund retry after the provider already refunded cannot confirm it, and a signed notification without a topic
  is ignored instead of refused. Slice 2 review `review-242ad9e08d5e50ef` found a publish/refund race (CRITICAL);
  67840dd claims `Invitation.refundRequestedAt` on the row before the provider call and publish requires it NULL
  (API 1752 unit and 403 db-specs pass). Its provider route is `recover` (scope_changed), which the facade refuses in
  this session (`input must be a string`).
