# Visual theme «A · Rosa y vino»

Status: **current** (M2 T8t, T8l; S35, S37). The owner approved version 3 of the concept «A · Rosa y vino» on
2026-11-05 (L41 of `odd/tasks/m2-identity.md`). The tokens, fonts, ornaments, shared components, `/ingresar`,
`/cuenta`, and the full concept landing page at `/` (T8l: every section and the draw-on bouquet, with the honest
pre-launch copy the owner approved in L45) are implemented. The administrator pages (T8d: `/admin/ingresar`,
`/admin/activar`, `/admin`) use the same frame and components as the customer pages.

## Principles

- Light backgrounds only, never a dark theme.
- Elegant and warm: wine and pale pink with gold hairlines, a display serif, and a script for accents.
- Ornaments are fine-line botanical engraving in wine and gold, like letterpress invitations. No AI-painted
  flowers ("Flores de línea fina, sin IA").
- Text meets WCAG AA (4.5:1) and component borders reach 3:1. A test enforces both (see Accessibility).

## Color tokens

Every color lives in the `@theme` block of `apps/web/app/globals.css`. Tailwind's default palette is reset
(`--color-*: initial`), so a class such as `bg-orange-50` produces nothing; use the token utilities
(`bg-surface`, `text-ink`, `border-field-border`, `ring-gold/45`, …). Shadows mix their color from the tokens.

| Token | Value | Role |
| --- | --- | --- |
| `background` | `#FFF7F5` | Page background. |
| `surface` | `#FFFFFF` | Cards, panels, fields, and the quiet button. |
| `rose-50` | `#FDEEF2` | Pale pink tint: status notes, the page wash, invalid fields, hover fills. |
| `rose-100` | `#F8D7E0` | Pink tint: note borders, selection, small fills; light text on deep wine. |
| `ink` | `#3B1424` | Text and headings. |
| `muted` | `#6B3A4C` | Secondary text: intros, hints, descriptions. Derived from S35. |
| `placeholder` | `#8A6070` | Field placeholders (from the approved concept); passes 4.5:1 on white and `rose-50`. |
| `primary` | `#8C1C3A` | Wine: buttons, links, eyebrows, focus outlines. |
| `primary-deep` | `#6E1530` | Deep wine: button gradient and hover, error note text, shadows. |
| `on-primary` | `#FFFFFF` | Text on `primary` and `primary-deep`. |
| `field-border` | `#A06E7E` | Field and quiet-button outlines; reaches 3:1 on `surface` and `background`. |
| `rose` | `#E9A3B5` | Flowers, inner card hairline, link underline. |
| `gold` | `#C29A54` | Ornaments and hairlines only, never small text. |
| `leaf` | `#8FAF8C` | Botanicals only. |

The S35 values are fixed by the test; a new color is a new token with a documented role, not a literal in a
class or a stylesheet.

Radii: `rounded-field` (1 rem) for fields and notes, `rounded-panel` (1.6 rem) for the inner card,
`rounded-card` (2 rem) for the outer card frame; buttons are `rounded-full`. Shadows: `shadow-soft` (header and
small cards), `shadow-paper` (the main card), and `shadow-button` (the wine button). The `paper-wash` utility
draws the pale pink wash behind the customer pages; the landing draws its own washes from the same tokens.

## Typography

`apps/web/app/layout.tsx` loads three Google fonts through `next/font/google` (self-hosted at build time, Latin
subset, `display: swap`) and sets their variables on `<html>`; the `@theme inline` block maps them to utilities.

| Utility | Font | Weights | Use |
| --- | --- | --- | --- |
| `font-display` | Cormorant Garamond | 500, 600, normal and italic | Headings, the wordmark's "Invita", large numbers; the italic for the accented words of the landing headings. |
| `font-script` | Great Vibes | 400 | Names and accents only: the wordmark's "Me", the names on the landing's sample stationery, and «Para cada celebración»; couple and guest names on future invitations. Never body text, labels, buttons, or anything a person must read quickly. |
| `font-sans` | Jost | 400, 500 | Interface and body text, labels, buttons, fields (the default body font). |

Add a weight or the italic only when a page uses it, so the build ships no unused font files.

## Ornaments

Static SVG files in `apps/web/public/ornaments/`, adapted from the approved concept's line art (shimmer
animation and draw-on hooks removed, numbers rounded):

| File | Use |
| --- | --- |
| `corner-floral.svg` (about 38 KB, 12 KB gzipped) | A spray of roses, buds, leaves, and gold sprigs in two corners of the customer pages (one flipped); on the landing, the hero, gallery, guest-experience, and closing bouquets, and the drawn hero bouquet with reduced motion. |
| `bouquet-draw.svg` (about 38 KB, 12 KB gzipped) | The same bouquet with its own draw-on CSS, for the landing hero only (see Motion). |
| `garland.svg`, `card-corner.svg`, `arch-sprig.svg`, `envelope-spray.svg`, `doily.svg`, `crest.svg`, `swash.svg`, `petal.svg` | Landing line art: the garland on the sample cards and phones, the corners of the XV card, the sprig on the hero arch, the spray on the envelope, the doilies behind the step medallions, the laurel around the closing seal, the gold underline of «enamoran», and the drifting petals. |
| `icon-*.svg` | Landing line icons: tiara, rings, and balloons for the occasions band; cards, quill, and envelope for the steps; calendar, pin, and heart for the guest experience. |
| `envelope.svg`, `wax-seal.svg`, `crown.svg`, `balloons.svg`, `bunting.svg`, `damask.svg`, `lace-edge.svg`, `paper-fiber.svg`, `deckle-mask.svg` | Sample stationery of the landing: the envelope, the wax seal, the XV crown, the party balloons and bunting, the wine damask band, the lace edge of the occasions band, the paper fibre on every card, and the deckled edge of the garden card. |
| `flourish-divider.svg` | The gold flourish between the eyebrow and the heading. |
| `rose-bud.svg` | The bullet of eyebrows. |
| `wordmark-rose.svg` | The small rose after the wordmark. |

