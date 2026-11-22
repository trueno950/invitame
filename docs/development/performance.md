# Performance checks

This document describes the repeatable latency check for the two critical public reads (Milestone 10, task T7;
spec S1 «checks de rendimiento»). It is current behavior: the script exists, it has been run locally, and its
budget comes from that measurement. **Nothing has been measured in a deployed environment yet**, so the budget
stays provisional until the first measurement against a preview deployment replaces it.

## What it measures

`scripts/check-performance.mjs` sends a fixed, small number of sequential requests to an already running web and
API and reports p50, p95, and max latency per target:

| Target | Route | What the number covers |
| --- | --- | --- |
| `web` | `GET /i/<slug>` | The whole guest page: the Next.js server render, its API call, and the HTML transfer. |
| `api` | `GET /public/invitations/<slug>` | The public read alone: validation, the PostgreSQL read, the projection, and the JSON transfer. |

Measuring both targets separates a slow page from a slow read: a page that grows while the API read stays flat
points at rendering or an extra request, and both growing at once points at the database or the deployment.

The run is deliberately bounded and sequential — 30 warm requests and 50 measured requests per target by default,
one request at a time. It is a regression signal, not a load test (see "What it does not cover"). Warm-up removes
the first-request cost (a cold route, a connection pool that is still filling), so the measured samples describe
the steady state a guest reaches after the site is warm.

The script starts nothing and writes no file. It needs no dependency: `node scripts/check-performance.mjs` runs on
the Node.js the repository already requires.

## The budget, and where it came from

The check fails (exit code 1) when a target's measured p95 is over its budget. The default budgets are:

| Target | Declared p95 budget | Observed local p95 | Headroom |
| --- | --- | --- | --- |
| `web` | 250 ms | 14.9–23.4 ms over six runs | ≈ 10× |
| `api` | 100 ms | 6.1–16.9 ms over six runs | ≈ 6× |

Those numbers were measured, not assumed. The record:

- Date and machine: 2026-11-21, a macOS 26.6.2 arm64 laptop, Node.js 24.18.0, local Docker PostgreSQL 17.
- Deployment shape: the API built with `tsc` and started from `dist`, the web built with `next build` and served
  by `next start` — production builds of both, on loopback, with no network between them.
- Data: a disposable database (`invitame_perf_t7`, created for the measurement and dropped afterwards) with the
  seeded catalog and one `PUBLISHED` invitation on the `xv-arch-01` renderer, slug `perf-t7-invitacion`.
- Commands: `node scripts/check-performance.mjs --slug perf-t7-invitacion`, six times, in the same warm process.

Observed results of the six runs (p50 / p95 / max, in milliseconds):

| Run | web | api |
| --- | --- | --- |
| 1 | 13 / 23.4 / 29.4 | 6.2 / 7.4 / 19.3 |
| 2 | 12.2 / 17.8 / 28.9 | 5.7 / 7.3 / 7.9 |
| 3 | 12.1 / 22.3 / 29.0 | 7.6 / 13.1 / 99.0 |
| 4 | 14.9 / 19.6 / 39.8 | 6.0 / 8.3 / 14.3 |
| 5 | 16.4 / 19.6 / 25.3 | 6.7 / 16.9 / 18.9 |
| 6 | 12.5 / 14.9 / 15.3 | 5.7 / 6.1 / 6.5 |

Read the table honestly: the budget is about ten times the local p95, so this check catches an order-of-magnitude
regression — an N+1 query, a blocking provider call, a page that starts fetching twice — and it deliberately does
not catch a 20% change, which on this hardware is indistinguishable from noise. The single 99 ms API sample in run
3 is the same point: a laptop is not a benchmark rig, and the API p95 moved from 7.3 ms to 16.9 ms between runs
without any change to the code.

**The budget is provisional.** It describes a laptop. A deployed preview adds real network latency, TLS, a
platform edge, a shared CPU, and a managed database over a network, so the first measurement against a preview
must replace these numbers, and the declared defaults with them. Until that measurement exists, treat a failure
as a question to investigate and a pass as weak evidence.

## How to run it

The check needs a running web and API and one published invitation in the database they use. Locally, that is the
documented development setup (see [`README.md`](../../README.md)):

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Create or publish one invitation in that database, then run the check against its slug:

```bash
node scripts/check-performance.mjs --slug <slug>
```

Print the plan without sending a request — this is how the check can run in a job that has no server:

```bash
node scripts/check-performance.mjs --dry-run
```

A production build of both apps is closer to what a guest gets than `pnpm dev`, so measure a preview deployment,
or a local `pnpm build` with `pnpm --filter @invitame/api start` and `pnpm --filter @invitame/web start`, when the
numbers matter.

Options and environment variables (a flag wins over its variable, which wins over the default):

