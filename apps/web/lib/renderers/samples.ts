import { rendererAcceptsProps } from "../public/invitation-render.ts";
import type { RendererProps } from "./registry.ts";

/**
 * The fixed sample content the template chooser previews (T9; S9). A preview is never a stored screenshot:
 * it is the real, allow-listed renderer rendering one fixed sample per category, with the configuration the
 * published version stores. So a sample has to satisfy every registered renderer's own props parser, and
 * `preview` answers nothing when a renderer refuses it — the chooser then shows that card without a
 * miniature instead of failing the page.
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
export const SAMPLE_CATEGORY_KEYS = ["birthday"] as const;

/** Where the birthday sample image lives under `apps/web/public`. */
export const BIRTHDAY_SAMPLE_IMAGE_PATH = "/samples/birthday-mateo.svg";

/**
 * The sample's photo address for one page origin, or undefined when the origin is not a bare http(s) origin
 * (`requestOrigin` answers only those). A page that has no trustworthy origin renders no miniature.
 */
function sampleImage(origin: string): string | undefined {
  try {
    const parsed = new URL(origin);

    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return `${origin}${BIRTHDAY_SAMPLE_IMAGE_PATH}`;
}

/**
 * The fixed sample content of one category (S9), as the renderer's content parser reads it, or undefined when
 * no sample exists for that key. The key is compared by equality and never used as a property name or a path.
 */
export function sampleContentFor(categoryKey: string, origin: string): unknown | undefined {
  if (categoryKey !== "birthday") {
    return undefined;
  }

  const mainPhoto = sampleImage(origin);

  if (mainPhoto === undefined) {
    return undefined;
  }

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
