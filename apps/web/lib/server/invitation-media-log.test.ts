import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiClientError } from "./api-client.ts";
import { invitationMediaFailureLine, logInvitationMediaFailure } from "./invitation-media-log.ts";

// The operational log of one unexpected media call (M8 S2, S4). AGENTS.md forbids logging personal data, and an
// upload carries the creator's own alt text and the file's name: the line may name the event, the error class, the
// client's failure kind, and the class of its cause, and nothing else.

const ALT_TEXT = "Los novios en el jardín de la abuela";
const FILE_NAME = "vacaciones-en-acapulco.jpg";
const INVITATION_ID = "0b6f3e0e-8c1e-4b8e-9a51-2f7d1c3a9e10";

describe("the media failure line", () => {
  it("names the event, the error class, the kind, and the cause class only", () => {
    const error = new ApiClientError("unavailable", 503, {
      cause: new TypeError("fetch failed"),
    });

    const line = invitationMediaFailureLine(error);
    const parsed = JSON.parse(line) as Record<string, unknown>;

    assert.deepEqual(parsed, {
      event: "invitation_media_call_failed",
      error: "ApiClientError",
      kind: "unavailable",
      cause: "TypeError",
    });
    assert.equal(line.includes("\n"), false);
  });

  it("never carries the alt text, the file name, the invitation id, or another message", () => {
    const error = new Error(`upload of ${FILE_NAME} failed: ${ALT_TEXT} on ${INVITATION_ID}`);

    const line = invitationMediaFailureLine(error);
    const parsed = JSON.parse(line) as Record<string, unknown>;

    assert.equal(parsed.error, "Error");
    for (const secret of [ALT_TEXT, FILE_NAME, INVITATION_ID, "acapulco", "jardín"]) {
      assert.equal(line.includes(secret), false, secret);
    }
  });

  it("writes one line and never throws when the sink fails", () => {
    const lines: string[] = [];

    logInvitationMediaFailure(new Error("boom"), (line) => {
      lines.push(line);
    });
    assert.equal(lines.length, 1);

    assert.doesNotThrow(() =>
      logInvitationMediaFailure(new Error("boom"), () => {
        throw new Error("sink is closed");
      }),
    );
  });
});
