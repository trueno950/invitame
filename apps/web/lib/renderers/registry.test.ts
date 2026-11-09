import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { findRenderer, listRendererKeys } from "./registry.ts";

// The web renderer map (M3 T7; S2, S3, S6): an explicit componentKey -> component allow-list.

describe("web renderer registry", () => {
  it("lists birthday-adventure-01 as the only renderer", () => {
    assert.deepEqual(listRendererKeys(), ["birthday-adventure-01"]);
    assert.equal(typeof findRenderer("birthday-adventure-01"), "function");
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
