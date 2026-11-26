import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INVITATION_FEATURE_KEYS, isInvitationFeatureKey } from "./invitation-features.ts";

// The web mirrors the API's gated keys (invitation-features S7, m6 S4) so an owned invitation's
// `availableFeatures` reads strictly; a key the API gates but the mirror lacks would refuse the whole body.
describe("implemented feature keys", () => {
  it("mirrors every key the API gates, including the itinerary, the guest list, its QR pass, and the gallery", () => {
    assert.deepEqual(
      [...INVITATION_FEATURE_KEYS],
      [
        "ITINERARY",
        "COUNTDOWN",
        "MAP",
        "WHATSAPP",
        "MUSIC",
        "GIFT_REGISTRY",
        "RSVP",
        "GUEST_LIST",
        "QR_PASS",
        "GALLERY",
        "CALENDAR",
      ],
    );
    for (const key of ["ITINERARY", "RSVP", "GUEST_LIST", "QR_PASS", "GALLERY"]) {
      assert.equal(isInvitationFeatureKey(key), true, key);
    }
  });

  it("still refuses a key the API does not gate", () => {
    assert.equal(isInvitationFeatureKey("PHOTO_BOOTH"), false);
    assert.equal(isInvitationFeatureKey("rsvp"), false);
  });
});
