# Visual theme «A · Rosa y vino»

Status: **current** (M2 T8t, T8l, T8f; S35, S37, S43). The owner approved version 3 of the concept «A · Rosa y vino» on
2026-11-05 (L41 of `odd/tasks/m2-identity.md`). The tokens, fonts, ornaments, shared components, `/ingresar`,
`/cuenta`, and the full concept landing page at `/` (T8l: every section and the draw-on bouquet, with the honest
pre-launch copy the owner approved in L45) are implemented. The invitation pages reuse the theme in a wide
workspace instead of the centered card (M4 T8; S11, S12), described in [Customer workspace](#customer-workspace).
The administrator pages under `/admin` do not use this
theme: they have their own neutral administration theme, described in [Administration theme](#administration-theme).

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

`apps/web/app/layout.tsx` loads every family through `next/font/local` from woff2 files committed in
`apps/web/app/fonts/` (Latin subset, `display: swap`) and sets their variables on `<html>`; the `@theme inline` block
maps the three product fonts to utilities. The build fetches no font over the network (S43); a unit test in
`apps/web/lib/theme/fonts.test.ts` fails if any `apps/web` source imports `next/font/google` again, if a font file
the layout names is missing, is not woff2, if a file cannot draw the weight the layout declares for it, or if a
family has no license next to it.

Status: **current** (T6b, T7b; S2, S5, S8, S13). Nineteen families are loaded: three for the product interface
and the landing, and sixteen display faces for the guest invitation themes.

| Utility | Font | Weights | Use |
| --- | --- | --- | --- |
| `font-display` | Cormorant Garamond | 500, 600, normal and italic | Headings, the wordmark's "Invita", large numbers; the italic for the accented words of the landing headings. |
| `font-script` | Great Vibes | 400 | Names and accents only: the wordmark's "Me", the names on the landing's sample stationery, and «Para cada celebración»; couple and guest names on future invitations. Never body text, labels, buttons, or anything a person must read quickly. |
| `font-sans` | Jost | 400, 500 | Interface and body text, labels, buttons, fields (the default body font). |

The invitation display fonts are not utilities, because the face depends on the theme of the stored
`TemplateVersion` and not on the place in the page: each is exposed as a CSS variable on `<html>`
(`--font-cinzel-decorative`, `--font-luckiest-guy`, `--font-bangers`, `--font-chewy`, `--font-lilita-one`,
`--font-pacifico`, `--font-press-start-2p`, `--font-baloo-2`, `--font-quicksand`, `--font-fredoka`,
`--font-playfair-display`, `--font-josefin-sans`, `--font-fraunces`, `--font-caveat`, `--font-nunito`,
`--font-lora`, and the already-loaded `--font-great-vibes`) and the renderer points `--inv-display` at the one
its theme names. All sixteen are declared with `preload: false`, because a guest page renders one theme and
must not download sixteen faces. They are used for names and titles only; body text stays Jost 400/500, so no
Jost 600/700 file was added and emphasis inside a layout uses Jost 500 (the variable file does draw 100–900, so
a real bold is a deliberate, documented change later, never a silent one).

Add a weight or the italic only when a page uses it, so the build ships no unused font files.

### Font files and licenses

Each family has its own folder under `apps/web/app/fonts/` with its woff2 files and the license google/fonts ships
for it, copied byte for byte: `OFL.txt` for the SIL Open Font License 1.1 families (`ofl/<family>/OFL.txt`) and
`LICENSE.txt` for the Apache License 2.0 families (`apache/<family>/LICENSE.txt`) in the
[google/fonts](https://github.com/google/fonts) repository. The files are the same Latin-subset files
`next/font/google` used to download.

| Folder | Files | Declared weights | License |
| --- | --- | --- | --- |
| `cormorant-garamond/` | `cormorant-garamond-latin-normal.woff2`, `cormorant-garamond-latin-italic.woff2` (variable) | `500 600` | `OFL.txt` |
| `great-vibes/` | `great-vibes-latin-normal.woff2` | `400` | `OFL.txt` |
| `jost/` | `jost-latin-normal.woff2` (variable) | `400 500` | `OFL.txt` |
| `cinzel-decorative/` | `cinzel-decorative-latin-normal.woff2` | `400` | `OFL.txt` |
| `luckiest-guy/` | `luckiest-guy-latin-normal.woff2` | `400` | `LICENSE.txt` (Apache 2.0) |
| `bangers/` | `bangers-latin-normal.woff2` | `400` | `OFL.txt` |
| `chewy/` | `chewy-latin-normal.woff2` | `400` | `LICENSE.txt` (Apache 2.0) |
| `lilita-one/` | `lilita-one-latin-normal.woff2` | `400` | `OFL.txt` |
| `pacifico/` | `pacifico-latin-normal.woff2` | `400` | `OFL.txt` |
| `press-start-2p/` | `press-start-2p-latin-normal.woff2` | `400` | `OFL.txt` |
| `baloo-2/` | `baloo-2-latin-normal.woff2` | `700` | `OFL.txt` |
| `quicksand/` | `quicksand-latin-normal.woff2` | `600` | `OFL.txt` |
| `fredoka/` | `fredoka-latin-normal.woff2` | `600` | `OFL.txt` |
| `playfair-display/` | `playfair-display-latin-normal.woff2` | `700` | `OFL.txt` |
| `josefin-sans/` | `josefin-sans-latin-normal.woff2` | `600` | `OFL.txt` |
| `fraunces/` | `fraunces-latin-normal.woff2` | `700` | `OFL.txt` |
| `caveat/` | `caveat-latin-normal.woff2` | `700` | `OFL.txt` |
| `nunito/` | `nunito-latin-normal.woff2` | `700` | `OFL.txt` |
| `lora/` | `lora-latin-normal.woff2` | `700` | `OFL.txt` |

The last nine rows are the display faces of the baby shower and themed baptism boards in
`design/celebration-themes/` (T7b; S13): Baloo 2, Quicksand, Fredoka, Playfair Display, Josefin Sans, Fraunces,
Caveat, Nunito, and Lora. All nine families ship the SIL Open Font License 1.1 (`ofl/<family>/OFL.txt`). Their
fallbacks are the board's stacks, so the serif faces (Playfair Display, Fraunces, Lora) pair with Times New Roman
and the rest with Arial.

The fallback faces keep the fonts `next/font/google` used: `adjustFontFallback: "Times New Roman"` for Cormorant
Garamond, Cinzel Decorative, Playfair Display, Fraunces, and Lora, and `"Arial"` for the other families.
`next/font/local` computes the fallback metrics
from the files, so the ascent and descent match the old ones and `size-adjust` differs by up to about five points
(Great Vibes); it affects only the fallback shown before a font loads. `apps/web/app/fonts/.gitattributes` marks the
woff2 files as binary and keeps `git diff --check` from flagging the trailing spaces of the upstream license text,
for `OFL.txt` and `LICENSE.txt` alike.

To add or update a font, a weight, or a style:

1. Request `https://fonts.googleapis.com/css2?family=<Family>:<axes>&display=swap` with a modern browser
   User-Agent, so the answer names woff2 files, and keep only the `/* latin */` blocks. When several weights point
   to one file, it is a variable font: keep that one file and declare the weight range (`"500 600"`).
2. Treat downloads as untrusted: save each in a new empty temporary directory outside the repository, execute
   nothing from it, check that each font starts with the woff2 signature `wOF2`, and record its source URL, size,
   and SHA-256 in the change description.
3. Copy the files and the family's license from google/fonts into `apps/web/app/fonts/<family>/` — `OFL.txt` for
   an SIL family, `LICENSE.txt` for an Apache 2.0 family; confirm which one the family ships under `ofl/` or
   `apache/` before copying, and never rename or reflow it. Add the files to the `src` list in `layout.tsx` with
   their weight and style, and update the table above.
4. Run `pnpm --filter @invitame/web test` and `pnpm build`, and compare the pages before and after.

A theme display font is a title face only: one file, the single weight suited to display titles (`600` or `700` for
the nine faces added by T7b), `preload: false`, and the theme board's fallback stack behind it where the theme
declaration points `--inv-display`.

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
- `app/_components/customer-shell.tsx`: the frame of `/ingresar` and `/cuenta` (the
  paper wash, corner flowers, the header with the wordmark, and one centered card with the eyebrow, flourish,
  heading, and intro). `CustomerPageFrame` is the paper and header both customer frames share.
- `app/_components/customer-workspace-shell.tsx`: the wide frame of the invitation pages (see
  [Customer workspace](#customer-workspace)), with the same paper, corner flowers, and header, and a compact
  page header (eyebrow, heading, intro, and optional actions on the right) instead of the centered card. The
  `pageActionButton` class is a page header's one main action at its own width.
- `app/_components/sign-out-button.tsx`: the wine «Cerrar sesión» button shared by customers and administrators,
  with its failure note; the administration sidebar passes its own `className`.
- `app/_components/landing/`: the landing sections (`hero.tsx`, `sections.tsx`, `closing.tsx`), the sample
  stationery (`stationery.tsx`), the drawings (`art.tsx`), and the three action shapes (`actions.tsx`):
  `SignInLink` (the wine button to `/ingresar`), `AnchorLink` (a button-shaped link that only scrolls), and
  `ComingSoon` (a «Próximamente» label, never a link or a button). `landing.module.css` holds the concept's
  styles on the tokens: every color is a token or a `color-mix` of tokens, and the hero illustration and sample
  cards scale with container query units.
- The enrollment QR code (`app/admin/activar/qr-code.tsx`) is drawn in `ink` on `surface` with a 4-module quiet
  zone and a gold hairline, the highest-contrast pair, so a phone camera reads it reliably. Below it, the setup
  key for manual entry is set in monospace `ink` on a pink tint, in groups of 4 and selectable as a whole, with a
  visually hidden caption that names it for screen readers.

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

## Guest invitation themes

Status: **current** (T6b, T7c; S2, S3, S5, S7, S8, S13). A themed template is a **layout** plus a **theme**: the
layout is an allow-listed renderer that codes the page structure once, and the theme is an allow-listed palette, a
licensed display font, and an original motif that the layout applies. Each combination is its own catalog template
and `TemplateVersion`.

- Layouts, from the directions in `design/birthday-adventure-v2/`: `birthday-map-01` (Mapa, `01-mapa-aventura.html`),
  `birthday-poster-01` (Cartel, `02-cartel-fiesta.html`), and `birthday-story-01` (Cuento, `03-cuento-ilustrado.html`).
  These three replaced the first single design, `birthday-adventure-01` (its own palette, typography, and section
  order), which was deleted with its files, tests, seed template, and catalog rows once they shipped (S11).
- Baby showers and themed baptisms (T7c, S13), from `design/celebration-themes/`, each ship one layout, «Clásica»:
  `baby-shower-classic-01` with eight themes (Osito y miel, Nubes y estrellas, Safari bebé, Globos aerostáticos,
  Arcoíris boho, Lunita, Amigos del bosque, Conejito dulce) and `baptism-classic-01` with six (Paloma y olivo,
  Angelitos, Cielo y nubes, Floral suave, Corderito, Luz de estrella). A theme is a seven-color palette, one licensed
  display font used at the single weight it is loaded with, and an original geometric motif; every text pair reaches
  4.5:1, and a test pins the palettes and the weights. The baby shower layout asks for the hosts, date, time, place,
  address, message, and an RSVP contact, and shows the baby's name, the gender reveal, the gift registry, and a photo
  only when the invitation has them. The themed baptism layout asks for the child's name and date, the parents, the
  godparents, the ceremony (place, address, time), the reception (place, address, time), the message, and an RSVP
  contact, with the photo and the gift registry optional. Both take exactly `{componentKey, theme}` as configuration;
  the formal baptism stays in the elegant line (T8).
- Birthday themes, from `design/kids-themes/01-tablero-temas.html`, in this order:

| Key | Catalog name | Display font | Motif |
| --- | --- | --- | --- |
| `ice-kingdom` | Reino de hielo | Cinzel Decorative | Copos de nieve |
| `rescue-team` | Equipo de rescate | Luckiest Guy | Huellas y estrellas |
| `spider-hero` | Héroe arácnido | Bangers | Telarañas |
| `classic-mouse` | Ratón clásico | Chewy | Lunares |
| `dinosaurs` | Dinosaurios | Lilita One | Montañas y huevos — paper-cut illustration |
| `under-the-sea` | Bajo el mar | Pacifico | Burbujas y olas |
| `fairytale-princess` | Princesa de cuento | Great Vibes | Coronas y estrellas |
| `blocks-and-pixels` | Bloques y píxeles | Press Start 2P | Bloques |

- Guardrail (S5): a palette may be inspired by a popular character or brand and a font may be the official one only
  when its license allows commercial use. No theme carries character artwork, a logo, or a protected name — not in
  its key, its catalog name, or its marketing. The motifs are original shapes drawn in
  `app/_components/renderers/birthday/motif.ts`; the paper-cut illustrations below are original drawings too, and
  the dinosaur is a generic long-necked friend, never character artwork.
- Configuration: exactly `{ "componentKey": <layout key>, "theme": <theme key> }`, both required; an extra key,
  another layout's key, an unknown theme, and a wrongly typed value are refused by the API before publication and by
  the web parser again (`lib/renderers/birthday-themes.ts`), so a drifted snapshot never renders. The content is the
  same eight fields every birthday layout reads (`lib/renderers/birthday-content.ts`), so the creator form is shared.
- Colors reach the markup as CSS variables on the invitation root: `--inv-background`, `--inv-surface`, `--inv-soft`,
  `--inv-ink`, `--inv-accent`, `--inv-decoration-one`, `--inv-decoration-two`, plus `--inv-display` for the font. The
  root also carries `data-theme` and `data-component-key`. No color is a literal in a component or a stylesheet.
- `--inv-on-accent` is the theme's contrast partner rather than one of the seven board colors: white, the color of
  text and decoration on the `accent` surface. It exists because `globals.css` resets `--color-*`, so a
  Tailwind default-palette utility such as `text-white` compiles to **nothing** and the element silently inherits
  the ink color (about 2.2:1 on an accent band). `birthday-themed-renderers.test.ts` fails if any themed renderer
  source uses a default-palette color utility again.
- Contrast: `ink` and `accent` reach 4.5:1 on `background`, `surface`, and `soft`, and white reaches 4.5:1 on
  `accent`, for all eight themes; `lib/renderers/birthday-themes.test.ts` pins the palettes to the board and checks
  every pair with `lib/theme/contrast.ts`. Decoration colors never carry text.
- Background: the theme `background` paints the page, not only the centred column. Each renderer opens with a
  `fixed inset-0 -z-10` layer filled with `--inv-background`; the guest `<main>` is `isolate`, so the layer stays
  behind the invitation's content and above the site's paper wash, and it covers the whole viewport on a long page.
- Rendering: server components with no client script, mobile-first at 390 px, a real `<img>` for `mainPhoto` with its
  alt text, and headings tied to their sections.
- Decoration (T6b, T7c, I3a; S4, S5): the theme motif or illustration is decoration, so it never sits under text.
  Each layout puts it in its own zone — a `div` marked `data-decoration` and `aria-hidden`, outside every
  `data-section` — and a layout has up to three of them: the header scene, a strip between sections, and a footer
  strip. Zones hold `preserveAspectRatio="xMidYMid meet"` (motif, divider, footer) or `slice` (header scene), so
  shapes keep their proportions in any box instead of stretching. Every motif's element groups carry unique React
  keys. `DecorationZone` (`app/_components/renderers/illustrations/decoration.ts`) is the only place a layout draws
  decoration, so the rule is written once.

## Paper-cut theme illustrations

Status: **current** (I3a; S1-S4). The owner chose the «Papel recortado» artboard,
`design/theme-illustrations/01-papel-recortado.html`, from the three hand-built SVG samples (L3) and asked for the
real stack to implement it. A theme with an illustration replaces its motif strip in all five themed layouts, so
existing invitations change look (pre-launch, accepted); a theme without one keeps exactly the motif strip it drew
before, byte for byte, which `theme-illustrations.test.ts` compares against the motif component rendered in the same
test.

- Shape of an illustration (`app/_components/renderers/illustrations/types.ts`): `ThemeIllustration` names the theme
  key and three `IllustrationDrawing` parts — `scene` (header diorama, `390 × 200`, `xMidYMid slice`), `divider`
  (`390 × 56`, `meet`), and `footer` (`390 × 62`, `meet`). Each part gives its `viewBox` and a `draw(id)` function;
  `id(name)` answers an id unique to that render, so two invitations on one page never share a `<filter>`, a
  `<clipPath>`, or a reusable sheet (`frame.ts` owns the `aria-hidden` SVG and the `useId` prefix).
- Shared primitives (`primitives.ts`), the technique the artboard documents: `cutSheets` draws every element as its
  own cut sheet — a 3–4 px offset ink shadow, the fill, and an optional white cut hairline — from shapes defined once
  in `<defs>`; `tornEdge` draws the irregular torn line with notches of different depth; `grain` multiplies one
  `feTurbulence` over the scene; `THEME_PAINTS` is the only palette a drawing can name, the eight theme variables.
  Tints are `opacity` on a theme color, never a color of their own.
- Registry (`illustrations/registry.ts`): an allow-listed map keyed by theme key, with one file per occasion so three
  workers can add themes without touching each other — `registry-birthday.ts`, `registry-baby-shower.ts`,
  `registry-baptism.ts`. Adding a theme is one drawing file `<theme-key>.ts` next to the registry plus one line in its
  occasion's registry; the occurrence test fails if a theme drawing is not registered, or a registered theme has no
  file. `themeIllustration` answers `undefined` for a theme without a drawing (including `constructor` and
  `__proto__`, through `Object.hasOwn`), and the layout then keeps its motif strip.
- Budget: one theme's three parts stay under 25 KB of markup (the Dinosaurios set is about 17 KB), checked by the test
  suite per theme, so a heavy drawing cannot creep into every guest page.
- Placement in the five layouts, chosen per layout from the Cartel artboard: `birthday-poster-01` opens its accent
  band with the scene and bleeds the divider and the footer full width; `birthday-map-01` bleeds the scene over the
  top of the page and keeps the strips in the column; `birthday-story-01` opens the page sheet with the scene,
  clipped to the sheet's rounded top, and closes it with the footer; `baby-shower-classic-01` and
  `baptism-classic-01` put the scene in the strip above the accent band and the divider before the message.
- Current coverage: `dinosaurs` is drawn (I3a). I3b–I3d add the other seven birthday themes and the baby shower and
  baptism themes; until then those themes keep their motif strip.
- Choosing (T9, T10b; S9, S10): the owner of a new invitation picks the design, then the theme, then the package,
  one step at a time, following `design/template-chooser-v2/02-paso-a-paso-escritorio.html` and its
  narrow-screen artboard. Each step is a server URL of the same page with no client script:
  `?paso=1|2|3&ocasion=<category>&diseno=<componentKey>&tema=<versionId>&paquete=<packageId>`. `resolveChooserStep`
  (`lib/customer/template-steps.ts`) reads every value against the creator catalog — the finer selection wins, so
  a version decides its design and its occasion — and a missing, unknown, or stale value never renders an error
  page: it falls back to the nearest step that still holds. Step 1 shows the occasion's designs in one row, each
  one a link to its theme step with a live miniature of the real renderer; the occasion is a catalog category
  that publishes templates, so no name is written in code and no occasion is offered empty. Step 2 shows the
  chosen design in each of its themes as comparable miniatures beside the large sample of the chosen one, and a
  design with a single style (the templates of other categories) shows that one style and moves on. Step 3 shows
  the packages and the create form. The stepper marks the done steps as links back to
  their own URL with the whole selection kept, and the footer bar repeats «Paso N de 3», the selection
  (design · theme · package), «Atrás», and the step's primary action; on step 3 that action submits the form,
  which still posts the published version id. A create the API refuses comes back to step 3 with the same
  `ocasion`, `diseno`, `tema`, and `paquete` in its URL and the message shown (`?paso=3&…&error=<code>`), so the
  written-out selection is never lost; the theme and the package are rebuilt from the version id and the
  package id the form posted, the occasion and the design are re-read against the catalog on arrival, and a
  tampered value only falls back to the nearest step that still holds (S12). Every miniature is the real,
  allow-listed renderer rendering one
  fixed sample per category (`lib/renderers/samples.ts`, photo `public/samples/birthday-mateo.svg`, an original
  illustration), never a stored screenshot, so a catalog edit shows up in the chooser with no asset to refresh.
  The sample is drawn at 390 px and scaled down inside a frame with `contain: paint`; the scale on the wrapper is
  also what makes the renderer's `position: fixed` background layer relative to the frame instead of the page.
  «Ver completa» opens `/cuenta/invitaciones/nueva/vista/<versionId>`, a signed-in page that renders the same
  sample at phone width and leads back to the theme step with that version still selected.
- Samples: one fixed sample per category, and a renderer that refuses it (a drifted configuration, a category
  without a sample, an unregistered key) only loses its miniature. `samples.test.ts` proves the birthday sample
  passes every registered renderer's own props parser, for every theme.

## Guest invitation features

Status: **current** (F2, F3; S3, S4). The API decides which features an invitation shows: the pinned package's
feature keys intersected with the implemented allow-list `COUNTDOWN`, `MAP`, and `WHATSAPP`, plus add-to-calendar,
which is always on and is not a catalog feature; WhatsApp also needs a stored phone. The web renders one themed
**features block** in every layout and never reads a package or a feature name to choose a code path.

- Placement and shape: each layout (`birthday-map-01`, `birthday-poster-01`, `birthday-story-01`,
  `baby-shower-classic-01`, `baptism-classic-01`) places `InvitationFeaturesBlock`
  (`app/_components/invitation-features/`) after its own details, before its closing message. One block serves the
  five designs, so every invitation behaves the same. With no feature data the renderer receives no `features`
  prop and renders exactly the markup it rendered before the block existed.
- Theme: the block carries no palette. Every color comes from the CSS variables the layout already sets on its
  root (`--inv-surface`, `--inv-soft`, `--inv-ink`, `--inv-accent`, `--inv-on-accent`) and the display font from
  `--inv-display`, so the block looks native in each of the eight birthday themes, the eight baby shower themes,
  and the six baptism themes. Counters sit on the softer surface, the cards on `surface`, and every action is a
  44 px pill on `accent` with `on-accent` as its text color, which is the pair a themed palette pins at 4.5:1.
- Countdown: days, hours, and minutes to the event start, computed in the invitation's IANA zone
  (`lib/invitation-features/start-instant.ts`, `countdown.ts`). It is rendered on the server at request time, so it
  reads without JavaScript, and `CountdownIsland` is the block's only client component: it ticks once a minute,
  says «¡Hoy es el día!» on the event's day, «¡Es hoy!» from the start for the four hours the calendar event lasts,
  and «La celebración ya pasó» after that, and has no animation, so reduced motion needs no special case.
- Map: «Cómo llegar» per place, with two buttons to Google Maps and Waze. The links come from the layout's own
  address fields (`lib/invitation-features/map-links.ts`): no embedded map, no API key, and a baptism shows its
  ceremony and its reception.
- Calendar: a Google Calendar link and a `.ics` download
  (`/i/<slug>/calendario.ics`, `lib/invitation-features/calendar.ts`) for a four-hour event at the start time in
  the invitation's zone. The file follows RFC 5545 literally — UTC timestamps, escaped text, lines folded at 75
  octets, CRLF, and a slug-based UID so a re-download updates the same event — and its route answers
  `text/calendar; charset=utf-8`, `attachment; filename="invitacion.ics"`, and `Cache-Control: no-store`.
- WhatsApp: one button to `wa.me/<digits>` with a neutral prefilled Spanish greeting that names the celebration.
  The number is the creator's stored E.164 contact; it is never logged, and a phone stored without the WhatsApp
  package key is never shown.
- Degradation: an unsupported zone turns off only the countdown and the calendar (the two features that read a
  wall clock); a snapshot whose facts cannot be read turns off the whole block. Neither is a guest-visible error.
- Creator side: the draft page (`/cuenta/invitaciones/[id]`) has a «Funcionalidades» section after the content
  form. It offers the time zone select with Spanish place labels only («Ciudad de México y centro del país»,
  «Cancún y Quintana Roo», ...), shows the WhatsApp field only while the pinned package
  includes WhatsApp (and carries a stored number in a hidden field otherwise, so saving the zone never clears it),
  lists the automatic features the guests will see, and saves through a server action that mirrors the content
  form's notice/error redirects. An archived invitation shows the section read-only.

## Customer workspace

Status: **current** (M4 T8; S11, S12). The owner tried the invitation pages and found the same problem as in the
administration pages: a 30 rem card in the middle of the screen, too much scrolling, and inputs that were all
plain text. The customer «Rosa y vino» theme stays; the invitation pages simply use the width.

- Where it applies: `/cuenta/invitaciones`, `/cuenta/invitaciones/nueva`, and `/cuenta/invitaciones/[id]` render
  inside `customer-workspace-shell.tsx`, a server component that keeps the paper wash, the corner flowers, the
  header with the wordmark, and the eyebrow with its bud, and replaces the card with a compact page header and up
  to `max-w-6xl` of content. `/cuenta` and `/ingresar` keep the centered `CustomerShell`.
- List: the drafts are a card grid (`sm:grid-cols-2 xl:grid-cols-3`) with the status badge, the public slug, the
  creation date, and «Editar»; «Nueva invitación» is the header action, and an empty account sees the empty state
  in one small panel.
- Create: the chooser is the three-step flow («Paso a paso») described in
  [Guest invitation themes](#guest-invitation-themes). Every choice is a link to a step URL, so it works from the
  keyboard and needs no JavaScript; the create form posts the published version id and the chosen package, and the
  package card shows its price in force.
- Detail: two columns from `lg` up. The form takes two thirds and its fields are grouped into the short sections
  `contentSections` derives from the property names: «Festejado» (`celebrantName`, `age`), «Cuándo» (`date`,
  `time`), «Dónde» (`location`, `address`), «Contenido» (`mainPhoto`, `message`), and one last «Otros datos» group
  for any property those do not name, keeping the schema order. Each section is a fieldset with two columns of
  fields from `sm` up; a multi-line field spans both. The side third holds the status badge, the slug as text, what
  is still missing («Faltan: …»), and the archive form, and stays in view (`lg:sticky`). An archived draft and a
  retired version keep the same layout, with the stored content in place of the form.
- Inputs: `contentFields` derives each control from that property of the pinned schema and never from the template
  name. `format: "date"` is an `input type="date"`; `format: "time"`, or a `pattern` that accepts every 24-hour
  time and refuses anything else, is `input type="time"`; `format: "uri"` is `input type="url"` with
  `inputMode="url"`; an `integer` or `number` is `input type="number"` with the schema's `minimum`/`maximum` as
  `min`/`max` and `step="1"` for an integer, so a browser refuses a negative age; a string whose `maxLength` is
  above 200 becomes a `<textarea>` with that `maxLength` and a rows hint, and every other string a text input with
  its `maxLength`.
- Partial drafts: the schema's `required` is never the HTML `required` attribute, because a draft may stay
  incomplete until publication (S7); those fields are marked «Necesario para publicar» in their label, next to one
  line saying that the draft can be saved with empty fields. `format`, `pattern`, `minimum`, `maximum`, and
  `maxLength` are also checked on the server by `parseContentForm`, which refuses instead of clamping and answers
  the existing `invalid-form` message.

## Administration theme

Status: **current**. The owner asked for an administration look apart from the customer theme, a denser dashboard
in the spirit of shadcn/ui, with less scrolling. It is built with Tailwind and no component library; its only
added dependency is the `lucide-react` icon set, and the pages stay server components whose forms work without
JavaScript.

- Tokens: the `@theme static` block of `app/globals.css` declares the `admin-*` colors, a zinc palette
  (`admin-background`, `admin-surface`, `admin-subtle`, `admin-border`, `admin-input`, `admin-ink`,
  `admin-muted`, `admin-placeholder`, `admin-primary`, `admin-primary-deep`, `admin-on-primary`, and the
  `danger`, `success`, and `warning` pairs of the badges and notes). `lib/theme/contrast.test.ts` checks their text
  pairs at 4.5:1 and the field border at 3:1, like the customer tokens.
- Scope: `app/admin/layout.tsx` wraps every administrator page in the `admin-theme` utility. It points the
  customer tokens (`primary`, `ink`, `muted`, `field-border`, the radii, and the fonts) at the administration
  palette and the system sans-serif font, so the sign-in form, the enrollment flow, and the sign-out button,
  which are shared components, render neutral inside `/admin` without a second copy.
- Classes: `app/admin/_components/admin-ui.ts` holds the administration's buttons, fields, cards, tables, notes,
  and badges. A badge always names the state in text, so color is never the only signal.
- Frames: `app/admin/_components/admin-shell.tsx` is the panel and catalog frame, with a sidebar (a scrollable top
  bar on small screens) holding the navigation and «Cerrar sesión», a breadcrumb bar, and a compact header with
  the page's actions. Every sidebar entry carries a `lucide-react` icon; the group titles (General, Catálogo), shown from
  the `lg` breakpoint up, are small uppercase labels with no hover or pointer, so they never read as links.
  `app/admin/_components/admin-centered-shell.tsx` is the centered card of sign-in, enrollment, and the
  unavailable notices, which show no navigation.
- Selects: every administration `<select>` goes through `app/admin/_components/admin-select.tsx`, which hides the
  native arrow and draws a chevron inset from the right border like the field's text.
- Icons: `lucide-react` is the only icon set. Icons are decorative (`aria-hidden`) next to a visible label, at
  `size-4` in the sidebar and buttons and `size-3.5` in the breadcrumb and small buttons.
- Layout: catalog lists are tables (`app/admin/catalogo/_components/catalog-table.tsx`); single-form pages
  (create pages and the category and feature edit pages) pass `width="form"` to `AdminShell`, which centers the
  header and the form card in one reading-width column; forms are cards with two-column fields; the package and
  template edit pages put the main forms in two thirds of the
  width and the price, its history, or the versions in the remaining third.
- Components: repeated administration markup lives in one component, not inline. In
  `app/admin/_components/`: `AdminCard` and `AdminCardEmpty` (`admin-card.tsx`), `StatusBadge`
  (`status-badge.tsx`), `NewRecordLink` (`new-record-link.tsx`), `AdminBrandMark` (`admin-brand-mark.tsx`),
  `AdminDetailLayout` (`admin-detail-layout.tsx`), and `AdminSelect` (`admin-select.tsx`). In
  `app/admin/catalogo/_components/`: `FormBody`, `SubmitFooter`, and the fields (`fields.tsx`), and
  `RecordBasicsFields` (`record-basics.tsx`). New administration markup that repeats goes into one of them
  instead of being written inline.

## Where each piece lives

| Piece | Path |
| --- | --- |
| Tokens, font mapping, `paper-wash`, base styles, reduced motion | `apps/web/app/globals.css` |
| Font loading | `apps/web/app/layout.tsx` |
| Font files and their licenses | `apps/web/app/fonts/<family>/` |
| Shared classes and components | `apps/web/app/_components/` |
| Ornament files | `apps/web/public/ornaments/` |
| Contrast helper and test, font loading test | `apps/web/lib/theme/` |
| Invitation theme tokens, shared content parser, layout parsers and registries | `apps/web/lib/renderers/` |
| Themed invitation components, display-font bridge, and motifs | `apps/web/app/_components/renderers/` |
| Themed pages | `apps/web/app/ingresar/`, `apps/web/app/cuenta/`, `apps/web/app/page.tsx` |
| Customer workspace (invitation pages) | `apps/web/app/cuenta/invitaciones/`, `apps/web/app/_components/customer-workspace-shell.tsx` |
| Administration classes and frames | `apps/web/app/admin/_components/` |
| Landing sections, styles, and drawings | `apps/web/app/_components/landing/` |
| Landing copy and its honesty test (S37) | `apps/web/lib/landing/` |
