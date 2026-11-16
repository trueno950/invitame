# Elegant line — XV años, weddings, formal baptism

Branch `feat/elegant-line` from `feat/theme-illustrations` at `8ad3766`. Add the elegant style for XV años, weddings,
and formal baptisms: layouts and themes chosen visually by the owner before code, then implemented like the themed
line.

## Specs

- S1 — ROADMAP catalog design track, verbatim: "elegant layouts and themes for XV años, weddings, and formal
  baptisms"; owner origin (catalog-designs L5), verbatim: "ya para mas formales esos si son elegantes como 15 anos o
  bodas, lo mismo aplica para bautizos a veces es formal otras de tematicas".
- S2 — Owner go-ahead (L1), verbatim: "wok dale", after «Revisa las comparaciones y dime si alguna necesita otra
  pasada. Si te gustan, sigo con la línea elegante: XV años, bodas y bautizo formal.»
- S3 — Rules inherited from the catalog design track: every layout and theme is chosen by the owner from visual
  directions before code; original artwork only, no protected names; colors only from each theme's tokens; WCAG AA;
  mobile-first at 390 px; decoration never behind text; invitations already pinned to a version render unchanged
  unless the owner accepts otherwise.

- S4 — Owner choices (L3), verbatim answers: layouts → "03 · Arco y foto (Recomendado)" only; themes → "Los 8
  (Recomendado)"; fields → "Sí, como están (Recomendado)" (the proposal in `design/elegant-line/05-datos-por-ocasion.html`);
  fonts → "Sí, agrégalas (Recomendado)" (Bodoni Moda and Italiana, SIL OFL). Parent decisions within S4 (L3; owner
  may overturn):
  - **Layouts.** One visual layout, «Arco y foto», shipped as three allow-listed renderers because each occasion has
    its own content schema: `xv-arch-01` (category `quinceanera`), `wedding-arch-01` (`wedding`), `baptism-arch-01`
    (`baptism`, the formal baptism next to the themed one). Configuration is exactly `{componentKey, theme}`.
  - **Themes.** Eight keys in the board's order, shared by the three layouts and kept in
    `apps/api/src/catalog/domain/renderers/elegant-themes.ts` as `export const ELEGANT_THEMES = [ ... ] as const;`:
    `blush-gold` (Rosa empolvado y oro), `ivory-black` (Marfil y negro), `midnight-gold` (Azul medianoche y oro),
    `olive-cream` (Verde olivo y crema), `champagne` (Champaña), `lavender-silver` (Lavanda y plata),
    `terracotta-sage` (Terracota y salvia), `burgundy-gold` (Borgoña y oro). Colors, display fonts, and ornament
    descriptions exactly as on the board; ornaments are original fine-line SVG (not paper-cut).
  - **Content.** XV años (`xv-arch-01`) required: `celebrantName`, `date`, `parents`, `honorSponsors`,
    `ceremonyPlace`, `ceremonyAddress`, `ceremonyTime`, `receptionPlace`, `receptionAddress`, `receptionTime`,
    `dressCode`, `message`, `rsvpContact`; optional: `chambelanes`, `giftRegistry`, `mainPhoto`. Wedding
    (`wedding-arch-01`) required: `coupleNameOne`, `coupleNameTwo`, `date`, the three `ceremony*`, the three
    `reception*`, `dressCode`, `message`, `rsvpContact`; optional: `firstFamilyParents`, `secondFamilyParents`,
    `weddingSponsors`, `giftRegistry`, `mainPhoto`, `hashtag`. Formal baptism (`baptism-arch-01`) reuses the themed
    baptism schema exactly. Lists (sponsors, chambelanes, parents) are bounded text, one name per line. Without a
    photo, the arch shows a theme-colored wash with the theme's ornament and keeps the name at AA contrast.
  - **Catalog.** 24 templates (3 layouts × 8 themes), key `<occasion>-arch-<theme>`, Spanish name
    `Arco y foto · <theme name>`, neutral descriptions, PUBLISHED version 1 created only when new.
  - **Features.** Each layout places the shared features block and exposes event facts (ceremony and reception as
    the two places); the page title names the celebrant or the couple.

- S5 — Owner request through the design canvas (L4), verbatim: "Implement the design artboard
  design/elegant-line/02-ornamental.html" — «Ornamental — papelería clásica», tradeoff: "Es la dirección que más se
  parece a una invitación impresa de lujo: tarjeta centrada con doble filete sobre papel texturizado, laurel dibujado
  en SVG original, acentos de foil y el nombre en script. El costo es que el ornamento ocupa la cabecera y todo el
  contenido queda en una columna centrada y estrecha, con la foto reducida a un camafeo en lugar de protagonista."
  Handoff instruction: "Implement it in the project's real stack. Use the artboard as the visual spec: map its parts
  to the project's existing components and styles, and do not copy the artboard HTML verbatim." Parent decisions
  within S5 (L4; owner may overturn): a second elegant layout next to «Arco y foto», with the same eight themes, the
  same content schemas, and the same features block, shipped as `xv-ornamental-01`, `wedding-ornamental-01`, and
  `baptism-ornamental-01` with 24 more templates named `Ornamental · <theme name>`.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| E1 | Elegant directions under `design/elegant-line/`: three layout directions and a theme board, plus «Datos que pide esta ocasión» for XV años and weddings | S1-S3 | worker | |
