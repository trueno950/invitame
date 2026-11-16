import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BABY_SHOWER_THEMES } from "./baby-shower-themes.ts";
import { BAPTISM_THEMES } from "./baptism-themes.ts";
import { BIRTHDAY_THEMES } from "./birthday-themes.ts";
import { listRendererKeys } from "./registry.ts";
import { SAMPLE_CATEGORY_KEYS, sampleContentFor, sampleInvitation } from "./samples.ts";

// The fixed sample content of the chooser previews (T9; S9). A preview is the real renderer rendering one
// fixed sample per category, never a stored screenshot, so the sample has to satisfy every registered
// renderer's own props parser: a sample that a renderer refuses would answer the chooser a 500 instead of a
// card without a miniature.

const ORIGIN = "https://invitame.test";
const SAMPLE_IMAGE_PATH = "/samples/birthday-mateo.svg";

/** The catalog category, the themes, and the sample image of every layout the web serves (T7c; S13). */
const LAYOUT_SAMPLES = [
  {
    componentKey: "birthday-map-01",
    category: "birthday",
    themes: BIRTHDAY_THEMES,
    image: "/samples/birthday-mateo.svg",
  },
  {
    componentKey: "birthday-poster-01",
    category: "birthday",
    themes: BIRTHDAY_THEMES,
    image: "/samples/birthday-mateo.svg",
  },
  {
    componentKey: "birthday-story-01",
    category: "birthday",
    themes: BIRTHDAY_THEMES,
    image: "/samples/birthday-mateo.svg",
  },
  {
    componentKey: "baby-shower-classic-01",
    category: "baby-shower",
    themes: BABY_SHOWER_THEMES,
    image: "/samples/baby-shower-sofia.svg",
  },
  {
    componentKey: "baptism-classic-01",
    category: "baptism",
    themes: BAPTISM_THEMES,
    image: "/samples/baptism-emilia.svg",
  },
] as const;

/** A configuration one themed layout accepts, for each layout the web knows. */
function themedConfiguration(componentKey: string, theme: string) {
  return { componentKey, theme };
}

describe("chooser sample content", () => {
  it("keeps one fixed sample per occasion the catalog publishes", () => {
    assert.deepEqual(SAMPLE_CATEGORY_KEYS, ["birthday", "baby-shower", "baptism"]);
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

  it("keeps the baby shower and baptism samples of the boards", () => {
    assert.deepEqual(sampleContentFor("baby-shower", ORIGIN), {
      hosts: "Mariana y Lucía Ruiz",
      babyName: "Sofía",
      genderReveal: true,
      date: "2027-03-13",
      time: "12:00",
      location: "Jardín Las Palmas",
      address: "Av. de los Cedros 88, Col. Jardines, Ciudad de México",
      giftRegistry: "Mesa de regalos · Código 5123 4471",
      rsvpContact: "Confirma con Mariana al 55 1234 5678",
      message: "¡Te esperamos para celebrar la llegada de Sofía! Habrá comida, pastel y sorpresas.",
      mainPhoto: `${ORIGIN}/samples/baby-shower-sofia.svg`,
    });
    assert.deepEqual(sampleContentFor("baptism", ORIGIN), {
      celebrantName: "Emilia",
      date: "2027-04-11",
      parents: "Diego y Valentina Ortiz",
      godparents: "Andrés Ortiz y Camila Reyes",
      ceremonyPlace: "Parroquia San Miguel",
      ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
      ceremonyTime: "11:00",
      receptionPlace: "Casa de los abuelos",
      receptionAddress: "Av. de los Fresnos 210, Col. Álamos, Querétaro",
      receptionTime: "13:30",
      giftRegistry: "Mesa de regalos · Código 7781 2205",
      rsvpContact: "Confirma con Valentina al 55 9876 5432",
      message: "Acompáñanos a dar la bienvenida a Emilia en este día tan especial.",
      mainPhoto: `${ORIGIN}/samples/baptism-emilia.svg`,
    });
  });

  it("has no sample for a category nobody wrote one for", () => {
    for (const category of ["wedding", "quinceanera", "graduation", "", "constructor"]) {
      assert.equal(sampleContentFor(category, ORIGIN), undefined, category);
    }
  });

  it("answers a preview that every registered renderer accepts", () => {
    assert.deepEqual(
      LAYOUT_SAMPLES.map((layout) => layout.componentKey),
      listRendererKeys(),
    );

    for (const layout of LAYOUT_SAMPLES) {
      assert.notEqual(
        sampleInvitation(
          layout.componentKey,
          themedConfiguration(layout.componentKey, layout.themes[0]),
          layout.category,
          ORIGIN,
        ),
        undefined,
        layout.componentKey,
      );
    }
  });

  it("answers a preview for every layout and theme combination the catalog publishes", () => {
    for (const layout of LAYOUT_SAMPLES) {
      for (const theme of layout.themes) {
        assert.deepEqual(
          sampleInvitation(
            layout.componentKey,
            themedConfiguration(layout.componentKey, theme),
            layout.category,
            ORIGIN,
          ),
          {
            configuration: themedConfiguration(layout.componentKey, theme),
            content: sampleContentFor(layout.category, ORIGIN),
          },
          `${layout.componentKey} ${theme}`,
        );
      }
    }
    assert.equal(
      LAYOUT_SAMPLES.reduce((total, layout) => total + layout.themes.length, 0),
      38,
    );
  });

  it("answers nothing for a renderer it cannot register, preview, or parse", () => {
    // An unregistered key, a drifted configuration, and a category without a sample all degrade to a card
    // without a miniature instead of throwing while the chooser renders.
    for (const [componentKey, configuration] of [
      ["birthday-nope-01", themedConfiguration("birthday-map-01", BIRTHDAY_THEMES[0])],
      ["birthday-map-01", themedConfiguration("birthday-map-01", "no-such-theme")],
      ["birthday-map-01", { theme: "dinosaurs" }],
      ["birthday-map-01", "not-an-object"],
      ["birthday-poster-01", { componentKey: "birthday-poster-01" }],
      ["__proto__", themedConfiguration("birthday-map-01", BIRTHDAY_THEMES[0])],
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
    for (const layout of LAYOUT_SAMPLES) {
      for (const origin of [
        "",
        "javascript:alert(1)",
        "invitame.test",
        `${ORIGIN}/`,
        "http://a b",
      ]) {
        assert.equal(
          sampleInvitation(
            layout.componentKey,
            themedConfiguration(layout.componentKey, layout.themes[0]),
            layout.category,
            origin,
          ),
          undefined,
          `${layout.componentKey} ${origin}`,
        );
      }
    }
  });
});

describe("the sample images", () => {
  for (const image of [
    SAMPLE_IMAGE_PATH,
    "/samples/baby-shower-sofia.svg",
    "/samples/baptism-emilia.svg",
  ]) {
    const source = readFileSync(new URL(`../../public${image}`, import.meta.url), "utf8");

    it(`${image} is an original illustration with no script and no external image`, () => {
      assert.match(source, /^<svg[\s>]/);
      assert.match(source, /viewBox="0 0 \d+ \d+"/);
      assert.doesNotMatch(source, /<script/i);
      assert.doesNotMatch(source, /<image\b/i);
      assert.doesNotMatch(source, /href="https?:/i);
    });
  }
});
