import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Locale } from "../../../lib/i18n/locale.ts";
import type { RendererProps } from "../../../lib/renderers/registry.ts";
import { BABY_SHOWER_THEMES } from "../../../lib/renderers/baby-shower-themes.ts";
import { BAPTISM_THEMES } from "../../../lib/renderers/baptism-themes.ts";
import { BIRTHDAY_THEMES } from "../../../lib/renderers/birthday-themes.ts";
import { ELEGANT_THEMES } from "../../../lib/renderers/elegant-themes.ts";
import { BabyShowerClassicRenderer } from "./baby-shower-classic-01/baby-shower-classic-renderer.ts";
import { BaptismArchRenderer } from "./baptism-arch-01/baptism-arch-renderer.ts";
import { BaptismClassicRenderer } from "./baptism-classic-01/baptism-classic-renderer.ts";
import { BaptismOrnamentalRenderer } from "./baptism-ornamental-01/baptism-ornamental-renderer.ts";
import { BirthdayMapRenderer } from "./birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "./birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "./birthday-story-01/birthday-story-renderer.ts";
import { WeddingArchRenderer } from "./wedding-arch-01/wedding-arch-renderer.ts";
import { WeddingOrnamentalRenderer } from "./wedding-ornamental-01/wedding-ornamental-renderer.ts";
import { XVArchRenderer } from "./xv-arch-01/xv-arch-renderer.ts";
import { XVOrnamentalRenderer } from "./xv-ornamental-01/xv-ornamental-renderer.ts";

/*
 * The fixed texts of every renderer in English (F14; S2.14, L19.2): a guest whose invitation renders English reads
 * kickers, headings, labels, aria labels, and alt texts in English, and no Spanish fixed text survives. What the owner
 * wrote — the names, the message, the address — is passed through as written, which is why the fixtures below write
 * their free text in English: only the renderer's own words are under test here.
 *
 * The Spanish output is pinned where it always was (`lib/renderers/*.test.ts`), so this file also proves that a page
 * that asks for no locale still renders exactly the Spanish markup it rendered before the setting existed.
 */

const BIRTHDAY_CONTENT = {
  celebrantName: "Mateo",
  age: 7,
  date: "2026-12-05",
  time: "16:30",
  location: "Garden of Pines",
  address: "123 Reforma Street, Guadalajara",
  mainPhoto: "https://example.com/mateo.jpg",
  message: "Come celebrate with me.",
};

const BABY_SHOWER_CONTENT = {
  hosts: "Mariana and Lucía Ruiz",
  babyName: "Sofía",
  genderReveal: true,
  date: "2027-03-13",
  time: "12:00",
  location: "Palm Garden",
  address: "88 Cedar Avenue",
  giftRegistry: "Registry code 5123 4471",
  rsvpContact: "Confirm with Mariana at 55 1234 5678",
  message: "Come meet Sofía.",
  mainPhoto: "https://example.com/sofia.jpg",
};

const BAPTISM_CONTENT = {
  celebrantName: "Emilia",
  date: "2027-04-11",
  parents: "Diego and Valentina Ortiz",
  godparents: "Andrés Ortiz and Camila Reyes",
  ceremonyPlace: "San Miguel Parish",
  ceremonyAddress: "45 Hidalgo Street, Querétaro",
  ceremonyTime: "11:00",
  receptionPlace: "Grandparents house",
  receptionAddress: "210 Fresnos Avenue, Querétaro",
  receptionTime: "13:30",
  giftRegistry: "Registry code 7781 2205",
  rsvpContact: "Confirm with Valentina at 55 9876 5432",
  message: "Join us to welcome Emilia.",
  mainPhoto: "https://example.com/emilia.jpg",
};

