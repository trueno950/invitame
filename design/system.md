# InvitaMe design system

Synced on 2026-11-30 from the project sources below. Values are copied from those files; nothing here is invented.
Artboards use only self-contained HTML, so the project fonts are named first and followed by system fallbacks.

## Scope

There are two separate visual layers:

- **App theme** — landing, `/ingresar`, `/cuenta`, and the customer invitation workspace. Source:
  `apps/web/app/globals.css`, `docs/design/theme.md`. The administration pages use a separate zinc palette.
- **Guest invitation designs** — every themed layout takes its look from one `InvitationTheme`: seven colors, one
  licensed display font, and one original motif, reached as CSS variables. Source:
  `apps/web/lib/renderers/theme-tokens.ts` (the `InvitationTheme` shape and `THEME_COLOR_ROLES`),
  `apps/web/app/_components/renderers/themed/theme.ts` (`THEME_VARIABLES`, `ON_ACCENT`, `themeStyle`), and the
  per-occasion theme sets: `apps/web/lib/renderers/birthday-themes.ts` (8), `baby-shower-themes.ts` (8),
  `baptism-themes.ts` (6), `elegant-themes.ts` (8). `docs/design/theme.md` does not cover guest invitation designs.

The guest page `/i/<slug>` wraps the renderer in the app's `paper-wash` and a «Hecha con InvitaMe» footer link
(`apps/web/app/i/[slug]/page.tsx`).

## Colors — app theme (`apps/web/app/globals.css`)

| Token | Value | Usage |
| --- | --- | --- |
| `background` | `#fff7f5` | Page background |
| `surface` | `#ffffff` | Cards and panels |
| `rose-50` | `#fdeef2` | Soft wash |
| `rose-100` | `#f8d7e0` | Dividers, selection |
| `ink` | `#3b1424` | Body text |
| `muted` | `#6b3a4c` | Secondary text |
| `placeholder` | `#8a6070` | Input placeholders |
| `primary` | `#8c1c3a` | Buttons (white text) |
| `primary-deep` | `#6e1530` | Button hover |
| `on-primary` | `#ffffff` | Text on primary |
| `field-border` | `#a06e7e` | Component borders at 3:1 |
| `rose` | `#e9a3b5` | Ornaments |
| `gold` | `#c29a54` | Hairlines and ornaments, never small text |
| `leaf` | `#8faf8c` | Botanicals only |

Administration palette (`/admin` only): background `#fafafa`, surface `#ffffff`, subtle `#f4f4f5`, border `#e4e4e7`,
input `#8a8a93`, ink `#18181b`, muted `#52525b`, placeholder `#6b6b73`, primary `#18181b`, primary-deep `#3f3f46`,
on-primary `#fafafa`, danger `#b91c1c`/`#fef2f2`, success `#166534`/`#f0fdf4`, warning `#92400e`/`#fffbeb`.

## Colors — guest invitation themes (`theme-tokens.ts`, `themed/theme.ts`)

Every themed layout reads seven colors plus one contrast partner from its theme, as CSS variables. The
`THEME_COLOR_ROLES` order is: `background`, `surface`, `soft`, `ink`, `accent`, `decorationOne`, `decorationTwo`.

| CSS variable | Role | Usage |
| --- | --- | --- |
| `--inv-background` | `background` | Invitation background layer |
| `--inv-surface` | `surface` | Cards and panels on the invitation |
| `--inv-soft` | `soft` | Soft wash / secondary surface |
| `--inv-ink` | `ink` | Body text |
| `--inv-accent` | `accent` | The single accent color |
| `--inv-decoration-one` | `decorationOne` | First decoration color |
| `--inv-decoration-two` | `decorationTwo` | Second decoration color |
| `--inv-on-accent` | *(constant)* | `#ffffff` — text on `accent`, checked at 4.5:1 |
| `--inv-display` | *(font)* | The theme's licensed display font + fallback stack |

Tests require `ink` and `accent` to reach 4.5:1 on `background`, `surface`, and `soft`; `on-accent` white keeps
4.5:1 on `accent`. Decoration never carries text.

Thirty themes exist across four sets: birthday 8, baby shower 8, baptism 6, elegant 8. Each theme carries a
`displayName` (neutral Spanish), seven `colors`, a `fontVariable`/`fontFallback`, an original `motif`, a fluid
`titleSize`, and optionally a `titleWeight` (a face loaded at one weight is never synthetically emboldened).

## Typography (`apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `docs/design/theme.md`)

| Token | Family | Loaded weights | Usage |
| --- | --- | --- | --- |
| `font-display` | Cormorant Garamond | 500, 600, italic | Headings |
| `font-script` | Great Vibes | 400 | Names and accents only, never body text |
| `font-sans` | Jost | 400, 500 | Interface and body text |

Guest invitation themes load their own licensed display font per theme and use the `font-sans` stack for body text.

## Radius and shadows (`apps/web/app/globals.css`)

- Radius: `field` 1rem, `panel` 1.6rem, `card` 2rem.
- Shadows: `soft`, `paper`, `button` — wine-tinted (`primary-deep`/`primary`) layered shadows.

## Component rules

- Buttons: pill, `primary` with white text and `shadow-button`; hover `primary-deep`.
- Fields: `field` radius, `field-border` border, `placeholder` color.
- Ornaments: fine-line wine/gold engravings in `apps/web/public/ornaments/`, decorative only (`alt=""`,
  `aria-hidden`), never under text (`docs/design/theme.md`).
- Motion is decoration and ends at once with `prefers-reduced-motion: reduce`.
- Guest renderers: server-rendered, no client script or inline handlers (renderer tests); mobile-first and never
  wider than 30rem (`INVITATION_ROOT`).
