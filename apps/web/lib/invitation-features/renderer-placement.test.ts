import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BabyShowerClassicRenderer } from "../../app/_components/renderers/baby-shower-classic-01/baby-shower-classic-renderer.ts";
import { BaptismArchRenderer } from "../../app/_components/renderers/baptism-arch-01/baptism-arch-renderer.ts";
import { BaptismClassicRenderer } from "../../app/_components/renderers/baptism-classic-01/baptism-classic-renderer.ts";
import { BirthdayMapRenderer } from "../../app/_components/renderers/birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "../../app/_components/renderers/birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "../../app/_components/renderers/birthday-story-01/birthday-story-renderer.ts";
import { WeddingArchRenderer } from "../../app/_components/renderers/wedding-arch-01/wedding-arch-renderer.ts";
import { XVArchRenderer } from "../../app/_components/renderers/xv-arch-01/xv-arch-renderer.ts";
import { BABY_SHOWER_THEMES } from "../renderers/baby-shower-themes.ts";
import { BAPTISM_THEMES } from "../renderers/baptism-themes.ts";
import { BIRTHDAY_THEMES } from "../renderers/birthday-themes.ts";
import { ELEGANT_THEMES } from "../renderers/elegant-themes.ts";
import { findRenderer } from "../renderers/registry.ts";
import type { InvitationFeatures } from "./invitation-features.ts";

// The features block of the guest page lives in each layout's own flow (S4): after the details or the place
// cards, before the message and the RSVP, so a guest reads when and where and then acts on it. An invitation
// without features renders no features block at all.

interface LayoutCase {
  readonly key: string;
  readonly Renderer: (props: RendererProps) => ReactElement;
  readonly themes: readonly string[];
  readonly content: Record<string, unknown>;
  /** The sections in document order once the invitation has features. */
  readonly sectionsWithFeatures: readonly string[];
  /** The sections in document order for the layout's minimal content. */
  readonly minimalSectionsWithFeatures: readonly string[];
  readonly minimal: Record<string, unknown>;
  /** The place names the block must carry for this layout. */
  readonly places: readonly string[];
}

interface RendererProps {
  readonly configuration: unknown;
  readonly content: unknown;
  readonly features?: InvitationFeatures;
  readonly calendarHref?: string;
}

const BIRTHDAY_CONTENT = {
  celebrantName: "Mateo",
  age: 7,
  date: "2026-12-05",
  time: "16:30",
  location: "Jardín Los Arcos",
  address: "Av. de las Flores 214, Ciudad de México",
  mainPhoto: "https://example.com/mateo.svg",
  message: "¡Ven a celebrar conmigo! Habrá juegos y pastel.",
};

const BABY_SHOWER_CONTENT = {
  hosts: "Mariana y Lucía Ruiz",
  babyName: "Sofía",
  genderReveal: true,
  date: "2027-03-13",
  time: "12:00",
  location: "Jardín Las Palmas",
  address: "Av. de los Cedros 88, Ciudad de México",
  giftRegistry: "Mesa de regalos · Código 5123 4471",
  rsvpContact: "Confirma con Mariana al 55 1234 5678",
  message: "¡Te esperamos para celebrar la llegada de Sofía!",
  mainPhoto: "https://example.com/sofia.svg",
};

const BABY_SHOWER_MINIMAL = {
  hosts: "Mariana y Lucía Ruiz",
  date: "2027-03-13",
  time: "12:00",
  location: "Jardín Las Palmas",
  address: "Av. de los Cedros 88, Ciudad de México",
  message: "¡Te esperamos para celebrar!",
  rsvpContact: "Confirma con Mariana al 55 1234 5678",
};

const BAPTISM_CONTENT = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego y Valentina Ortiz",
  godparents: "Andrés Ortiz y Camila Reyes",
  ceremonyPlace: "Parroquia San Miguel",
  ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Casa de los abuelos",
  receptionAddress: "Av. de los Fresnos 210, Querétaro",
  receptionTime: "13:30",
  giftRegistry: "Mesa de regalos · Código 7781 2205",
  rsvpContact: "Confirma con Valentina al 55 9876 5432",
  message: "Acompáñanos a dar la bienvenida a Emilia.",
  mainPhoto: "https://example.com/emilia.svg",
};

const BAPTISM_MINIMAL = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego y Valentina Ortiz",
  godparents: "Andrés Ortiz y Camila Reyes",
  ceremonyPlace: "Parroquia San Miguel",
  ceremonyAddress: "Calle Hidalgo 45, Centro, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Casa de los abuelos",
  receptionAddress: "Av. de los Fresnos 210, Querétaro",
  receptionTime: "13:30",
  message: "Acompáñanos a dar la bienvenida a Emilia.",
  rsvpContact: "Confirma con Valentina al 55 9876 5432",
};

