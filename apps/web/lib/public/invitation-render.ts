import {
  BIRTHDAY_ADVENTURE_COMPONENT_KEY,
  parseBirthdayAdventureConfiguration,
  parseBirthdayAdventureContent,
  RendererPropsError,
} from "../renderers/birthday-adventure-01.ts";
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
import { RendererPropsError as ThemedRendererPropsError } from "../renderers/renderer-props-error.ts";

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
    BIRTHDAY_ADVENTURE_COMPONENT_KEY,
    (props) => {
      parseBirthdayAdventureConfiguration(props.configuration);
      parseBirthdayAdventureContent(props.content);
    },
  ],
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
]);

/** The keys this module can check, so a test can keep them equal to the registry's (A3). */
export function propsCheckKeys(): readonly string[] {
  return [...PROPS_CHECKS.keys()];
}

/**
 * Whether the props of `componentKey` satisfy its renderer's contract. A refused snapshot is `false`; any
 * other error is a real bug in the check itself and is rethrown unchanged, so it is not mistaken for a
 * guest's missing page.
 *
 * `birthday-adventure-01` keeps the error class it shipped with (its files are unchanged), and the themed
 * layouts share the one in `renderers/renderer-props-error.ts`; both mean "a drifted snapshot", so both are
 * refused here.
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
    if (error instanceof RendererPropsError || error instanceof ThemedRendererPropsError) {
      return false;
    }
    throw error;
  }
}
