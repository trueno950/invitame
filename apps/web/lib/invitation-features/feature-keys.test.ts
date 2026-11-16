import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INVITATION_FEATURE_KEYS, isInvitationFeatureKey } from "./invitation-features.ts";

// The web mirrors the API's gated keys (invitation-features S7, m6 S4) so an owned invitation's
// `availableFeatures` reads strictly; a key the API gates but the mirror lacks would refuse the whole body.
describe("implemented feature keys", () => {
  it("mirrors every key the API gates, including the guest list and its QR pass", () => {
    assert.deepEqual(
      [...INVITATION_FEATURE_KEYS],
      [
        "COUNTDOWN",
        "MAP",
        "WHATSAPP",
        "MUSIC",
        "GIFT_REGISTRY",
        "RSVP",
        "GUEST_LIST",
        "QR_PASS",
        "CALENDAR",
      ],
    );
    for (const key of ["RSVP", "GUEST_LIST", "QR_PASS"]) {
      assert.equal(isInvitationFeatureKey(key), true, key);
    }
  });

  it("still refuses a key the API does not gate", () => {
    assert.equal(isInvitationFeatureKey("PHOTO_BOOTH"), false);
    assert.equal(isInvitationFeatureKey("rsvp"), false);
  });
});