const XV_CONTENT = {
  celebrantName: "Valentina Ramírez",
  date: "2026-08-15",
  parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
  honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
  ceremonyPlace: "Parroquia de San Agustín",
  ceremonyAddress: "Calle de los Fresnos 132, Ciudad de México",
  ceremonyTime: "18:00",
  receptionPlace: "Jardín de los Olivos",
  receptionAddress: "Camino Real a Santa Fe 41, Ciudad de México",
  receptionTime: "20:30",
  dressCode: "Formal · etiqueta",
  message: "Hay días que se esperan toda una vida.",
  rsvpContact: "Adriana Solís · 55 8120 4471",
  mainPhoto: "https://example.com/valentina.svg",
};

const XV_MINIMAL = {
  ...XV_CONTENT,
  mainPhoto: undefined,
};

const WEDDING_CONTENT = {
  coupleNameOne: "Ana Sofía",
  coupleNameTwo: "Daniel",
  date: "2026-09-12",
  firstFamilyParents: "Roberto Sánchez y Elena Vargas",
  secondFamilyParents: "Jorge Medina y Lucía Peña",
  ceremonyPlace: "Parroquia de Santa Ana",
  ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
  ceremonyTime: "17:00",
  receptionPlace: "Hacienda San Gabriel",
  receptionAddress: "Camino a la Hacienda 8, Querétaro",
  receptionTime: "19:30",
  dressCode: "Formal",
  message: "Nos encantaría celebrar contigo.",
  rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
  mainPhoto: "https://example.com/boda.svg",
};

const WEDDING_MINIMAL = {
  coupleNameOne: "Ana Sofía",
  coupleNameTwo: "Daniel",
  date: "2026-09-12",
  ceremonyPlace: "Parroquia de Santa Ana",
  ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
  ceremonyTime: "17:00",
  receptionPlace: "Hacienda San Gabriel",
  receptionAddress: "Camino a la Hacienda 8, Querétaro",
  receptionTime: "19:30",
  dressCode: "Formal",
  message: "Nos encantaría celebrar contigo.",
  rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
};

const BAPTISM_ARCH_CONTENT = {
  ...BAPTISM_CONTENT,
};

const BAPTISM_ARCH_MINIMAL = {
  ...BAPTISM_MINIMAL,
};

const LAYOUTS: readonly LayoutCase[] = [
  {
    key: "birthday-map-01",
    Renderer: BirthdayMapRenderer,
    themes: BIRTHDAY_THEMES,
    content: BIRTHDAY_CONTENT,
    sectionsWithFeatures: ["hero", "route", "features", "message"],
    minimalSectionsWithFeatures: ["hero", "route", "features", "message"],
    minimal: BIRTHDAY_CONTENT,
    places: ["Lugar"],
  },
  {
    key: "birthday-poster-01",
    Renderer: BirthdayPosterRenderer,
    themes: BIRTHDAY_THEMES,
    content: BIRTHDAY_CONTENT,
    sectionsWithFeatures: ["hero", "details", "features", "message"],
    minimalSectionsWithFeatures: ["hero", "details", "features", "message"],
    minimal: BIRTHDAY_CONTENT,
    places: ["Lugar"],
  },
  {
    key: "birthday-story-01",
    Renderer: BirthdayStoryRenderer,
    themes: BIRTHDAY_THEMES,
    content: BIRTHDAY_CONTENT,
    sectionsWithFeatures: ["hero", "details", "place", "features", "message"],
    minimalSectionsWithFeatures: ["hero", "details", "place", "features", "message"],
    minimal: BIRTHDAY_CONTENT,
    places: ["Lugar"],
  },
  {
    key: "baby-shower-classic-01",
    Renderer: BabyShowerClassicRenderer,
    themes: BABY_SHOWER_THEMES,
    content: BABY_SHOWER_CONTENT,
    sectionsWithFeatures: ["hero", "details", "features", "photo", "message", "rsvp"],
    minimalSectionsWithFeatures: ["hero", "details", "features", "message", "rsvp"],
    minimal: BABY_SHOWER_MINIMAL,
    places: ["Lugar"],
  },
  {
    key: "baptism-classic-01",
    Renderer: BaptismClassicRenderer,
    themes: BAPTISM_THEMES,
    content: BAPTISM_CONTENT,
    sectionsWithFeatures: [
      "hero",
      "details",
      "ceremony",
      "reception",
      "features",
      "photo",
      "message",
      "rsvp",
    ],
    minimalSectionsWithFeatures: [
      "hero",
      "details",
      "ceremony",
      "reception",
      "features",
      "message",
      "rsvp",
    ],
    minimal: BAPTISM_MINIMAL,
    places: ["Ceremonia", "Recepción"],
  },
  {
    key: "xv-arch-01",
    Renderer: XVArchRenderer,
    themes: ELEGANT_THEMES,
    content: XV_CONTENT,
    sectionsWithFeatures: [
      "hero",
      "family",
      "ceremony",
      "reception",
      "details",
      "features",
      "message",
      "rsvp",
    ],
    minimalSectionsWithFeatures: [
      "hero",
      "family",
      "ceremony",
      "reception",
      "details",
      "features",
      "message",
      "rsvp",
    ],
    minimal: XV_MINIMAL,
    places: ["Ceremonia", "Recepción"],
  },
  {
    key: "wedding-arch-01",
    Renderer: WeddingArchRenderer,
    themes: ELEGANT_THEMES,
    content: WEDDING_CONTENT,
    sectionsWithFeatures: [
      "hero",
      "family",
      "ceremony",
      "reception",
      "details",
      "features",
      "message",
      "rsvp",
    ],
    minimalSectionsWithFeatures: [
      "hero",
      "ceremony",
      "reception",
      "details",
      "features",
      "message",
      "rsvp",
    ],
    minimal: WEDDING_MINIMAL,
    places: ["Ceremonia", "Recepción"],
  },
  {
    key: "baptism-arch-01",
    Renderer: BaptismArchRenderer,
    themes: ELEGANT_THEMES,
    content: BAPTISM_ARCH_CONTENT,
    sectionsWithFeatures: [
      "hero",
      "family",
      "ceremony",
      "reception",
      "details",
      "features",
      "message",
      "rsvp",
    ],
    minimalSectionsWithFeatures: [
      "hero",
      "family",
      "ceremony",
      "reception",
      "features",
      "message",
      "rsvp",
    ],
    minimal: BAPTISM_ARCH_MINIMAL,
    places: ["Ceremonia", "Recepción"],
  },
];

