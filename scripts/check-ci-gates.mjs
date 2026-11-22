import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Guards the M10 S5 exit criterion "CI/CD runs the documented quality gates without silently
// skipping material checks". It reads the gate matrix of docs/development/quality-gates.md and the
// job and step definitions of .github/workflows/ci.yml, and fails when:
//
// - a gate documented in the matrix has no declared CI coverage (`CI_COVERAGE` below), so adding or
//   renaming a documented gate never leaves CI silently without it;
// - a gate declared in `CI_COVERAGE` is no longer documented, so the matrix and CI cannot drift
//   apart in the other direction either;
// - a declared gate is missing from the workflow file, runs fewer times than required (the seed
//   runs twice to prove idempotence), or was moved out of the job that is documented to run it;
// - a gate declared `local` (the developer's Docker Compose database, the format repair command)
//   appears in any workflow `run:` step, which would run it in CI;
// - the required-check table is emptied or loses one of the always-required checks, which would
//   leave branch protection protecting nothing while the heading still claims otherwise;
// - a required status check documented in the matrix document no longer matches the workflow job
//   `name:`, which would silently detach branch protection from the job it protects.
//
// It is a static check of the workflow definition: it proves a gate is wired, not that a past run
// passed. `--self-test` runs the same functions over fixtures, including one missing a gate, and
// proves the guard fails there.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = ".github/workflows/ci.yml";
const qualityGatesPath = "docs/development/quality-gates.md";
const matrixHeading = "## Current command matrix";
const requiredChecksHeading = "### Required status checks on `master`";

/**
 * The three status checks `master` must require. The documented table still supplies each check's
 * job id; this list makes an emptied or trimmed table fail instead of passing with nothing to
 * verify.
 */
export const REQUIRED_CHECKS = ["Quality gates", "Database tests", "Browser tests"];

/**
 * How every gate of the documented matrix is expected to appear in `.github/workflows/ci.yml`.
 * `runs` entries name an exact `run:` command, the job id that must contain it, and how many times
 * it must appear; `local` marks a gate CI must not run, with the reason. Keys must equal the
 * commands parsed from the matrix, in both directions (see the header comment).
 */
export const CI_COVERAGE = {
  "node scripts/check-ci-gates.mjs": {
    // Both steps, so deleting the self-test from the workflow fails the guard it verifies.
    runs: [
      { command: "node scripts/check-ci-gates.mjs", job: "quality-gates" },
      { command: "node scripts/check-ci-gates.mjs --self-test", job: "quality-gates" },
    ],
  },
  "pnpm format:check": {
    runs: [{ command: "pnpm format:check", job: "quality-gates" }],
  },
  "pnpm format": {
    local: "writes formatting changes, so it is a repair command and never evidence",
  },
  "pnpm docs:check": {
    runs: [{ command: "pnpm docs:check", job: "quality-gates" }],
  },
  "pnpm lint": {
    runs: [{ command: "pnpm lint", job: "quality-gates" }],
  },
  "pnpm typecheck": {
    runs: [{ command: "pnpm typecheck", job: "quality-gates" }],
  },
  "pnpm test": {
    runs: [{ command: "pnpm test", job: "quality-gates" }],
  },
  "pnpm --filter @invitame/api test:db": {
    runs: [{ command: "pnpm --filter @invitame/api test:db", job: "database-tests" }],
  },
  "pnpm --filter @invitame/web test:e2e": {
    runs: [{ command: "pnpm --filter @invitame/web test:e2e", job: "browser-tests" }],
  },
  "pnpm build": {
    runs: [{ command: "pnpm build", job: "quality-gates" }],
  },
  "git diff --check": {
    runs: [{ command: "git diff --check", job: "quality-gates" }],
  },
  "pnpm db:up": {
    local: "starts the developer's Docker Compose PostgreSQL; CI starts its own service container",
  },
  "pnpm db:migrate": {
    runs: [
      { command: "pnpm --filter @invitame/api prisma:migrate:deploy", job: "database-tests" },
      { command: "pnpm --filter @invitame/api prisma:generate", job: "database-tests" },
    ],
  },
  "pnpm db:seed": {
    runs: [{ command: "pnpm db:seed", job: "database-tests", count: 2 }],
  },
  "node scripts/check-seed-idempotence.mjs": {
    // The second seed proves nothing on its own: the counts must be recorded before it and compared
    // after it, so both steps are required.
    runs: [
      { command: "node scripts/check-seed-idempotence.mjs --record", job: "database-tests" },
      { command: "node scripts/check-seed-idempotence.mjs --verify", job: "database-tests" },
    ],
  },
  "pnpm db:check": {
    runs: [{ command: "pnpm db:check", job: "database-tests" }],
  },
  "pnpm db:down": {
    local: "stops the developer's Docker Compose services; CI containers end with the job",
  },
};

