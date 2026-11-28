import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanGuestPath,
  LANGUAGE_CHOICE_MAX_AGE_SECONDS,
  LANGUAGE_COOKIE,
  languageChoiceOutcome,
  languageChoiceParameters,
  languageChoicePath,
  languageCookie,
  languageCookiePath,
  rememberedLocale,
  requestedLocale,
  resolveGuestLocale,
  showsLanguageSwitch,
} from "./guest-locale.ts";
import { isInvitationLanguage, storedInvitationLanguage } from "./invitation-language.ts";

// The locale of a guest page (F14; L19.2, L19.3): the owner's setting decides whether the guest may choose, the
// `?idioma=` query wins over the remembered cookie, and the cookie is the only thing this product writes for it. The
// rules are pure so the page, the switch, and the one route handler that sets the cookie all read the same decision.

const SLUG = "ana-y-luis";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

describe("the language an invitation stores (F14; L19.1)", () => {
  it("accepts only the three stored values and reads anything else as Spanish", () => {
    for (const value of ["es", "es-en", "en"]) {
      assert.equal(isInvitationLanguage(value), true, value);
    }
    for (const value of ["ES", "es-MX", "", null, undefined, 3, {}]) {
      assert.equal(isInvitationLanguage(value), false, String(value));
      assert.equal(storedInvitationLanguage(value), "es", String(value));
    }
  });
});

describe("which fixed language a stored choice renders (F14; L19.2, L19.3)", () => {
  it("offers the switch only to an invitation that stores both languages", () => {
    assert.equal(showsLanguageSwitch("es-en"), true);
    assert.equal(showsLanguageSwitch("es"), false);
    assert.equal(showsLanguageSwitch("en"), false);
    assert.equal(showsLanguageSwitch(undefined), false);
  });
});

describe("the locale of one guest page (F14; L19.2, L19.3)", () => {
  it("always answers the owner's one language when the invitation stores only one", () => {
    // Spanish only: neither the query nor a stored cookie changes it.
    assert.equal(resolveGuestLocale({ language: "es", requested: "en", remembered: "en" }), "es");
    // English only: the switch is never shown, and a remembered Spanish value is not a guest choice.
    assert.equal(resolveGuestLocale({ language: "en", requested: "es", remembered: "es" }), "en");
    // An absent value is an API written before F14: the page renders Spanish and offers no choice (L19.5, L20).
    assert.equal(
      resolveGuestLocale({ language: undefined, requested: "en", remembered: "en" }),
      "es",
    );
    assert.equal(resolveGuestLocale({ language: "es-MX", remembered: "en" }), "es");
  });

  it("takes the query first, then the cookie, then Spanish when both languages are offered", () => {
    assert.equal(
      resolveGuestLocale({ language: "es-en", requested: "en", remembered: "es" }),
      "en",
    );
    assert.equal(
      resolveGuestLocale({ language: "es-en", requested: "es", remembered: "en" }),
      "es",
    );
    // Nothing asked: the cookie the guest set earlier is the choice.
    assert.equal(resolveGuestLocale({ language: "es-en", remembered: "en" }), "en");
    // Nothing asked and nothing remembered: the product's own language.
    assert.equal(resolveGuestLocale({ language: "es-en" }), "es");
  });

  it("ignores a query or a cookie that is not one of the two locales", () => {
    assert.equal(
      resolveGuestLocale({ language: "es-en", requested: "fr", remembered: "en" }),
      "en",
    );
    assert.equal(resolveGuestLocale({ language: "es-en", requested: "en-US" }), "es");
    assert.equal(
      resolveGuestLocale({ language: "es-en", requested: ["en"], remembered: "x" }),
      "es",
    );
    assert.equal(resolveGuestLocale({ language: "es-en", remembered: 7 }), "es");
  });

  it("reads the query and the cookie values strictly", () => {
    assert.equal(requestedLocale({ idioma: "en" }), "en");
    assert.equal(requestedLocale({ idioma: "ES" }), undefined);
    assert.equal(requestedLocale({ idioma: ["en"] }), undefined);
    assert.equal(requestedLocale({}), undefined);
    assert.equal(rememberedLocale("en"), "en");
    assert.equal(rememberedLocale(" es"), undefined);
    assert.equal(rememberedLocale(undefined), undefined);
  });
});

