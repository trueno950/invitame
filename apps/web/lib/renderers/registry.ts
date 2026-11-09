import type { ReactElement } from "react";

import { BirthdayAdventureRenderer } from "../../app/_components/renderers/birthday-adventure-01/birthday-adventure-renderer.ts";
import { BIRTHDAY_ADVENTURE_COMPONENT_KEY } from "./birthday-adventure-01.ts";

// The web renderer map (M3 T7; S2, S3, S6): the only place where a `componentKey` becomes code. The API owns
// the allow-list and validates a version's schema and configuration before it is published; the web owns
// this componentKey -> component map, and `registry-sync.test.ts` fails when the two key lists differ. The
// map is a static, explicit list of imports: no dynamic import, and no key is ever used as a module path or
// resolved from a catalog string. Adding a renderer means reviewed code here, in the API registry, and a new
// immutable `TemplateVersion` (AGENTS.md).

/** The props every renderer receives from a `TemplateVersion` snapshot and the invitation data. */
export interface RendererProps {
  readonly configuration: unknown;
  readonly content: unknown;
}

export type RendererComponent = (props: RendererProps) => ReactElement;

const RENDERERS: ReadonlyMap<string, RendererComponent> = new Map([
  [BIRTHDAY_ADVENTURE_COMPONENT_KEY, BirthdayAdventureRenderer],
]);

export function listRendererKeys(): readonly string[] {
  return [...RENDERERS.keys()];
}

/** Returns the component for a registered key, or undefined. `Map` has no prototype lookups. */
export function findRenderer(key: string): RendererComponent | undefined {
  return RENDERERS.get(key);
}
