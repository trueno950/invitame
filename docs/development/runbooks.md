# Operations runbooks and alert ownership

Operational runbooks for the first release and the alert-ownership table (Milestone 10, T6; S1, S5). This is the
document an operator opens while something is happening: each runbook quotes the exact command, the exact SQL, or
the exact structured event that exists in the code today, with a `path:line` citation. Exit criteria S5 require
«critical workflows have human-approved operational owners and tested recovery paths»; the table in
[§9](#9-alert-ownership-table) is where those owners and destinations are recorded, and every cell that is still
undecided says so instead of guessing.

**Nothing is deployed today.** There is no Railway project, domain, production email, media bucket, or payment
credential; those are the owner's external setup (T8). Every runbook below is written against the repository that
would be deployed, and the parts that need the deployment are marked «first deployment». Hosting facts, the
per-service commands, and the variable matrices live in
[`deployment.md`](deployment.md) and [`deployment-services.md`](deployment-services.md), not here.

## How to use these runbooks

- One runbook per incident, in the order an operator needs them: what to check, what the answer means, what to do,
  and when to stop.
- **Acting inside a runbook is allowed only for the operations it names.** Reading a log, running a `--dry-run`,
  reading a `/health` endpoint, and re-sending a sign-in code are read-only or idempotent. Anything that would
  change money, an applied migration, or a stored row is the owner's decision, not an operator's improvisation.
- Every command that needs a connection reads the deployment's own environment (`DATABASE_URL`, the media and
  payment variables). Never copy a production secret into a shell history, a ticket, or this file, and never print
  one while diagnosing.
- Timestamps in these runbooks are UTC unless a step names `America/Mexico_City`, which is the product's own day
  boundary for analytics.
- Structured log events are `JSON` lines with an `event` key. §9 lists the ones that are alert-worthy; §8 lists the
  rest and says what a log is and is not.

## 1. Release checklist

Three phases, in this order. Nothing here is a script: each step is a command or a page a human runs and reads.

### Phase 1 — before the release

1. **Green CI on the commit that will be released.** The branch protection on `master` requires the three checks
   «Quality gates», «Database tests», and «Browser tests» (`odd/tasks/m10-release.md` L3; the jobs are
   `.github/workflows/ci.yml:13`, `:58`, `:105`). Record the commit and the run:

   ```bash
   git rev-parse HEAD
   gh pr checks <pr-number>
   gh run list --branch master --limit 3
   ```

   A check that is skipped, cancelled, or missing is not green for this purpose: S5 forbids silently skipping a
   material check, and the guard that a removed gate fails CI is T4's. Do not merge on a red or absent check.

2. **Migration set reviewed as additive.** `prisma migrate deploy` applies whatever is pending in the order it
   finds it (`railway.api.json:17`), and an applied migration is never edited. So review the set, not one file:

   ```bash
   git diff --name-only <deployed-sha>..HEAD -- apps/api/prisma/migrations
   ```

   Additive means `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD COLUMN` (nullable or with a default), and
   constraint or trigger additions. A `DROP`, a rename, a type change, a `NOT NULL` on an existing column, or a
   backfill that rewrites rows is destructive: it needs the human owner's approval and a recovery plan before it
   merges (`AGENTS.md`, "Data and persistence"). The same rule is why `prisma migrate deploy` cannot fail halfway
   into a data rewrite the reviewer never saw.

3. **A backup exists, and its instant is recorded.** S3 chose Railway's own backups, and the repository adds no
   backup script. Confirm in Railway that the database's backups are enabled for the plan in use and note the
   instant of the most recent completed one. Do not start a release on top of a backup you cannot point at. The
   procedure, its verification, and the restore path are in [`backup-restore.md`](backup-restore.md); this checklist
   only requires that the backup exists and that the release records it.

4. **`PAYMENTS_MODE` decided and set explicitly.** Production has no default, because the default would decide
   whether money is charged (`apps/api/src/config/environment.ts:615-621`), and `simulated` is refused there
   (`:638`). The first release is `free` (S2), so:

   - `PAYMENTS_MODE=free` means publication needs no payment, `POST /invitations/:id/checkout` answers
     `409 PAYMENTS_DISABLED`, and **every webhook delivery is refused** (`docs/development/payments.md#modes`).
     In that mode `PAYMENT_WEBHOOK_REJECTED` is expected traffic, not an incident.
   - Write the chosen value into the release record. A release whose mode nobody wrote down is the failure mode
     this step exists to prevent.

### Phase 2 — the release

1. Merge to `master` and watch both services build. The API runs its migrations **before** the new instance
   starts (`preDeployCommand`, `railway.api.json:17`), so the deploy log of the API carries the migration output.
   Read it, do not assume it:

   - the log names the migrations it applies (`N migrations found in prisma/migrations`, then
     ``Applying migration `…` `` per migration), or says `No pending migrations to apply.`;
   - every applied name is one you reviewed in phase 1, and nothing unexpected appears;
   - a failed pre-deploy fails the deploy before the new instance serves traffic, so the previous deployment keeps
     answering. That is a stop, not a retry: read the error before redeploying.

