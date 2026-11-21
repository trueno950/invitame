# Analytics and view retention

This document is the operational companion of the administrator's analytics (Milestone 9 T11; S2, S3, S7, L12). The
rules live in `apps/api/src/invitations/domain/analytics-window.ts`, the use cases in
`apps/api/src/invitations/application/` (`admin-analytics.use-cases.ts`, `invitation-views.ts`,
`invitation-view-retention.ts`), and the SQL in `apps/api/src/invitations/infrastructure/prisma-admin-analytics.repository.ts`
and `prisma-invitation-view.repository.ts`. The data model is described in
[`../database/model.md`](../database/model.md).

## What is counted, and what is not

- A view is **each opening of the link** (L12): every served public invitation, reloads and the owner's own visit
  included, reported as «aperturas» and never as «personas».
- The plain public page counts `PUBLIC`; a guest's personal link counts `GUEST`. They are stored separately and shown
  together and separately.
- A view is counted only after the invitation resolved **and** its renderer exists, so a 404, a draft, an archived
  invitation, or an invitation this deployment cannot render counts nothing.
- An RSVP submission is not an opening, and the owner's own preview (the owner-scoped read) is not counted: only the
  two public reads count, because they are the only place a guest is served the page.
- The count is fire-and-forget: the response never waits for the write, and a failure is one structured line
  `{ "event": "invitation_view_count_failed" }` with no slug, no id, and nothing about the visitor. The guest's page is
  identical whether the counter is healthy or not.
- Nothing about the visitor is stored — no IP address, user agent, referrer, cookie, session, or token — and no
  endpoint answers one. A count cannot be traced back to a person.
- The day is cut in `America/Mexico_City`, by PostgreSQL (`at AT TIME ZONE 'America/Mexico_City'`), never by the API
  process's own zone.

## The reads

Both routes are `@AdminOnly()` and read-only. The window is the last thirty days ending today in `America/Mexico_City`
when the request names no bound, may not be reversed, and may hold at most ninety days; a day that is not a real
calendar day is a validation 400, and a reversed or over-wide window is 400 `INVALID_ANALYTICS_WINDOW`. Every day of
the window is answered once, ascending, `YYYY-MM-DD`, with zeros where nothing was counted.

- `GET /admin/analytics/views?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ days: [{ day, public, guest }], topInvitations:
  [{ invitationId, slug, public, guest }] }`, the top list at most twenty invitations ordered by total openings
  descending and then by slug.
- `GET /admin/analytics/funnel?from&to` → `{ days: [{ day, draftsCreated, checkoutsStarted, paymentsApproved,
  firstPublications }] }`.
- `GET /admin/invitations/:invitationId` adds `views: { public, guest }` (the retained window) and `rsvpTotals:
  { attendingPeople, declined, responses }`.

The funnel needs no table: drafts created are `Invitation.createdAt`, checkouts started `Payment.createdAt`, approved
payments `Payment.paidAt` where the status is `paid`, and first publications `Invitation.firstPublishedAt`.

## The retention command

```text
pnpm analytics:retention                # deletes and reports the count
pnpm analytics:retention -- --dry-run  # reports what it would delete
pnpm --filter @invitame/api analytics:retention --dry-run
```

A pnpm script forwards an argument after a standalone `--`; the command drops that separator before it reads its flags.

It deletes the `InvitationView` rows whose `day` is older than ninety days before today in `America/Mexico_City` and
prints one line of counts only — never an invitation, a slug, or an owner. The cutoff is the last kept day, so a row of
exactly ninety days stays and a row of ninety-one days goes. It is idempotent: a second run on the same day deletes
nothing. Exit code 0 means the run finished; 1 means it failed — an unknown argument, a missing or unreachable
`DATABASE_URL`, or a refused statement — and nothing is reported as done.

`--dry-run` calls the count instead of the delete, so it cannot remove anything even if the cutoff is wrong. Run it
before the first scheduled run and whenever the window changes.

It needs only `DATABASE_URL` and `NODE_ENV`: no auth, web, media, or payment secret. It is the whole operation, so it is
safe to run at any time; `InvitationView` is written only by the two public reads, which never read it back.

## Railway schedule (pending owner approval)

S7 chose «Comando + tarea programada en Railway». The command exists; the production schedule is a change the owner
approves separately. When approved, the deployment adds a scheduled task (Railway's cron service) that runs:

```text
pnpm analytics:retention
```

daily, once per day, with the API's own `DATABASE_URL` in its environment and Node 22 present. Whatever the schedule,
the run is idempotent, so a duplicated or retried execution deletes nothing a first one did not. Confirm the first run
from the task's output: `{"event":"analytics_retention","mode":"apply","deletedViews":N}`. No API restart is needed,
and the web page needs no change.

Until that task exists, run the command by hand (or from a one-off Railway shell) when the table's oldest day is
older than ninety days; nothing in the product depends on the deletion having happened, because every read is bounded
to a window and sums only the days it asks for.