const FEATURES: InvitationFeatures = {
  timeZone: "America/Mexico_City",
  countdown: true,
  map: true,
  calendar: true,
  whatsapp: { phone: "+525512345678" },
};

const CALENDAR_HREF = "/i/invitacion/calendario.ics";

/** The `data-section` values in document order. */
function sectionsOf(html: string): string[] {
  return [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1] as string);
}

function render(layout: LayoutCase, theme: string, props: Partial<RendererProps> = {}): string {
  return renderToStaticMarkup(
    createElement(layout.Renderer, {
      configuration: { componentKey: layout.key, theme },
      content: layout.content,
      ...props,
    }),
  );
}

describe("features block placement", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} places the block after its details or place cards for every theme`, () => {
      for (const theme of layout.themes) {
        const html = render(layout, theme, { features: FEATURES, calendarHref: CALENDAR_HREF });

        assert.deepEqual(sectionsOf(html), [...layout.sectionsWithFeatures], `${theme} sections`);
        assert.match(html, /data-section="features"[^>]*>[\s\S]*?data-feature="countdown"/);
        assert.match(html, /data-feature="map"/);
        assert.match(html, /data-feature="calendar"/);
        assert.match(html, /data-feature="whatsapp"/);
        assert.equal(
          [...html.matchAll(/data-place="([^"]+)"/g)].map((match) => match[1]).join(","),
          layout.places.join(","),
          `${theme} places`,
        );
        assert.ok(html.includes(`href="${CALENDAR_HREF}"`), `${theme} calendar download`);
      }
    });

    it(`${layout.key} places the block the same way for a minimal invitation`, () => {
      const html = render(layout, layout.themes[0] as string, {
        content: layout.minimal,
        features: FEATURES,
        calendarHref: CALENDAR_HREF,
      });

      assert.deepEqual(sectionsOf(html), [...layout.minimalSectionsWithFeatures]);
    });

    it(`${layout.key} renders no features block when the invitation has no features`, () => {
      const html = render(layout, layout.themes[0] as string);

      assert.doesNotMatch(html, /data-section="features"/);
      assert.doesNotMatch(html, /data-feature=/);
    });

    it(`${layout.key} accepts the features through the renderer registry`, () => {
      const Registered = findRenderer(layout.key);

      assert.ok(Registered, layout.key);
      const html = renderToStaticMarkup(
        createElement(Registered, {
          configuration: { componentKey: layout.key, theme: layout.themes[0] },
          content: layout.content,
          features: FEATURES,
          calendarHref: CALENDAR_HREF,
        }),
      );

      assert.match(html, /data-section="features"/);
      assert.match(html, /data-feature="countdown"/);
    });
  }
});