const XV_CONTENT = {
  celebrantName: "Valentina Ramírez",
  date: "2026-08-15",
  parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
  honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
  chambelanes: "Diego Fuentes\nRodrigo Salas",
  ceremonyPlace: "San Agustín Parish",
  ceremonyAddress: "132 Fresnos Street, Mexico City",
  ceremonyTime: "18:00",
  receptionPlace: "Olive Garden Hall",
  receptionAddress: "41 Santa Fe Road, Mexico City",
  receptionTime: "20:30",
  dressCode: "Formal",
  message: "Some days are worth a lifetime.",
  rsvpContact: "Adriana Solís · 55 8120 4471",
  giftRegistry: "Liverpool 50894421",
  mainPhoto: "https://example.com/valentina.jpg",
};

const WEDDING_CONTENT = {
  coupleNameOne: "Ana Sofía",
  coupleNameTwo: "Daniel",
  date: "2026-09-12",
  firstFamilyParents: "Roberto Sánchez\nElena Vargas",
  secondFamilyParents: "Jorge Medina\nLucía Peña",
  weddingSponsors: "Andrés Reyes\nCamila Reyes",
  ceremonyPlace: "Santa Ana Parish",
  ceremonyAddress: "120 Juárez Avenue, Querétaro",
  ceremonyTime: "17:00",
  receptionPlace: "San Gabriel Hacienda",
  receptionAddress: "8 Hacienda Road, Querétaro",
  receptionTime: "19:30",
  dressCode: "Formal",
  message: "We would love to celebrate with you.",
  rsvpContact: "Confirm with Ana Sofía at 55 1234 5678",
  giftRegistry: "Registry code 4471 2205",
  hashtag: "#AnaYDaniel",
  mainPhoto: "https://example.com/ana-y-daniel.jpg",
};

interface RendererCase {
  readonly key: string;
  readonly Renderer: (props: RendererProps) => ReactElement;
  readonly configuration: Record<string, unknown>;
  readonly content: Record<string, unknown>;
  /** The fixed English texts this renderer must render. */
  readonly english: readonly RegExp[];
  /** The fixed Spanish texts it must not render any more. */
  readonly spanish: readonly RegExp[];
  /** One fixed Spanish text it renders when the page asks for no locale, which must equal `es`. */
  readonly spanishMarker: RegExp;
}

/** The date and clock words of the fixtures, so a case reads as its own day. */
const BIRTHDAY_DATE = /December 5, 2026/;
const BIRTHDAY_CLOCK = /4:30 PM/;

