import { BABY_SHOWER_THEME, BABY_SHOWER_THEMES } from "./baby-shower-themes.ts";
import { BAPTISM_THEME, BAPTISM_THEMES } from "./baptism-themes.ts";
import { BIRTHDAY_THEME, BIRTHDAY_THEMES } from "./birthday-themes.ts";
import { ELEGANT_THEME, ELEGANT_THEMES } from "./elegant-themes.ts";
import type { InvitationTheme } from "./theme-tokens.ts";

/**
 * Every themed layout the web serves, with the themes it accepts, in the order its theme board shows them
 * (T7c; S2, S8, S13). This is the one list that knows which occasion a layout belongs to: a design in the
 * template chooser comes from a version's `componentKey`, its styles from `configuration.theme`, and its
 * occasion from the catalog category — never from a catalog name, and without a code change when a new
 * occasion is seeded. The birthday themes keep their own module, so `THEMED_LAYOUT_KEYS` there continues to
 * name exactly the three birthday layouts.
 */

export interface ThemedLayoutDefinition {
  readonly componentKey: string;
  /** The neutral Spanish title of the design in the chooser, shared by all its themes. */
  readonly title: string;
  /** One sentence describing the layout, never the theme. */
  readonly description: string;
  /** The themes the layout accepts, in the owner's theme-board order. */
  readonly themes: readonly string[];
  /** The palette, font, and motif of each theme, keyed by the allow-listed theme key. */
  readonly theme: Readonly<Record<string, InvitationTheme>>;
}

export const THEMED_LAYOUTS: readonly ThemedLayoutDefinition[] = [
  {
    componentKey: "birthday-map-01",
    title: "Mapa",
    description: "Una ruta de aventura con paradas para la fecha, la hora y el lugar de la fiesta.",
    themes: BIRTHDAY_THEMES,
    theme: BIRTHDAY_THEME,
  },
  {
    componentKey: "birthday-poster-01",
    title: "Cartel",
    description: "Un cartel festivo con la foto y los datos del cumpleaños en primer plano.",
    themes: BIRTHDAY_THEMES,
    theme: BIRTHDAY_THEME,
  },
  {
    componentKey: "birthday-story-01",
    title: "Cuento",
    description: "Un cuento ilustrado que narra la fiesta de cumpleaños paso a paso.",
    themes: BIRTHDAY_THEMES,
    theme: BIRTHDAY_THEME,
  },
  {
    componentKey: "baby-shower-classic-01",
    title: "Clásica",
    description: "Una invitación de baby shower con banda de color, datos y mesa de regalos.",
    themes: BABY_SHOWER_THEMES,
    theme: BABY_SHOWER_THEME,
  },
  {
    componentKey: "baptism-classic-01",
    title: "Clásica",
    description: "Una invitación de bautizo con ceremonia y recepción en su propio bloque.",
    themes: BAPTISM_THEMES,
    theme: BAPTISM_THEME,
  },
  // The elegant line (E3c; S4): one visual direction, «Arco y foto», shipped as three layouts because each
  // occasion keeps its own content schema. All three share the eight elegant themes.
  {
    componentKey: "xv-arch-01",
    title: "Arco y foto",
    description:
      "La foto en un arco con el nombre sobre un velo, y tarjetas elegantes para los datos.",
    themes: ELEGANT_THEMES,
    theme: ELEGANT_THEME,
  },
  {
    componentKey: "wedding-arch-01",
    title: "Arco y foto",
    description: "Un arco con los dos nombres de la pareja y tarjetas finas para la boda.",
    themes: ELEGANT_THEMES,
    theme: ELEGANT_THEME,
  },
  {
    componentKey: "baptism-arch-01",
    title: "Arco y foto",
    description: "Un arco sereno para el bautizo formal, con el nombre del bebé sobre el velo.",
    themes: ELEGANT_THEMES,
    theme: ELEGANT_THEME,
  },
  // The second visual direction of the same formal line (E4b; S5), «Ornamental»: a stationery card with a
  // double rule, a laurel monogram, foil hairlines, and the name in script. Same eight themes, same content.
  {
    componentKey: "xv-ornamental-01",
    title: "Ornamental",
    description:
      "Una tarjeta centrada con doble filete, monograma de laurel y el nombre en script, con la foto en camafeo.",
    themes: ELEGANT_THEMES,
    theme: ELEGANT_THEME,
  },
  {
    componentKey: "wedding-ornamental-01",
    title: "Ornamental",
    description:
      "Papelería clásica para la boda: doble filete, laurel y los dos nombres en script.",
    themes: ELEGANT_THEMES,
    theme: ELEGANT_THEME,
  },
  {
    componentKey: "baptism-ornamental-01",
    title: "Ornamental",
    description:
      "Una tarjeta de papelería fina para el bautizo, con monograma de laurel y foto en camafeo.",
    themes: ELEGANT_THEMES,
    theme: ELEGANT_THEME,
  },
];

/** The layout a `componentKey` names, or undefined for a key without themes. Compared by equality only. */
export function themedLayoutFor(componentKey: string): ThemedLayoutDefinition | undefined {
  return THEMED_LAYOUTS.find((layout) => layout.componentKey === componentKey);
}

/** The theme data of one allow-listed key of a layout, or undefined; never a prototype lookup. */
export function themedLayoutTheme(
  layout: ThemedLayoutDefinition,
  theme: string,
): InvitationTheme | undefined {
  return Object.hasOwn(layout.theme, theme) ? layout.theme[theme] : undefined;
}
