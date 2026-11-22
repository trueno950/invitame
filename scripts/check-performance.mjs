#!/usr/bin/env node
/**
 * Repeatable latency check for the two critical public reads (M10 T7; S1).
 *
 * It starts nothing: it only issues a bounded, fixed number of requests to an already running deployment and
 * reports p50/p95/max latency per target. The two targets are the guest's page (`GET /i/<slug>` on the web) and
 * the public API read that page calls (`GET /public/invitations/<slug>` on the API), so a slow page can be
 * attributed to the web render, to the API read, or to both.
 *
 * Requests run one at a time, after a warm-up, so the numbers are a stable regression signal instead of a load
 * test. The check exits non-zero when a target's measured p95 is over its budget. The default budgets and the
 * local measurement they came from are documented in `docs/development/performance.md`; every value can be
 * overridden from the environment or with a flag, because a deployed preview is not a laptop.
 *
 * Usage:
 *   node scripts/check-performance.mjs --slug <slug> --web-url https://preview.example --api-url https://api.example
 *   node scripts/check-performance.mjs --dry-run
 *
 * Environment (a flag of the same name wins): PERF_WEB_URL, PERF_API_URL, PERF_SLUG, PERF_WARM_REQUESTS,
 * PERF_MEASURED_REQUESTS, PERF_TIMEOUT_MS, PERF_WEB_P95_BUDGET_MS, PERF_API_P95_BUDGET_MS.
 *
 * Exit codes: 0 all targets inside budget (or `--dry-run`), 1 a budget was exceeded or a request failed,
 * 2 a usage error. The last line is always one JSON object: `{"check":"performance",...}`.
 *
 * It writes no files and starts no server. The public API read counts one invitation opening per served page, so
 * each run adds view rows to the database serving that slug: point it at a disposable database or a preview
 * deployment, never at production data.
 */
import process from "node:process";

const DEFAULT_WEB_URL = "http://localhost:3000";
const DEFAULT_API_URL = "http://localhost:3001";
/** The documented local run: 30 warm requests, then 50 measured ones per target. */
const DEFAULT_WARM_REQUESTS = 30;
const DEFAULT_MEASURED_REQUESTS = 50;
/** A request slower than this is a failure, not a slow sample; it keeps a hung target from stalling the check. */
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * Budgets taken from the local measurement recorded in `docs/development/performance.md` with headroom over the
 * observed p95: 14.9-23.4ms for the page and 6.1-16.9ms for the API read over six runs. They are deliberately
 * loose, because the observation is local and a preview deployment adds the network, so the check catches an
 * order-of-magnitude regression (an N+1 read, a blocking provider call) instead of a few milliseconds of noise.
 * The page is the slower target because it renders the invitation and calls the API read below.
 */
const DEFAULT_WEB_P95_BUDGET_MS = 250;
const DEFAULT_API_P95_BUDGET_MS = 100;
/** A bound on the request count, so a typo can never turn this into an accidental load test. */
const MAX_REQUESTS = 1_000;

const USAGE = `Usage: node scripts/check-performance.mjs --slug <slug> [options]

  --slug <slug>                 Published invitation slug to read (or PERF_SLUG); required unless --dry-run.
  --web-url <origin>            Web origin (default ${DEFAULT_WEB_URL}, or PERF_WEB_URL).
  --api-url <origin>            API origin (default ${DEFAULT_API_URL}, or PERF_API_URL).
  --warm <count>                Warm-up requests per target (default ${DEFAULT_WARM_REQUESTS}, or PERF_WARM_REQUESTS).
  --measured <count>            Measured requests per target (default ${DEFAULT_MEASURED_REQUESTS}, or PERF_MEASURED_REQUESTS).
  --timeout-ms <ms>             Per-request timeout (default ${DEFAULT_TIMEOUT_MS}, or PERF_TIMEOUT_MS).
  --web-p95-budget-ms <ms>      Web page p95 budget (default ${DEFAULT_WEB_P95_BUDGET_MS}, or PERF_WEB_P95_BUDGET_MS).
  --api-p95-budget-ms <ms>      API read p95 budget (default ${DEFAULT_API_P95_BUDGET_MS}, or PERF_API_P95_BUDGET_MS).
  --dry-run                     Print the plan and exit 0 without sending a request.
  --help                        Print this help and exit 0.`;

/** A cost that is not the server's fault: the invocation itself is wrong, so it exits 2 and never measures. */
class UsageError extends Error {}

const FLAGS = new Map([
  ["slug", "slug"],
  ["web-url", "webUrl"],
  ["api-url", "apiUrl"],
  ["warm", "warmRequests"],
  ["measured", "measuredRequests"],
  ["timeout-ms", "timeoutMs"],
  ["web-p95-budget-ms", "webP95BudgetMs"],
  ["api-p95-budget-ms", "apiP95BudgetMs"],
]);

