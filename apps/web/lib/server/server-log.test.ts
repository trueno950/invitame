import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import { createServerLog, errorClass, logReadFailure, SERVER_LOG_EVENT } from "./server-log.ts";

// The web server's structured log for unexpected failures of its API reads (M2 T8d;
// R4-account-catch-all-unlogged, L40). One line per failure, holding the event name and the error
// class only: never a message, an address, a cookie, a token, or a response body.

describe("errorClass", () => {
  it("names the error's class, and nothing else", () => {
    assert.equal(errorClass(new ApiClientError("unavailable", 503)), "ApiClientError");
    assert.equal(errorClass(new TypeError("admin@example.test leaked")), "TypeError");
    assert.equal(errorClass("admin@example.test"), "unknown");
    assert.equal(errorClass(undefined), "unknown");
  });
});

describe("createServerLog", () => {
  it("writes one JSON line with the event and the error class", () => {
    const lines: string[] = [];
    const log = createServerLog((line) => lines.push(line));
    log({ event: SERVER_LOG_EVENT.OWN_PROFILE_READ_FAILED, error: "ApiClientError" });

    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0] ?? ""), {
      event: "own_profile_read_failed",
      error: "ApiClientError",
    });
  });

  it("never throws when the sink fails", () => {
    const log = createServerLog(() => {
      throw new Error("sink down");
    });
    assert.doesNotThrow(() =>
      log({ event: SERVER_LOG_EVENT.AUTH_SESSION_READ_FAILED, error: "TypeError" }),
    );
  });
});

describe("logReadFailure", () => {
  it("returns the read's value and logs nothing when it succeeds", async () => {
    const events: unknown[] = [];
    const value = await logReadFailure(
      SERVER_LOG_EVENT.OWN_PROFILE_READ_FAILED,
      async () => ({ signedIn: false }),
      (event) => events.push(event),
    );

    assert.deepEqual(value, { signedIn: false });
    assert.deepEqual(events, []);
  });

  it("logs one event with the error class and rethrows the same error", async () => {
    const events: unknown[] = [];
    const failure = new ApiClientError("unavailable", 502);

    await assert.rejects(
      logReadFailure(
        SERVER_LOG_EVENT.AUTH_SESSION_READ_FAILED,
        async () => {
          throw failure;
        },
        (event) => events.push(event),
      ),
      (error: unknown) => error === failure,
    );
    assert.deepEqual(events, [{ event: "auth_session_read_failed", error: "ApiClientError" }]);
  });

  it("keeps the message and other details out of the event", async () => {
    const lines: string[] = [];
    await assert.rejects(
      logReadFailure(
        SERVER_LOG_EVENT.OWN_PROFILE_READ_FAILED,
        async () => {
          throw new Error("cookie=better-auth.session_token=abc admin@example.test");
        },
        createServerLog((line) => lines.push(line)),
      ),
    );
    assert.equal(lines.length, 1);
    assert.doesNotMatch(lines[0] ?? "", /cookie|session_token|admin@example/);
  });
});
