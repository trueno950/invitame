import type { ReactElement } from "react";

import { BabyShowerClassicRenderer } from "../../app/_components/renderers/baby-shower-classic-01/baby-shower-classic-renderer.ts";
import { BaptismClassicRenderer } from "../../app/_components/renderers/baptism-classic-01/baptism-classic-renderer.ts";
import { BirthdayMapRenderer } from "../../app/_components/renderers/birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "../../app/_components/renderers/birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "../../app/_components/renderers/birthday-story-01/birthday-story-renderer.ts";
import type { InvitationFeatures } from "../invitation-features/invitation-features.ts";
import { BABY_SHOWER_CLASSIC_COMPONENT_KEY } from "./baby-shower-classic-01.ts";
import { BAPTISM_CLASSIC_COMPONENT_KEY } from "./baptism-classic-01.ts";
import { BIRTHDAY_MAP_COMPONENT_KEY } from "./birthday-map-01.ts";
import { BIRTHDAY_POSTER_COMPONENT_KEY } from "./birthday-poster-01.ts";
import { BIRTHDAY_STORY_COMPONENT_KEY } from "./birthday-story-01.ts";

// The web renderer map (M3 T7; S2, S3, S6): the only place where a `componentKey` becomes code. The API owns
// the allow-list and validates a version's schema and configuration before it is published; the web owns
// this componentKey -> component map, and `registry-sync.test.ts` fails when the two key lists differ. The
// map is a static, explicit list of imports: no dynamic import, and no key is ever used as a module path or
// resolved from a catalog string. Adding a renderer means reviewed code here, in the API registry, and a new
// immutable `TemplateVersion` (AGENTS.md). Every layout here is themed (T6b, T7c; S7, S8, S13): the three
// children's birthday layouts, the baby shower layout, and the themed baptism layout each take their look
// from an allow-listed theme, so one coded layout serves every palette, font, and motif of its occasion.

/** The props every renderer receives from a `TemplateVersion` snapshot and the invitation data. */
export interface RendererProps {
  readonly configuration: unknown;
  readonly content: unknown;
  /**
   * The features the API gated for this invitation (S3, S4): countdown, map, calendar, and WhatsApp. Absent
   * when the invitation has none, and then the renderer places no features block and its markup is exactly
   * the markup it produced before the block existed. The public page passes them (F3); a package or a
   * feature name never does.
   */
  readonly features?: InvitationFeatures;
  /** The `.ics` download the public page owns; the features block links to it when it is present. */
  readonly calendarHref?: string;
}

export type RendererComponent = (props: RendererProps) => ReactElement;

const RENDERERS: ReadonlyMap<string, RendererComponent> = new Map([
  [BIRTHDAY_MAP_COMPONENT_KEY, BirthdayMapRenderer],
  [BIRTHDAY_POSTER_COMPONENT_KEY, BirthdayPosterRenderer],
  [BIRTHDAY_STORY_COMPONENT_KEY, BirthdayStoryRenderer],
  [BABY_SHOWER_CLASSIC_COMPONENT_KEY, BabyShowerClassicRenderer],
  [BAPTISM_CLASSIC_COMPONENT_KEY, BaptismClassicRenderer],
]);

export function listRendererKeys(): readonly string[] {
  return [...RENDERERS.keys()];
}

/** Returns the component for a registered key, or undefined. `Map` has no prototype lookups. */
export function findRenderer(key: string): RendererComponent | undefined {
  return RENDERERS.get(key);
}
