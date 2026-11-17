# Checkout and payments

This document describes the current, implemented payment core of the API (Milestone 7, S1, S3, S4). It is the
operational companion of the code: the state machine and the entitlement rule live in
`apps/api/src/payments/domain/`, the use cases in `apps/api/src/payments/application/`, the adapters in
`apps/api/src/payments/infrastructure/`, and the SQL in `apps/api/src/payments/infrastructure/prisma-payment.repository.ts`.
The tables and their invariants are in [`../database/model.md`](../database/model.md).

## Shape

- `PaymentProvider` (`apps/api/src/payments/application/payment-provider.port.ts`) is the port: `createCheckout`
  answers the provider's reference and the browser redirect, and `verifyWebhook` verifies one delivery from the raw
  body plus headers and answers either a normalized event or a refusal. The application never sees a provider's
  status names, payload shape, signature scheme, or ids as anything but an opaque reference.
- A normalized event is exactly `{ eventId, type, providerReference, amountMinor, currency, occurredAt }` with
  `type` in `paid`, `failed`, `expired`, `refunded`. It is validated field by field
  (`application/normalized-payment-event.ts`) and is the only form a provider payload takes in the domain.
- Checkout copies the package's current price into `Payment.amountMinor` and `Payment.currency` and never re-reads
  it. Retiring the catalog price and publishing another leaves the payment as the owner saw it (S1).
- The publication gate (`infrastructure/payment-gate.ts`) implements the invitations module's `INVITATION_PAYMENT_GATE`
  port. A package whose current price is 0 needs no payment; otherwise a `paid` payment for this invitation and its
  current package is required. A price the catalog cannot answer fails closed with reason `PAYMENT_PRICE_UNAVAILABLE`.
- The simulated adapter (`infrastructure/simulated-payment-provider.ts`) has no account and no network: the redirect
  points at the web's `/cuenta/invitaciones/<invitationId>/pago/simulado/<paymentId>` page, and the button on that page calls
  `POST /payments/simulated/<paymentId>/emit`, which builds and signs an event and hands it to the same verified
  intake the public route uses.

## Modes

`PAYMENTS_MODE` decides what the API charges and which adapter it binds.

| Mode | Where | Behavior |
| --- | --- | --- |
| `free` | Any environment. Default in development and test. | Today's Milestone 5 behavior: publication needs no payment, `POST /invitations/:id/checkout` answers 409 `PAYMENTS_DISABLED`, `GET /invitations/:id/payment` answers `paymentRequired: false`, and every webhook delivery is refused. No provider is bound that can charge. |
| `simulated` | Development and test only; refused in production. | The full flow with the simulated provider: checkout, the signed webhook, the owner read, and the publication gate. |
| a provider key | Later, once the owner chooses a provider. | The real adapter behind the same port. |

Production must set `PAYMENTS_MODE` explicitly: there is no default there, because the default would decide whether
money is charged. `simulated` is refused at startup in production, because its adapter can mint a valid signature
from a configuration value, so a deployment that ran it could grant publication to an event the API itself produced.

## Environment

| Variable | When | Rule |
| --- | --- | --- |
| `PAYMENTS_MODE` | Production: yes. Elsewhere: no. | `free` or `simulated`. Defaults to `free` in development and test; required in production. |
| `PAYMENTS_SIMULATED_SECRET` | With `simulated` | The HMAC-SHA256 key of the simulated adapter, at least 32 characters, and different from `BETTER_AUTH_SECRET`, `AUTH_PROXY_SECRET`, and `AUTH_PROXY_SECRET_PREVIOUS`. Never logged, echoed, returned, or committed. |
| `PAYMENTS_RETURN_BASE_URL` | With `simulated` | The web origin the simulated redirect points at, `http` or `https`, default `http://localhost:3000`. It is an origin only: no path, query, or fragment. |

