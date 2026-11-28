import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { INVITATION_FEATURE_KEYS, isInvitationFeatureKey } from "./invitation-features.ts";

// The web mirrors the API's gated keys (invitation-features S7, m6 S4) so an owned invitation's
// `availableFeatures` reads strictly; a key the API gates but the mirror lacks would refuse the whole body.
describe("implemented feature keys", () => {
  it("mirrors every key the API gates, including the itinerary, the guest list, its QR pass, the gallery, the lodging, the guestbook, the guests' album, the livestream, the opening animation, co-hosts, the access code, and the English invitation", () => {
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
        // Co-hosts (F12; L17.5): a Premium or Deluxe invitation's owner read answers it, so the mirror needs it.
        "CO_HOSTS",
        // The access code (F13; L18.5): a Deluxe invitation's owner read answers it, so the mirror needs it.
        "PASSWORD_PROTECTION",
        // The English invitation (F14; L19.4): every package grants it, so every owner read answers it.
        "ENGLISH_INVITATION",
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
      "CO_HOSTS",
      "PASSWORD_PROTECTION",
      "ENGLISH_INVITATION",
    ]) {
      assert.equal(isInvitationFeatureKey(key), true, key);
    }
  });

  it("still refuses a key the API does not gate", () => {
    assert.equal(isInvitationFeatureKey("PHOTO_BOOTH"), false);
    assert.equal(isInvitationFeatureKey("rsvp"), false);
  });
});
