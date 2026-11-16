import {
  BABY_SHOWER_CLASSIC_COMPONENT_KEY,
  parseBabyShowerClassicConfiguration,
  parseBabyShowerClassicContent,
} from "../renderers/baby-shower-classic-01.ts";
import {
  BAPTISM_ARCH_COMPONENT_KEY,
  parseBaptismArchConfiguration,
  parseBaptismArchContent,
} from "../renderers/baptism-arch-01.ts";
import {
  BAPTISM_CLASSIC_COMPONENT_KEY,
  parseBaptismClassicConfiguration,
  parseBaptismClassicContent,
} from "../renderers/baptism-classic-01.ts";
import {
  BIRTHDAY_MAP_COMPONENT_KEY,
  parseBirthdayMapConfiguration,
  parseBirthdayMapContent,
} from "../renderers/birthday-map-01.ts";
import {
  BIRTHDAY_POSTER_COMPONENT_KEY,
  parseBirthdayPosterConfiguration,
  parseBirthdayPosterContent,
} from "../renderers/birthday-poster-01.ts";
import {
  BIRTHDAY_STORY_COMPONENT_KEY,
  parseBirthdayStoryConfiguration,
  parseBirthdayStoryContent,
} from "../renderers/birthday-story-01.ts";
import type { RendererProps } from "../renderers/registry.ts";
import { RendererPropsError } from "../renderers/renderer-props-error.ts";
import {
  parseWeddingArchConfiguration,
  parseWeddingArchContent,
  WEDDING_ARCH_COMPONENT_KEY,
} from "../renderers/wedding-arch-01.ts";
import {
  parseXVArchConfiguration,
  parseXVArchContent,
  XV_ARCH_COMPONENT_KEY,
} from "../renderers/xv-arch-01.ts";

/**
 * Whether a registered renderer will accept the stored props of an invitation (M5 T5; A3). A renderer
 * parses its own configuration and content and throws `RendererPropsError` when the snapshot drifted, but
 * that parse runs while React renders the element: a throw there cannot be caught by the page and would
 * answer the guest a 500, and a Server Component may not render its children ahead of time to find out
 * (`react-dom/server` is refused in that bundle). So the check calls the renderer's own exported parsers
 * directly, and the page turns a refused snapshot into `notFound()`.
 *
 * This is a props check, not a second component map: a `componentKey` still becomes a component only in
 * `registry.ts`. Each entry names the parsers of one already-registered renderer, and `propsCheckKeys()`
 * is pinned to `listRendererKeys()` by a test, so registering a renderer without its check fails CI instead
 * of 404ing every one of its invitations. A renderer that is not registered, or has no check, fails closed.
 */

type PropsCheck = (props: RendererProps) => void;

const PROPS_CHECKS: ReadonlyMap<string, PropsCheck> = new Map<string, PropsCheck>([
  [
    BIRTHDAY_MAP_COMPONENT_KEY,
    (props) => {
      parseBirthdayMapConfiguration(props.configuration);
      parseBirthdayMapContent(props.content);
    },
  ],
  [
    BIRTHDAY_POSTER_COMPONENT_KEY,
    (props) => {
      parseBirthdayPosterConfiguration(props.configuration);
      parseBirthdayPosterContent(props.content);
    },
  ],
  [
    BIRTHDAY_STORY_COMPONENT_KEY,
    (props) => {
      parseBirthdayStoryConfiguration(props.configuration);
      parseBirthdayStoryContent(props.content);
    },
  ],
  [
    BABY_SHOWER_CLASSIC_COMPONENT_KEY,
    (props) => {
      parseBabyShowerClassicConfiguration(props.configuration);
      parseBabyShowerClassicContent(props.content);
    },
  ],
  [
    BAPTISM_CLASSIC_COMPONENT_KEY,
    (props) => {
      parseBaptismClassicConfiguration(props.configuration);
      parseBaptismClassicContent(props.content);
    },
  ],
  [
    XV_ARCH_COMPONENT_KEY,
    (props) => {
      parseXVArchConfiguration(props.configuration);
      parseXVArchContent(props.content);
    },
  ],
  [
    WEDDING_ARCH_COMPONENT_KEY,
    (props) => {
      parseWeddingArchConfiguration(props.configuration);
      parseWeddingArchContent(props.content);
    },
  ],
  [
    BAPTISM_ARCH_COMPONENT_KEY,
    (props) => {
      parseBaptismArchConfiguration(props.configuration);
      parseBaptismArchContent(props.content);
    },
  ],
]);

/** The keys this module can check, so a test can keep them equal to the registry's (A3). */
export function propsCheckKeys(): readonly string[] {
  return [...PROPS_CHECKS.keys()];
}

/**
 * Whether the props of `componentKey` satisfy its renderer's contract. A refused snapshot is `false`; any
 * other error is a real bug in the check itself and is rethrown unchanged, so it is not mistaken for a
 * guest's missing page. Every layout shares the one `RendererPropsError`, so a drifted snapshot is refused
 * the same way whichever theme it names.
 */
export function rendererAcceptsProps(componentKey: string, props: RendererProps): boolean {
  const check = PROPS_CHECKS.get(componentKey);

  if (check === undefined) {
    return false;
  }

  try {
    check(props);
    return true;
  } catch (error) {
    if (error instanceof RendererPropsError) {
      return false;
    }
    throw error;
  }
}