Every message from `apps/api/src/config/environment.ts` names a variable and never echoes its value. In `free` mode
neither the secret nor the return origin is read, so an existing deployment needs no new variable to keep working.

## Trying the simulated flow locally

1. Apply the migration to your development database: `pnpm db:migrate` (it adds only
   `20261121120000_add_payments`).
2. Give a package a current price through the admin API. Prices are not seeded, so a package without one answers
   409 `PAYMENT_PRICE_UNAVAILABLE` — which is the fail-closed answer, not a bug.
3. Start the API with the mode and a secret:
   `PAYMENTS_MODE=simulated PAYMENTS_SIMULATED_SECRET="<at least 32 characters>" pnpm --filter @invitame/api dev`.
4. Create a draft with that package and open it in the web at `http://localhost:3000/cuenta/invitaciones/<id>`: the
   side column shows «Pagar y publicar» with the amount, and the button starts the checkout. From a shell,
   `POST /invitations/:id/checkout` with the owner session does the same; its answer carries `redirectUrl`, which
   points at the web's simulated page for that payment.
5. `POST /payments/simulated/<paymentId>/emit` with `{ "outcome": "paid" }` (or `"failed"`) and the owner session
   signs an event and posts it through the public intake; the simulated page's «Pagar» and «Simular rechazo» buttons
   do exactly that. The same input twice is a duplicate no-op, because the simulated event id is derived from the
   payment and the outcome. The return page `/cuenta/invitaciones/<id>/pago` then reads the state from the API, and
   the draft's publish button works once the payment is `paid`.

## Simulated signature scheme

`POST /payments/webhooks/simulated` accepts one header:

```text
x-invitame-signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
```

The digest is `HMAC-SHA256(secret, "<t>.<raw body>")` rendered as lower-case hex. The signature covers the exact bytes
of the body, which is why the route reads `request.rawBody` and not the parsed JSON. Verification
(`infrastructure/simulated-signature.ts`) refuses, with one 400 and no detail:

- a missing, duplicated, unknown, or malformed header field;
- a digest that is not 64 lower-case hex characters, or that does not match (`crypto.timingSafeEqual`, after a length
  check, so the comparison is constant-time);
- a timestamp more than five minutes away from the API's clock, in either direction (replay protection);
- a body that is not the normalized event shape.

The rejection is a single `400 { "code": "PAYMENT_WEBHOOK_REJECTED" }`: a caller cannot tell a missing signature from
a stale one or a forged one. Nothing is written for a refused delivery.

## Adding a real provider adapter

1. Add the provider key to `PAYMENTS_MODE` in `apps/api/src/config/environment.ts`, plus the settings variant that
   carries its credentials (each variant carries only what its adapter needs) and its startup validation. Never echo a
   credential in an error message.
2. Add `apps/api/src/payments/infrastructure/<provider>-payment-provider.ts` implementing `PaymentProvider`:
   - `createCheckout` opens the provider's session with the payment's `amountMinor`, `currency`, and
     `idempotencyKey`, and answers the provider's reference and redirect URL. Never read the amount from a request.
   - `verifyWebhook` implements the provider's documented signature scheme over the raw body and the documented
     headers, refuses a stale delivery, then maps the payload to `NormalizedPaymentEvent` and validates it with
     `parseNormalizedPaymentEvent`. No provider status name, payload key, or customer datum may escape this file.
   - Anything that is not one of the four normalized types is a refusal, not a new domain status.
3. Add the case to `createPaymentProvider` in `apps/api/src/payments/payments.module.ts`. Nothing else changes: the
   checkout use case, the intake, the gate, the routes, and the tables are provider-neutral.
4. Add fixture tests with the provider's sandbox: a valid event, a forged signature, a stale timestamp, a duplicate
   delivery, an out-of-order delivery, and a mismatching amount or currency.
5. Document the provider's scheme and its environment variables next to this file.

## Production checklist for the owner

