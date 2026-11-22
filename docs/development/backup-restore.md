# Backup, verification, restore, and release rollback

Status: the backup, verification, restore, and release-rollback plan for the first release (Milestone 10, T5; S3, S5).
The owner chose «Solo Railway»: «Los respaldos que ofrece Railway según el plan; menos piezas, pero dependes de él para
restaurar.» (`odd/tasks/m10-release.md`, S3). The repository therefore adds **no backup script**: `package.json` has no
backup command, and nothing in `scripts/` or in either app takes, schedules, or performs a restore — the only
maintenance commands are `pnpm media:cleanup`, `pnpm analytics:retention`, and `pnpm db:migrate`. Nothing here is a
platform fact the repository can prove — there is no Railway project, no Postgres service, and no media bucket today —
so every Railway claim below is marked **verified in the repository** or **confirm at project creation (T8)**. Nothing
in this document was executed: the drill is the procedure T8 runs once the project exists.

## What Railway's Postgres backups provide

| Claim | Evidence | Status |
| --- | --- | --- |
| Railway hosts the API, the web, and PostgreSQL as three services of one project | ADR 0004 decision 4 (`docs/adr/0004-authentication-with-better-auth.md:105-110`) | verified in the repository (design decision) |
| The plan is the thing that decides which backups exist, their schedule, and their retention | S3 «según el plan»; no schedule, window, or retention number appears anywhere in the repository | **confirm at project creation (T8)**: the exact numbers are the owner's to read off the plan |
| The plan recorded for production is Pro, with Hobby for development | ADR 0004 (`docs/adr/0004-authentication-with-better-auth.md:108-110`) | verified in the repository; the plan actually bought is an open owner decision (`deployment.md`, "Owner decisions still open") |
| Railway keeps backups of its Postgres service, and they are visible in the dashboard for that service | none | **confirm at project creation (T8)**: the section's name, whether it lists the backups, and whether they can be downloaded |
| An on-demand backup can be taken before a risky migration | none | **confirm at project creation (T8)** |
| A restore is started from Railway and targets one service's database | none | **confirm at project creation (T8)**: whether the target can be a scratch service instead of the live one, which is what the drill needs |

The procedure that follows is deliberately written so it does not depend on any of the unconfirmed details:

1. **Read the plan's numbers first.** Before the first release, record the schedule, the retention, and how long a
   backup takes to become available in the release record. A backup that is still being written is not a backup: an
   on-demand backup taken *after* a migration cannot undo it, so it is taken before.
2. **Take an on-demand backup before anything that drops or rewrites data** — a non-additive migration, a manual `psql`
   repair, a restore, or a release whose migration was not reviewed as additive. Write its identifier and the instant
   it was taken into the release record, because that instant is the only undo point there is.
3. **Never let a backup be the only copy of a decision.** Everything that is *not* in the database (below) needs its
   own protection, and the backup does not carry it.

## What a Postgres backup does not cover

A backup of the Postgres service contains the database: every table in `apps/api/prisma/schema.prisma` and nothing
else. What lives outside it:

| Data | Where it actually lives | In the backup | Its own protection |
| --- | --- | --- | --- |
| Media objects: the WebP main photo and gallery files | the S3-compatible bucket selected by `MEDIA_S3_*`; the `MediaAsset` row names the object with `storageKey` and never holds the binary (`apps/api/prisma/schema.prisma:461-467`, [`media-storage.md`](media-storage.md)) | **no** | the bucket's own protection — provider-side versioning and, if the plan allows it, a lifecycle rule. Provider, cost, and whether versioning is enabled are owner decisions at T8 |
| Railway service variables and secrets (`DATABASE_URL`, the auth secrets, `RESEND_API_KEY`, the media credentials) | Railway's variable store, per service (`deployment.md`, "Per-service variables") | **no** | the owner's own secret store. The full matrix and the ordered production list are in [`deployment.md`](deployment.md) |
| Application logs and the `email_delivery_degraded` event | the platform's log stream; no table in the schema stores a log or an audit trail of requests | **no** | Railway's own log retention — **confirm at project creation (T8)** |
| Guest personal tokens | only as `Guest.tokenHash`, the SHA-256 digest (`apps/api/prisma/schema.prisma:510-511`); the token itself is answered once and never stored | yes (the digest) | nothing else: a restore cannot leak a token that was never stored |
| Administrator audit rows | `AdminAction` in Postgres, append-only by trigger | yes | nothing: a restore is the only way a stored row ever changes |
| Counted openings | `InvitationView` in Postgres, kept ninety days | yes | a restore can bring back rows older than the window; `pnpm analytics:retention` is idempotent and deletes them again ([`analytics-retention.md`](analytics-retention.md)) |
| Email, place search, music metadata | nothing persisted beyond the columns that mirror an answer (`InvitationFeatureSettings.playlistTitle`, `playlistCoverUrl`) | n/a | nothing to protect |

`pnpm media:cleanup` is **not** a backup. It deletes: the objects of rows marked `deleted`, the objects under
`invitations/` that no row names (after a one-hour grace period), and then the rows whose object is gone
([`media-storage.md`](media-storage.md)). Run against a bucket whose rows were restored but whose objects were not, it
treats every object as an orphan and deletes it. The media bucket is protected by the provider, never by this command.

## The restore drill

The drill proves one backup is usable, without touching production. It restores the dump into a **scratch** database
that is not the production Postgres, and runs the repository's own checks against it. Run it after the first release,
after any change to the migration set, and before each release whose migration was not reviewed as additive.

### Target: the local PostgreSQL 17 container

The repository's own `docker-compose.yml` runs `postgres:17-alpine` on `127.0.0.1:5442`, and that is the only target
where every check below can run today: `pnpm --filter @invitame/api test:db` refuses any host that is not
`localhost`, `127.0.0.1`, or `[::1]` (`apps/api/test/database.ts:12-21`). A scratch Railway Postgres is the other
possible target, but whether the platform can restore one backup into a service other than the live one is **confirm at
project creation (T8)**, and even then `test:db` cannot be pointed at it unless it is reached as `localhost` — confirm
that too. Until both are confirmed, the scratch Railway service is used for the SQL sanity list only, and the local
container carries the full drill.

### Step 1 — take and keep one backup

Take an on-demand backup of the Postgres service in Railway (**confirm at project creation (T8)**: that the action
exists, where it is, and where the backups are listed) and record its identifier, the instant it was taken, and the
plan's schedule and retention next to it. Download the dump, or keep it where the drill can read it.

### Step 2 — a fresh scratch database, never the existing one

```text
pnpm db:up
docker compose exec -T postgres createdb -U invitame invitame_restore
```

`pnpm db:up` is the root script, `docker compose up -d --wait postgres`, and it uses the same PostgreSQL 17 container
development uses. `createdb`, `psql`, and `pg_restore` are that image's own client tools — the compose healthcheck
already runs `pg_isready` from the same directory (`docker-compose.yml:16`). `invitame_restore` is a **different
database** from the `invitame` database of that container and from production; use a new name for each drill rather
than deleting an older one. `createdb` failing because the name exists is the intended answer: pick the next name.

### Step 3 — restore the dump into it

The dump's format decides the command, and only these two spellings are needed:

```text
docker compose exec -T postgres psql -U invitame -d invitame_restore -v ON_ERROR_STOP=1 -f - < backup.sql
docker compose exec -T postgres pg_restore -U invitame -d invitame_restore --no-owner --no-privileges --exit-on-error < backup.dump
```

The first reads a plain-SQL dump, the second a custom-format or tar archive. `ON_ERROR_STOP=1` and `--exit-on-error`
make a partially applied restore exit non-zero instead of leaving a database that looks restored. A non-zero exit is a
**failed drill**, not a warning: report it and stop.

