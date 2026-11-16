import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { findRenderer, listRendererKeys } from "./registry.ts";

// The web renderer map (M3 T7; S2, S3, S6): an explicit componentKey -> component allow-list.

// The themed layouts are the whole list (T6b, T7c; S7, S8, S13), each its own reviewed component that takes
// an allow-listed theme: the three children's birthday layouts, the baby shower layout, the themed baptism
// layout, and the three arch layouts of the elegant line (E3c; S4). The single `birthday-adventure-01`
// renderer was deleted (S11).
const THEMED_KEYS = [
  "birthday-map-01",
  "birthday-poster-01",
  "birthday-story-01",
  "baby-shower-classic-01",
  "baptism-classic-01",
  "xv-arch-01",
  "wedding-arch-01",
  "baptism-arch-01",
] as const;

describe("web renderer registry", () => {
  it("lists exactly the eight themed layouts, in registration order", () => {
    assert.deepEqual(listRendererKeys(), [...THEMED_KEYS]);
    for (const key of THEMED_KEYS) {
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
      "BIRTHDAY-POSTER-01",
      "birthday-map-02",
      "birthday-map-00",
    ]) {
      assert.equal(findRenderer(key), undefined, JSON.stringify(key));
    }
  });

  it("resolves a key to a component that renders the invitation", () => {
    const Renderer = findRenderer("birthday-map-01");

    assert.ok(Renderer);
    const html = renderToStaticMarkup(
      createElement(Renderer, {
        configuration: { componentKey: "birthday-map-01", theme: "dinosaurs" },
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
    assert.match(html, /data-theme="dinosaurs"/);
  });
});
