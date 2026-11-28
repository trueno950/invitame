import { createElement, type CSSProperties, type ReactElement } from "react";

import type { LanguageSwitchView } from "../../../../lib/i18n/language-switch.ts";
import type { InvitationTheme } from "../../../../lib/renderers/theme-tokens.ts";
import { themeStyle } from "../../../_components/renderers/themed/theme.ts";

/**
 * The ES / EN switch a guest taps on an invitation that offers both languages (F14; S2.14, L19.2, L19.3), following
 * `design/english-invitation/01-selector-de-idioma.html`: one pill at the top right of the invitation, two text labels,
 * and the active one filled with the accent.
 *
 * A server component with no client script: both options are plain links to the route handler that remembers the
 * choice and returns to the clean page, so the switch works with the script off. It paints with the invitation's own
 * `--inv-*` tokens, and the page passes the resolved theme so the pill belongs to the design it sits on; the values
 * behind each token are the artboard's when no theme is known.
 *
 * `.ts` + `createElement` rather than `.tsx`, like every renderer of this product, so `node --test` can render it and
 * read the markup a guest receives.
 */

const h = createElement;

const GROUP_STYLE: CSSProperties = {
  background: "var(--inv-surface, #fffaf7)",
  borderRadius: 999,
  boxShadow: "inset 0 0 0 1px var(--inv-soft, #f1dfd6)",
  display: "inline-flex",
  gap: 2,
  padding: 3,
};

const OPTION_STYLE: CSSProperties = {
  borderRadius: 999,
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  padding: "0.3rem 0.6rem",
  textDecoration: "none",
};

const IDLE_STYLE: CSSProperties = { ...OPTION_STYLE, color: "var(--inv-ink, #6d5752)" };

const CURRENT_STYLE: CSSProperties = {
  ...OPTION_STYLE,
  background: "var(--inv-accent, #9b5a4f)",
  color: "var(--inv-on-accent, #ffffff)",
};

export interface LanguageSwitchProperties {
  /** Everything the switch renders, built from the stored language and the rendered locale (L19.2, L19.3). */
  readonly view: LanguageSwitchView;
  /** The theme of the invitation the pill sits on; absent leaves the artboard's own values in place. */
  readonly theme?: InvitationTheme;
}

export function LanguageSwitch({ view, theme }: LanguageSwitchProperties): ReactElement {
  const group = h(
    "div",
    { "aria-label": view.groupLabel, role: "group", style: GROUP_STYLE },
    ...view.options.map((option) =>
      h(
        "a",
        {
          // The rendered language, announced to a screen reader; the other option is an ordinary link (L19.3).
          "aria-current": option.current ? ("true" as const) : undefined,
          href: option.href,
          key: option.label,
          style: option.current ? CURRENT_STYLE : IDLE_STYLE,
        },
        option.label,
      ),
    ),
  );

  // The theme is applied on a wrapper, so the pill inherits the same variables as the invitation it belongs to.
  return theme === undefined ? group : h("div", { style: themeStyle(theme) }, group);
}