const LAYOUTS: readonly RendererCase[] = [
  {
    key: "birthday-map-01",
    Renderer: BirthdayMapRenderer,
    configuration: { componentKey: "birthday-map-01", theme: BIRTHDAY_THEMES[0] },
    content: BIRTHDAY_CONTENT,
    english: [
      /aria-label="Birthday invitation for Mateo"/,
      /alt="Photo of Mateo"/,
      /invited to an adventure!/,
      /What an expedition!/,
      /The party route/,
      /When\?/,
      /What time\?/,
      /Where\?/,
      /aria-label="Turning 7"/,
      />years</,
      /Message/,
      BIRTHDAY_DATE,
      BIRTHDAY_CLOCK,
    ],
    spanish: [
      /Invitación de cumpleaños/,
      /Foto de/,
      /Te invitamos/,
      /Gran expedición/,
      /La ruta de la fiesta/,
      /¿Cuándo\?/,
      /¿A qué hora\?/,
      /¿Dónde\?/,
      /Cumple 7/,
      /Mensaje/,
      /diciembre/,
      /16:30 h/,
    ],
    spanishMarker: /La ruta de la fiesta/,
  },
  {
    key: "birthday-poster-01",
    Renderer: BirthdayPosterRenderer,
    configuration: { componentKey: "birthday-poster-01", theme: BIRTHDAY_THEMES[0] },
    content: BIRTHDAY_CONTENT,
    english: [
      /aria-label="Birthday invitation for Mateo"/,
      /alt="Photo of Mateo"/,
      /my party!/,
      /Your admission ticket/,
      />Date</,
      />Venue</,
      />Mateo!</,
      /aria-label="Time: 4:30 PM"/,
      /sharp/,
      /years/,
      /of laughs/,
      /Message/,
      BIRTHDAY_DATE,
    ],
    spanish: [
      /Invitación de cumpleaños/,
      /Foto de/,
      /Es mi fiesta/,
      /Tu boleto de entrada/,
      />Fecha</,
      />Lugar</,
      /¡Mateo!/,
      /Hora: 16:30/,
      /horas/,
      /de risas/,
      /Mensaje/,
      /diciembre/,
      /16:30 h/,
    ],
    spanishMarker: /Tu boleto de entrada/,
  },
  {
    key: "birthday-story-01",
    Renderer: BirthdayStoryRenderer,
    configuration: { componentKey: "birthday-story-01", theme: BIRTHDAY_THEMES[0] },
    content: BIRTHDAY_CONTENT,
    english: [
      /aria-label="Birthday invitation for Mateo"/,
      /alt="Photo of Mateo"/,
      /Once upon a time/,
      /Chapter 1 · Details/,
      /Chapter 2 · Venue/,
      /Chapter 3 · Message/,
      /The big day/,
      />Date</,
      />Time</,
      /turns <b[^>]*>7 years<\/b>/,
      /and the party goes on with you/,
      BIRTHDAY_DATE,
      BIRTHDAY_CLOCK,
    ],
    spanish: [
      /Invitación de cumpleaños/,
      /Foto de/,
      /Había una vez/,
      /Capítulo 1 · Detalles/,
      /Capítulo 2 · Lugar/,
      /Capítulo 3 · Mensaje/,
      /El gran día/,
      />Fecha</,
      />Hora</,
      /cumple <b[^>]*>7 años<\/b>/,
      /la fiesta continúa contigo/,
      /diciembre/,
      /16:30 h/,
    ],
    spanishMarker: /Había una vez/,
  },
  {
    key: "baby-shower-classic-01",
    Renderer: BabyShowerClassicRenderer,
    configuration: { componentKey: "baby-shower-classic-01", theme: BABY_SHOWER_THEMES[0] },
    content: BABY_SHOWER_CONTENT,
    english: [
      /aria-label="Baby shower invitation for Sofía"/,
      /Baby shower for/,
      /The details/,
      />Hosts</,
      /Gender reveal/,
      /There will be a reveal!/,
      /Gift registry/,
      /The photo/,
      /alt="Photo of Sofía"/,
      /wait to see you!/,
      /Message/,
      /Confirm your attendance/,
      /March 13, 2027/,
      /12:00 PM/,
    ],
    spanish: [
      /Invitación de baby shower/,
      /Baby shower de/,
      /Los detalles/,
      /Anfitriones/,
      /Revelación de género/,
      /Habrá revelación/,
      /Mesa de regalos/,
      /La foto/,
      /Foto de/,
      /Te esperamos/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /marzo/,
      /12:00 h/,
    ],
    spanishMarker: /Anfitriones/,
  },
  {
    key: "baptism-classic-01",
    Renderer: BaptismClassicRenderer,
    configuration: { componentKey: "baptism-classic-01", theme: BAPTISM_THEMES[0] },
    content: BAPTISM_CONTENT,
    english: [
      /aria-label="Baptism invitation for Emilia"/,
      /Baptism of/,
      /The family/,
      />Parents</,
      />Godparents</,
      />Ceremony</,
      />Reception</,
      /A day to remember/,
      /alt="Photo of Emilia"/,
      /Message/,
      /Confirm your attendance/,
      /April 11, 2027/,
      /11:00 AM/,
    ],
    spanish: [
      /Invitación de bautizo/,
      /Bautizo de/,
      /La familia/,
      />Padres</,
      />Padrinos</,
      />Ceremonia</,
      />Recepción</,
      /Un día para recordar/,
      /Foto de/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /abril/,
      /11:00 h/,
    ],
    spanishMarker: /La familia/,
  },
  {
    key: "xv-arch-01",
    Renderer: XVArchRenderer,
    configuration: { componentKey: "xv-arch-01", theme: ELEGANT_THEMES[0] },
    content: XV_CONTENT,
    english: [
      /aria-label="Quinceañera invitation for Valentina Ramírez"/,
      /My quinceañera/,
      /alt="Photo of Valentina Ramírez"/,
      /The family/,
      />Parents</,
      /Honorary sponsors/,
      /Chambelanes/,
      />Mass</,
      />Reception</,
      /Dress code/,
      /Gift registry/,
      /Details/,
      /Message/,
      /Confirm your attendance/,
      /August 15, 2026/,
      /6:00 PM/,
      /8:30 PM/,
    ],
    spanish: [
      /Mis XV años/,
      /Invitación de XV años/,
      /Foto de/,
      /La familia/,
      />Padres</,
      /Padrinos de honor/,
      />Misa</,
      />Recepción</,
      /Vestimenta/,
      /Mesa de regalos/,
      /Detalles/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /agosto/,
      /18:00 h/,
    ],
    spanishMarker: /Mis XV años/,
  },
  {
    key: "wedding-arch-01",
    Renderer: WeddingArchRenderer,
    configuration: { componentKey: "wedding-arch-01", theme: ELEGANT_THEMES[0] },
    content: WEDDING_CONTENT,
    english: [
      /aria-label="Wedding invitation for Ana Sofía and Daniel"/,
      /Our wedding/,
      /alt="Photo of Ana Sofía and Daniel"/,
      /Family of Ana Sofía/,
      /Family of Daniel/,
      />Sponsors</,
      />Ceremony</,
      />Reception</,
      /Dress code/,
      /Gift registry/,
      /Message/,
      /Confirm your attendance/,
      /September 12, 2026/,
      /5:00 PM/,
    ],
    spanish: [
      /Nuestra boda/,
      /Invitación de boda/,
      /Foto de/,
      /Familia de/,
      />Padrinos</,
      />Ceremonia</,
      />Recepción</,
      /Vestimenta/,
      /Mesa de regalos/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /septiembre/,
      /17:00 h/,
    ],
    spanishMarker: /Nuestra boda/,
  },
  {
    key: "baptism-arch-01",
    Renderer: BaptismArchRenderer,
    configuration: { componentKey: "baptism-arch-01", theme: ELEGANT_THEMES[0] },
    content: BAPTISM_CONTENT,
    english: [
      /aria-label="Baptism invitation for Emilia"/,
      /Baptism of/,
      /alt="Photo of Emilia"/,
      />Parents</,
      />Godparents</,
      />Ceremony</,
      />Reception</,
      /Gift registry/,
      /Message/,
      /Confirm your attendance/,
      /April 11, 2027/,
    ],
    spanish: [
      /Bautizo de/,
      /Invitación de bautizo/,
      /Foto de/,
      />Padres</,
      />Padrinos</,
      />Ceremonia</,
      />Recepción</,
      /Mesa de regalos/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /abril/,
    ],
    spanishMarker: /Bautizo de/,
  },
  {
    key: "xv-ornamental-01",
    Renderer: XVOrnamentalRenderer,
    configuration: { componentKey: "xv-ornamental-01", theme: ELEGANT_THEMES[0] },
    content: XV_CONTENT,
    english: [
      /aria-label="Quinceañera invitation for Valentina Ramírez"/,
      /My quinceañera/,
      /aria-label="Portrait"/,
      /The family/,
      />Parents</,
      /Honorary sponsors/,
      />Mass</,
      />Reception</,
      /Dress code/,
      /Details/,
      /Message/,
      /Confirm your attendance/,
      /August 15, 2026/,
      /6:00 PM/,
    ],
    spanish: [
      /Mis XV años/,
      /Invitación de XV años/,
      /Retrato/,
      /La familia/,
      />Padres</,
      /Padrinos de honor/,
      />Misa</,
      />Recepción</,
      /Vestimenta/,
      /Detalles/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /agosto/,
      /18:00 h/,
    ],
    spanishMarker: /Mis XV años/,
  },
  {
    key: "wedding-ornamental-01",
    Renderer: WeddingOrnamentalRenderer,
    configuration: { componentKey: "wedding-ornamental-01", theme: ELEGANT_THEMES[0] },
    content: WEDDING_CONTENT,
    english: [
      /aria-label="Wedding invitation for Ana Sofía and Daniel"/,
      /Our wedding/,
      /aria-label="Portrait"/,
      /Family of Ana Sofía/,
      />Sponsors</,
      />Ceremony</,
      />Reception</,
      /Dress code/,
      /Message/,
      /Confirm your attendance/,
      /September 12, 2026/,
    ],
    spanish: [
      /Nuestra boda/,
      /Invitación de boda/,
      /Retrato/,
      /Familia de/,
      />Padrinos</,
      />Ceremonia</,
      />Recepción</,
      /Vestimenta/,
      /Mensaje/,
      /Confirma tu asistencia/,
      /septiembre/,
    ],
    spanishMarker: /Nuestra boda/,
  },
  {
    key: "baptism-ornamental-01",
    Renderer: BaptismOrnamentalRenderer,
    configuration: { componentKey: "baptism-ornamental-01", theme: ELEGANT_THEMES[0] },
    content: BAPTISM_CONTENT,
    english: [
      /aria-label="Baptism invitation for Emilia"/,
      /Baptism of/,
      /aria-label="Portrait"/,
      />Parents</,
      />Godparents</,
      />Ceremony</,
      />Reception</,
      /Message/,
      /Confirm your attendance/,
      /April 11, 2027/,
    ],
    spanish: [
      /Bautizo de/,
      /Invitación de bautizo/,
      /Retrato/,
      />Padres</,
      />Padrinos</,
      />Ceremonia</,
      />Recepción</,
      /Mensaje/,
      /Confirma tu asistencia/,
      /abril/,
    ],
    spanishMarker: /Bautizo de/,
  },
];

