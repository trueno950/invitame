import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_INVITATION_LANGUAGE,
  effectiveInvitationLanguage,
  INVITATION_LANGUAGE_ISSUE,
  INVITATION_LANGUAGES,
  isInvitationLanguage,
  storedInvitationLanguage,
  validateInvitationLanguage,
} from "./invitation-language";

// The language of an invitation (F14; S2.14, L19.1, L19.5): three stored values, one allow-list, and the one answer a
// guest page reads. Pure domain rules: no dictionary, no framework, no locale-specific formatting.

describe("invitation languages (F14; L19.1)", () => {
  it("offers exactly the three languages of the owner's editor, Spanish first", () => {
    assert.deepEqual(INVITATION_LANGUAGES, ["es", "es-en", "en"]);
    assert.equal(DEFAULT_INVITATION_LANGUAGE, "es");
    assert.equal(INVITATION_LANGUAGES.includes(DEFAULT_INVITATION_LANGUAGE), true);
  });

  it("accepts only an exact member of the allow-list", () => {
    for (const language of INVITATION_LANGUAGES) {
      assert.equal(isInvitationLanguage(language), true, language);
    }
    // A look-alike never becomes a language: no case folding, no trimming, no near miss.
    for (const value of [
      "ES",
      "En",
      "es ",
      " es",
      "es-EN",
      "es-en ",
      "en-US",
      "es-MX",
      "ingles",
      "both",
      "",
      null,
      undefined,
      42,
      ["es"],
      { language: "es" },
    ]) {
      assert.equal(isInvitationLanguage(value), false, String(value));
    }
  });

  it("reads a row written around the API, or no value at all, as Spanish (L19.5)", () => {
    for (const language of INVITATION_LANGUAGES) {
      assert.equal(storedInvitationLanguage(language), language);
    }
    // The column's default and the answer of an older body: an absent or unknown value is Spanish, never a guess.
    for (const value of [undefined, null, "", "ES", "en-US", 42, ["en"]]) {
      assert.equal(storedInvitationLanguage(value), "es", String(value));
    }
  });

  it("reports one issue for every refused request value, and none for the three languages", () => {
    for (const language of INVITATION_LANGUAGES) {
      assert.deepEqual(validateInvitationLanguage(language), { ok: true, value: language });
    }

    assert.equal(INVITATION_LANGUAGE_ISSUE, "language must be one of es, es-en, en");
    for (const value of [undefined, null, "", "ES", "es-en ", "en-US", 1, true, ["en"]]) {
      assert.deepEqual(validateInvitationLanguage(value), {
        ok: false,
        issue: INVITATION_LANGUAGE_ISSUE,
      });
    }
  });

  it("answers the owner's choice only while the package grants ENGLISH_INVITATION (L19.5)", () => {
    // Granted: the stored choice is what the guest page renders.
    assert.equal(effectiveInvitationLanguage(true, "es"), "es");
    assert.equal(effectiveInvitationLanguage(true, "es-en"), "es-en");
    assert.equal(effectiveInvitationLanguage(true, "en"), "en");
    // Withdrawn: Spanish, without losing the stored choice, so re-granting it restores what the owner picked.
    for (const language of INVITATION_LANGUAGES) {
      assert.equal(effectiveInvitationLanguage(false, language), "es", language);
    }
  });
});