| Option | Environment variable | Default |
| --- | --- | --- |
| `--slug` | `PERF_SLUG` | none; required except with `--dry-run` |
| `--web-url` | `PERF_WEB_URL` | `http://localhost:3000` |
| `--api-url` | `PERF_API_URL` | `http://localhost:3001` |
| `--warm` | `PERF_WARM_REQUESTS` | `30` |
| `--measured` | `PERF_MEASURED_REQUESTS` | `50` |
| `--timeout-ms` | `PERF_TIMEOUT_MS` | `10000` |
| `--web-p95-budget-ms` | `PERF_WEB_P95_BUDGET_MS` | `250` |
| `--api-p95-budget-ms` | `PERF_API_P95_BUDGET_MS` | `100` |

Both origins must be bare `http` or `https` origins with no path, and the request count is capped at 1000 per
target, so a typo cannot turn the check into a load test.

Exit codes: `0` every target is within budget (or `--dry-run` and `--help`), `1` a budget was exceeded or a
request failed, `2` a usage error. The last line is always one JSON object, for a job log or a report:

```json
{"check":"performance","ok":true,"slug":"perf-t7-invitacion","results":[{"name":"web","requests":50,"warmupRequests":30,"p50Ms":13,"p95Ms":23.4,"maxMs":29.4,"p95BudgetMs":250,"withinBudget":true}]}
```

A non-2xx answer fails the run instead of producing a fast sample, because a wrong slug or a 500 render would
otherwise read as good news. Each target is reported before the verdict, so the log says which one was over
budget.

### Side effect: it counts invitation openings

The public read counts one opening of the invitation link per served page, and the guest page reaches that read
through the API. One default run therefore counts about 160 openings (80 page requests, each counted once through
its API call, plus 80 direct API reads). They accumulate in one row per calendar day and source — the counter is
an upsert, so a run increments a number instead of inserting rows — and the observed delta for one default run was
exactly 160. That is the feature working, not a defect of the check, but it means: point the check at a
disposable database or a preview deployment. Never run it against production data, because it would inflate the
published openings figure.

## Why it is not a step in the push CI (yet)

The check is not wired into `.github/workflows/ci.yml`. That is deliberate, and the reason is what the check
needs: a running web, a running API, a migrated database, and one published invitation. A job on every push would
have to boot all of that, and then measure latency on a shared runner whose CPU, disk, and network are shared with
other jobs. The number such a job produces is noisy in exactly the range this check is meant to watch, so it would
be either a flaky required check or a budget so loose it no longer says anything.

A deployed preview is a better place for it: the apps and the database are already running, the network is real,
and the measurement describes the thing a guest uses. The exact job step to paste into the workflow when the
parent decides to wire it:

```yaml
  performance:
    name: Performance check
    runs-on: ubuntu-latest
    needs: [quality-gates]
    if: github.event_name == 'pull_request'
    env:
      PERF_WEB_URL: ${{ vars.PERF_WEB_URL }}
      PERF_API_URL: ${{ vars.PERF_API_URL }}
      PERF_SLUG: ${{ vars.PERF_SLUG }}
      PERF_WEB_P95_BUDGET_MS: "250"
      PERF_API_P95_BUDGET_MS: "100"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - run: node scripts/check-performance.mjs
```

Notes for that step: it needs no `pnpm install`, because the script has no dependency; the three values are
repository variables, so the preview's origin and the slug of a published invitation there are configuration
rather than code; and it runs only on pull requests, where a preview exists. Add it to branch protection only
after a preview measurement has replaced the provisional budgets — a required check with an unmeasured budget
blocks merges for the wrong reason.

## What it does not cover

- **Load, concurrency, or capacity.** Requests are sequential by design, so the check says nothing about how many
  guests the deployment serves at once, about connection-pool limits, or about behavior under a burst.
- **Real network conditions.** A local run is loopback; a preview run includes the network but not a guest's
  mobile connection, a slow 3G tail, or a distant region.
- **Media serving.** Invitation photos are served by the media route and, in production, from object storage. The
  check reads a text page whose images the browser fetches separately, so image bytes, cache headers, and the
  storage provider are not measured.
- **Admin pages, sign-in, owner flows, and writes.** The check reads the public page and its public API read. Admin
  lists, the invitation editor, RSVP submission, payments, guest personal links, and the calendar file are out of
  scope.
- **Cold starts and deploys.** Warm-up hides them on purpose. A platform cold start or a deploy that reconnects
  the database is not visible here.
- **Front-end rendering cost in the browser.** The number is server time plus transfer; a guest's phone still
  parses, lays out, and paints the page, and JavaScript work is not measured.
- **Third-party providers.** Music metadata lookups, place search, email, and payments are not in the measured
  path.

## Honest status

- Measured: the two public reads, locally, on the machine and date above, with production builds.
- Not measured: production, any preview deployment, any other region, any concurrent load.
- Consequence: the declared budget is provisional, and the first preview measurement replaces it. When it does,
  update this document and the two default constants at the top of `scripts/check-performance.mjs` in the same
  change, and cite the observed numbers here.