/** The markup a case renders, with the entities a text assertion should not have to spell. */
function render(layout: RendererCase, locale?: Locale): string {
  return renderToStaticMarkup(
    createElement(layout.Renderer, {
      configuration: layout.configuration,
      content: layout.content,
      ...(locale === undefined ? {} : { locale }),
    }),
  );
}

/** The rendered text as a guest reads it, so an apostrophe is an apostrophe. */
function readable(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

describe("the renderers in English", () => {
  for (const layout of LAYOUTS) {
    it(`${layout.key} writes its fixed texts in English`, () => {
      const html = readable(render(layout, "en"));

      for (const text of layout.english) {
        assert.match(html, text, `${layout.key} ${text}`);
      }
      for (const text of layout.spanish) {
        assert.doesNotMatch(html, text, `${layout.key} still says ${text}`);
      }
    });

    it(`${layout.key} keeps its Spanish markup when the page asks for no locale`, () => {
      const absent = render(layout);
      const spanish = render(layout, "es");

      assert.equal(absent, spanish, layout.key);
      assert.match(readable(absent), layout.spanishMarker, layout.key);
      assert.notEqual(absent, render(layout, "en"), layout.key);
    });
  }
});

describe("the renderers' features block in English", () => {
  // The block's place card reads the facts each renderer builds, so the facts follow the page locale too (L19.2).
  const features = {
    timeZone: "America/Mexico_City",
    countdown: false,
    map: true,
    calendar: true,
    whatsapp: null,
    music: null,
    giftRegistry: false,
    gallery: [],
    itinerary: [],
  } as unknown as NonNullable<RendererProps["features"]>;

  for (const layout of LAYOUTS) {
    it(`${layout.key} hands the locale to the facts its features block reads`, () => {
      const html = readable(
        renderToStaticMarkup(
          createElement(layout.Renderer, {
            configuration: layout.configuration,
            content: layout.content,
            features,
            locale: "en",
          }),
        ),
      );

      assert.doesNotMatch(html, />Lugar</, layout.key);
      assert.doesNotMatch(html, /Cómo llegar/, layout.key);
    });
  }
});
