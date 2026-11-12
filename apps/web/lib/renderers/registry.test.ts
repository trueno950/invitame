import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { findRenderer, listRendererKeys } from "./registry.ts";

// The web renderer map (M3 T7; S2, S3, S6): an explicit componentKey -> component allow-list.

// The three themed layouts (T6b; S7, S8) are additional keys, each its own reviewed component; the
// original `birthday-adventure-01` stays registered and unchanged.
const THEMED_KEYS = ["birthday-map-01", "birthday-poster-01", "birthday-story-01"] as const;

describe("web renderer registry", () => {
  it("lists the adventure renderer and the three themed layouts", () => {
    assert.deepEqual(listRendererKeys(), ["birthday-adventure-01", ...THEMED_KEYS]);
    for (const key of ["birthday-adventure-01", ...THEMED_KEYS]) {
      assert.equal(typeof findRenderer(key), "function", key);
    }
  });

  it("resolves a themed layout key to a component that applies its theme", () => {
    const Renderer = findRenderer("birthday-poster-01");

    assert.ok(Renderer);
    const html = renderToStaticMarkup(
      createElement(Renderer, {
        configuration: { componentKey: "birthday-poster-01", theme: "under-the-sea" },
        content: {
          celebrantName: "Lucía",
          age: 5,
          date: "2026-03-14",
          time: "11:00",
          location: "Parque Alameda",
          address: "Av. Juárez 10",
          mainPhoto: "https://example.com/lucia.jpg",
          message: "Te espero.",
        },
      }),
    );

    assert.match(html, /Lucía/);
    assert.match(html, /data-theme="under-the-sea"/);
  });

  it("treats prototype keys and unknown keys as not registered", () => {
    for (const key of [
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      "unknown",
      "",
      "BIRTHDAY-ADVENTURE-01",
      "BIRTHDAY-MAP-01",
      "birthday-map-02",
    ]) {
      assert.equal(findRenderer(key), undefined, JSON.stringify(key));
    }
  });

  it("resolves a key to a component that renders the invitation", () => {
    const Renderer = findRenderer("birthday-adventure-01");

    assert.ok(Renderer);
    const html = renderToStaticMarkup(
      createElement(Renderer, {
        configuration: {
          componentKey: "birthday-adventure-01",
          layout: "adventure",
          palette: "forest",
          typography: "rounded",
          sectionOrder: ["hero"],
        },
        content: {
          celebrantName: "Lucía",
          age: 5,
          date: "2026-03-14",
          time: "11:00",
          location: "Parque Alameda",
          address: "Av. Juárez 10",
          mainPhoto: "https://example.com/lucia.jpg",
          message: "Te espero.",
        },
      }),
    );

    assert.match(html, /Lucía/);
    assert.match(html, /data-palette="forest"/);
  });
});
