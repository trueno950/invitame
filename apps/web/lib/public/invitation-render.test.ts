import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findRenderer, listRendererKeys } from "../renderers/registry.ts";
import { propsCheckKeys, rendererAcceptsProps } from "./invitation-render.ts";

// The guard that turns a drifted renderer snapshot into the guest's friendly 404 (M5 T5; A3). A stored
// snapshot that the renderer refuses is an operational error, not a guest error, so the page must learn
// it *before* React renders the element: a throw during render would become a 500 page instead.

const RENDERER_KEY = "birthday-story-01";

const CONFIGURATION = {
  componentKey: RENDERER_KEY,
  theme: "dinosaurs",
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
      { configuration: { ...CONFIGURATION, theme: "neon" }, content: CONTENT },
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

// The three themed layouts (T6b; S7, S8): the same eight content fields, and a configuration that is exactly
// `{componentKey, theme}`. A refused snapshot must reach the page as `false`, never as a throw.
const THEMED_LAYOUTS = [
  { key: "birthday-map-01", theme: "ice-kingdom" },
  { key: "birthday-poster-01", theme: "blocks-and-pixels" },
  { key: "birthday-story-01", theme: "fairytale-princess" },
] as const;

describe("themed layout props checks", () => {
  it("accepts the published props of every themed layout", () => {
    for (const { key, theme } of THEMED_LAYOUTS) {
      assert.equal(
        rendererAcceptsProps(key, {
          configuration: { componentKey: key, theme },
          content: CONTENT,
        }),
        true,
        key,
      );
    }
  });

  it("refuses a drifted themed snapshot without throwing at the page", () => {
    for (const { key, theme } of THEMED_LAYOUTS) {
      for (const props of [
        { configuration: { componentKey: key, theme: "neon" }, content: CONTENT },
        { configuration: { componentKey: key }, content: CONTENT },
        { configuration: { componentKey: key, theme: 7 }, content: CONTENT },
        {
          configuration: { componentKey: key, theme, palette: "sunset" },
          content: CONTENT,
        },
        { configuration: { componentKey: key, theme }, content: { ...CONTENT, mainPhoto: "x" } },
      ]) {
        assert.equal(
          rendererAcceptsProps(key, props),
          false,
          `${key} ${JSON.stringify(props.configuration)}`,
        );
      }
    }
  });
});

// The two celebration layouts (T7c; S13) use their own content parsers, so the props check must accept their
// published snapshots and refuse a drifted one the same way it refuses a birthday layout's.
const CELEBRATION_LAYOUTS = [
  { key: "baby-shower-classic-01", theme: "teddy-honey" },
  { key: "baptism-classic-01", theme: "dove-olive" },
] as const;

const BABY_SHOWER_CONTENT = {
  hosts: "Mariana y Lucía Ruiz",
  date: "2027-03-13",
  time: "12:00",
  location: "Jardín Las Palmas",
  address: "Av. de los Cedros 88",
  message: "¡Te esperamos!",
  rsvpContact: "Mariana 55 1234 5678",
};

const BAPTISM_CONTENT = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego y Valentina Ortiz",
  godparents: "Andrés Ortiz y Camila Reyes",
  ceremonyPlace: "Parroquia San Miguel",
  ceremonyAddress: "Calle Hidalgo 45",
  ceremonyTime: "11:00",
  receptionPlace: "Casa de los abuelos",
  receptionAddress: "Av. de los Fresnos 210",
  receptionTime: "13:30",
  message: "Acompáñanos.",
  rsvpContact: "Valentina 55 9876 5432",
};

describe("celebration layout props checks", () => {
  it("accepts the published props of both celebration layouts", () => {
    assert.equal(
      rendererAcceptsProps("baby-shower-classic-01", {
        configuration: { componentKey: "baby-shower-classic-01", theme: "teddy-honey" },
        content: BABY_SHOWER_CONTENT,
      }),
      true,
    );
    assert.equal(
      rendererAcceptsProps("baptism-classic-01", {
        configuration: { componentKey: "baptism-classic-01", theme: "dove-olive" },
        content: BAPTISM_CONTENT,
      }),
      true,
    );
  });

  it("refuses a drifted celebration snapshot without throwing at the page", () => {
    for (const { key, theme } of CELEBRATION_LAYOUTS) {
      const content = key === "baby-shower-classic-01" ? BABY_SHOWER_CONTENT : BAPTISM_CONTENT;

      for (const props of [
        { configuration: { componentKey: key, theme: "neon" }, content },
        { configuration: { componentKey: key }, content },
        { configuration: { componentKey: key, theme, palette: "sunset" }, content },
        {
          configuration: { componentKey: key, theme },
          content: { ...content, date: "2027-02-30" },
        },
        { configuration: { componentKey: key, theme }, content: {} },
      ]) {
        assert.equal(
          rendererAcceptsProps(key, props),
          false,
          `${key} ${JSON.stringify(props.configuration)}`,
        );
      }
    }
  });
});

describe("retired single-design snapshot", () => {
  it("refuses the removed single-design snapshot (S11)", () => {
    // T11 deleted `birthday-adventure-01` and its five-variable palette configuration. A stored snapshot of
    // the retired key must be refused before React renders it, whichever shape its configuration has.
    assert.equal(findRenderer("birthday-adventure-01"), undefined);
    for (const configuration of [
      { componentKey: "birthday-adventure-01", palette: "sunset" },
      { componentKey: "birthday-adventure-01", theme: "adventure" },
      { palette: "sunset" },
      "birthday-adventure-01",
    ]) {
      assert.equal(
        rendererAcceptsProps("birthday-adventure-01", { configuration, content: CONTENT }),
        false,
        JSON.stringify(configuration),
      );
    }
  });
});
