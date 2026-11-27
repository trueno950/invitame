import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OPENING_ANIMATION_COPY,
  OPENING_ANIMATION_DURATION_MS,
  OPENING_ANIMATION_STORAGE_PREFIX,
  openingAnimationCard,
  openingAnimationDecision,
  openingAnimationSkips,
  openingAnimationStorageKey,
  openingAnimationTheme,
  parseOpeningAnimations,
} from "./opening-animation.ts";

// The opening animation of a guest invitation (F10; S2.10, L14.2, L14.4). Every rule that decides whether the
// envelope plays is pure and lives here, so the client island only measures the browser and starts the CSS: the
// switch the public read answered, the guest's own motion preference, and the one play this browser session keeps.

describe("the opening animation decision (F10; L14.2)", () => {
  it("plays when the read says so, the guest allows motion, and this session has not played it yet", () => {
    assert.equal(
      openingAnimationDecision({
        plays: true,
        reducedMotion: false,
        playedThisSession: false,
      }),
      "play",
    );
  });

  it("skips it when the invitation does not play it: the switch is off or the package does not grant it", () => {
    assert.equal(
      openingAnimationDecision({ plays: false, reducedMotion: false, playedThisSession: false }),
      "skip",
    );
  });

  it("skips it entirely when the guest asks for reduced motion, so nothing moves at all", () => {
    assert.equal(
      openingAnimationDecision({ plays: true, reducedMotion: true, playedThisSession: false }),
      "skip",
    );
  });

  it("skips it once this browser session played it, so a reload does not replay it", () => {
    assert.equal(
      openingAnimationDecision({ plays: true, reducedMotion: false, playedThisSession: true }),
      "skip",
    );
  });
});

describe("the opening animation of one invitation (F10; L14.2)", () => {
  it("names one session entry per invitation, so another invitation still plays its own", () => {
    assert.equal(
      openingAnimationStorageKey("invitacion-k7m2qx"),
      `${OPENING_ANIMATION_STORAGE_PREFIX}invitacion-k7m2qx`,
    );
    assert.notEqual(openingAnimationStorageKey("uno"), openingAnimationStorageKey("dos"));
  });

  it("ends in about three seconds, which is the whole animation", () => {
    assert.equal(OPENING_ANIMATION_DURATION_MS, 3_000);
  });

  it("skips at once with Enter, Escape, Space, or the tap of any abbreviation a browser reports", () => {
    for (const key of ["Enter", "Escape", " ", "Space", "Spacebar"]) {
      assert.equal(openingAnimationSkips(key), true, key);
    }
    for (const key of ["a", "Tab", "ArrowDown", "enter"]) {
      assert.equal(openingAnimationSkips(key), false, key);
    }
  });

  it("states the one line the envelope carries, in neutral Spanish", () => {
    assert.equal(OPENING_ANIMATION_COPY.tap, "Toca para abrir");
  });
});

describe("the public opening animation field (F10; L14.4, L20)", () => {
  it("reads a granted and switched-on invitation as playing and a switched-off one as not playing", () => {
    assert.equal(parseOpeningAnimations(true), true);
    assert.equal(parseOpeningAnimations(false), false);
  });

  it("reads an absent field as off, so an older API never hides the invitation behind an overlay (L20)", () => {
    assert.equal(parseOpeningAnimations(undefined), false);
    assert.equal(parseOpeningAnimations(null), false);
  });

  it("reads anything that is not the documented boolean as off too, instead of guessing a state", () => {
    for (const value of ["true", 1, {}, [], "sí"]) {
      assert.equal(parseOpeningAnimations(value), false, JSON.stringify(value));
    }
  });
});

describe("the card of the opening animation (F10; L14.2)", () => {
  it("splits the celebration the invitation already names into the occasion and the celebrant", () => {
    assert.deepEqual(openingAnimationCard("XV años de Valentina Ramírez"), {
      occasion: "XV años",
      name: "Valentina Ramírez",
      initials: "VR",
    });
    assert.deepEqual(openingAnimationCard("Cumpleaños de Mateo"), {
      occasion: "Cumpleaños",
      name: "Mateo",
      initials: "M",
    });
    assert.deepEqual(openingAnimationCard("Bautizo de Sofía"), {
      occasion: "Bautizo",
      name: "Sofía",
      initials: "S",
    });
    // The couple's two names keep their own initials, and the conjunction is never one of them.
    assert.deepEqual(openingAnimationCard("Boda de Ana y Luis"), {
      occasion: "Boda",
      name: "Ana y Luis",
      initials: "AL",
    });
    assert.deepEqual(openingAnimationCard("Baby shower de Sofía"), {
      occasion: "Baby shower",
      name: "Sofía",
      initials: "S",
    });
  });

  it("answers the whole title as the occasion when the celebration states no «de», and needs no name", () => {
    assert.deepEqual(openingAnimationCard("Nuestra boda"), {
      occasion: "Nuestra boda",
      name: "Nuestra boda",
      initials: "",
    });
  });

  it("answers nothing without a celebration to name, so no overlay covers an unknown page", () => {
    assert.equal(openingAnimationCard(undefined), undefined);
    assert.equal(openingAnimationCard(""), undefined);
    assert.equal(openingAnimationCard("   "), undefined);
  });
});

describe("the theme of the opening animation (F10; L14.2)", () => {
  it("reads the colors of the invitation's own theme, so the envelope is the design's", () => {
    const theme = openingAnimationTheme("xv-arch-01", {
      componentKey: "xv-arch-01",
      theme: "ivory-black",
    });

    assert.ok(theme);
    assert.match(theme.colors.accent, /^#[0-9a-f]{6}$/);
    assert.match(theme.colors.background, /^#[0-9a-f]{6}$/);
  });

  it("answers nothing for a layout or a theme this deployment does not know, so no overlay is drawn", () => {
    assert.equal(openingAnimationTheme("birthday-unknown-01", { theme: "ivory-black" }), undefined);
    assert.equal(
      openingAnimationTheme("xv-arch-01", { componentKey: "xv-arch-01", theme: "unknown" }),
      undefined,
    );
    assert.equal(openingAnimationTheme("xv-arch-01", null), undefined);
    assert.equal(openingAnimationTheme("xv-arch-01", { theme: 7 }), undefined);
  });
});