/** The arguments in `--name value` or `--name=value` form, plus the switches; `--help` and `--dry-run` hold no value. */
function parseArguments(argv) {
  const parsed = { dryRun: false, help: false, values: new Map() };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (argument === "--help") {
      parsed.help = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new UsageError(`Unexpected argument: ${argument}`);
    }

    const separator = argument.indexOf("=");
    const rawName = separator === -1 ? argument.slice(2) : argument.slice(2, separator);
    const name = FLAGS.get(rawName);
    if (name === undefined) {
      throw new UsageError(`Unknown option: --${rawName}`);
    }

    const value = separator === -1 ? argv[index + 1] : argument.slice(separator + 1);
    if (value === undefined || value === "" || (separator === -1 && value.startsWith("--"))) {
      throw new UsageError(`Option --${rawName} needs a value.`);
    }
    if (separator === -1) {
      index += 1;
    }
    parsed.values.set(name, value);
  }

  return parsed;
}

/** A flag wins over its environment variable, which wins over the documented default. */
function resolveSetting(parsed, name, environmentName, fallback) {
  const fromFlag = parsed.values.get(name);
  if (fromFlag !== undefined) {
    return fromFlag;
  }

  const fromEnvironment = process.env[environmentName]?.trim();
  return fromEnvironment ? fromEnvironment : fallback;
}

function readInteger(label, raw, { minimum, maximum }) {
  if (!/^\d+$/.test(raw)) {
    throw new UsageError(`${label} must be a whole number, not ${JSON.stringify(raw)}.`);
  }

  const value = Number.parseInt(raw, 10);
  if (value < minimum || value > maximum) {
    throw new UsageError(`${label} must be between ${minimum} and ${maximum}, not ${value}.`);
  }

  return value;
}