### Step 4 — the migration set must already be complete

```text
RESTORE_DATABASE_URL="postgresql://invitame:invitame_local_only@localhost:5442/invitame_restore?schema=public"
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @invitame/api prisma:migrate:deploy
```

Prefix the variable in front of the command rather than exporting it for the session, so nothing falls back to a local
`.env` file. The Prisma CLI prints how many migration directories it found in `apps/api/prisma/migrations` and then one
of two things (Prisma 6.19.3, verified in the installed CLI):

| Output | Meaning | Drill result |
| --- | --- | --- |
| `No pending migrations to apply.` | the restore already carries every committed migration | **pass** |
| `The following migration(s) have been applied:` and a list, then `All migrations have been successfully applied.` | the backup predates a committed migration; the command applied it | **fail the criterion**: the backup is older than the code, so it does not prove the current schema. Record which migrations ran and repeat the drill on a newer backup |

Both cases exit 0, so read the output. A non-zero exit is a failed drill too: the command itself refused, for example
because the restored `_prisma_migrations` table records a failed migration — the restore then carries a broken
migration history, and nothing may be applied on top of it. `--exit-on-error` in step 3 and this text check are the two
places the drill reads output rather than an exit code; everything else is an exit code.

### Step 5 — the repository's database suites against the restore

```text
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @invitame/api test:db
```

The suites are `apps/api/src/**/*.db-spec.ts`; they write and delete their own rows, which is safe in a scratch copy and
is exactly what proves the restored schema accepts the current code. Exit code 0 is the pass. This is the check that a
`schema.prisma` change without a committed migration would fail, so a failure here is investigated before it is called
a flake.

### Step 6 — the SQL sanity list

```text
docker compose exec -T postgres psql -U invitame -d invitame_restore
```

Then, with the table and column names as `apps/api/prisma/schema.prisma` declares them (quoted camelCase identifiers,
the enum type names PostgreSQL holds):

```sql
SELECT status, count(*) FROM "Invitation" GROUP BY status ORDER BY status;
SELECT status, count(*) FROM "Payment" GROUP BY status ORDER BY status;
SELECT max("receivedAt") FROM "PaymentEvent";
SELECT count(*) FROM "AdminAction";
SELECT max("day") FROM "InvitationView";
```

What each answers, and what it must match:

| Query | Proves | Compared against |
| --- | --- | --- |
| `"Invitation"` by `status` (`DRAFT`, `ARCHIVED`, `PUBLISHED`) | the invitation truth survived: drafts, published, archived | the administrator's invitation list filtered by each status before the backup |
| `"Payment"` by `status` (`pending`, `paid`, `failed`, `expired`, `refunded`) | the payment truth survived, and no `paid` row was lost. On the free first release (`PAYMENTS_MODE=free`, S2) it can legitimately be empty: every count is zero and nothing is lost there yet | the administrator's payments view before the backup |
| `max("PaymentEvent"."receivedAt")` | the provider-event intake reached the instant it had reached; a missing recent event is the RPO loss made visible | the instant the last event was recorded |
| `count(*)` of `"AdminAction"` | the append-only audit is complete and was never trimmed | the administrator's audit view before the backup |
| `max("InvitationView"."day")` | the analytics counters reached their latest day; rows older than ninety days may reappear and are the retention command's business | the last day the analytics window showed a count for |

A mismatch is a finding about *that* backup, not proof that backups fail: record the numbers, the backup's identifier,
and the delta, and say which of the five disagreed. A `paid` payment that is missing from the restore is the one
mismatch that blocks a release.

### Step 7 — record the drill

Write into the release record: the date, the backup identifier and instant, the target (local container or scratch
Railway service), the wall-clock duration from starting the restore to the fifth query answering, the five results, and
the pass or fail of steps 4 and 5. That duration is the only real RTO evidence the project ever has.