| E2 | Owner picks layouts, themes, and content fields | S3, S4 | owner | L3 |
| E3a | API: three arch renderers, elegant theme allow-list, XV and wedding schemas, seed of 24 templates, tests | S3, S4 | worker | `8335256` |
| E3b | Web: Bodoni Moda and Italiana fonts | S4 | worker | `16da3cd` |
| E3c | Web: elegant themes, arch layout for three occasions, ornaments, parsers, registry, event facts, samples, form fields, page title, tests, browser check | S3, S4 | worker | `e74b975` |
| E4a | API: three ornamental renderers reusing the elegant themes and schemas, 24 templates, tests | S5 | worker, after E3a | `b839c7b` |
| E4b | Web: ornamental layout for three occasions (double-rule card, laurel monogram, foil accents, script name, cameo photo), registry, chooser, tests, browser check | S5 | worker, after E3c | |
| E3d | Integration of both elegant layouts: full checks, seed the dev database, browser review, docs, canvas handoffs | S3-S5 | inline | |

## Log

- L1 — Owner approved the richer illustrations and asked to continue ("wok dale", S2). Existing catalog categories:
  `quinceanera`, `wedding`, and `baptism` (themed baptism uses `baptism`; the formal baptism joins the same category
  with elegant layouts).
- L2 — E1 written by worker `mwiq1y32-w-3qyp` to `design/elegant-line/`: `01-editorial.html`, `02-ornamental.html`, and
  `03-arco-y-foto.html` (XV años for «Valentina Ramírez» at 390 px), `04-tablero-temas-elegantes.html` (eight
  themes, minimum contrast 5.31-9.80:1), `05-datos-por-ocasion.html` (XV: 16 fields, 13 reused and 3 new; bodas: 18
  fields, 11 reused and 7 new; formal baptism reuses the baptism schema), and `design.json`. Checks: contrast,
  palette containment, focus, 46 px or larger targets, and 320 px reflow all pass; no external URLs. Proposed new
  OFL fonts: Bodoni Moda and Italiana. Worker recommendation: 03 as the flagship, 02 for the formal baptism, 01 as a
  second XV and wedding option. Waiting for E2.
- L3 — Owner choices (S4): only «Arco y foto», all eight themes, the proposed fields, and the two new fonts. The parent
  fixed the contract in S4 and launched E3a-E3c in parallel with disjoint surfaces.
- L4 — Owner also asked, through the canvas handoff, to implement `02-ornamental.html` (S5). It is queued as E4a and E4b
  so that it does not collide with the running Arco y foto workers (E3a and E3c edit the same registries, seed, and
  chooser); it starts when they land. Canvas handoff reported `in_progress`.
- L5 — E3b done in `16da3cd` (worker `mwirfays-y-pv6o`): Bodoni Moda 500 and Italiana 400, latin woff2, OFL 1.1 copied
  byte-for-byte from google/fonts, `preload: false`, `--font-bodoni-moda` and `--font-italiana`. The fonts test went
  RED (2 failures) and then GREEN. Web: 1030/1030 tests; tsc, docs, and Biome pass.
- L6 — E3a done in `8335256` (worker `mwirfasw-x-nnl3`). It adds `ELEGANT_THEMES` (8 keys), `xv-arch-01`
  (13 required and 3 optional fields), `wedding-arch-01` (12 required and 6 optional), and `baptism-arch-01`, which
  imports `BAPTISM_CONTENT_FIELDS` so it cannot drift from the themed baptism. The seed adds 24 «Arco y foto ·»
  templates in `quinceanera`, `wedding`, and `baptism`. API: 1219/1219 unit tests and 309/309 db-specs pass; tsc,
  docs, and Biome pass. Open: `hashtag` has only a 60-character bound. E4a launched now that the API registry and
  seed have landed.
- L7 — E4a done in `b839c7b` (worker `mwiruvha-10-c1gf`). It adds `xv-ornamental-01`, `wedding-ornamental-01`, and
  `baptism-ornamental-01`, which import their arch siblings' content fields; a sibling-equality test guards against
  schema drift. The seed adds 24 «Ornamental ·» templates through a shared elegant builder; a differential run shows
  the arch seeds are identical. API: 1246/1246 unit tests and 310/310 db-specs pass; tsc, docs, and Biome pass. The
  web registry-sync test fails until E4b registers the keys.
- L8 — E3c done in `e74b975` (worker `mwirfb6h-z-cqid`). It adds the eight elegant themes, the shared arch layout with
  measured scrim (7.87-9.80:1), wax seal, family, place, and detail cards, the features block, and eight original
  fine-line ornaments. It also adds three thin renderers, parsers (the formal baptism shares `parseBaptismContent`;
  a differential run found identical output on 13 inputs), registry and props checks, event facts, the wedding page
  title, samples, form labels and sections, and chooser groups. Web: 1120/1121 tests; the only failure is
  registry-sync, which expects the API's three ornamental keys until E4b lands. tsc and Biome pass. Browser: 33
  cases at 390 and 1280 px with 0 defects. The parent added the docs paragraph. Known: the formal baptism sample
  photo is the themed illustration. E4b launched.
