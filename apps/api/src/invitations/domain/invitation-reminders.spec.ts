import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type InvitationReminders,
  REMINDERS_EVENT_EVE_ISSUE,
  REMINDERS_PENDING_RSVP_ISSUE,
  REMINDERS_TYPE_ISSUE,
  REMINDERS_VERSION_ISSUE,
  storedReminders,
  validateReminders,
} from "./invitation-reminders";

// The reminder settings of one invitation (F6; L9.1): the two switches the owner saves, their bounds, and the rule
// that a payload with nothing switched on means no reminder settings at all. Every case goes through the validator
// the API stores with.

const BOTH: InvitationReminders = { version: 1, pendingRsvp: true, eventEve: true };

/** The validated payload, or the issues that refuse it. */
function resultOf(payload: unknown): unknown {
  const validated = validateReminders(payload);

  return validated.ok ? validated.value : validated.issues;
}

/** The validated payload, asserting the value is one the rules accept. */
function payloadOf(payload: unknown): InvitationReminders | null {
  const validated = validateReminders(payload);

  assert.deepEqual(validated.ok ? [] : (validated as { issues: readonly string[] }).issues, []);

  return validated.ok ? validated.value : null;
}

describe("the reminder settings payload (L9.1)", () => {
  it("accepts the versioned pair of switches in either state", () => {
    assert.deepEqual(payloadOf(BOTH), BOTH);
    assert.deepEqual(payloadOf({ version: 1, pendingRsvp: true, eventEve: false }), {
      version: 1,
      pendingRsvp: true,
      eventEve: false,
    });
    assert.deepEqual(payloadOf({ version: 1, pendingRsvp: false, eventEve: true }), {
      version: 1,
      pendingRsvp: false,
      eventEve: true,
    });
  });

  it("treats null, an absent value, and two switches that are off as no reminder settings", () => {
    assert.equal(resultOf(null), null);
    assert.equal(resultOf(undefined), null);
    // Nothing switched on is nothing to send: the invitation keeps no reminder settings instead of an empty pair.
    assert.equal(resultOf({ version: 1, pendingRsvp: false, eventEve: false }), null);
  });

  it("refuses a payload that is not an object, another version, and a switch that is not a boolean", () => {
    assert.deepEqual(resultOf([{ version: 1 }]), [REMINDERS_TYPE_ISSUE]);
    assert.deepEqual(resultOf("on"), [REMINDERS_TYPE_ISSUE]);
    assert.deepEqual(resultOf(42), [REMINDERS_TYPE_ISSUE]);
    assert.deepEqual(resultOf({ version: 2, pendingRsvp: true, eventEve: true }), [
      REMINDERS_VERSION_ISSUE,
    ]);
    assert.deepEqual(resultOf({ pendingRsvp: true, eventEve: true }), [REMINDERS_VERSION_ISSUE]);
  });

  it("reports every refused switch in a deterministic order", () => {
    assert.deepEqual(resultOf({ version: 1, pendingRsvp: "sí", eventEve: 1 }), [
      REMINDERS_PENDING_RSVP_ISSUE,
      REMINDERS_EVENT_EVE_ISSUE,
    ]);
    assert.deepEqual(resultOf({ version: 3, pendingRsvp: null, eventEve: null }), [
      REMINDERS_VERSION_ISSUE,
      REMINDERS_PENDING_RSVP_ISSUE,
      REMINDERS_EVENT_EVE_ISSUE,
    ]);
  });
});

describe("the stored reminder settings (F6; L9.1)", () => {
  it("reads a row written around the API as no reminder settings", () => {
    assert.equal(storedReminders({ version: 9, pendingRsvp: true, eventEve: true }), null);
    assert.equal(storedReminders({ version: 1, pendingRsvp: "true", eventEve: true }), null);
    assert.equal(storedReminders({ version: 1, pendingRsvp: false, eventEve: false }), null);
    assert.equal(storedReminders(null), null);
    assert.equal(storedReminders(undefined), null);
  });

  it("keeps a stored payload the rules accept", () => {
    assert.deepEqual(storedReminders(BOTH), BOTH);
    assert.deepEqual(storedReminders({ version: 1, pendingRsvp: false, eventEve: true }), {
      version: 1,
      pendingRsvp: false,
      eventEve: true,
    });
  });
});
