import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRemindersPayload } from "./reminders.ts";

// The reminder switches as the owner read and the write carry them (F6; L9.1, L20). A body written before the switches
// existed has no value at all and reads as none; a body of another shape refuses the whole read instead of reaching the
// editor, and a pair with nothing switched on reads as no settings because that is what the API stores.

describe("the reminder payload parser (F6; L9.1, L20)", () => {
  it("reads the versioned pair of switches", () => {
    assert.deepEqual(parseRemindersPayload({ version: 1, pendingRsvp: true, eventEve: false }), {
      version: 1,
      pendingRsvp: true,
      eventEve: false,
    });
    assert.deepEqual(parseRemindersPayload({ version: 1, pendingRsvp: true, eventEve: true }), {
      version: 1,
      pendingRsvp: true,
      eventEve: true,
    });
  });

  it("reads an absent value and a pair with nothing on as no settings", () => {
    assert.equal(parseRemindersPayload(undefined), null);
    assert.equal(parseRemindersPayload(null), null);
    assert.equal(parseRemindersPayload({ version: 1, pendingRsvp: false, eventEve: false }), null);
  });

  it("refuses another version, a switch that is not a boolean, and an unknown key", () => {
    assert.equal(
      parseRemindersPayload({ version: 2, pendingRsvp: true, eventEve: true }),
      undefined,
    );
    assert.equal(parseRemindersPayload({ pendingRsvp: true, eventEve: true }), undefined);
    assert.equal(
      parseRemindersPayload({ version: 1, pendingRsvp: "sí", eventEve: true }),
      undefined,
    );
    assert.equal(parseRemindersPayload({ version: 1, pendingRsvp: true, eventEve: 1 }), undefined);
    assert.equal(
      parseRemindersPayload({ version: 1, pendingRsvp: true, eventEve: true, phone: "+52" }),
      undefined,
    );
    assert.equal(parseRemindersPayload([]), undefined);
    assert.equal(parseRemindersPayload("on"), undefined);
  });
});