/** An origin with no path, query, or fragment: the two routes below are the only path this check adds. */
function readOrigin(label, raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UsageError(`${label} must be an http or https origin, not ${JSON.stringify(raw)}.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UsageError(`${label} must be an http or https origin, not ${JSON.stringify(raw)}.`);
  }
  if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
    throw new UsageError(`${label} must be an origin without a path, query, or fragment.`);
  }

  return parsed.origin;
}

/**
 * The one slug shape the check sends: the public route answers the same 404 for anything else, so a value that
 * cannot be a slug is a usage error here instead of a misleading 50-request failure.
 */
function readSlug(raw) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) || raw.length > 60) {
    throw new UsageError(
      `--slug must be the published slug: lower-case letters, digits, and single dashes, 60 characters or fewer.`,
    );
  }

  return raw;
}

function resolveOptions(argv) {
  const parsed = parseArguments(argv);

  if (parsed.help) {
    return { help: true };
  }

  const settings = {
    dryRun: parsed.dryRun,
    webUrl: readOrigin(
      "--web-url",
      resolveSetting(parsed, "webUrl", "PERF_WEB_URL", DEFAULT_WEB_URL),
    ),
    apiUrl: readOrigin(
      "--api-url",
      resolveSetting(parsed, "apiUrl", "PERF_API_URL", DEFAULT_API_URL),
    ),
    warmRequests: readInteger(
      "--warm",
      resolveSetting(parsed, "warmRequests", "PERF_WARM_REQUESTS", `${DEFAULT_WARM_REQUESTS}`),
      { minimum: 0, maximum: MAX_REQUESTS },
    ),
    measuredRequests: readInteger(
      "--measured",
      resolveSetting(
        parsed,
        "measuredRequests",
        "PERF_MEASURED_REQUESTS",
        `${DEFAULT_MEASURED_REQUESTS}`,
      ),
      { minimum: 1, maximum: MAX_REQUESTS },
    ),
    timeoutMs: readInteger(
      "--timeout-ms",
      resolveSetting(parsed, "timeoutMs", "PERF_TIMEOUT_MS", `${DEFAULT_TIMEOUT_MS}`),
      { minimum: 100, maximum: 120_000 },
    ),
    webP95BudgetMs: readInteger(
      "--web-p95-budget-ms",
      resolveSetting(
        parsed,
        "webP95BudgetMs",
        "PERF_WEB_P95_BUDGET_MS",
        `${DEFAULT_WEB_P95_BUDGET_MS}`,
      ),
      { minimum: 1, maximum: 120_000 },
    ),
    apiP95BudgetMs: readInteger(
      "--api-p95-budget-ms",
      resolveSetting(
        parsed,
        "apiP95BudgetMs",
        "PERF_API_P95_BUDGET_MS",
        `${DEFAULT_API_P95_BUDGET_MS}`,
      ),
      { minimum: 1, maximum: 120_000 },
    ),
  };

  const rawSlug = resolveSetting(parsed, "slug", "PERF_SLUG", "");
  // `--dry-run` prints the plan for a job with no server and no seeded invitation, so a missing slug stays a
  // placeholder there and every other run refuses it.
  settings.slug = rawSlug === "" ? undefined : readSlug(rawSlug);
  if (settings.slug === undefined && !settings.dryRun) {
    throw new UsageError(
      "--slug (or PERF_SLUG) is required: this check reads one published invitation.",
    );
  }

  return settings;
}

/** The two critical read paths, as the paths the check appends to each origin. */
function targetsOf(options) {
  const slug = options.slug ?? "<slug>";

  return [
    {
      name: "web",
      path: `/i/${slug}`,
      url: `${options.webUrl}/i/${slug}`,
      p95BudgetMs: options.webP95BudgetMs,
      // The guest's page is rendered per request and calls the API read below; a cold render also pays for the
      // first request of the process, which is why the run warms both targets before it measures.
      description: "public invitation page (web)",
    },
    {
      name: "api",
      path: `/public/invitations/${slug}`,
      url: `${options.apiUrl}/public/invitations/${slug}`,
      p95BudgetMs: options.apiP95BudgetMs,
      description: "public invitation read (API)",
    },
  ];
}

/** Nearest-rank percentile of an ascending array, so p95 of 50 samples is the 48th smallest. */
function percentile(ascending, fraction) {
  const rank = Math.ceil(fraction * ascending.length);
  return ascending[Math.min(Math.max(rank, 1), ascending.length) - 1];
}

/**
 * One request, timed until its body is fully read so the sample covers the transfer the guest waits for. Any
 * non-2xx answer is a failure: a 404 slug or a 500 render would otherwise read as a fast sample.
 */
async function timedRequest(target, timeoutMs) {
  const started = performance.now();

  const response = await fetch(target.url, {
    headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  await response.arrayBuffer();
  const elapsed = performance.now() - started;

  if (!response.ok) {
    throw new Error(`${target.description} answered HTTP ${response.status} at ${target.url}.`);
  }

  return elapsed;
}

async function measureTarget(target, options) {
  for (let index = 0; index < options.warmRequests; index += 1) {
    await timedRequest(target, options.timeoutMs);
  }

  const samples = [];
  for (let index = 0; index < options.measuredRequests; index += 1) {
    samples.push(await timedRequest(target, options.timeoutMs));
  }

  const ascending = [...samples].sort((left, right) => left - right);
  const p95Ms = percentile(ascending, 0.95);

  return {
    name: target.name,
    description: target.description,
    url: target.url,
    requests: samples.length,
    warmupRequests: options.warmRequests,
    p50Ms: round(percentile(ascending, 0.5)),
    p95Ms: round(p95Ms),
    maxMs: round(ascending[ascending.length - 1]),
    p95BudgetMs: target.p95BudgetMs,
    // The p95 is compared exactly as it is reported, so a printed number always agrees with the verdict.
    withinBudget: round(p95Ms) <= target.p95BudgetMs,
  };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function planOf(options, targets) {
  return {
    dryRun: true,
    measured: false,
    webUrl: options.webUrl,
    apiUrl: options.apiUrl,
    slug: options.slug ?? null,
    warmRequests: options.warmRequests,
    measuredRequests: options.measuredRequests,
    timeoutMs: options.timeoutMs,
    targets: targets.map((target) => ({
      name: target.name,
      description: target.description,
      method: "GET",
      path: target.path,
      // With no slug in a dry run the path keeps the `<slug>` placeholder, so the plan still shows the shape.
      url: target.url,
      p95BudgetMs: target.p95BudgetMs,
    })),
  };
}

async function main() {
  const options = resolveOptions(process.argv.slice(2));

  if (options.help) {
    console.info(USAGE);
    return 0;
  }

  const targets = targetsOf(options);

  if (options.dryRun) {
    const plan = planOf(options, targets);

    console.info("Performance check plan (dry run: no request is sent):");
    for (const target of plan.targets) {
      console.info(
        `- ${target.description}: GET ${target.url} (p95 budget ${target.p95BudgetMs}ms)`,
      );
    }
    console.info(
      `- ${plan.warmRequests} warm requests, then ${plan.measuredRequests} measured requests per target, ` +
        `one at a time, ${plan.timeoutMs}ms timeout.`,
    );
    console.info(JSON.stringify({ check: "performance", ok: true, ...plan }));
    return 0;
  }

  const results = [];
  for (const target of targets) {
    results.push(await measureTarget(target, options));
  }

  const ok = results.every((result) => result.withinBudget);

  console.info(
    `Performance check on ${options.slug} (${options.warmRequests} warm + ${options.measuredRequests} measured ` +
      `requests per target):`,
  );
  for (const result of results) {
    console.info(
      `- ${result.description}: p50 ${result.p50Ms}ms, p95 ${result.p95Ms}ms, max ${result.maxMs}ms, ` +
        `${result.requests} requests (p95 budget ${result.p95BudgetMs}ms) ` +
        `${result.withinBudget ? "within budget" : "OVER BUDGET"}`,
    );
  }
  console.info(JSON.stringify({ check: "performance", ok, slug: options.slug, results }));

  return ok ? 0 : 1;
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(error instanceof UsageError ? message : `Performance check failed: ${message}`);
  if (error instanceof UsageError) {
    console.error("Run with --help for the accepted options.");
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
  console.error(
    JSON.stringify({
      check: "performance",
      ok: false,
      error: error instanceof UsageError ? "usage" : "request_failed",
    }),
  );
}
