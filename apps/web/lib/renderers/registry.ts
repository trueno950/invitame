import type { ReactElement } from "react";

import type { Locale } from "../i18n/locale.ts";

import { BabyShowerClassicRenderer } from "../../app/_components/renderers/baby-shower-classic-01/baby-shower-classic-renderer.ts";
import { BaptismArchRenderer } from "../../app/_components/renderers/baptism-arch-01/baptism-arch-renderer.ts";
import { BaptismClassicRenderer } from "../../app/_components/renderers/baptism-classic-01/baptism-classic-renderer.ts";
import { BaptismOrnamentalRenderer } from "../../app/_components/renderers/baptism-ornamental-01/baptism-ornamental-renderer.ts";
import { BirthdayMapRenderer } from "../../app/_components/renderers/birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "../../app/_components/renderers/birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "../../app/_components/renderers/birthday-story-01/birthday-story-renderer.ts";
import { WeddingArchRenderer } from "../../app/_components/renderers/wedding-arch-01/wedding-arch-renderer.ts";
import { WeddingOrnamentalRenderer } from "../../app/_components/renderers/wedding-ornamental-01/wedding-ornamental-renderer.ts";
import { XVArchRenderer } from "../../app/_components/renderers/xv-arch-01/xv-arch-renderer.ts";
import { XVOrnamentalRenderer } from "../../app/_components/renderers/xv-ornamental-01/xv-ornamental-renderer.ts";
import type { InvitationFeatures } from "../invitation-features/invitation-features.ts";
import { BABY_SHOWER_CLASSIC_COMPONENT_KEY } from "./baby-shower-classic-01.ts";
import { BAPTISM_ARCH_COMPONENT_KEY } from "./baptism-arch-01.ts";
import { BAPTISM_CLASSIC_COMPONENT_KEY } from "./baptism-classic-01.ts";
import { BAPTISM_ORNAMENTAL_COMPONENT_KEY } from "./baptism-ornamental-01.ts";
import { BIRTHDAY_MAP_COMPONENT_KEY } from "./birthday-map-01.ts";
import { BIRTHDAY_POSTER_COMPONENT_KEY } from "./birthday-poster-01.ts";
import { BIRTHDAY_STORY_COMPONENT_KEY } from "./birthday-story-01.ts";
import { WEDDING_ARCH_COMPONENT_KEY } from "./wedding-arch-01.ts";
import { WEDDING_ORNAMENTAL_COMPONENT_KEY } from "./wedding-ornamental-01.ts";
import { XV_ARCH_COMPONENT_KEY } from "./xv-arch-01.ts";
import { XV_ORNAMENTAL_COMPONENT_KEY } from "./xv-ornamental-01.ts";

// The web renderer map (M3 T7; S2, S3, S6): the only place where a `componentKey` becomes code. The API owns
// the allow-list and validates a version's schema and configuration before it is published; the web owns
// this componentKey -> component map, and `registry-sync.test.ts` fails when the two key lists differ. The
// map is a static, explicit list of imports: no dynamic import, and no key is ever used as a module path or
// resolved from a catalog string. Adding a renderer means reviewed code here, in the API registry, and a new
// immutable `TemplateVersion` (AGENTS.md). Every layout here is themed (T6b, T7c; S7, S8, S13): the three
// children's birthday layouts, the baby shower layout, the themed baptism layout, and the three arch and
// three ornamental layouts of the elegant line each take their look from an allow-listed theme, so one coded
// layout serves every palette, font, and ornament of its occasion.

/** The props every renderer receives from a `TemplateVersion` snapshot and the invitation data. */
export interface RendererProps {
  readonly configuration: unknown;
  readonly content: unknown;
  /**
   * The content fields the invitation's omitted sections cover (S3, S8.3). A hidden field reads as absent, so
   * a required value the customer switched off never refuses the snapshot, and the layout draws no block for
   * it. Absent means the version omits nothing, which is every version published before the extension.
   */
  readonly hiddenFields?: readonly string[];
  /**
   * The features the API gated for this invitation (S3, S4): countdown, map, calendar, and WhatsApp. Absent
   * when the invitation has none, and then the renderer places no features block and its markup is exactly
   * the markup it produced before the block existed. The public page passes them (F3); a package or a
   * feature name never does.
   */
  readonly features?: InvitationFeatures;
  /** The `.ics` download the public page owns; the features block links to it when it is present. */
  readonly calendarHref?: string;
  /**
   * The locale the guest page renders (F14; L19.2). Absent reads as Spanish, so a renderer's Spanish markup is exactly
   * the markup it produced before the setting existed; only fixed texts follow it, never what the owner wrote.
   */
  readonly locale?: Locale;
}

export type RendererComponent = (props: RendererProps) => ReactElement;

const RENDERERS: ReadonlyMap<string, RendererComponent> = new Map([
  [BIRTHDAY_MAP_COMPONENT_KEY, BirthdayMapRenderer],
  [BIRTHDAY_POSTER_COMPONENT_KEY, BirthdayPosterRenderer],
  [BIRTHDAY_STORY_COMPONENT_KEY, BirthdayStoryRenderer],
  [BABY_SHOWER_CLASSIC_COMPONENT_KEY, BabyShowerClassicRenderer],
  [BAPTISM_CLASSIC_COMPONENT_KEY, BaptismClassicRenderer],
  [XV_ARCH_COMPONENT_KEY, XVArchRenderer],
  [WEDDING_ARCH_COMPONENT_KEY, WeddingArchRenderer],
  [BAPTISM_ARCH_COMPONENT_KEY, BaptismArchRenderer],
  [XV_ORNAMENTAL_COMPONENT_KEY, XVOrnamentalRenderer],
  [WEDDING_ORNAMENTAL_COMPONENT_KEY, WeddingOrnamentalRenderer],
  [BAPTISM_ORNAMENTAL_COMPONENT_KEY, BaptismOrnamentalRenderer],
]);

export function listRendererKeys(): readonly string[] {
  return [...RENDERERS.keys()];
}

/** Returns the component for a registered key, or undefined. `Map` has no prototype lookups. */
export function findRenderer(key: string): RendererComponent | undefined {
  return RENDERERS.get(key);
}
