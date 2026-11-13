import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_INVITATION_TIME_ZONE,
  INVITATION_TIME_ZONES,
  isInvitationTimeZone,
} from "./time-zones.ts";

// The web's mirror of the API's time zone allow-list (F3; S3, S4). The public page reads a stored zone with
// this list, the creator's select offers exactly these values, and both refuse a zone the API never stores,
// so the mirror is pinned to the eleven zones the F1 contract names.

describe("invitation time zones", () => {
  it("lists the eleven Mexico zones of the API contract, in its order", () => {
    assert.deepEqual(
      [...INVITATION_TIME_ZONES],
      [
        "America/Mexico_City",
        "America/Cancun",
        "America/Mazatlan",
        "America/Hermosillo",
        "America/Chihuahua",
        "America/Tijuana",
        "America/Matamoros",
        "America/Monterrey",
        "America/Merida",
        "America/Ojinaga",
        "America/Bahia_Banderas",
      ],
    );
    assert.equal(DEFAULT_INVITATION_TIME_ZONE, "America/Mexico_City");
    assert.equal(INVITATION_TIME_ZONES.includes(DEFAULT_INVITATION_TIME_ZONE), true);
  });

  it("accepts only an exact member of the list", () => {
    for (const zone of INVITATION_TIME_ZONES) {
      assert.equal(isInvitationTimeZone(zone), true, zone);
    }
    for (const value of [
      "",
      "America/mexico_city",
      " America/Mexico_City",
      "America/Mexico_City ",
      "Europe/Madrid",
      "UTC",
      "Mexico/General",
      null,
      7,
      ["America/Mexico_City"],
    ]) {
      assert.equal(isInvitationTimeZone(value), false, JSON.stringify(value));
    }
  });
});
