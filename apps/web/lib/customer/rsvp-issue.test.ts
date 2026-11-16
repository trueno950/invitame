import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RSVP_SETTINGS_ERROR_CODE,
  rsvpSettingsIssueCodes,
  rsvpSettingsIssueMessages,
  rsvpSettingsIssuesTarget,
} from "./rsvp-issue.ts";

// Why the API refused an RSVP settings save, and how it reaches the creator in Spanish (M6 G3; S4). The API
// answers deterministic English issues; the action turns each one into a small code in the page's query and the
// page turns the code back into one of these sentences. Raw English never reaches a customer.

describe("rsvpSettingsIssueCodes", () => {
  it("maps the API's own sentences to the page's codes", () => {
    assert.deepEqual(
      rsvpSettingsIssueCodes([
        "deadline must be an ISO 8601 instant with an offset, or null",
        "partyLimit must be an integer",
        "partyLimit must be between 1 and 10",
      ]),
      ["deadline", "party"],
    );
  });

  it("names each code once and answers `other` for an issue it does not know", () => {
    assert.deepEqual(
      rsvpSettingsIssueCodes([
        "partyLimit must be between 1 and 10",
        "partyLimit must be an integer",
      ]),
      ["party"],
    );
    assert.deepEqual(rsvpSettingsIssueCodes(["something new"]), ["other"]);
    assert.deepEqual(rsvpSettingsIssueCodes([]), ["other"]);
  });
});

describe("the query of a refused settings save", () => {
  it("carries the error code and the issue codes", () => {
    assert.equal(RSVP_SETTINGS_ERROR_CODE, "rsvp-settings-invalid");
    assert.equal(
      rsvpSettingsIssuesTarget("/cuenta/invitaciones/x", ["deadline", "party"]),
      "/cuenta/invitaciones/x?error=rsvp-settings-invalid&issues=deadline,party",
    );
  });

  it("reads the Spanish sentences of a closed list of codes", () => {
    const messages = rsvpSettingsIssueMessages("deadline,party");

    assert.equal(messages.length, 2);
    for (const message of messages) {
      assert.equal(typeof message, "string");
      assert.notEqual(message.trim(), "");
    }
    assert.deepEqual(rsvpSettingsIssueMessages("bogus"), []);
    assert.deepEqual(rsvpSettingsIssueMessages(undefined), []);
    assert.deepEqual(rsvpSettingsIssueMessages(["deadline", "deadline"]).length, 1);
  });
});
