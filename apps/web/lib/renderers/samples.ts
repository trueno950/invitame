import { rendererAcceptsProps } from "../public/invitation-render.ts";
import type { RendererProps } from "./registry.ts";

/**
 * The fixed sample content the template chooser previews (T9; S9, T7c; S13). A preview is never a stored
 * screenshot: it is the real, allow-listed renderer rendering one fixed sample per category, with the
 * configuration the published version stores. So a sample has to satisfy every registered renderer's own
 * props parser, and `preview` answers nothing when a renderer refuses it — the chooser then shows that card
 * without a miniature instead of failing the page.
 *
 * The sample is deliberately fictional and Spanish (tú), like the product copy, and its photo is an original
 * illustration drawn as SVG in `public/samples/`: no photograph, no character, no logo, no brand (S4, S5).
 * The address is absolute because the content parser accepts an http(s) URL, and it is built from the origin
 * of the request that renders the page, never from a configurable base URL.
 */

/** One renderer's props for a preview: the version's configuration and the category's sample content. */
export interface SampleInvitation {
  readonly configuration: unknown;
  readonly content: unknown;
}

/** The categories a fixed sample exists for; a category without one only gets cards without miniatures. */
export const SAMPLE_CATEGORY_KEYS = [
  "birthday",
  "baby-shower",
  "baptism",
  "quinceanera",
  "wedding",
] as const;

/** Where each sample image lives under `apps/web/public`. */
export const SAMPLE_IMAGE_PATHS = {
  birthday: "/samples/birthday-mateo.svg",
  "baby-shower": "/samples/baby-shower-sofia.svg",
  baptism: "/samples/baptism-emilia.svg",
  quinceanera: "/samples/quinceanera-valentina.svg",
  wedding: "/samples/wedding-ana-sofia-daniel.svg",
} as const;

/**
 * The sample's photo address for one page origin and one category, or undefined when the origin is not a
 * bare http(s) origin (`requestOrigin` answers only those). A page that has no trustworthy origin renders
 * no miniature.
 */
function sampleImage(category: string, origin: string): string | undefined {
  const image = Object.hasOwn(SAMPLE_IMAGE_PATHS, category)
    ? SAMPLE_IMAGE_PATHS[category as keyof typeof SAMPLE_IMAGE_PATHS]
    : undefined;

  if (image === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(origin);

    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return `${origin}${image}`;
}

/**
 * The fixed sample content of one category (S9, S13), as the renderer's content parser reads it, or
 * undefined when no sample exists for that key. The key is compared by equality and never used as a path.
 */
export function sampleContentFor(categoryKey: string, origin: string): unknown | undefined {
  const mainPhoto = sampleImage(categoryKey, origin);

  if (mainPhoto === undefined) {
    return undefined;
  }

  if (categoryKey === "birthday") {
    return {
      celebrantName: "Mateo",
      age: 7,
      date: "2026-12-05",
      time: "16:30",
      location: "Jardín Los Arcos",
      address: "Av. de las Flores 214, Col. Del Valle, Ciudad de México",
      message: "¡Ven a celebrar conmigo! Habrá juegos, pastel y muchas sorpresas.",
      mainPhoto,
    };
  }

  if (categoryKey === "baby-shower") {
    return {
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
      mainPhoto,
    };
  }

  if (categoryKey === "quinceanera") {
    return sampleQuinceaneraContent(mainPhoto);
  }
  if (categoryKey === "wedding") {
    return sampleWeddingContent(mainPhoto);
  }

  return sampleBaptismContent(mainPhoto);
}

/**
 * The XV años sample of the elegant board (E3c; S4): the same «Valentina Ramírez» the artboard shows, with
 * the lists written one name per line.
 */
function sampleQuinceaneraContent(mainPhoto: string): unknown {
  return {
    celebrantName: "Valentina Ramírez",
    date: "2026-08-15",
    parents: "Miguel Ramírez Alcántara\nAdriana Solís de Ramírez",
    honorSponsors: "Joaquín Esquivel del Valle\nMariana Robles de Esquivel",
    ceremonyPlace: "Parroquia de San Agustín",
    ceremonyAddress: "Calle de los Fresnos 132, San Pedro de los Pinos, Ciudad de México",
    ceremonyTime: "18:00",
    receptionPlace: "Jardín de los Olivos",
    receptionAddress: "Camino Real a Santa Fe 41, Santa Fe, Ciudad de México",
    receptionTime: "20:30",
    dressCode: "Formal · etiqueta",
    message: "Hay días que se esperan toda una vida. El 15 de agosto quiero celebrar contigo.",
    rsvpContact: "Confirma con Adriana al 55 8120 4471",
    giftRegistry: "Mesa de regalos Liverpool · Código 5089 4421",
    mainPhoto,
  };
}

/** The wedding sample of the elegant board (E3c; S4), with the two families and the hashtag. */
function sampleWeddingContent(mainPhoto: string): unknown {
  return {
    coupleNameOne: "Ana Sofía",
    coupleNameTwo: "Daniel",
    date: "2026-09-12",
    firstFamilyParents: "Roberto Sánchez y Elena Vargas",
    secondFamilyParents: "Jorge Medina y Lucía Peña",
    weddingSponsors: "Andrés Reyes\nCamila Reyes",
    ceremonyPlace: "Parroquia de Santa Ana",
    ceremonyAddress: "Av. Juárez 120, Centro, Querétaro",
    ceremonyTime: "17:00",
    receptionPlace: "Hacienda San Gabriel",
    receptionAddress: "Camino a la Hacienda 8, Querétaro",
    receptionTime: "19:30",
    dressCode: "Formal",
    message: "Nos encantaría celebrar contigo el comienzo de nuestra vida juntos.",
    rsvpContact: "Confirma con Ana Sofía al 55 1234 5678",
    giftRegistry: "Mesa de regalos · Código 4471 2205",
    hashtag: "#AnaYDaniel",
    mainPhoto,
  };
}

/** The baptism sample of the board: the ceremony at 11:00 and the reception at 13:30, like the artboards. */
function sampleBaptismContent(mainPhoto: string): unknown {
  return {
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
    mainPhoto,
  };
}

/**
 * The renderer props of a preview, or undefined when there is no sample for the category, the `componentKey`
 * is not a registered renderer, or the renderer refuses the stored configuration or the sample. A caller
 * never parses the content itself: the renderer's own check decides, exactly as the public invitation page
 * does before it renders (`lib/public/invitation-render.ts`).
 */
export function sampleInvitation(
  componentKey: string,
  configuration: unknown,
  categoryKey: string,
  origin: string,
): SampleInvitation | undefined {
  const content = sampleContentFor(categoryKey, origin);

  if (content === undefined) {
    return undefined;
  }

  const props: RendererProps = { configuration, content };

  return rendererAcceptsProps(componentKey, props) ? props : undefined;
}