2. **`/health` answers 200 on both services.**

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' https://api.<domain>/health
   curl -sS -o /dev/null -w '%{http_code}\n' https://app.<domain>/health
   ```

   - The API's `/health` is the database-backed readiness probe: 200 carries
     `{"status":"healthy","database":"available","checkedAt":"…"}`, and it answers 503 when the `SELECT 1` roundtrip
     fails (`apps/api/src/health/health.controller.ts:12-25`, `apps/api/src/health/health.service.ts:12`).
   - The web's `/health` is a constant `{"status":"ok"}` that reads no session, cookie, environment variable, or
     API (`apps/web/app/health/route.ts:13-23`), so it stays 200 while the API is down. A green web health and a
     red API health is exactly the pair it is designed to show.
   - Both are the Railway health check path of their service (`railway.api.json:19`, `railway.web.json:18`).

3. **One-off catalog and draft commands, when a release ships them.** The first release that contains omittable
   content sections (`odd/tasks/omittable-sections.md`) needs two commands, run once against the production
   database after the migrations, each first with `--dry-run`:

   ```bash
   pnpm --filter @invitame/api catalog:omittable-sections -- --dry-run   # then without --dry-run
   pnpm --filter @invitame/api invitations:repin-drafts -- --dry-run     # then without --dry-run
   ```

   - `catalog:omittable-sections` publishes a new version of each catalog template that declares which sections a
     customer may turn off; the previous version is retired, never edited. A template the renderer contract refuses
     is listed under `refused` with its issues and the run continues; any `refused` or `failed` entry exits 1 and is
     a stop to read, not a retry. A second run creates nothing.
   - `invitations:repin-drafts` moves each DRAFT invitation to its template's current published version, after
     validating the stored content against it; published and archived invitations never move. Keep its JSON output:
     `moves` lists every moved invitation with `fromVersionId` and `toVersionId`, which is what the recovery in
     `docs/database/model.md` («Draft re-pin») needs. A second run moves nothing.
   - Run the catalog command first: until a template has its new version, its drafts have nothing to move to.

### Phase 3 — post-release verification

Six actions, in order, on the deployed system. Every one of them is a real user path, not a probe.

1. **Create a draft.** Sign in as a customer at `https://app.<domain>/ingresar` with a code from a real mailbox,
   then create a draft at `/cuenta/invitaciones/nueva`. (The API route behind it is `POST /invitations`,
   `apps/api/src/invitations/presentation/invitations.controller.ts:138`.)
2. **Publish a free invitation.** On the draft page, press «Publicar»; with `PAYMENTS_MODE=free` the publication
   gate grants without a charge (`apps/api/src/invitations/application/invitation.use-cases.ts:590`,
   `apps/api/src/payments/infrastructure/payment-gate.ts:26`). The web form calls
   `POST /invitations/:id/publish` through `apps/web/app/cuenta/invitaciones/actions.ts:103`.
3. **Open it publicly.** Open `https://app.<domain>/i/<slug>` in a fresh private window. That page is the one that
   counts a `PUBLIC` opening (`apps/api/src/invitations/presentation/public-invitations.controller.ts:110-120`).
4. **Confirm exactly one opening is counted.** Read `/admin/analitica` (the day's «aperturas», last thirty days by
   default, `apps/web/app/admin/analitica/page.tsx:26-32`) and confirm the same number in the database:

   ```sql
   SELECT "day", "source", "count"
   FROM "InvitationView"
   WHERE "invitationId" = '<the draft you just published>'
   ORDER BY "day" DESC;
   ```

   Expected: **one** row for today in `America/Mexico_City` with `source = 'PUBLIC'` and `count = 1`. A reload
   increments it again — an opening is each opening of the link, reloads and the owner's own visit included
   (`docs/development/analytics-retention.md`). The write happens after the answer is sent and is never awaited, so
   a read taken in the same second as the page load may still be one behind; reload the admin page before deciding
   it failed, and only then check `invitation_view_count_failed` (§8).
