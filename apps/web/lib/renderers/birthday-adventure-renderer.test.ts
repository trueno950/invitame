import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BirthdayAdventureRenderer } from "../../app/_components/renderers/birthday-adventure-01/birthday-adventure-renderer.ts";

// The server-rendered `birthday-adventure-01` invitation (M3 T7; S2, S6): sections follow the configured
// order, every value is escaped, and invalid props fail loudly instead of rendering a broken page.

function configuration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    componentKey: "birthday-adventure-01",
    layout: "adventure",
    palette: "sunset",
    typography: "rounded",
    sectionOrder: ["hero", "details", "message"],
    ...overrides,
  };
}

function content(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    celebrantName: "Mateo",
    age: 7,
    date: "2026-12-05",
    time: "16:30",
    location: "Jardín Los Pinos",
    address: "Calle Reforma 123, Guadalajara",
    mainPhoto: "https://example.com/mateo.jpg",
    message: "Ven a celebrar conmigo.",
    ...overrides,
  };
}

function render(
  configurationOverrides: Record<string, unknown> = {},
  contentOverrides: Record<string, unknown> = {},
): string {
  return renderToStaticMarkup(
    createElement(BirthdayAdventureRenderer, {
      configuration: configuration(configurationOverrides),
      content: content(contentOverrides),
    }),
  );
}

/** The `data-section` values in document order. */
function sectionsOf(html: string): string[] {
  return [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1] as string);
}

describe("BirthdayAdventureRenderer", () => {
  it("renders the hero, details, and message with Spanish labels", () => {
    const html = render();

    assert.deepEqual(sectionsOf(html), ["hero", "details", "message"]);
    assert.match(html, /<h1[^>]*>Mateo<\/h1>/);
    assert.match(html, /Cumple 7 años/);
    assert.match(html, /<img[^>]*src="https:\/\/example\.com\/mateo\.jpg"/);
    assert.match(html, /<img[^>]*alt="Foto de Mateo"/);
    assert.match(
      html,
      /<dt[^>]*>Fecha<\/dt><dd[^>]*><time[^>]*datetime="2026-12-05"[^>]*>5 de diciembre de 2026<\/time>/i,
    );
    assert.match(
      html,
      /<dt[^>]*>Hora<\/dt><dd[^>]*><time[^>]*datetime="16:30"[^>]*>16:30 h<\/time>/i,
    );
    assert.match(html, /<dt[^>]*>Lugar<\/dt><dd[^>]*>Jardín Los Pinos<\/dd>/);
    assert.match(html, /<dt[^>]*>Dirección<\/dt><dd[^>]*>Calle Reforma 123, Guadalajara<\/dd>/);
    assert.match(html, /<h2[^>]*>Mensaje<\/h2>/);
    assert.match(html, /Ven a celebrar conmigo\./);
  });

  it("follows the configured section order and omits sections that are not listed", () => {
    assert.deepEqual(sectionsOf(render({ sectionOrder: ["message", "hero", "details"] })), [
      "message",
      "hero",
      "details",
    ]);

    const heroOnly = render({ sectionOrder: ["hero"] });
    assert.deepEqual(sectionsOf(heroOnly), ["hero"]);
    assert.doesNotMatch(heroOnly, /Ven a celebrar conmigo/);
    assert.doesNotMatch(heroOnly, /Jardín Los Pinos/);
  });

  it("applies the palette as a data attribute and CSS variables", () => {
    for (const palette of ["sunset", "ocean", "forest"]) {
      const html = render({ palette });
      assert.match(html, new RegExp(`data-palette="${palette}"`));
      assert.match(html, /style="[^"]*--inv-accent:#[0-9a-f]{6}/i);
    }
    assert.notEqual(render({ palette: "ocean" }), render({ palette: "forest" }));
  });

  it("escapes content so it cannot add markup", () => {
    const html = render(
      {},
      {
        celebrantName: "<script>alert(1)</script>",
        location: '"><img src=x onerror=alert(1)>',
        address: "Tom & Jerry's <b>place</b>",
        message: "</p><script>alert(2)</script>",
        mainPhoto: "https://example.com/a.jpg?x=1&y=2",
      },
    );

    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /<b>/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Tom &amp; Jerry&#x27;s &lt;b&gt;place&lt;\/b&gt;/);
    assert.match(html, /src="https:\/\/example\.com\/a\.jpg\?x=1&amp;y=2"/);
    assert.match(html, /alt="Foto de &lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  });

  it("ships no client script and no inline event handler", () => {
    const html = render();

    assert.doesNotMatch(html, /<script/);
    assert.doesNotMatch(html, /\son[a-z]+=/);
  });

  it("labels the invitation and ties each section to its heading", () => {
    const html = render();

    assert.match(html, /<article[^>]*aria-label="Invitación de cumpleaños de Mateo"/);
    for (const section of ["hero", "details", "message"]) {
      const labelledBy = new RegExp(`data-section="${section}"[^>]*aria-labelledby="([^"]+)"`).exec(
        html,
      )?.[1];

      assert.ok(labelledBy, `${section} has aria-labelledby`);
      assert.match(html, new RegExp(`id="${labelledBy}"`), `${section} heading exists`);
    }
  });

  it("throws for an unknown palette or section instead of rendering", () => {
    assert.throws(() => render({ palette: "neon" }), {
      name: "RendererPropsError",
      message:
        "Invalid birthday-adventure-01 configuration: configuration.palette must be one of: sunset, ocean, forest",
    });
    assert.throws(() => render({ sectionOrder: ["hero", "footer"] }), {
      name: "RendererPropsError",
      message:
        "Invalid birthday-adventure-01 configuration: configuration.sectionOrder[1] must be one of: hero, details, message",
    });
    assert.throws(() => render({}, { age: "siete" }), {
      name: "RendererPropsError",
      message:
        "Invalid birthday-adventure-01 content: content.age must be an integer from 1 to 120",
    });
  });
});