## What a restore overwrites, and how not to restore production by mistake

A restore replaces the **whole target database** with the backup's state. Every table is overwritten, so everything
written after the backup instant is gone: invitations created, published, or archived; `Payment` transitions and the
`PaymentEvent` rows that recorded them; RSVP answers; guest check-ins; `InvitationView` counters; `AdminAction` rows.
Files in the media bucket are untouched, because they were never in the database.

Two consequences worth stating outright:

- **A restore moves the product back in time, including its sessions.** `Session` rows are the session store
  (`apps/api/prisma/schema.prisma:122-139`), and ending a session deletes its row
  (`apps/api/src/auth/inactive-session.prisma.db-spec.ts:121`), so a session created after the backup stops working and
  a session that ended after the backup is accepted again until it expires. A production restore is therefore also a
  security action: tell the administrator and end the affected sessions deliberately.
- **A restore cannot be undone** except by another backup. That is why an on-demand backup is taken *before* one.

Rules that keep a restore away from production:

1. Restore into a database name that is not the production database's, on a server that is not the production
   Postgres. The drill's default is the local container's `invitame_restore`.
2. Never put the production `DATABASE_URL` in a shell variable that a restore command could read. The drill uses
   `RESTORE_DATABASE_URL` and passes it as `DATABASE_URL=` in front of the two commands that need it.
3. Railway's restore is started from a service in the project (**confirm at project creation (T8)** that this is how
   it works, that the service on screen is the target, and whether a scratch service can be one). When in doubt,
   restore into a new service and copy nothing back.
4. Before any production restore, take a fresh on-demand backup and record it. A restore that goes wrong is recovered
   from that backup, not from the dump being restored.
5. The suites are the second guard: `test:db` refuses a host that is not local anyway
   (`apps/api/test/database.ts:12-21`), so a drill can never write to Railway by accident through them. It also means
   a green `test:db` result is always a statement about a local database — never about production.

## RPO and RTO

Neither is guaranteed today, and this document does not invent numbers for them.

| Measure | Value | Evidence |
| --- | --- | --- |
| **RPO** (how much data a restore can lose) | **whatever the plan's schedule gives**: one backup interval plus the delay before anyone notices the loss | the owner decision S3 and ADR 0004's plan; the interval is **confirm at project creation (T8)** |
| **RTO** (how long recovery takes) | **time to restore a Railway backup into the service**: the restore itself, plus the redeploy or cutover that points the API at the restored database | the drill's measured duration (step 7) is the only real evidence; there is none yet |

Both are estimates until the drill runs in T8. Until then the honest statements are: a loss of up to one backup
interval is possible, and no one has measured how long a restore takes. Whatever the interval turns out to be, the
narrowest window in the data is the payment and RSVP truth written in it, because nothing reconstructs those from
anywhere else.

## Release rollback

A release is rolled back by deploying the previous successful build again. Migrations are forward-only, so the rollback
moves the code, not the schema — and the release is only rollback-safe if the migration it shipped was additive.

### The procedure

1. **Stop the bleeding by redeploying the previous successful build.** Railway keeps the deployment history and can
   roll back to an earlier one (**confirm at project creation (T8)**: the exact action and whether it re-runs the
   pre-deploy command; `deployment-services.md` records the pre-deploy command as
   `pnpm --filter @invitame/api prisma:migrate:deploy`). Redeploying an older build applies no older migration: the
   pre-deploy command only ever moves forward.