5. **Sign in as an administrator.** `https://app.<domain>/admin/ingresar` with the password and the authenticator
   code. An administrator who has not enrolled an authenticator app cannot take an administrative action, and its
   password only works inside its 24-hour window (ADR 0004 decision 3, [§7](#7-administrator-lockout)).
6. **Load `/admin/analitica`.** The window's daily openings and the purchase funnel render. A load failure shows
   the page's own retry notice instead of an empty table (`apps/web/app/admin/analitica/page.tsx:95-102`,
   `apps/web/lib/admin/analytics/copy.ts:59`).

### Evidence to record

Write these into the release record, which the owner keeps; do not paste a secret, a customer's address, or a
sign-in code into it:

- the released commit (`git rev-parse HEAD`) and the CI run that was green on it;
- the `PAYMENTS_MODE` the release runs;
- each migration name the pre-deploy step applied, or `No pending migrations to apply.`;
- the backup instant from phase 1;
- the four observed results: both `/health` status codes, the published slug (slug only), the `InvitationView`
  row read in step 4, and the administrator sign-in;
- the release instant and who ran it.

## 2. Payment webhook or refund incident

The payment core has exactly one writer: the verified webhook intake. This runbook is about telling the four
possible answers apart, reading state, and knowing when to stop.

### Tell the four answers apart

| What you see | What it means | Was anything written? | What the provider does |
| --- | --- | --- | --- |
| `400 {"code":"PAYMENT_WEBHOOK_REJECTED"}` | The delivery did not pass verification: missing, duplicated, unknown or malformed signature header, a digest that does not match, a timestamp more than five minutes from the API clock, or a body that is not the event shape. A signed delivery that names no topic at all is malformed, not undecided. | Nothing. | Retries; treat it as undelivered. |
| `200 {"outcome":"ignored"}` | Authentic, but decides nothing — another topic, or a status such as `pending`, `authorized`, `in_process`, `in_mediation`. | Nothing. | Stops retrying, by design. |
| `200 {"outcome":"duplicate"}` | The event was already stored: `(provider, providerEventId)` is unique, so a redelivery is a no-op. | Nothing new. | Its retry already succeeded. |
| `200 {"outcome":"processed"}` | The event was stored and its transition applied in one transaction. | The event row and, when the event decides, the payment state. | Done. |

The refusals are implemented at `apps/api/src/payments/application/payment-webhook.use-case.ts:49` (one refusal for
every check, no detail, so a caller cannot tell a missing signature from a forged one), `:54` (`ignored`), `:82`
(`duplicate`), `:94` (`processed`), with the response shape at
`apps/api/src/payments/presentation/payment.response.ts:166` and the public route at
`apps/api/src/payments/presentation/payments.controller.ts:83`.

**`rejected` is not the same problem as `ignored`.** A rejected delivery means the two sides disagree about
signing: the provider's secret (`MERCADOPAGO_WEBHOOK_SECRET`) and the deployment's are not the same value, the
notification URL points at the wrong service, or the host clock has drifted past ±5 minutes. An ignored delivery
means they agree and the event simply had nothing to decide. Diagnosing an `ignored` event as a signature problem
wastes the outage window; diagnosing a `rejected` one as «normal» hides a real loss of payment truth.

### Where the payment state lives

`Payment` (`apps/api/prisma/schema.prisma:535`) holds the state, the snapshot amount and currency, the provider key,
the provider reference, and the idempotency key. `PaymentEvent` (`:571`) holds one row per received delivery: the
normalized type, the provider's own event id, the decision (`outcome`), and the SHA-256 of the raw payload — never
the payload itself, because it can carry a payer's name or card data. `Payment.status` moves only inside the intake
transaction; no administrator click writes it, and the admin refund route asks the provider instead
(`apps/api/src/payments/application/refund.use-cases.ts:10-15`).

Read it through the administrator API, which is what `/admin/pagos/<id>` renders, or through SQL:

```sql
SELECT "id", "status", "amountMinor", "currency", "provider", "providerReference", "paidAt", "updatedAt"
FROM "Payment"
WHERE "id" = '<paymentId>';

SELECT "providerEventId", "type", "outcome", "receivedAt", "processedAt"
FROM "PaymentEvent"
WHERE "paymentId" = '<paymentId>'
ORDER BY "receivedAt" DESC
LIMIT 50;
```

To find a payment from its invitation, join through `Invitation.slug`
(`apps/api/prisma/schema.prisma:318`) instead of guessing an id:

```sql
SELECT p."id", p."status", p."amountMinor", p."currency", p."paidAt"
FROM "Payment" p
JOIN "Invitation" i ON i."id" = p."invitationId"
WHERE i."slug" = '<slug>';
```

The owner's own read is `GET /invitations/:id/payment`, and the administrator's read-only detail is
`GET /admin/payments/:paymentId` (`apps/api/src/payments/presentation/admin-payments.controller.ts:64`). Both take
the session from the request, never from a query parameter.

### The administrator refund path, and its refusals

«Sin reembolso tras publicar»: a full refund may be requested only while the payment is `paid` and its invitation
was **never published** — «never published» reads `Invitation.firstPublishedAt`, which the first publish sets and
nothing clears, so unpublishing and archiving do not reopen the door
(`apps/api/src/payments/application/refund.use-cases.ts:10-15`).

Path: `/admin/pagos` lists the newest paid payments with a «Reembolsar» form only on a row the API marks
`refundable` (`apps/web/app/admin/pagos/page.tsx:78`) → the server action
(`apps/web/lib/admin/payments/commands.ts:30`) → `POST /admin/payments/:paymentId/refund`
(`apps/api/src/payments/presentation/admin-payments.controller.ts:75`). The click only **asks** the provider
(`apps/api/src/payments/application/refund.use-cases.ts:60-70`); the payment becomes `refunded` when the verified
notification for the refund arrives, and a `refunded` payment no longer opens the publication gate.

| Refusal | Meaning | What to do |
| --- | --- | --- |
| `404 PAYMENT_NOT_FOUND` | The id names no payment. | Re-read the list; do not retype an id. |
| `409 PAYMENT_NOT_REFUNDABLE` | The payment is not `paid` (pending, failed, expired, or already refunded), or the checkout never reached the provider so there is no provider reference. | Nothing to refund. Read the events before escalating. |
| `409 INVITATION_ALREADY_PUBLISHED` | The invitation was published at some instant, even if it is a draft now. | Refused by design. Escalate; do not attempt it another way. |
| `503 PAYMENT_PROVIDER_UNAVAILABLE` | The provider refused or could not be reached. The refund claim is kept, so the invitation stays unpublishable and the retry re-sends the same idempotent refund. | Retry once after the provider recovers; the stable idempotency key keeps a double click to one refund. |

A publish racing a refund is settled in the database, not by code order: the refund claims
`Invitation.refundRequestedAt` with a conditional single-row update, and the publish requires that column to stay
NULL (`apps/api/src/payments/application/refund.use-cases.ts:17-21`). Exactly one of the two lands.

### When the answer is «do not touch money; record and escalate»

Stop, record, and escalate — no SQL write, no manual state change, no provider-panel refund guessed at — when any
of these is true:

- what Mercado Pago's panel shows and what `Payment` says disagree: an amount or currency mismatch, a payment the
  provider reports as approved but ours still shows `pending` after the provider's own retries, a refund the
  provider reports as landed while our payment is still `paid`, or a chargeback / `in_mediation` status;
- a `paid` event's `PaymentEvent` row exists but the payment did not move, or the reverse;
- the fix you are considering is an `UPDATE` or `DELETE` on `Payment`, `PaymentEvent`, or `Invitation.publishedAt`
  — those are money truth, and the intake is the only writer;
- `PAYMENTS_MODE` on the running deployment is not the value the release record says, or a credential
  (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`) may have leaked.

Record for the escalation, and nothing else: the payment id, the provider's payment id, the two timestamps, which
of the four answers above the deliveries received, and the read-only output of the two queries. Never a card
datum, a payer's name or address, the access token, or the signature secret. Recovering a lost notification is the
provider's retry or a re-send from its panel — never a hand-written row.

## 3. Email delivery degraded

ADR 0004 decision 8 (as amended) requires an operational alert for repeated send failures **by the first
production release**, and the code already emits the signal.

**The event.** `{"event":"email_delivery_degraded","failures":5,"windowMs":300000}` is emitted when five failed
deliveries fall inside a sliding five-minute window
(`apps/api/src/email/application/email-delivery.service.ts:21-26` and `:32`, raised at `:158`). It re-arms only
after a full window passes with no failure, so one ongoing outage raises one alert and not one per message. Each
failed message is logged first as `{"event":"email_delivery_failed","attempts":N,"reason":"…","transient":bool}`
(`:125`), which is the per-message line: three attempts in total, 250 ms and then 500 ms apart (`:11-16`), and no
recipient, subject, body, code, or key in either line.

**What the user sees when a code does not arrive.** The code request answers success immediately, before any
delivery happens (`apps/api/src/auth/sign-in-code/sign-in-code-sender.ts:51-63`), so the page says «Revisa tu
correo» and «Pedimos un código para <email>. Puede tardar un par de minutos en llegar y vence en 5 minutos»
(`apps/web/lib/customer/copy.ts:34-37`, `:40`). Nothing arrives. When delivery fails after the retries the code is
invalidated, so entering it answers «El código no es correcto o ya venció. Revísalo o pide uno nuevo.» (`:47`). The
customer cannot tell an outage from a typo — which is deliberate, because the response must never reveal whether an
address has an account.

**The per-address quota is 5 codes per hour** (`apps/api/src/auth/abuse-limits.ts:22`), counted on a SHA-256 of the
trimmed lower-cased address so the plain address is never stored (`:25-34`). Over the quota the code is removed
unsent and the page still says a code was sent (`apps/api/src/auth/sign-in-code/sign-in-code-sender.ts:92-98`).
So an exhausted quota and a broken provider look identical to the customer: check how many codes that address asked
for before blaming the delivery path. A separate client-IP limit allows 3 requests per 60 seconds on each code
endpoint (`apps/api/src/auth/abuse-limits.ts:4`).

**Safe retry, in order:**

1. Confirm the shape of the failure from the log line's `reason` and `transient` — a permanent reason (a refused
   recipient or a provider 4xx) is a configuration problem, not an outage.
2. Check the provider: its status page, whether the sending domain's SPF, DKIM, and DMARC records still verify, and
   whether the plan's daily sending limit is reached (ADR 0004: the free plan is development-only because every
   customer sign-in sends an email, and it is small).
3. Check the deployment's own variables: `EMAIL_TRANSPORT` must be `resend` in production (no other value is
   accepted, `apps/api/src/config/environment.ts:527`), `EMAIL_FROM` must be the verified sender, and
   `RESEND_API_KEY` must be present (`:545`).
4. Have the customer press «Enviar un código nuevo» (`apps/web/lib/customer/copy.ts:44`). Resending is safe: a new
   code replaces the old one, a failed delivery invalidates only its own code, and a retry never creates a second
   valid code. Do not ask anyone to read a code out loud, and never put a code in a ticket.
5. Existing sessions keep working during a mail outage, and administrator sign-in does not use email at all
   (ADR 0004 decision 8): the blast radius is new customer sign-ins only.

## 4. Media storage failure

### Upload failures

| Symptom | Cause | Where |
| --- | --- | --- |
| `413 PAYLOAD_TOO_LARGE` | The multipart body is over the upload route's 16 MB request bound — the widest configurable photo (15 MB) plus room for the boundary, the `kind` and `alt` fields, and part headers. Nothing about the file was examined. | `apps/api/src/media/presentation/multipart-form.ts:146`, `MAX_UPLOAD_REQUEST_BYTES` at `apps/api/src/media/domain/media-asset.ts:71`, passed by `apps/api/src/media/presentation/invitations-media.controller.ts:76` |
| `400 INVALID_MEDIA_UPLOAD` with `file must be at most <n> MB` | The file is larger than the configured `maxUploadMegabytes`. The size is read from the header before any decode. | `apps/api/src/media/domain/media-asset.ts:105`, `apps/api/src/media/presentation/media.response.ts:106` |
| `400 INVALID_MEDIA_UPLOAD` with a format or dimensions issue | Not a JPEG, PNG, or WebP by magic bytes, or more than 8000 px on a side. The width and height come from the header, before decoding. | `docs/development/media-storage.md#limits` |
| `409 INVITATION_NOT_EDITABLE` | The invitation is archived, so nothing may be added to it. | `apps/api/src/media/presentation/media.response.ts:85`; the upload route's own map at `apps/api/src/media/presentation/invitations-media.controller.ts:65` |
| `409` on the count cap | The gallery or stored-asset cap is reached. A lowered cap refuses the next upload and leaves every stored photo where it is. | `docs/development/media-storage.md#limits` |

**Read the configured numbers before diagnosing a size problem.** `/admin/configuracion` holds them, in the group
«Tamaño de foto» («Peso máximo por foto (MB)», range 1–15) and «Fotos por invitación» («Fotos de galería», 1–24;
«Archivos guardados», 1–80, always at least one above the gallery cap)
(`apps/api/src/settings/domain/operational-settings.ts:56-66`, labels in
`apps/web/lib/admin/settings/copy.ts`). The seeded values are 10 MB, 12 gallery photos, and 40 stored assets
(`:73-82`), so «10 MB» in a message is the seed and not a constant. The panel's own rule is that a lowered limit
only stops what is added afterwards — nothing stored is deleted, hidden, or rewritten.

The web refuses an oversized photo before reading it, using `GET /invitations/:id/media/limits`, and Next's own
body limit is 16 MB for server actions and proxied routes (`apps/web/next.config.ts:6`). If a photo is refused
before it ever reaches the API, the cause is that limit, not the media rules.

### Serving failures

`GET /media/<assetId>` answers **one 404** for every case that must look identical: missing, deleted, unpublished,
someone else's, or a row whose object is gone (`apps/api/src/media/presentation/media.controller.ts:40-70`). A
published invitation's image is public and immutable; the owner sees a draft with `private, no-store`. So a broken
image on a published invitation is usually one of two things: the asset row is not `stored`, or the object is not
in the bucket.

```sql
SELECT "id", "kind", "status", "byteSize", "width", "height", "storageKey", "updatedAt"
FROM "MediaAsset"
WHERE "invitationId" = '<invitationId>'
ORDER BY "kind", "position";
```

`status = 'DELETED'` explains a 404 and needs the cleanup command. A `STORED` row whose image still 404s means the
object is missing from the bucket: `MEDIA_STORAGE_DRIVER`, the bucket, the endpoint, and the credential are the
first things to check, because a wrong bucket answers exactly like a missing file. Never "fix" it by editing
`storageKey` or `status`: `status` is the recovery marker the cleanup command reads, and rewriting it loses the
object's track.

### When to run `pnpm media:cleanup --dry-run` first

Run the dry run first, always, and read its counts before letting it delete:

```bash
pnpm media:cleanup -- --dry-run
pnpm media:cleanup
```

The dry run reports `deletedObjects`, `orphanObjects`, `skippedRecentObjects`, `deletedRows`, and `failedObjects`
without touching anything (`apps/api/scripts/media-cleanup.ts:37-39`; the apply run prints the same object with
`"mode":"apply"` from `apps/api/src/media/application/media.use-cases.ts:582`). It is the right first step after a
failed upload or delete, and the routine step before trusting it as a periodic job. Two reasons it is safe at any
time: an object with no row is only treated as an orphan once it is older than the **one-hour** grace period
(`MEDIA_ORPHAN_GRACE_MS`), because an upload writes its object before it inserts its row; and the objects of rows
marked `deleted` are never subject to that grace period. A `skippedRecentObjects` count above zero is the grace
period doing its job, not a failure. Exit code 0 means every object it tried to delete is gone; 1 means at least
one failed and its row was kept for the next run — running it again is the retry.

## 5. Retention runs

Two independent commands, each idempotent, each printing one line of counts and nothing that names an invitation, a
slug, an owner, or an image.

### Analytics views

```bash
pnpm analytics:retention -- --dry-run   # prints what it would delete
pnpm analytics:retention                # deletes and reports the count
```

- Prints `{"event":"analytics_retention","mode":"dry-run"|"apply","deletedViews":N}`
  (`apps/api/scripts/analytics-retention.ts:41-44`). `--dry-run` calls the count instead of the delete, so it cannot
  remove anything even if the cutoff were wrong.
- Deletes `InvitationView` rows whose day is older than ninety days before today in `America/Mexico_City`; the
  cutoff is the last kept day, so a row of exactly ninety days stays and a row of ninety-one days goes.
- Idempotent: a second run on the same day deletes nothing. Needs only `DATABASE_URL` and `NODE_ENV`.
- Exit 0 means the run finished; 1 means it failed — an unknown argument, a missing or unreachable `DATABASE_URL`,
  or a refused statement — reported as `{"event":"analytics_retention_failed","error":"…"}` (`:50`) and never as
  done. Nothing in the product depends on the deletion having happened, because every read is bounded to a window.
- Run the dry run before the first scheduled run and whenever the window changes. The daily Railway task that will
  run the apply form is created with the first deployment (S7); until it exists, running it by hand is the whole
  operation.

### Media objects

```bash
pnpm media:cleanup -- --dry-run
pnpm media:cleanup
```

Prints the counts described in [§4](#when-to-run-pnpm-mediacleanup---dry-run-first), deletes the objects of rows
marked `deleted`, the objects under `invitations/` that no row names and that are older than the one-hour grace
period, and then the rows whose object is gone. Idempotent for the same reason: a second run finds nothing that the
first did not already remove, and a failed object keeps its row for the next run. It needs `NODE_ENV`, the
database URL, and the media variables, but no auth, web, or payment secret.

## 6. Secret rotation

### `AUTH_PROXY_SECRET` — rotatable without a cut

The web proves every request to the API with a shared secret in the `x-invitame-proxy-secret` header; in production
the API refuses every `/api/auth` request without it with a generic `403` before any endpoint, hook, or rate-limit
step runs (ADR 0004 decision 4). Rotation is designed in three steps, in this order (README, "Environment
variables"):

1. On the **API**, set `AUTH_PROXY_SECRET` to the new value and `AUTH_PROXY_SECRET_PREVIOUS` to the old one. The API
   accepts either while both are set: `matchesAnySecret` is called with both
   (`apps/api/src/auth/auth-request-guard.ts:229-233`).
2. On the **web**, set `AUTH_PROXY_SECRET` to the new value. The web validates its own copy at startup and has no
   previous-secret setting (`apps/web/lib/server/config.ts:112-124`), so this is the moment the two sides agree.
3. On the **API**, remove `AUTH_PROXY_SECRET_PREVIOUS`. From then on the old secret is refused.

The validator's rules are what make the window safe and what will refuse a sloppy rotation
(`apps/api/src/config/environment.ts:376-378`, `:400-415`): at least 32 characters; different from
`BETTER_AUTH_SECRET`; `AUTH_PROXY_SECRET_PREVIOUS` requires `AUTH_PROXY_SECRET`; and the two differ from each
other. A deployment that gets one of these wrong does not start, and the message names the variable and never its
value.

Diagnose the window from the logs: `{"event":"auth_proxy_rejected","path":"/api/auth/…"}` means a request arrived
without a secret the API accepts — during a rotation that is step 2 missing or a web deployment still on the old
value *after* step 3 (`apps/api/src/auth/auth-request-guard.ts:13`, `:234-236`). Nobody can sign in while it
persists, so treat it as P1 in §9.

The same shape applies to the other rotating credentials: `PAYMENTS_SIMULATED_SECRET`, `MERCADOPAGO_ACCESS_TOKEN`,
`MERCADOPAGO_WEBHOOK_SECRET`, and the media credentials are re-issued on the provider's side and updated on the
service; each has a startup rule that names the variable and never echoes a value. `MERCADOPAGO_WEBHOOK_SECRET`
must be updated on both sides — a mismatch produces `400 PAYMENT_WEBHOOK_REJECTED` on every delivery, which is
[§2](#2-payment-webhook-or-refund-incident)'s first row.

### `BETTER_AUTH_SECRET` — no rotation path yet

**There is no rotation path for `BETTER_AUTH_SECRET`, and this document does not pretend otherwise.** Better Auth's
own multi-secret rotation is refused at startup — `BETTER_AUTH_SECRETS` is refused for any value other than unset
or exactly `""` (README, "Environment variables") — and the API passes a single `secret`.

What that means operationally, because it decides whether you may rotate at all:

- `BETTER_AUTH_SECRET` signs every session **and** encrypts each administrator's TOTP secret and backup codes.
  Changing it ends every session — customers and administrators — and leaves every enrolled administrator unable
  to produce a valid second factor.
- Each enrolled administrator therefore needs
  `pnpm --filter @invitame/api admin:reset-second-factor -- <email>` and then a fresh enrollment
  ([§7](#7-administrator-lockout)), and every customer signs in again.
- So the honest rule today: **rotate only on a real suspicion of compromise, with the owner's approval, a planned
  window, and a list of every enrolled administrator in hand.** Not as routine hygiene. A planned rotation is a
  deployment-milestone task that does not exist yet; if one is needed, it is an owner decision, not an operator
  improvisation.

## 7. Administrator lockout

There is no administrator sign-up, no password change through the API, and no interface that unlocks an account.
Two server-side commands are the whole recovery surface, both interactive-terminal only, both printing their
password once (README, "Create an administrator" and "Recover a locked administrator").

### `admin:create` — a new administrator, or a reissued initial password

```bash
pnpm --filter @invitame/api admin:create -- <email>
```

`apps/api/package.json:6`. It creates an `ACTIVE` administrator with a random 24-character initial password, printed
once on its own line and never logged or stored in plain text; it refuses when its output is redirected. The
password opens a **24-hour** enrollment window: until the administrator enrolls an authenticator app at
`/admin/activar` and confirms it with the first code, the account holds no administrator authority. After 24 hours
the password stops working like a wrong password and existing sessions end.

Re-running it for an administrator who has **not** enrolled replaces the password, restarts the 24-hour window,
discards an unconfirmed enrollment, and signs the administrator out everywhere, in one transaction. It refuses an
administrator who has already enrolled (use the recovery command), a `DISABLED` administrator, and any customer
address, which is never promoted. Exit codes: 0 issued, 1 refused or failed, 2 a usage error or a non-interactive
terminal.

### `admin:reset-second-factor` — every lock state of an enrolled administrator

```bash
pnpm --filter @invitame/api admin:reset-second-factor -- <email>
```

`apps/api/package.json:8`. It releases every lock state of an `ACTIVE` administrator: a first confirmation that
failed or was interrupted, a second tab that signed out during activation, a lost confirmation response before the
backup codes were seen, a lost device, and lost or used-up backup codes. In one transaction it turns the second
factor off, deletes the authenticator secret and the backup codes, signs the administrator out everywhere, and
replaces the password with a new initial password that opens a **new 24-hour** enrollment window. The administrator
then signs in and enrolls again, exactly as after `admin:create`.

Before running it, confirm the requester's identity out of band — a call to a number you already know — because
anyone who receives the new password can enroll their own device. Hand the password over through a secure channel.
The command refuses an unknown address, a customer, and a `DISABLED` administrator, changing nothing, and prints at
most the user id — never the address, the password, the authenticator secret, or the backup codes.

A pending administrator whose 24-hour window simply expired uses `admin:create`, not the reset command.

### When nobody can sign in

Work from the cheapest cause outward: if **everyone** is affected it is infrastructure, and if one person is
affected it is that account's own state.

1. **Is it everybody or one account?** If customers cannot sign in either, it is not a lockout. Go to
   [§3](#3-email-delivery-degraded) (codes) or check `auth_proxy_rejected` / `auth_request_unavailable` /
   `web_config_invalid` in §8 and `/health` on both services.
2. **Do administrators fail with a password error or with a second-factor error?** A password error inside the
   24-hour window is a wrong password; after the window it is an expired one — `admin:create` again. A
   second-factor error is a lost device or a lost backup code set — `admin:reset-second-factor`.
3. **Is the administrator `DISABLED`?** `pnpm --filter @invitame/api user:disable -- <email>` disables and revokes
   sessions (`apps/api/package.json:21`) and there is **no inverse in this milestone**: re-enabling is out of scope,
   so a disabled administrator is not recoverable by any command in the repository. That is an owner decision and
   an escalation, not something to work around by editing rows.
4. **Is there no administrator at all?** `admin:create` is the answer, and its 24-hour enrollment window starts the
   clock — run it when the person who will enroll is ready, not days earlier.

## 8. Incident log sources

Every operational signal in the product is one JSON log line with an `event` key. These are the ones that exist
today, with where they are emitted. Use them together with §9: the event tells you what broke, the runbook tells
you what to do.

| Event | Emitted at | Meaning |
| --- | --- | --- |
| `email_delivery_failed` | `apps/api/src/email/application/email-delivery.service.ts:125` | One message could not be delivered after the bounded retries, with `attempts`, `reason`, `transient`. |
| `email_delivery_degraded` | `apps/api/src/email/application/email-delivery.service.ts:158` | Five failures inside five minutes; one per ongoing outage. |
| `background_task_failed` | `apps/api/src/auth/sign-in-code/background-tasks.ts:123`, `:128` | A background sign-in-code task failed; names the task, the failed stage (`quota`, `lookup`, `delivery`, `invalidation`), and the error class. |
| `background_task_rejected`, `background_task_rejected_after_shutdown` | `apps/api/src/auth/sign-in-code/background-tasks.ts:77`, `:82` | The process refused a task at capacity (`MAX_PENDING_BACKGROUND_TASKS = 100`) or while shutting down; the code was discarded, never queued. |
| `auth_proxy_rejected` | `apps/api/src/auth/auth-request-guard.ts:235` | A `/api/auth` request arrived without a secret the API accepts. Everyone's sign-in depends on this being zero. |
| `client_ip_unresolved` | `apps/api/src/auth/auth-request-guard.ts:243` | The client IP could not be read from the configured header; answers 503, and rate limits cannot work without it. |
| `auth_request_unavailable` | `apps/api/src/auth/auth-request-guard.ts:251` | The auth handler threw; carries the path and the error class. |
| `session_refused`, `session_ended`, `session_update_refused`, `administrator_sibling_sessions_delete_failed`, `administrator_enrollment_superseded`, `administrator_enrollment_compensation_failed`, `administrator_enrollment_revert_result`, `administrator_session_created_at_invalid` | `apps/api/src/auth/auth-request-guard.ts:11-31`, `apps/api/src/auth/session-access-hook.ts:91` | Session-lifecycle decisions, including every path that ends an administrator session. |
| `invitation_view_count_failed` | `apps/api/src/invitations/presentation/public-invitations.controller.ts:204` | One opening was not counted. The guest's page was already served and is unaffected. |
| `public-invitation-not-renderable` | `apps/api/src/invitations/presentation/public-invitations.controller.ts:213` | A public slug has no renderer for its pinned version; the guest gets a 404. Carries the slug and the component key. |
| `mercadopago-request-failed` | `apps/api/src/payments/infrastructure/mercadopago-payment-provider.ts:555`, `:598`, `:660`, `:688`, `:744`, `:755`, `:764`, `:775` | One provider request failed, naming only a category (status, timeout, network, unreadable answer). Never a token, a body, or a payer datum. |
| `media_delete_recovery` | `apps/api/src/media/application/media.use-cases.ts:425` | A delete could not remove the object; the row is marked and kept for the next cleanup run. |
| `media_session_read_failed` | `apps/api/src/media/presentation/optional-session.ts:53` | The session read for an unpublished image failed; the request is answered as unauthenticated. |
| `media_cleanup`, `media_cleanup_refused`, `media_cleanup_failed` | `apps/api/src/media/application/media.use-cases.ts:582`, `apps/api/scripts/media-cleanup.ts:19`, `:46` | The cleanup run's counts, a refused argument, and a failed run. |
| `analytics_retention`, `analytics_retention_refused`, `analytics_retention_failed` | `apps/api/scripts/analytics-retention.ts:41`, `:21`, `:50` | The retention run's counts, a refused argument, and a failed run. |
| `place-search-failed` | `apps/api/src/invitations/infrastructure/photon-place-search.ts:76`, `:253`, `:265`, `:274`, `:285` | The address-suggestion lookup failed; the field degrades to no suggestions. |
| `web_config_invalid` | `apps/web/lib/server/startup.ts:37` | The web refused to start with an invalid setting; the line names the variable and the server exits 1. |
| `auth_proxy_upstream_failed` | `apps/web/lib/server/auth-proxy.ts:53`, `:57`, `:270`, `:278` | The web could not reach the API for an `/api/auth` request. |
| `admin_catalog_call_failed`, `admin_settings_call_failed`, `admin_payments_call_failed`, `admin_analytics_call_failed`, `admin_invitations_call_failed`, `admin_users_call_failed`, `invitation_media_call_failed` | `apps/web/lib/server/admin-payments-api.ts:32`, `apps/web/lib/server/admin-users-api.ts:32`, `apps/web/lib/server/admin-analytics-api.ts:32`, `apps/web/lib/server/admin-invitations-api.ts:34`, `apps/web/lib/server/admin-settings-api.ts:32`, `apps/web/lib/server/admin-catalog-log.ts:11`, `apps/web/lib/server/invitation-media-log.ts:14` | One administrator (or media) page could not read its data; the page shows its own retry notice. |

Three rules apply to all of them, and they are not stylistic:

1. **A log is not an audit trail.** Operational logs are a signal about health, they are aggregated by the platform,
   and they expire. The audit trail is `AdminAction` (`apps/api/prisma/schema.prisma:622`): one append-only row per
   state-changing support action, written in the same transaction as the change, with an `AdminAction_append_only`
   trigger that refuses every `UPDATE` and `DELETE`. Reading a payment detail writes no `AdminAction` row, by
   design. When the question is «who did this, and why», the answer is a query on `AdminAction`, never a log grep:

   ```sql
   SELECT "action", "reason", "note", "targetUserId", "invitationId", "adminUserId", "createdAt"
   FROM "AdminAction"
   ORDER BY "createdAt" DESC
   LIMIT 20;
   ```

2. **No personal data in a log line.** No recipient address, sign-in code, password, token, card or payer datum,
   provider payload, image key, or visitor identity is logged anywhere; a failure that would carry one carries only
   its class or category. Two consequences worth knowing while diagnosing: a path in an auth event is cut to 128
   characters (`apps/api/src/auth/auth-request-guard.ts:92-100`) and carries no query, and the view counter's
   failure line names neither the invitation nor the visitor. If a diagnostic needs a value that is not in a log,
   get it from the read-only SQL above — not by adding logging to a running service.
3. **Absence of an event is not evidence of health.** Almost every structural failure here is fail-closed and
   silent by design (a refused publication, a dropped webhook). Read the event *and* the state.

## 9. Alert ownership table

One row per alert-worthy event above. The ADR requires the `email_delivery_degraded` row to exist and to be owned
**by the first production release**; the rest are the same standard applied to the other user-facing paths.

Severity scale used here:

- **P1** — money, sign-in, or the public invitation pages are broken or can silently lose truth. Act immediately.
- **P2** — degraded but usable, or a background job failed. Act the same day.
- **P3** — diagnostic; act only on a pattern or a repeat.

No alert destination exists yet, because no Railway project, no alerting, and no on-call has been created (T8). So
the honest entry for every row is the same: **destination not decided yet (T8 owner decision)**. The T8 owner fills
the destination and the responsible person's name in the blank of each row; this table is the record S5 asks for,
and it is deliberately not filled with an invented name or channel.

| Event | Severity | Who is notified | Where it is emitted |
| --- | --- | --- | --- |
| `email_delivery_degraded` — **required by ADR 0004 by the first release** | P1 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/email/application/email-delivery.service.ts:158` |
| `auth_proxy_rejected` | P1 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/auth/auth-request-guard.ts:235` |
| `auth_request_unavailable` | P1 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/auth/auth-request-guard.ts:251` |
| `web_config_invalid` (web exit 1) | P1 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/web/lib/server/startup.ts:37` |
| `PAYMENT_WEBHOOK_REJECTED` (400 on `POST /payments/webhooks/:provider`) | P1 while `PAYMENTS_MODE=mercadopago`; **expected traffic and not an alert** while `free` | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/payments/presentation/payment.response.ts:166` |
| `mercadopago-request-failed` | P2 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/payments/infrastructure/mercadopago-payment-provider.ts:555` (and `:598`, `:660`, `:688`, `:744`, `:755`, `:764`, `:775`) |
| `email_delivery_failed` (single, below the degraded threshold) | P2 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/email/application/email-delivery.service.ts:125` |
| `background_task_failed` with `task: "sign_in_code_delivery"` | P2 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/auth/sign-in-code/background-tasks.ts:123`, `:128` |
| `background_task_rejected` / `background_task_rejected_after_shutdown` (a refused code request never reaches the customer) | P2 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/auth/sign-in-code/background-tasks.ts:77`, `:82` |
| `public-invitation-not-renderable` | P2 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/invitations/presentation/public-invitations.controller.ts:213` |
| `media_cleanup_failed` / cleanup exit 1 (an object or row still pending) | P2 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/scripts/media-cleanup.ts:46`; the run's counts at `apps/api/src/media/application/media.use-cases.ts:582` |
| `analytics_retention_failed` | P3 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/scripts/analytics-retention.ts:50` |
| `invitation_view_count_failed` | P3 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/invitations/presentation/public-invitations.controller.ts:204` |
| `media_delete_recovery` | P3 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/media/application/media.use-cases.ts:425` |
| `own_profile_read_failed`, `own_profile_update_failed`, `auth_session_read_failed` (the web could not read or write the account it was rendering), `media_session_read_failed` | P3 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/web/lib/server/server-log.ts:15-17`, emitted from `apps/web/lib/server/session-api.ts:47`, `:57`, `:71`; `apps/api/src/media/presentation/optional-session.ts:53` |
| `client_ip_unresolved` (answers 503; rate limits cannot work) | P2 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/auth/auth-request-guard.ts:243` |
| `place-search-failed` (the address field degrades to no suggestions) | P3 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/invitations/infrastructure/photon-place-search.ts:76` |
| `auth_proxy_upstream_failed` (the web could not reach the API for `/api/auth`) | P1 when sustained, P3 as a single line | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/web/lib/server/auth-proxy.ts:53`, `:57`, `:270`, `:278` |
| `admin_*_call_failed` / `invitation_media_call_failed` (one page could not read its data; it shows its own retry notice) | P3 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/web/lib/server/admin-catalog-log.ts:11`, `apps/web/lib/server/invitation-media-log.ts:14`, and the equivalent constant at `:32`/`:34` of each other `apps/web/lib/server/admin-*-api.ts` |
| `/health` 503 on the API (database unreachable) — not a log event | P1 | Destination not decided yet (T8 owner decision). Responsible person: ______________________ | `apps/api/src/health/health.controller.ts:18-24`; Railway's own health check (`railway.api.json:19`) |

How to fill this table when the destination is decided: name the channel (a Railway alert, an email, an on-call
rotation), name the person who answers it, and keep the severity column as it is unless the owner changes the
threshold. A row that names no person is not an owner, and S5's exit criterion is not met by a channel alone.

## Open items this document does not decide

- **Alert destinations and named owners** — every row in §9. T8, with the owner.
- **The email alert's channel specifically** — required by ADR 0004 decision 8 before the first production release.
- **The scheduled retention and cleanup tasks** — the retention task's schedule is approved and created with the
  first deployment (S7, [`analytics-retention.md`](analytics-retention.md)); a scheduled media cleanup is not yet
  agreed.
- **Log retention** — how long the platform keeps the structured lines. That is the host's setting and an owner
  decision; until it is recorded, treat a log query as a short-window tool and `AdminAction` as the record.
- **`BETTER_AUTH_SECRET` rotation** — no path exists ([§6](#6-secret-rotation)); a planned rotation is an owner
  decision and a deployment-milestone task.
- **Re-enabling a `DISABLED` account** — no command exists; recovering a disabled administrator is out of scope, so
  disabling one is irreversible today ([§7](#7-administrator-lockout)).