Rules: fine-line engraving in wine (`primary`, `primary-deep`) and gold, with at most a faint `rose` wash; no
filled illustrations or gradients beyond the gold stroke. The one exception is the sample stationery of the
landing, which depicts printed invitations as the approved concept draws them (a wax seal, colored balloons and
bunting, a damask band); it stays on the sample cards and never becomes a page ornament. Ornaments are
decoration, so they render through `Ornament` (`app/_components/ornament.tsx`) as `<img alt="" aria-hidden="true">`
with intrinsic sizes, never carry meaning, and never sit under text where they reduce its contrast. The landing
renders its drawings the same way through `Art` (`app/_components/landing/art.tsx`) and loads the ones below the
first screen lazily. Keep each file under 40 KB.

## Components

- `app/_components/ui.ts`: the shared classes. `primaryButton` (wine with white text, one per form),
  `quietButton` (white pill with a `field-border` outline), `textButton` (underlined wine link), `fieldLabel`,
  `textField`, `fieldHint`, `statusNote` (ink on `rose-50`), `errorNote` (deep wine on white with a wine edge, so
  an error never relies on color alone), and `focusRing`.
- `app/_components/wordmark.tsx`: "Invita" in the display serif, "Me" in the wine script, and the rose; read by
  assistive technology as "InvitaMe".
- `app/_components/ornament.tsx`: the decorative images above.
- `app/_components/customer-shell.tsx`: the frame of `/ingresar`, `/cuenta`, and the administrator pages (the
  paper wash, corner flowers, the header with the wordmark, and one centered card with the eyebrow, flourish,
  heading, and intro).
- `app/_components/sign-out-button.tsx`: the wine «Cerrar sesión» button shared by customers and administrators,
  with its failure note.
- `app/_components/landing/`: the landing sections (`hero.tsx`, `sections.tsx`, `closing.tsx`), the sample
  stationery (`stationery.tsx`), the drawings (`art.tsx`), and the three action shapes (`actions.tsx`):
  `SignInLink` (the wine button to `/ingresar`), `AnchorLink` (a button-shaped link that only scrolls), and
  `ComingSoon` (a «Próximamente» label, never a link or a button). `landing.module.css` holds the concept's
  styles on the tokens: every color is a token or a `color-mix` of tokens, and the hero illustration and sample
  cards scale with container query units.
- The enrollment QR code (`app/admin/activar/qr-code.tsx`) is drawn in `ink` on `surface` with a 4-module quiet
  zone and a gold hairline, the highest-contrast pair, so a phone camera reads it reliably.

## Motion

Motion is decoration and stays short: buttons press to 97 % scale in 150 ms with `ease-out-soft`, and colors
fade on hover. With `prefers-reduced-motion: reduce`, an unlayered rule in `globals.css` ends every transition and
animation at once, and smooth scrolling is enabled only without that preference. The ornament files contain no
animation, except `bouquet-draw.svg`.

The landing moves only `transform` and `opacity`: the sample cards and the hero phone float, sparkles twinkle,
petals drift down behind the illustration, and the guest-experience chip bobs. The concept's moving gold shimmer
is left static, so nothing repaints once the page settles. With reduced motion every animation ends at its final
frame and the petals are hidden.

The hero bouquet draws itself on load without a script: `public/ornaments/bouquet-draw.svg` carries its own CSS.
Each group of strokes is dashed with `pathLength="1"` and its dash offset runs to zero in 1.1 s, staggered by
105 ms (about 2.9 s in total); the shading fades in. At the end the dash is dropped so joins render cleanly, and the
finished drawing is identical to `corner-floral.svg`. Chromium does not pass the page's reduced-motion preference
into an SVG image, so `DrawnBouquet` (`app/_components/landing/art.tsx`) wraps the image in a `<picture>` whose
`(prefers-reduced-motion: reduce)` source is `corner-floral.svg`: with reduced motion the bouquet appears already
drawn.

## Accessibility

- `apps/web/lib/theme/contrast.test.ts` reads the tokens from the `@theme` block and checks, with the WCAG
  relative-luminance helper in `apps/web/lib/theme/contrast.ts`: 4.5:1 for `ink` and `muted` on `background` and
  `surface`, white on `primary` and `primary-deep`, `primary` on `background` and `surface`, placeholders, the
  colors of `statusNote` and `errorNote` (taken from their classes in `ui.ts`), and light pink on deep wine; and
  3:1 for `field-border` on `surface` and `background`. A missing token fails the test.
- Focus is a 2 px wine outline: on `focus-visible` for buttons and links, on every focus for text fields.
- Gold is never used for text that must be read; `ring-gold/*` hairlines are decoration, not component borders.

## Where each piece lives

| Piece | Path |
| --- | --- |
| Tokens, font mapping, `paper-wash`, base styles, reduced motion | `apps/web/app/globals.css` |
| Font loading | `apps/web/app/layout.tsx` |
| Shared classes and components | `apps/web/app/_components/` |
| Ornament files | `apps/web/public/ornaments/` |
| Contrast helper and test | `apps/web/lib/theme/` |
| Themed pages | `apps/web/app/ingresar/`, `apps/web/app/cuenta/`, `apps/web/app/admin/`, `apps/web/app/page.tsx` |
| Landing sections, styles, and drawings | `apps/web/app/_components/landing/` |
| Landing copy and its honesty test (S37) | `apps/web/lib/landing/` |
