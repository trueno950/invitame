import { isInvitationSlug } from "../server/invitations-api.ts";
import { type TextKey, t } from "./dictionary.ts";
import { languageChoicePath, showsLanguageSwitch } from "./guest-locale.ts";
import type { Locale } from "./locale.ts";

/**
 * The ES / EN switch of a guest page (F14; S2.14, L19.2, L19.3), following
 * `design/english-invitation/01-selector-de-idioma.html`: a labelled group of two plain links whose addresses carry
 * `?idioma=`, the active one marked with `aria-current`, and the labels and group name taken from the dictionary of the
 * rendered locale. The page draws it only for an invitation that offers both languages, which is what this view
 * answers nothing for.
 *
 * The links are plain anchors and never client script: each one reaches the route handler that remembers the choice in
 * a cookie and answers a redirect to the clean URL, so the switch works with the script off (L19.3).
 */

/** One language of the switch: its two letters, the address that remembers it, and whether it is the rendered one. */
export interface LanguageSwitchOption {
  readonly label: string;
  readonly href: string;
  readonly current: boolean;
}

/** Everything the switch renders: its accessible group name and its options, in the fixed ES / EN order. */
export interface LanguageSwitchView {
  readonly groupLabel: string;
  readonly options: readonly LanguageSwitchOption[];
}

/** The options of the switch, in the order the artboard draws them, each named by its own dictionary key. */
const OPTIONS: readonly { readonly locale: Locale; readonly key: TextKey }[] = [
  { locale: "es", key: "language.optionEs" },
  { locale: "en", key: "language.optionEn" },
] as const;

/**
 * The switch of one guest page, or nothing at all when the invitation stores a single language (L19.3). A slug that
 * cannot be one draws nothing either, because no link of the switch would name an invitation.
 */
export function languageSwitchView(input: {
  readonly language: unknown;
  readonly locale: Locale;
  readonly slug: string;
  readonly guestToken?: string;
}): LanguageSwitchView | undefined {
  if (!showsLanguageSwitch(input.language) || !isInvitationSlug(input.slug)) {
    return undefined;
  }

  return {
    groupLabel: t(input.locale, "language.group"),
    options: OPTIONS.map((option) => ({
      label: t(input.locale, option.key),
      href: languageChoicePath(input.slug, option.locale, input.guestToken),
      current: option.locale === input.locale,
    })),
  };
}
