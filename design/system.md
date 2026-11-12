# InvitaMe design system

Synced on 2026-11-12 from the project sources below. Values are copied from those files; nothing here is invented.
Artboards use only self-contained HTML, so the project fonts are named first and followed by system fallbacks.

## Scope

There are two separate visual layers:

- **App theme** — landing, `/ingresar`, `/cuenta`, and the customer invitation workspace. Source:
  `apps/web/app/globals.css`, `docs/design/theme.md`. The administration pages use a separate zinc palette.
- **Guest invitation designs** — each catalog renderer owns its palette, passed as five CSS variables
  (`--inv-background`, `--inv-surface`, `--inv-soft`, `--inv-ink`, `--inv-accent`). Source:
  `apps/web/lib/renderers/birthday-adventure-01.ts` (`PALETTE_COLORS`),
  `apps/web/app/_components/renderers/birthday-adventure-01/birthday-adventure-renderer.ts`.
  `docs/design/theme.md` does not cover guest invitation designs.

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

## Colors — `birthday-adventure-01` palettes (`apps/web/lib/renderers/birthday-adventure-01.ts`)

| Palette | background | surface | soft | ink | accent |
| --- | --- | --- | --- | --- | --- |
| `sunset` | `#fff4e5` | `#ffffff` | `#ffe0bd` | `#3d1f0f` | `#a8380c` |
| `ocean` | `#e8f6fa` | `#ffffff` | `#c4e8f1` | `#0b2f3d` | `#075c75` |
| `forest` | `#eef6e9` | `#ffffff` | `#d3e9c8` | `#17301a` | `#2a622a` |

Tests require `ink` and `accent` to reach 4.5:1 on `background`, `surface`, and `soft`.

## Typography (`apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `docs/design/theme.md`)

| Token | Family | Loaded weights | Usage |
| --- | --- | --- | --- |
| `font-display` | Cormorant Garamond | 500, 600, italic | Headings |
| `font-script` | Great Vibes | 400 | Names and accents only, never body text |
| `font-sans` | Jost | 400, 500 | Interface and body text |

`birthday-adventure-01` uses only `font-sans` and asks for 600/700, which are not loaded. Its configuration carries
`typography: "rounded"`, which the renderer validates but does not use.

## Radius and shadows (`apps/web/app/globals.css`)

- Radius: `field` 1rem, `panel` 1.6rem, `card` 2rem.
- Shadows: `soft`, `paper`, `button` — wine-tinted (`primary-deep`/`primary`) layered shadows.

## Component rules

- Buttons: pill, `primary` with white text and `shadow-button`; hover `primary-deep`.
- Fields: `field` radius, `field-border` border, `placeholder` color.
- Ornaments: fine-line wine/gold engravings in `apps/web/public/ornaments/`, decorative only (`alt=""`,
  `aria-hidden`), never under text (`docs/design/theme.md`).
- Motion is decoration and ends at once with `prefers-reduced-motion: reduce`.
- Guest renderers: server-rendered, no client script or inline handlers (renderer tests).
