import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { validateEnvironment } from "./environment";

// The committed `apps/api/.env.example` must start the API once its one empty secret is filled in
// (S12; T11 sign-off, `AUTH_BASE_URL` finding F1). The file is edited by a human: this test only reads it.

function parseEnvFile(text: string): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const separator = trimmed.indexOf("=");

    if (trimmed === "" || trimmed.startsWith("#") || separator === -1) {
      continue;
    }

    entries[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }

  return entries;
}

describe("apps/api/.env.example (S12)", () => {
  const example = parseEnvFile(readFileSync(join(__dirname, "../../.env.example"), "utf8"));

  it("keeps BETTER_AUTH_SECRET empty, so no known secret can be copied into production", () => {
    assert.equal(example.BETTER_AUTH_SECRET, "");
  });

  it("passes the startup validation once BETTER_AUTH_SECRET is filled in", () => {
    const environment = { ...example, BETTER_AUTH_SECRET: "x".repeat(32) };

    assert.doesNotThrow(() => validateEnvironment(environment));
  });

  it("names the web origin as AUTH_BASE_URL, one of the CORS_ORIGIN entries", () => {
    const origins = (example.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim());

    assert.ok(origins.includes(example.AUTH_BASE_URL ?? ""));
  });

  it("sets NODE_ENV explicitly, which the API requires (S56)", () => {
    assert.ok(["development", "test", "production"].includes(example.NODE_ENV ?? ""));
  });
});