The provider, its account, its fees, and refunds beyond recording the provider's event are the owner's decisions.
Before production charges money:

1. Choose the provider and add its adapter (above), or keep `PAYMENTS_MODE=free` to publish without payment.
2. Set `PAYMENTS_MODE` explicitly. It is required in production, and `simulated` is refused there.
3. Put every provider credential in the deployment's secret storage, never in `apps/api/.env` committed to the
   repository, a log line, a response, a fixture, or a documentation example.
4. Set the package prices through the admin API; a package without a current price cannot be published while the API
   charges (`402 INVITATION_PAYMENT_REQUIRED` with reason `PAYMENT_PRICE_UNAVAILABLE`).
5. Apply the migration (`pnpm db:migrate`) before starting the API that reads the tables.
6. Register the webhook URL (`https://<api origin>/payments/webhooks/<provider>`) with the provider and confirm that
   the provider's own retries are enabled: a duplicate delivery is a no-op by design.
7. Verify the provider's sandbox events end to end: forged, unsigned, stale, duplicate, out-of-order, and failed
   events, plus a price change after checkout (the payment must keep its amount).
8. Decide how refunds are handled beyond recording the provider's `refunded` event; the API records the transition
   and nothing else.

## Routes and codes

Owner routes require the session; the owner comes only from the session, and another customer's invitation or payment
answers the same 404 as an unknown one.

| Route | Success | Refusals |
| --- | --- | --- |
| `POST /invitations/:id/checkout` | `200 { paymentId, redirectUrl, amountMinor, currency }` | `409 PAYMENTS_DISABLED`, `409 PAYMENT_NOT_REQUIRED`, `409 PAYMENT_PRICE_UNAVAILABLE`, `409 PAYMENT_ALREADY_PAID`, `409 INVITATION_PACKAGE_LOCKED_BY_PAYMENT`, `409 INVITATION_NOT_EDITABLE`, `404 INVITATION_NOT_FOUND`, `503 PAYMENT_PROVIDER_UNAVAILABLE` |
| `GET /invitations/:id/payment` | `200 { paymentRequired, status, amountMinor, currency, paidAt }` | `404 INVITATION_NOT_FOUND` |
| `POST /payments/webhooks/:provider` (public) | `200 { outcome: "processed" }`, `200 { outcome: "duplicate" }` | `400 PAYMENT_WEBHOOK_REJECTED` (no detail), `404 PAYMENT_PROVIDER_NOT_FOUND` |
| `POST /payments/simulated/:paymentId/emit` (owner) | `200 { outcome: "processed" }`, `200 { outcome: "duplicate" }` | `409 PAYMENT_SIMULATED_DISABLED`, `404 PAYMENT_NOT_FOUND`, `400` for an outcome other than `paid` or `failed` |

`POST /invitations/:id/checkout` answers 200 and not 201: a repeated checkout resumes the same pending payment, with
the same idempotency key and the same snapshot, instead of creating a second resource.

## Package change

An invitation pins its package at creation and the `Invitation_pinned_fields_immutable` trigger refuses any later
change, so the API has no package-change route. If such a capability is added later it must refuse an invitation with
a `paid` payment (409 `INVITATION_PACKAGE_LOCKED_BY_PAYMENT`) instead of losing the payment; the checkout already
refuses that state today, and the gate never grants publication from a paid payment for another package.

## Web flow

The web is a server-first client of the three owner routes (M7 T2; S1, S4). Nothing on a page decides whether an
invitation is paid: the state always comes from `GET /invitations/:id/payment`, so a query parameter, a cookie, or a
client value can never make a page say "paid", and the API's publication gate stays the only guard.

