import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateAtStartup } from "./startup.ts";

// Startup validation of the web server settings (M2 T8c; L38, R4-web-config-validated-only-on-first-request):
// `instrumentation.ts` runs it once when a Node.js server starts, never during `next build`. Next.js
// 16.3.5 logs an error thrown by `register()` but keeps serving 500s, so a failure exits the process.

function hooks(validate: () => unknown = () => {}) {
  const exits: number[] = [];
  const lines: string[] = [];
  let validations = 0;
  return {
    exits,
    lines,
    validations: () => validations,
    hooks: {
      validate: () => {
        validations += 1;
        return validate();
      },
      exit: (code: number) => {
        exits.push(code);
      },
      log: (line: string) => {
        lines.push(line);
      },
    },
  };
}

describe("validateAtStartup", () => {
  it("validates once on a Node.js server and keeps it running", () => {
    const probe = hooks();

    assert.equal(validateAtStartup({ NEXT_RUNTIME: "nodejs" }, probe.hooks), "valid");
    assert.equal(probe.validations(), 1);
    assert.deepEqual(probe.exits, []);
    assert.deepEqual(probe.lines, []);
  });

  it("logs the configuration error and exits with code 1", () => {
    const probe = hooks(() => {
      throw new Error("API_ORIGIN must be provided in production.");
    });

    assert.equal(validateAtStartup({ NEXT_RUNTIME: "nodejs" }, probe.hooks), "invalid");
    assert.deepEqual(probe.exits, [1]);
    assert.deepEqual(
      probe.lines.map((line) => JSON.parse(line)),
      [{ event: "web_config_invalid", message: "API_ORIGIN must be provided in production." }],
    );
  });

  it("logs a generic message for a non-Error failure", () => {
    const probe = hooks(() => {
      throw "unexpected";
    });

    assert.equal(validateAtStartup({ NEXT_RUNTIME: "nodejs" }, probe.hooks), "invalid");
    assert.deepEqual(JSON.parse(probe.lines[0] ?? "{}"), {
      event: "web_config_invalid",
      message: "Invalid web server configuration.",
    });
    assert.deepEqual(probe.exits, [1]);
  });

  it("skips the production build and non-Node.js runtimes", () => {
    const environments = [
      { NEXT_RUNTIME: "nodejs", NEXT_PHASE: "phase-production-build" },
      { NEXT_RUNTIME: "edge" },
      {},
    ];
    for (const environment of environments) {
      const probe = hooks();

      assert.equal(validateAtStartup(environment, probe.hooks), "skipped");
      assert.equal(probe.validations(), 0, JSON.stringify(environment));
      assert.deepEqual(probe.exits, []);
    }
  });
});