2. **Keep migrations forward-only and never edit an applied migration.** The rule is in `AGENTS.md` ("Never edit an
   applied migration to hide a new schema change") and restated per table in
   [`../database/model.md`](../database/model.md) ("Never edit the applied migration file"). An applied migration is
   history: editing it changes the file without changing any database that already ran it, so the next environment
   diverges silently.
3. **Expect the old code to meet the new schema.** After step 1 the previous build runs against the migrated database.
   That is survivable exactly when the migration was additive — a new nullable column, a new table, a new index, or a
   new enum value — because the old code simply does not read it. A new enum value needs its own migration file for
   the same reason: PostgreSQL cannot use a value appended in the same transaction
   ([`../database/model.md`](../database/model.md), the `AdminActionType` note).
4. **When a release needs a schema fix, ship a new additive migration** in a new release. Repair is forwards: a
   corrected column, a backfill, or a new table arrives as another migration and another deploy.
5. **When a non-additive migration has reached production — dropped columns, rewritten values, narrowed types — the
   recovery path is the backup, not a down-migration.** There is no down-migration in this repository to run, and
   writing one would rewrite history. That path loses everything after the backup instant, which is why such a
   migration needs a human decision, an on-demand backup taken immediately before it, and a restore drilled
   beforehand (`AGENTS.md`, destructive migrations).
6. **Review every release's migration as additive or not before it deploys.** Read the SQL in
   `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` and look for `DROP`, `ALTER COLUMN ... TYPE`, a
   `NOT NULL` added to an existing column, or an `UPDATE`/backfill. One of those makes the release non-additive; the
   backup in rule 5 is then a precondition of the deploy, not a precaution.
7. **A rollback must not touch the media bucket.** Neither a code rollback nor a database restore creates, copies, or
   deletes an object. A restored database can name objects the bucket no longer holds, because cleanup ran after the
   backup, and nothing in the repository re-creates them: `pnpm media:cleanup -- --dry-run` reports the counts it would
   act on (`deletedObjects`, `deletedRows`, `orphanObjects`, `skippedRecentObjects`, `failedObjects`) without deleting
   anything (`apps/api/src/media/application/media.use-cases.ts:508-583`), and the objects' own protection is the
   bucket's versioning, decided at T8.

### What must survive any rollback

| Invariant | What it means for a rollback | Source |
| --- | --- | --- |
| A `Payment` keeps its price snapshot and is never re-read | `amountMinor` and `currency` are the package's price at checkout, never a live read of the catalog, so retiring a price or publishing another leaves every stored payment untouched. A rollback must not rewrite them or recompute them from `PackagePrice` | `apps/api/prisma/schema.prisma:524-526`; [`../database/model.md`](../database/model.md) ("the snapshot of the package's price at checkout, not a live read of the catalog") |
| A paid invitation's gate stays satisfied | publication is granted from a verified backend state — a `paid` `Payment` for this invitation and its current package — so no rollback may delete, rewrite, or re-derive those rows. A rollback that removes the payment state altogether must also restore `PAYMENTS_MODE=free` or stop publishing | `apps/api/src/payments/infrastructure/payment-gate.ts:26-45`; [`payments.md`](payments.md) (refunds and the gate); [`../database/model.md`](../database/model.md), the `add_payments` recovery note |
| `Invitation.firstPublishedAt` is never cleared | it is the history the refund rule «Sin reembolso tras publicar» reads, and unlike `publishedAt` nothing clears it. A restore may take it back to the backup's value; no code and no repair may `SET "firstPublishedAt" = NULL` | `apps/api/prisma/schema.prisma:332-336`; [`../database/model.md`](../database/model.md); [`payments.md`](payments.md) |
| `AdminAction` is append-only and is never deleted by hand | the `AdminAction_append_only` trigger refuses every `UPDATE` and `DELETE`, so a stored row is final and a mistake is answered with a new row. The only way an audit row changes is a restore | `apps/api/prisma/schema.prisma:611-616`; [`../database/model.md`](../database/model.md) ("The audit is append-only") |
| `InvitationView` rows are never deleted by hand | the one deletion is `pnpm analytics:retention` for rows older than ninety days, which is idempotent and prints counts only. A rollback never touches the counters; a restore may bring expired days back and the retention command removes them | [`analytics-retention.md`](analytics-retention.md); [`../database/model.md`](../database/model.md), the `InvitationView` invariants |
| Media objects live outside Postgres | the row names the object; the binary is in the bucket. No rollback, restore, or repair moves binaries into rows or re-creates them from a dump | `apps/api/prisma/schema.prisma:461-467`; [`media-storage.md`](media-storage.md); [`anti-patterns.md`](anti-patterns.md) entry 11 |

## Who does what

| Owner, in Railway | The repository provides | Never by hand in production |
| --- | --- | --- |
| Create the project, the `api` and `web` services, and the Postgres service; buy the plan | `railway.api.json` and `railway.web.json`, with the build, pre-deploy, start, health, and restart settings ([`deployment-services.md`](deployment-services.md)) | Editing an applied migration file (`apps/api/prisma/migrations/`) |
| Read the backup schedule and retention off the plan and record them; take an on-demand backup before a risky migration | The migration set, reviewed for additivity before each release | Any `UPDATE` or `DELETE` against `Payment`, `PaymentEvent`, `AdminAction`, `InvitationView`, `Invitation`, `Guest`, or `RsvpResponse` |
| Start the restore, and the redeploy that points the API at a restored database | The drill: `prisma:migrate:deploy`, `test:db`, and the five-query sanity list | Restoring over the production Postgres without a fresh backup immediately before it |
| Redeploy the previous successful build when a release is rolled back | `pnpm media:cleanup -- --dry-run` and `pnpm analytics:retention -- --dry-run` to inspect a maintenance command before it applies | Dropping tables or enum types to "undo" a migration (`../database/model.md` documents the escape hatch; it needs a human decision and a backup) |
| Keep the production secrets in their own store, and the media bucket's own protection switched on | The configuration matrix, the ordered secret production, and the per-service variable split ([`deployment.md`](deployment.md)) | Putting media binaries, or a dump containing them, into a Postgres row |
| Confirm at project creation (T8) that a scratch service can be a restore target | The local PostgreSQL 17 target that today runs the whole drill | Treating a green `test:db` or a green drill as a statement about production |

## Open questions for project creation (T8)

1. **Backup schedule and retention.** Which the plan gives, and whether the release's loss window is acceptable for
   `Payment` and `RsvpResponse` truth. The numbers come from the plan, not from this repository.
2. **Where backups appear and what an on-demand backup is called.** The dashboard section, the dump format, and
   whether it can be downloaded.
3. **Whether a restore can target a scratch service.** If it cannot, the drill stays local and the SQL sanity list is
   the only check that ever runs against a restored Railway database.
4. **Whether a scratch Railway database can be reached as `localhost`**, which is what `test:db` requires; the
   alternative is that step 5 of the drill only ever runs locally.
5. **Whether deployment rollback re-runs the pre-deploy command.** Either answer is safe — no older migration is ever
   applied, because `prisma migrate deploy` only moves forward — but the release record should say which one happens.
6. **Media bucket protection.** Versioning, lifecycle, and whether the provider can restore a single object; the
   repository has no command for it and `pnpm media:cleanup` deletes rather than protects.
7. **Log retention.** How long the platform keeps an application log, since the database backup keeps none.

## Related documents

- [`deployment.md`](deployment.md) — the production configuration matrix, the per-service variables, and the secrets.
- [`deployment-services.md`](deployment-services.md) — the two service descriptors and the exact deploy commands.
- [`media-storage.md`](media-storage.md) — the media adapters, the bucket settings, and the cleanup command.
- [`analytics-retention.md`](analytics-retention.md) — the ninety-day retention command and its pending schedule.
- [`payments.md`](payments.md) — the payment modes, the publication gate, and the refund rule.
- [`../database/model.md`](../database/model.md) — the migration invariants, including each table's recovery note.
- [`quality-gates.md`](quality-gates.md) — `test:db` and the rest of the commands a change must pass.
