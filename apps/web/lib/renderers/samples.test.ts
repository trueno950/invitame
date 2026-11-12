import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BIRTHDAY_THEMES, THEMED_LAYOUT_KEYS } from "./birthday-themes.ts";
import { listRendererKeys } from "./registry.ts";
import { SAMPLE_CATEGORY_KEYS, sampleContentFor, sampleInvitation } from "./samples.ts";

// The fixed sample content of the chooser previews (T9; S9). A preview is the real renderer rendering one
// fixed sample per category, never a stored screenshot, so the sample has to satisfy every registered
// renderer's own props parser: a sample that a renderer refuses would answer the chooser a 500 instead of a
// card without a miniature.

const ORIGIN = "https://invitame.test";
const SAMPLE_IMAGE_PATH = "/samples/birthday-mateo.svg";

/** The configuration the seeded `birthday-adventure-01` version stores, so its parser accepts the sample. */
const ADVENTURE_CONFIGURATION = {
  componentKey: "birthday-adventure-01",
  layout: "adventure",
  palette: "sunset",
  typography: "rounded",
  sectionOrder: ["hero", "details", "message"],
};

/** A configuration one themed layout accepts, for each layout the web knows. */
function themedConfiguration(componentKey: string, theme: string) {
  return { componentKey, theme };
}

describe("chooser sample content", () => {
  it("keeps one fixed birthday sample with the eight content fields", () => {
    assert.deepEqual(SAMPLE_CATEGORY_KEYS, ["birthday"]);
    assert.deepEqual(sampleContentFor("birthday", ORIGIN), {
      celebrantName: "Mateo",
      age: 7,
      date: "2026-12-05",
      time: "16:30",
      location: "Jardín Los Arcos",
      address: "Av. de las Flores 214, Col. Del Valle, Ciudad de México",
      message: "¡Ven a celebrar conmigo! Habrá juegos, pastel y muchas sorpresas.",
      mainPhoto: `${ORIGIN}${SAMPLE_IMAGE_PATH}`,
    });
  });

  it("has no sample for a category nobody wrote one for", () => {
    for (const category of ["wedding", "baby-shower", "quinceanera", "", "constructor"]) {
      assert.equal(sampleContentFor(category, ORIGIN), undefined, category);
    }
  });

  it("answers a preview that every registered renderer accepts", () => {
    const keys = listRendererKeys();
    assert.deepEqual(keys, ["birthday-adventure-01", ...THEMED_LAYOUT_KEYS]);

    for (const componentKey of keys) {
      const configuration = THEMED_LAYOUT_KEYS.some((key) => key === componentKey)
        ? themedConfiguration(componentKey, BIRTHDAY_THEMES[0])
        : ADVENTURE_CONFIGURATION;

      assert.notEqual(
        sampleInvitation(componentKey, configuration, "birthday", ORIGIN),
        undefined,
        componentKey,
      );
    }
  });

  it("answers a preview for every layout and theme combination the catalog publishes", () => {
    for (const componentKey of THEMED_LAYOUT_KEYS) {
      for (const theme of BIRTHDAY_THEMES) {
        assert.deepEqual(
          sampleInvitation(
            componentKey,
            themedConfiguration(componentKey, theme),
            "birthday",
            ORIGIN,
          ),
          {
            configuration: themedConfiguration(componentKey, theme),
            content: sampleContentFor("birthday", ORIGIN),
          },
          `${componentKey} ${theme}`,
        );
      }
    }
  });

  it("answers nothing for a renderer it cannot register, preview, or parse", () => {
    // An unregistered key, a drifted configuration, and a category without a sample all degrade to a card
    // without a miniature instead of throwing while the chooser renders.
    for (const [componentKey, configuration] of [
      ["birthday-nope-01", ADVENTURE_CONFIGURATION],
      ["birthday-map-01", themedConfiguration("birthday-map-01", "no-such-theme")],
      ["birthday-map-01", { theme: "dinosaurs" }],
      ["birthday-map-01", "not-an-object"],
      ["birthday-adventure-01", { componentKey: "birthday-adventure-01" }],
      ["__proto__", ADVENTURE_CONFIGURATION],
    ] as const) {
      assert.equal(
        sampleInvitation(componentKey, configuration, "birthday", ORIGIN),
        undefined,
        componentKey,
      );
    }

    assert.equal(
      sampleInvitation(
        "birthday-map-01",
        themedConfiguration("birthday-map-01", "dinosaurs"),
        "wedding",
        ORIGIN,
      ),
      undefined,
    );
  });

  it("never builds a photo address from an origin a page cannot trust", () => {
    for (const origin of ["", "javascript:alert(1)", "invitame.test", `${ORIGIN}/`, "http://a b"]) {
      assert.equal(
        sampleInvitation(
          "birthday-map-01",
          themedConfiguration("birthday-map-01", "dinosaurs"),
          "birthday",
          origin,
        ),
        undefined,
        origin,
      );
    }
  });
});

describe("the sample image", () => {
  const source = readFileSync(new URL(`../../public${SAMPLE_IMAGE_PATH}`, import.meta.url), "utf8");

  it("is an original illustration with no script and no external image", () => {
    assert.match(source, /^<svg[\s>]/);
    assert.match(source, /viewBox="0 0 \d+ \d+"/);
    assert.doesNotMatch(source, /<script/i);
    assert.doesNotMatch(source, /<image\b/i);
    assert.doesNotMatch(source, /href="https?:/i);
  });
});
