import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { requireLocalUrl } from "./environment.ts";

// The browser harness writes users, sessions, and email, so it refuses to start without an explicit
// local PostgreSQL and Mailpit (M2 T9b; S38). Part A's verification proposed this regression test.

const NAMES = ["E2E_DATABASE_URL", "E2E_MAILPIT_URL"] as const;
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved[name];
    }
  }
});

describe("requireLocalUrl", () => {
  for (const name of NAMES) {
    it(`refuses a missing or blank ${name}`, () => {
      delete process.env[name];
      assert.throws(() => requireLocalUrl(name), new RegExp(`explicit ${name}`));
      process.env[name] = "   ";
      assert.throws(() => requireLocalUrl(name), new RegExp(`explicit ${name}`));
    });

    it(`refuses a remote or unparsable ${name}`, () => {
      for (const value of [
        "postgresql://postgres@db.example.com:5432/invitame_e2e",
        "http://mailpit.internal:8025",
        "http://10.0.0.5:8025",
        "http://localhost.example.com:8025",
      ]) {
        process.env[name] = value;
        assert.throws(() => requireLocalUrl(name), /must point to a local host/, value);
      }
      process.env[name] = "not a url";
      assert.throws(() => requireLocalUrl(name), /must be a valid URL/);
    });

    it(`accepts a local ${name} and returns it unchanged`, () => {
      for (const value of [
        "postgresql://postgres@127.0.0.1:55432/invitame_e2e",
        "http://localhost:8025",
        "http://[::1]:8025",
      ]) {
        process.env[name] = value;
        assert.equal(requireLocalUrl(name), value);
      }
    });
  }
});