- **Client** (`apps/web/lib/server/invitations-api.ts`): `checkout(id)`, `payment(id)`, and
  `emitSimulatedPayment(paymentId, outcome)`. Each answer is parsed strictly — a redirect URL is kept as text and
  allow-listed by its caller, an amount is a non-negative whole number of minor units, a status is one of the five
  stored ones — and every documented refusal becomes its own typed failure (`payments-disabled`,
  `payment-not-required`, `payment-price-unavailable`, `payment-already-paid`, `payment-package-locked`,
  `payment-provider-unavailable`, `simulated-payment-disabled`, `payment-not-found`). An id that is not a UUID sends
  no request at all: an unreadable invitation is `not-found` and an unreadable payment is `payment-not-found`.
- **Draft page** (`/cuenta/invitaciones/<id>`): the side column shows the panel above the publish form, and its states
  are the API's — hidden when the deployment sells nothing (so a free draft renders exactly as it did before M7),
  «Pagar y publicar» with the amount while the gate asks for a payment, «Pago confirmado» with the date once it is
  paid, and «Intentar de nuevo» after a `failed`, `expired`, or `refunded` payment. An amount the API requires but the
  page cannot format renders a note instead of a button, so no one pays a total nobody displayed. While a payment is
  due, the publish button is disabled with a hint; the API's 402 `INVITATION_PAYMENT_REQUIRED` remains what actually
  refuses the publication, and its copy now points at «Pagar y publicar» instead of at a capability this milestone
  does not have.
- **Checkout redirect allow-list** (`checkoutRedirectPath` in `apps/web/lib/customer/invitation-payment.ts`): a
  checkout's `redirectUrl` is followed only when it is an absolute `http`/`https` URL whose origin is exactly the web
  origin of the request that submitted the form (`requestOrigin`), whose path is exactly
  `/cuenta/invitaciones/<that invitation's UUID>/pago/simulado/<UUID>`, and which carries no credentials, query,
  fragment, or trailing slash. Anything else — another origin, a protocol-relative URL, `javascript:` or `data:`, a
  relative path, another invitation's id — fails closed with the page's own error notice
  (`payment-redirect-refused`) instead of being followed, and a request whose own origin cannot be determined refuses
  every redirect. This milestone's provider is the simulated one, so its page is the whole allow-list; a real provider
  adapter needs its own host allow-list for its checkout domain, reviewed with that adapter (the provider is the
  owner's decision, L1). `PAYMENTS_RETURN_BASE_URL` must therefore name the web origin the owner actually browses: a
  different host or port than the request's own is refused, which is the fail-closed answer and not a bug.
- **Return page** (`/cuenta/invitaciones/<id>/pago`): the provider sends the browser here, and the page renders
  `GET /invitations/:id/payment` — «Estamos confirmando tu pago» with an «Actualizar» link while it is pending or
  absent, «Pago confirmado» with the amount and the date plus the way back to publish, «El pago no se completó» with a
  retry button that starts the checkout again, and a package that needs no payment goes straight back to the
  invitation. A reload after the provider's webhook shows the new state because the read is never cached.
- **Simulated page** (`/cuenta/invitaciones/<id>/pago/simulado/<paymentId>`): the development-only page the simulated
  checkout redirects to, under `/cuenta` so the session proxy covers it. It shows «Pago de prueba», says that no real
  charge happens, and offers «Pagar» and «Simular rechazo», each one a server action that calls
  `POST /payments/simulated/<paymentId>/emit` and redirects to the return page. A payment that cannot be read, is
  already paid, or belongs to a deployment that sells nothing shows «Este pago de prueba no está disponible».
- **Forms and copy**: every payment form is a server action (`apps/web/app/cuenta/invitaciones/actions.ts`), so it
  works without JavaScript like the rest of the draft page. Each new failure has its Spanish sentence in
  `INVITATION_ERROR_COPY`, the payment text lives in `PAYMENT_COPY` (`apps/web/lib/customer/copy.ts`), and no page
  shows an English message or a raw code. One unexpected failure is logged once as `invitation_call_failed` with the
  error class, the client's failure kind, and the class of its cause — never a body, a cookie, an id, or an amount.
