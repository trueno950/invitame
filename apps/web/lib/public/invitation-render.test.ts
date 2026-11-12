import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listRendererKeys } from "../renderers/registry.ts";
import { propsCheckKeys, rendererAcceptsProps } from "./invitation-render.ts";

// The guard that turns a drifted renderer snapshot into the guest's friendly 404 (M5 T5; A3). A stored
// snapshot that the renderer refuses is an operational error, not a guest error, so the page must learn
// it *before* React renders the element: a throw during render would become a 500 page instead.

const RENDERER_KEY = "birthday-adventure-01";

const CONFIGURATION = {
  componentKey: RENDERER_KEY,
  layout: "adventure",
  palette: "sunset",
  typography: "rounded",
  sectionOrder: ["hero", "details", "message"],
};

const CONTENT = {
  celebrantName: "Ana",
  age: 7,
  date: "2026-12-05",
  time: "16:30",
  location: "Jardín Los Pinos",
  address: "Calle Reforma 123",
  mainPhoto: "https://example.com/ana.jpg",
  message: "Ven a celebrar conmigo.",
};

describe("renderer props checks", () => {
  it("covers exactly the renderers the web registry serves", () => {
    assert.deepEqual([...propsCheckKeys()], [...listRendererKeys()]);
  });

  it("accepts the props the API publishes for a registered renderer", () => {
    assert.equal(
      rendererAcceptsProps(RENDERER_KEY, { configuration: CONFIGURATION, content: CONTENT }),
      true,
    );
  });

  it("refuses props the renderer rejects, without throwing at the page", () => {
    for (const props of [
      { configuration: CONFIGURATION, content: { ...CONTENT, celebrantName: "" } },
      { configuration: CONFIGURATION, content: { ...CONTENT, age: 1.5 } },
      { configuration: { ...CONFIGURATION, palette: "neon" }, content: CONTENT },
      { configuration: null, content: CONTENT },
      { configuration: CONFIGURATION, content: null },
    ]) {
      assert.equal(rendererAcceptsProps(RENDERER_KEY, props), false, JSON.stringify(props));
    }
  });

  it("fails closed for a key that is not registered", () => {
    for (const key of ["unknown", "", "__proto__", "constructor"]) {
      assert.equal(
        rendererAcceptsProps(key, { configuration: CONFIGURATION, content: CONTENT }),
        false,
        JSON.stringify(key),
      );
    }
  });
});
