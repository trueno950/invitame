import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INVITATION_FEATURE_KEYS, isInvitationFeatureKey } from "./invitation-features.ts";

// The web mirrors the API's gated keys (invitation-features S7, m6 S4) so an owned invitation's
// `availableFeatures` reads strictly; a key the API gates but the mirror lacks would refuse the whole body.
describe("implemented feature keys", () => {
  it("mirrors every key the API gates, including the itinerary, the guest list, its QR pass, the gallery, the lodging, the guestbook, the guests' album, the livestream, and the opening animation", () => {
    assert.deepEqual(
      [...INVITATION_FEATURE_KEYS],
      [
        "ITINERARY",
        "COUNTDOWN",
        "MAP",
        "WHATSAPP",
        "MUSIC",
        "GIFT_REGISTRY",
        "LODGING",
        "GUESTBOOK",
        "GUEST_ALBUM",
        "LIVESTREAM",
        "OPENING_ANIMATION",
        "RSVP",
        "GUEST_LIST",
        "QR_PASS",
        "GALLERY",
        "CALENDAR",
      ],
    );
    // The album is read strictly too (F8; L11.2): a Deluxe invitation's owner read answers it.
    for (const key of [
      "ITINERARY",
      "LODGING",
      "GUESTBOOK",
      "GUEST_ALBUM",
      "LIVESTREAM",
      "OPENING_ANIMATION",
      "RSVP",
      "GUEST_LIST",
      "QR_PASS",
      "GALLERY",
    ]) {
      assert.equal(isInvitationFeatureKey(key), true, key);
    }
  });

  it("still refuses a key the API does not gate", () => {
    assert.equal(isInvitationFeatureKey("PHOTO_BOOTH"), false);
    assert.equal(isInvitationFeatureKey("rsvp"), false);
  });
});