describe("the cookie that remembers a guest's choice (F14; L19.3)", () => {
  it("is scoped to the invitation and lasts a year, and a script may read it", () => {
    const cookie = languageCookie(SLUG, "en", true);

    assert.equal(cookie.name, LANGUAGE_COOKIE);
    assert.equal(cookie.value, "en");
    assert.equal(cookie.path, "/i/ana-y-luis");
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.maxAge, LANGUAGE_CHOICE_MAX_AGE_SECONDS);
    assert.equal(LANGUAGE_CHOICE_MAX_AGE_SECONDS, 365 * 24 * 60 * 60);
    // The choice is not a secret: no `HttpOnly`, so the page itself may read it.
    assert.equal(Object.hasOwn(cookie, "httpOnly"), false);
    assert.equal(cookie.secure, true);
    assert.equal(languageCookie(SLUG, "es", false).secure, false);
    // The personal page of the same invitation reads the same cookie.
    assert.equal(languageCookiePath(SLUG), "/i/ana-y-luis");
  });
});

describe("the request that remembers a language and comes back clean (F14; L19.3)", () => {
  it("sets the cookie and redirects to the clean guest page", () => {
    const outcome = languageChoiceOutcome({
      slug: SLUG,
      parameters: { idioma: "en" },
      secure: true,
    });

    assert.deepEqual(outcome, {
      ok: true,
      target: "/i/ana-y-luis",
      cookie: languageCookie(SLUG, "en", true),
    });
  });

  it("comes back to the guest's own personal page when the choice was made there", () => {
    const outcome = languageChoiceOutcome({
      slug: SLUG,
      parameters: { idioma: "en", invitado: TOKEN },
      secure: false,
    });

    assert.deepEqual(outcome, {
      ok: true,
      target: `/i/ana-y-luis/g/${TOKEN}`,
      cookie: languageCookie(SLUG, "en", false),
    });
  });

  it("never sets a cookie, and still redirects to the clean page, for a value no guest could have chosen", () => {
    assert.deepEqual(
      languageChoiceOutcome({ slug: SLUG, parameters: { idioma: "fr" }, secure: true }),
      { ok: false, target: "/i/ana-y-luis" },
    );
    assert.deepEqual(languageChoiceOutcome({ slug: SLUG, parameters: {}, secure: true }), {
      ok: false,
      target: "/i/ana-y-luis",
    });
  });

  it("drops a personal token it cannot have minted instead of following it", () => {
    assert.deepEqual(
      languageChoiceOutcome({
        slug: SLUG,
        parameters: { idioma: "en", invitado: "../../cuenta" },
        secure: true,
      }),
      { ok: true, target: "/i/ana-y-luis", cookie: languageCookie(SLUG, "en", true) },
    );
  });

  it("names nothing for a slug that cannot be one", () => {
    assert.equal(
      languageChoiceOutcome({ slug: "../cuenta", parameters: { idioma: "en" }, secure: true }),
      undefined,
    );
    assert.equal(cleanGuestPath("../cuenta"), undefined);
    assert.equal(cleanGuestPath(SLUG), "/i/ana-y-luis");
    assert.equal(cleanGuestPath(SLUG, TOKEN), `/i/ana-y-luis/g/${TOKEN}`);
    assert.equal(cleanGuestPath(SLUG, "nope"), "/i/ana-y-luis");
    assert.equal(
      languageChoicePath(SLUG, "en", TOKEN),
      `/i/ana-y-luis/idioma?idioma=en&invitado=${TOKEN}`,
    );
    assert.equal(languageChoicePath(SLUG, "es"), "/i/ana-y-luis/idioma?idioma=es");
  });

  it("reads one value of each parameter and refuses a repeated one, exactly like the shared decision (F14; L19.3)", () => {
    // A repeated `idioma` names no single language, so the handler sets no cookie and still comes back to the clean page:
    // `URLSearchParams.get()` would have taken the first one, which is how a hand-edited link could choose for a guest.
    assert.deepEqual(languageChoiceParameters(new URLSearchParams("idioma=en&idioma=es")), {
      idioma: ["en", "es"],
      invitado: undefined,
    });
    assert.deepEqual(
      languageChoiceOutcome({
        slug: SLUG,
        parameters: languageChoiceParameters(new URLSearchParams("idioma=en&idioma=es")),
        secure: true,
      }),
      { ok: false, target: "/i/ana-y-luis" },
    );
    // One value of each is read as itself, and the personal token still chooses its own page.
    assert.deepEqual(languageChoiceParameters(new URLSearchParams(`idioma=en&invitado=${TOKEN}`)), {
      idioma: "en",
      invitado: TOKEN,
    });
    assert.deepEqual(
      languageChoiceOutcome({
        slug: SLUG,
        parameters: languageChoiceParameters(new URLSearchParams(`idioma=en&invitado=${TOKEN}`)),
        secure: true,
      }),
      { ok: true, target: `/i/ana-y-luis/g/${TOKEN}`, cookie: languageCookie(SLUG, "en", true) },
    );
    // An absent parameter is absent, never an empty string the decision could read as a language.
    assert.deepEqual(languageChoiceParameters(new URLSearchParams("")), {
      idioma: undefined,
      invitado: undefined,
    });
  });
});
