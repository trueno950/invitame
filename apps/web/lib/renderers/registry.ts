import type { ReactElement } from "react";

import { BirthdayMapRenderer } from "../../app/_components/renderers/birthday-map-01/birthday-map-renderer.ts";
import { BirthdayPosterRenderer } from "../../app/_components/renderers/birthday-poster-01/birthday-poster-renderer.ts";
import { BirthdayStoryRenderer } from "../../app/_components/renderers/birthday-story-01/birthday-story-renderer.ts";
import { BIRTHDAY_MAP_COMPONENT_KEY } from "./birthday-map-01.ts";
import { BIRTHDAY_POSTER_COMPONENT_KEY } from "./birthday-poster-01.ts";
import { BIRTHDAY_STORY_COMPONENT_KEY } from "./birthday-story-01.ts";

// The web renderer map (M3 T7; S2, S3, S6): the only place where a `componentKey` becomes code. The API owns
// the allow-list and validates a version's schema and configuration before it is published; the web owns
// this componentKey -> component map, and `registry-sync.test.ts` fails when the two key lists differ. The
// map is a static, explicit list of imports: no dynamic import, and no key is ever used as a module path or
// resolved from a catalog string. Adding a renderer means reviewed code here, in the API registry, and a new
// immutable `TemplateVersion` (AGENTS.md). The three themed layouts (T6b; S7, S8) each take their look from an
// allow-listed theme, so one coded layout serves every children's birthday palette, font, and motif.

/** The props every renderer receives from a `TemplateVersion` snapshot and the invitation data. */
export interface RendererProps {
  readonly configuration: unknown;
  readonly content: unknown;
}

export type RendererComponent = (props: RendererProps) => ReactElement;

const RENDERERS: ReadonlyMap<string, RendererComponent> = new Map([
  [BIRTHDAY_MAP_COMPONENT_KEY, BirthdayMapRenderer],
  [BIRTHDAY_POSTER_COMPONENT_KEY, BirthdayPosterRenderer],
  [BIRTHDAY_STORY_COMPONENT_KEY, BirthdayStoryRenderer],
]);

export function listRendererKeys(): readonly string[] {
  return [...RENDERERS.keys()];
}

/** Returns the component for a registered key, or undefined. `Map` has no prototype lookups. */
export function findRenderer(key: string): RendererComponent | undefined {
  return RENDERERS.get(key);
}