/** Lines of the section that starts with `heading`, up to the next Markdown heading. */
function sectionLines(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return null;
  }

  const end = lines.findIndex(
    (line, index) => index > start && /^#{1,6}\s/.test(line) && !line.trim().startsWith("#### "),
  );

  return lines.slice(start + 1, end === -1 ? undefined : end);
}

/** The table rows of a section: their cells, with the header and separator rows removed. */
function tableRows(markdown, heading) {
  const lines = sectionLines(markdown, heading);
  if (lines === null) {
    return null;
  }

  const rows = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }

    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 2 || cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue;
    }

    rows.push(cells);
  }

  return rows;
}

/**
 * The command a matrix cell documents: its first inline-code span, without a leading environment
 * assignment such as `DATABASE_URL=<local URL>`, so `DATABASE_URL=… pnpm --filter @invitame/api
 * test:db` documents `pnpm --filter @invitame/api test:db`.
 */
function documentedCommand(cell) {
  const inlineCode = /`([^`]+)`/.exec(cell);
  if (inlineCode === null) {
    return null;
  }

  const command = inlineCode[1].trim();
  const executable = /(?:^|\s)(pnpm|node|git)\s/.exec(command);
  if (executable === null) {
    return command;
  }

  return command.slice(executable.index).trim();
}

/** Every gate the matrix documents, in order, with its label. */
function documentedGates(markdown) {
  const rows = tableRows(markdown, matrixHeading);
  if (rows === null) {
    return null;
  }

  const gates = [];
  for (const cells of rows) {
    if (cells[0].toLowerCase() === "gate") {
      continue;
    }

    const command = documentedCommand(cells[1]);
    if (command !== null) {
      gates.push({ label: cells[0], command });
    }
  }

  return gates;
}

/** The required status checks the matrix document records, with their job ids. */
function documentedRequiredChecks(markdown) {
  const rows = tableRows(markdown, requiredChecksHeading);
  if (rows === null) {
    return null;
  }

  const checks = [];
  for (const cells of rows) {
    if (cells[0].toLowerCase() === "required check") {
      continue;
    }

    const job = /`([^`]+)`/.exec(cells[1]);
    checks.push({ check: cells[0], job: job === null ? null : job[1].trim() });
  }

  return checks;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && /^["']/.test(trimmed) && /["']$/.test(trimmed)) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

/**
 * The jobs of the workflow, with each job's `name:` and its `run:` steps. A text walk instead of a
 * YAML parser, so the guard needs no dependency; a shape it cannot read shows up as a missing gate
 * rather than as a silent pass.
 */
function parseWorkflow(text) {
  const jobs = new Map();
  let currentJob = null;
  let currentStep = null;

  for (const line of text.split("\n")) {
    const jobHeader = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobHeader !== null) {
      currentJob = { id: jobHeader[1], name: null, runs: [] };
      jobs.set(currentJob.id, currentJob);
      currentStep = null;
      continue;
    }

    if (currentJob === null) {
      continue;
    }

    const jobName = /^ {4}name:\s*(.+?)\s*$/.exec(line);
    if (jobName !== null) {
      currentJob.name = unquote(jobName[1]);
      currentStep = null;
      continue;
    }

    const stepName = /^\s+-\s+name:\s*(.+?)\s*$/.exec(line);
    if (stepName !== null) {
      currentStep = unquote(stepName[1]);
      continue;
    }

    const run = /^\s*(?:-\s+)?run:\s*(.+?)\s*$/.exec(line);
    if (run !== null) {
      currentJob.runs.push({ step: currentStep, command: unquote(run[1]) });
    }
  }

  return jobs;
}

/**
 * Whether a `run:` step executes `command`, alone or as one segment of a chained shell command such
 * as `pnpm db:up && pnpm db:migrate`. A segment that only starts with the command is not a match.
 */
function runsStep(runCommand, command) {
  return runCommand
    .split(/&&|\|\||[;\n]/)
    .map((segment) => segment.trim())
    .includes(command);
}

/**
 * The failures of one workflow/docs pair: empty when every documented gate is wired as declared, no
 * local-only gate runs in CI, and every required check still names a workflow job.
 */
export function evaluate({
  workflow,
  qualityGates,
  coverage = CI_COVERAGE,
  requiredChecks = REQUIRED_CHECKS,
}) {
  const failures = [];
  const jobs = parseWorkflow(workflow);

  const gates = documentedGates(qualityGates);
  if (gates === null) {
    failures.push(
      `${qualityGatesPath} must document the gate matrix under "${matrixHeading}", because the CI gate guard reads it`,
    );
  }

  const documented = new Set();
  for (const gate of gates ?? []) {
    documented.add(gate.command);
    const declaration = coverage[gate.command];

    if (declaration === undefined) {
      failures.push(
        `Documented gate "${gate.label}" (\`${gate.command}\`) has no CI coverage declaration in scripts/check-ci-gates.mjs: add it to .github/workflows/ci.yml and declare it in CI_COVERAGE, or declare it local with its reason`,
      );
      continue;
    }

    if (declaration.local !== undefined) {
      for (const job of jobs.values()) {
        for (const entry of job.runs) {
          if (!runsStep(entry.command, gate.command)) {
            continue;
          }

          failures.push(
            `Documented gate "${gate.label}" is declared local only (${declaration.local}), so \`${gate.command}\` must not run in CI, but .github/workflows/ci.yml job "${job.id}" runs it in step "${entry.step ?? "unnamed"}": remove that step, or document the gate as a CI gate and declare the job that runs it`,
          );
        }
      }

      continue;
    }

    for (const expectation of declaration.runs ?? []) {
      const job = jobs.get(expectation.job);
      const count = expectation.count ?? 1;
      const occurrences =
        job === undefined
          ? 0
          : job.runs.filter((entry) => entry.command === expectation.command).length;

      if (occurrences >= count) {
        continue;
      }

      const wanted = count === 1 ? "a run step" : `at least ${count} run steps`;
      failures.push(
        `Documented gate "${gate.label}" is not wired: .github/workflows/ci.yml job "${expectation.job}" must contain ${wanted} with the exact command \`${expectation.command}\` (found ${occurrences})`,
      );
    }
  }

  for (const command of Object.keys(coverage)) {
    if (!documented.has(command)) {
      failures.push(
        `scripts/check-ci-gates.mjs declares CI coverage for \`${command}\`, but ${qualityGatesPath} no longer documents that gate: document it again or remove the declaration`,
      );
    }
  }

  const recordedChecks = documentedRequiredChecks(qualityGates);
  if (recordedChecks === null) {
    failures.push(
      `${qualityGatesPath} must record the required status checks under "${requiredChecksHeading}", so a renamed job cannot detach branch protection silently`,
    );
  } else {
    if (recordedChecks.length === 0) {
      failures.push(
        `${qualityGatesPath} keeps the heading "${requiredChecksHeading}" but its table has no rows: list the required checks, or remove the heading together with them`,
      );
    }

    for (const check of requiredChecks) {
      if (!recordedChecks.some((recorded) => recorded.check === check)) {
        failures.push(
          `Required check "${check}" is no longer recorded under "${requiredChecksHeading}" in ${qualityGatesPath}: record it again, or change REQUIRED_CHECKS in scripts/check-ci-gates.mjs as a reviewed change to the protection itself`,
        );
      }
    }
  }

  for (const required of recordedChecks ?? []) {
    if (required.job === null) {
      failures.push(
        `Required check "${required.check}" must name its workflow job id in backticks`,
      );
      continue;
    }

    const job = jobs.get(required.job);
    if (job === undefined) {
      failures.push(
        `Required check "${required.check}" names job "${required.job}", which .github/workflows/ci.yml does not define`,
      );
      continue;
    }

    if (job.name !== required.check) {
      failures.push(
        `Required check "${required.check}" must stay the \`name:\` of job "${required.job}" in .github/workflows/ci.yml (found ${job.name === null ? "none" : `"${job.name}"`}); a rename detaches branch protection from the job it protects`,
      );
    }
  }

  return failures;
}

/** What the guard reports after a successful check: which job runs each CI gate. */
function coverageReport(coverage = CI_COVERAGE) {
  const lines = [];
  for (const [command, declaration] of Object.entries(coverage)) {
    if (declaration.local !== undefined) {
      lines.push(`  ${command} -> local only: ${declaration.local}`);
      continue;
    }

    lines.push(
      `  ${command} -> ${[...new Set((declaration.runs ?? []).map((run) => run.job))].join(", ")}`,
    );
  }

  return lines;
}

const fixtures = {
  workflow: `name: CI

on:
  push:

jobs:
  quality-gates:
    name: Quality gates
    runs-on: ubuntu-latest
    steps:
      - name: CI gate coverage
        run: node scripts/check-ci-gates.mjs

      - name: CI gate coverage self-test
        run: node scripts/check-ci-gates.mjs --self-test

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test

  database-tests:
    name: Database tests
    runs-on: ubuntu-latest
    steps:
      - name: Seed the database
        run: pnpm db:seed

      - name: Record seed row counts
        run: node scripts/check-seed-idempotence.mjs --record

      - name: Seed the database again (idempotence)
        run: pnpm db:seed

      - name: Verify the second seed created nothing
        run: node scripts/check-seed-idempotence.mjs --verify
`,
  qualityGates: `# Fixture

## Current command matrix

| Gate | Command | Current meaning | When required |
| --- | --- | --- | --- |
| CI gate coverage | \`node scripts/check-ci-gates.mjs\` | Fixture. | Every CI change. |
| Lint | \`pnpm lint\` | Fixture. | Every change. |
| Unit tests | \`pnpm test\` | Fixture. | Every change. |
| Seed | \`pnpm db:seed\` | Fixture. | Seed changes. |
| Seed idempotence counts | \`node scripts/check-seed-idempotence.mjs\` | Fixture. | Seed changes. |
| Stop local PostgreSQL | \`pnpm db:down\` | Fixture. | After local work. |

## CI/CD status

### Required status checks on \`master\`

| Required check | Job | Covers |
| --- | --- | --- |
| Quality gates | \`quality-gates\` | Static gates. |
| Database tests | \`database-tests\` | Database gates. |
`,
  // The guard's own declaration is the real one, so the fixture also proves that the real
  // CI_COVERAGE keeps requiring both the guard and its self-test step.
  coverage: {
    "node scripts/check-ci-gates.mjs": CI_COVERAGE["node scripts/check-ci-gates.mjs"],
    "pnpm lint": { runs: [{ command: "pnpm lint", job: "quality-gates" }] },
    "pnpm test": { runs: [{ command: "pnpm test", job: "quality-gates" }] },
    "pnpm db:seed": { runs: [{ command: "pnpm db:seed", job: "database-tests", count: 2 }] },
    "node scripts/check-seed-idempotence.mjs":
      CI_COVERAGE["node scripts/check-seed-idempotence.mjs"],
    "pnpm db:down": { local: "fixture local-only gate" },
  },
  requiredChecks: ["Quality gates", "Database tests"],
};

/** Runs the guard over fixtures and proves it fails on each drift it exists to catch. */
function selfTest() {
  const cases = [
    {
      name: "a consistent workflow and matrix pass",
      workflow: fixtures.workflow,
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: [],
    },
    {
      name: "a seed that runs once fails",
      workflow: fixtures.workflow.replace(
        `      - name: Seed the database again (idempotence)
        run: pnpm db:seed
`,
        "",
      ),
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: ["pnpm db:seed", "at least 2 run steps"],
    },
    {
      name: "a removed workflow step fails",
      workflow: fixtures.workflow.replace(
        `      - name: Test
        run: pnpm test
`,
        "",
      ),
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: ["Unit tests", "pnpm test"],
    },
    {
      name: "a gate moved to another job fails",
      workflow: fixtures.workflow
        .replace(
          `      - name: Seed the database
        run: pnpm db:seed

      - name: Record seed row counts
`,
          `      - name: Record seed row counts
`,
        )
        .replace(
          `      - name: Seed the database again (idempotence)
        run: pnpm db:seed

      - name: Verify the second seed created nothing
`,
          `      - name: Verify the second seed created nothing
`,
        )
        .replace(
          `      - name: Lint
        run: pnpm lint
`,
          `      - name: Lint
        run: pnpm lint

      - name: Seed the database
        run: pnpm db:seed

      - name: Seed the database again (idempotence)
        run: pnpm db:seed
`,
        ),
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: ['job "database-tests"', "pnpm db:seed", "at least 2 run steps"],
    },
    {
      name: "a documented gate without coverage fails",
      workflow: fixtures.workflow,
      qualityGates: fixtures.qualityGates.replace(
        "## CI/CD status",
        "| Brand build | `pnpm brand:new` | Fixture. | Never. |\n\n## CI/CD status",
      ),
      coverage: fixtures.coverage,
      expected: ["Brand build", "no CI coverage declaration"],
    },
    {
      name: "a declared gate no longer documented fails",
      workflow: fixtures.workflow,
      qualityGates: fixtures.qualityGates,
      coverage: { ...fixtures.coverage, "pnpm extra:gate": { local: "fixture" } },
      expected: ["pnpm extra:gate", "no longer documents that gate"],
    },
    {
      name: "a renamed required check fails",
      workflow: fixtures.workflow.replace("    name: Quality gates", "    name: Quality checks"),
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: ['Required check "Quality gates"', "Quality checks"],
    },
    {
      name: "a local-only gate added to CI fails",
      workflow: fixtures.workflow.replace(
        `      - name: Test
        run: pnpm test
`,
        `      - name: Test
        run: pnpm test

      - name: Stop local PostgreSQL
        run: pnpm db:down
`,
      ),
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: ["pnpm db:down", "must not run in CI"],
    },
    {
      name: "an emptied required-check table fails",
      workflow: fixtures.workflow,
      qualityGates: fixtures.qualityGates.replace(
        `| Quality gates | \`quality-gates\` | Static gates. |
| Database tests | \`database-tests\` | Database gates. |
`,
        "",
      ),
      coverage: fixtures.coverage,
      expected: ["has no rows"],
    },
    {
      name: "a dropped required check fails",
      workflow: fixtures.workflow,
      qualityGates: fixtures.qualityGates.replace(
        `| Database tests | \`database-tests\` | Database gates. |
`,
        "",
      ),
      coverage: fixtures.coverage,
      expected: ['Required check "Database tests"', "no longer recorded"],
    },
    {
      name: "a removed guard self-test step fails",
      workflow: fixtures.workflow.replace(
        `      - name: CI gate coverage self-test
        run: node scripts/check-ci-gates.mjs --self-test
`,
        "",
      ),
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: ["CI gate coverage", "node scripts/check-ci-gates.mjs --self-test"],
    },
    {
      name: "a removed seed-count verification fails",
      workflow: fixtures.workflow.replace(
        `      - name: Verify the second seed created nothing
        run: node scripts/check-seed-idempotence.mjs --verify
`,
        "",
      ),
      qualityGates: fixtures.qualityGates,
      coverage: fixtures.coverage,
      expected: ["Seed idempotence counts", "node scripts/check-seed-idempotence.mjs --verify"],
    },
  ];

  const problems = [];
  for (const testCase of cases) {
    const failures = evaluate({
      workflow: testCase.workflow,
      qualityGates: testCase.qualityGates,
      coverage: testCase.coverage,
      requiredChecks: testCase.requiredChecks ?? fixtures.requiredChecks,
    });

    if (testCase.expected.length === 0) {
      if (failures.length !== 0) {
        problems.push(`${testCase.name}: expected no failure, got ${failures.join(" | ")}`);
      }
      continue;
    }

    for (const fragment of testCase.expected) {
      const matched = failures.some((failure) => failure.includes(fragment));
      if (!matched) {
        problems.push(
          `${testCase.name}: expected a failure containing "${fragment}", got ${failures.length === 0 ? "none" : failures.join(" | ")}`,
        );
      }
    }
  }

  if (problems.length > 0) {
    console.error("CI gate guard self-test failed:");
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exitCode = 1;
    return;
  }

  console.info(`CI gate guard self-test passed (${cases.length} cases).`);
}

async function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  const workflow = await readFile(path.join(root, workflowPath), "utf8");
  const qualityGates = await readFile(path.join(root, qualityGatesPath), "utf8");
  const failures = evaluate({ workflow, qualityGates });

  if (failures.length > 0) {
    console.error("CI gate coverage check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  const gates = documentedGates(qualityGates) ?? [];
  const localOnly = gates.filter((gate) => CI_COVERAGE[gate.command]?.local !== undefined).length;
  console.info(
    `CI gate coverage check passed (${gates.length} documented gates, ${gates.length - localOnly} wired in ${workflowPath}, ${localOnly} local only).`,
  );
  for (const line of coverageReport()) {
    console.info(line);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
