import { themedLayoutFor } from "../renderers/themed-layouts.ts";
import type { InvitationTheme } from "../renderers/theme-tokens.ts";

/**
 * The opening animation of a guest invitation (F10; S2.10, L14.2, L14.4): the envelope with the seal that covers a
 * published invitation for about three seconds and then gets out of the way. Everything that decides whether it plays
 * is here, pure and tested: the switch the public read answered, the guest's own motion preference, and the one play
 * this browser session keeps per invitation. The client island only measures the browser, starts the CSS, and reads
 * the tap; the overlay itself is `app/_components/invitation-features/opening-animation-island.ts`.
 *
 * It is decoration and nothing else, so every rule fails towards showing the invitation: a page with no client script
 * draws no overlay, a body written before F10 answers no field and reads as off (L20), a guest who asked for reduced
 * motion never sees it, and a theme this deployment does not know draws no envelope at all.
 */

/** The key prefix of the one session entry per invitation: this browser session already played this invitation. */
export const OPENING_ANIMATION_STORAGE_PREFIX = "invitame:opening-animation:";

/**
 * How long the overlay stays, in milliseconds (L14.2). The CSS animation is authored so the seal, the flap, the card,
 * and the envelope all finish within this budget: 3 s in all, and the island removes the overlay at exactly this
 * instant even if the browser dropped a frame.
 */
export const OPENING_ANIMATION_DURATION_MS = 3_000;

/**
 * The keys that skip the animation at once (L14.2): Enter and Escape for a keyboard, and every spelling a browser
 * reports for the space bar. A single tap or click skips it too, and the overlay listens for that itself.
 */
export const OPENING_ANIMATION_SKIP_KEYS = ["Enter", "Escape", " ", "Space", "Spacebar"] as const;

/** The one line the envelope carries, in neutral Spanish (L14.2). */
export const OPENING_ANIMATION_COPY = {
  tap: "Toca para abrir",
} as const;

/** The decision of one page load: draw the overlay now, or show the invitation directly. */
export type OpeningAnimationDecision = "play" | "skip";

/** What decides one page load: the read of the API, the guest's preference, and this session's memory. */
export interface OpeningAnimationInput {
  /**
   * Whether the invitation plays the animation, as the public read answered it: the pinned package grants
   * `OPENING_ANIMATION` and the owner's switch is on (L14.4).
   */
  readonly plays: boolean;
  /** Whether the guest asked the browser for reduced motion, which skips the animation entirely (L14.2). */
  readonly reducedMotion: boolean;
  /** Whether this browser session already played this invitation (L14.2). */
  readonly playedThisSession: boolean;
}

/**
 * Whether this page load draws the overlay (L14.2). It plays only when all three agree: the invitation plays it, the
 * guest allows motion, and this session has not seen it; anything else shows the invitation directly, which is the
 * page the guest came for.
 */
export function openingAnimationDecision(input: OpeningAnimationInput): OpeningAnimationDecision {
  return input.plays && !input.reducedMotion && !input.playedThisSession ? "play" : "skip";
}

/** The session entry that remembers this invitation played in this browser session (L14.2). */
export function openingAnimationStorageKey(invitationSlug: string): string {
  return `${OPENING_ANIMATION_STORAGE_PREFIX}${invitationSlug}`;
}

/** Whether one key event skips the animation at once (L14.2): Enter, Escape, or the space bar. */
export function openingAnimationSkips(key: string): boolean {
  return (OPENING_ANIMATION_SKIP_KEYS as readonly string[]).includes(key);
}

/**
 * The public `features.openingAnimation` field of one invitation (F10; L14.4, L20): true only for the literal `true`.
 * An absent field is an API written before F10, and anything that is not a boolean is no answer this page renders,
 * so both read as off: the guest sees the invitation directly and never an overlay over content that may not exist.
 */
export function parseOpeningAnimations(value: unknown): boolean {
  return value === true;
}

/** The two lines of the card and the letters of the seal, read from the celebration the invitation already names. */
export interface OpeningAnimationCard {
  /** The occasion, drawn in small capitals: «XV años», «Boda», «Cumpleaños». */
  readonly occasion: string;
  /** The celebrant or the couple, drawn in the theme's script face: «Valentina Ramírez», «Ana y Luis». */
  readonly name: string;
  /** The letters of the seal: the initials of up to two names, or none when the title states no person. */
  readonly initials: string;
}

/** The words that join two names: never one of the seal's initials. */
const NAME_CONJUNCTIONS: ReadonlySet<string> = new Set([
  "y",
  "e",
  "de",
  "del",
  "la",
  "las",
  "los",
  "and",
  "&",
]);

/**
 * The card of the opening animation (L14.2), read from the celebration title the shared features already compute
 * (`eventFactsFor`), so the envelope and the rest of the page never disagree about who is celebrating. Every seeded
 * occasion names its person after a «de» («XV años de Valentina»), which is the split; a title that states none is the
 * occasion itself and carries no initials. No title at all answers nothing, and then no overlay is drawn.
 */
export function openingAnimationCard(title: string | undefined): OpeningAnimationCard | undefined {
  const trimmed = title?.trim() ?? "";

  if (trimmed === "") {
    return undefined;
  }

  const split = /^(.+?)\s+de\s+(.+)$/u.exec(trimmed);

  if (split === null) {
    return { occasion: trimmed, name: trimmed, initials: "" };
  }

  const occasion = split[1]?.trim() ?? trimmed;
  const name = split[2]?.trim() ?? trimmed;

  return { occasion, name, initials: initialsOf(name) };
}

/**
 * The initials of the first two names of one celebration: «Valentina Ramírez» is «VR», «Ana y Luis» is «AL», and a
 * single name is its own letter. A conjunction is skipped, and a lower-case name still answers its letters.
 */
function initialsOf(name: string): string {
  const words = name
    .split(/\s+/u)
    .map((word) => word.trim())
    .filter((word) => word !== "" && !NAME_CONJUNCTIONS.has(word.toLowerCase()));

  const initials = words
    .slice(0, 2)
    .map((word) => ([...word][0] ?? "").toUpperCase())
    .join("");

  return initials;
}

/**
 * The theme of the invitation's own design (L14.2, L14.6), so the envelope is drawn with the same seven colors and the
 * same display face as the page it covers. It is resolved from the same allow-listed theme board the renderer reads —
 * never from a catalog name — and an unknown layout or an unknown theme answers nothing, which draws no overlay.
 */
export function openingAnimationTheme(
  componentKey: string,
  configuration: unknown,
): InvitationTheme | undefined {
  const layout = themedLayoutFor(componentKey);

  if (layout === undefined || typeof configuration !== "object" || configuration === null) {
    return undefined;
  }

  const theme = (configuration as Record<string, unknown>).theme;

  if (typeof theme !== "string" || !layout.themes.includes(theme)) {
    return undefined;
  }

  return layout.theme[theme];
}
