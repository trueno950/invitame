import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { languageSwitchView } from "../../../../lib/i18n/language-switch.ts";
import type { InvitationTheme } from "../../../../lib/renderers/theme-tokens.ts";
import { LanguageSwitch } from "./language-switch.ts";

// The ES / EN switch of an invitation that offers both languages (F14; S2.14, L19.2, L19.3), following
// `design/english-invitation/01-selector-de-idioma.html` with the invitation's own `--inv-*` tokens. It is a server
// component with no client script: two plain links that come back through the one route handler which remembers the
// choice, and the active one marked with `aria-current`.

const SLUG = "ana-y-luis";

const THEME: InvitationTheme = {
  displayName: "Marfil y vino",
  colors: {
    background: "#fffaf7",
    surface: "#ffffff",
    soft: "#f1dfd6",
    ink: "#3d2b28",
    accent: "#9b5a4f",
    decorationOne: "#d8b59a",
    decorationTwo: "#c29a54",
  },
  fontVariable: "--font-cormorant-garamond",
  fontFallback: "Georgia, serif",
  motif: "arch",
  titleSize: "3rem",
};

function render(locale: "es" | "en", theme?: InvitationTheme): string {
  const view = languageSwitchView({ language: "es-en", locale, slug: SLUG });

  assert.ok(view !== undefined);

  return renderToStaticMarkup(
    createElement(LanguageSwitch, theme === undefined ? { view } : { view, theme }),
  );
}

describe("the guest's ES / EN switch (F14; L19.2, L19.3)", () => {
  it("draws one labelled group of two plain links, in the language of the page", () => {
    const spanish = render("es");

    assert.match(spanish, /role="group"/);
    assert.match(spanish, /aria-label="Idioma"/);
    assert.match(spanish, /href="\/i\/ana-y-luis\/idioma\?idioma=es"/);
    assert.match(spanish, /href="\/i\/ana-y-luis\/idioma\?idioma=en"/);
    assert.match(render("en"), /aria-label="Language"/);
    // Text labels, never a flag or an icon: the two letters are the whole control.
    assert.match(spanish, />ES</);
    assert.match(spanish, />EN</);
  });

  it("marks the active language with aria-current and leaves the other one unmarked", () => {
    const spanish = render("es");
    const markers = spanish.match(/aria-current="true"/g) ?? [];

    assert.equal(markers.length, 1);
    // The marked link is ES, and the ES link of the English page is not marked.
    const marked = /<a[^>]*aria-current="true"[^>]*>([^<]*)</.exec(spanish);
    assert.equal(marked?.[1], "ES");

    const englishMarked = /<a[^>]*aria-current="true"[^>]*>([^<]*)</.exec(render("en"));
    assert.equal(englishMarked?.[1], "EN");
  });

  it("paints with the invitation's own tokens, and with the theme's colors when one is known", () => {
    const themed = render("es", THEME);

    assert.match(themed, /var\(--inv-accent/);
    assert.match(themed, /var\(--inv-on-accent/);
    assert.match(themed, /--inv-accent:#9b5a4f/);
    assert.match(themed, /--inv-surface:#ffffff/);
  });

  it("ships no client script and no control of its own", () => {
    const html = render("es");

    assert.equal(html.includes("<script"), false);
    assert.equal(html.includes("<form"), false);
    assert.equal(html.includes("<button"), false);
  });
});
