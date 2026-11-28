import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { languageSwitchView } from "./language-switch.ts";

// The ES / EN switch a guest reads on an invitation that stores both languages (F14; L19.2, L19.3), following
// `design/english-invitation/01-selector-de-idioma.html`: two plain links, the active one marked with `aria-current`,
// and one group label in the rendered language. An invitation that stores one language has no switch at all.

const SLUG = "ana-y-luis";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

describe("the guest's ES / EN switch (F14; L19.2, L19.3)", () => {
  it("draws nothing unless the invitation offers both languages", () => {
    assert.equal(languageSwitchView({ language: "es", locale: "es", slug: SLUG }), undefined);
    assert.equal(languageSwitchView({ language: "en", locale: "en", slug: SLUG }), undefined);
    assert.equal(languageSwitchView({ language: undefined, locale: "es", slug: SLUG }), undefined);
  });

  it("names the group in the rendered language and marks the active one with aria-current", () => {
    const spanish = languageSwitchView({ language: "es-en", locale: "es", slug: SLUG });
    const english = languageSwitchView({ language: "es-en", locale: "en", slug: SLUG });

    assert.deepEqual(spanish, {
      groupLabel: "Idioma",
      options: [
        { label: "ES", href: "/i/ana-y-luis/idioma?idioma=es", current: true },
        { label: "EN", href: "/i/ana-y-luis/idioma?idioma=en", current: false },
      ],
    });
    assert.deepEqual(english, {
      groupLabel: "Language",
      options: [
        { label: "ES", href: "/i/ana-y-luis/idioma?idioma=es", current: false },
        { label: "EN", href: "/i/ana-y-luis/idioma?idioma=en", current: true },
      ],
    });
  });

  it("comes back to the same personal page when the guest chose on their own link", () => {
    const view = languageSwitchView({
      language: "es-en",
      locale: "es",
      slug: SLUG,
      guestToken: TOKEN,
    });

    assert.deepEqual(view?.options, [
      {
        label: "ES",
        href: `/i/ana-y-luis/idioma?idioma=es&invitado=${TOKEN}`,
        current: true,
      },
      {
        label: "EN",
        href: `/i/ana-y-luis/idioma?idioma=en&invitado=${TOKEN}`,
        current: false,
      },
    ]);
  });

  it("draws nothing for a slug that cannot be one", () => {
    assert.equal(
      languageSwitchView({ language: "es-en", locale: "es", slug: "../cuenta" }),
      undefined,
    );
  });
});
