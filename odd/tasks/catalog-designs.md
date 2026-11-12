# Catalog design track

Branch `feat/catalog-designs` from `master` at `6a6d19c`. Grow the catalog from one design (`birthday-adventure-01`)
to several templates per occasion, each a layout plus a theme; every layout and theme is chosen visually by the
owner before code. Renderer map: explore task `mwdzwovk-1-5423` (2026-11-12).

## Specs

- S1 — ROADMAP outcome (rewritten after L5): "Grow the catalog from one design to several templates per occasion,
  with each layout and theme chosen visually by the owner before it is implemented."
- S2 — ROADMAP key scope (rewritten after L5): "a template is a **layout** plus a **theme**: the layout is an
  allow-listed renderer (page structure, coded once); the theme is an allow-listed set of palette, licensed fonts, and
  original illustrations that the layout applies; each combination is its own catalog template and `TemplateVersion`";
  "themed layouts and themes for children's birthdays first, starting from the directions in
  `design/birthday-adventure-v2/`, then baby showers and themed baptisms"; "elegant layouts and themes for XV años,
  weddings, and formal baptisms"; "mobile-first, accessible guest rendering".
- S3 — ROADMAP exit criteria (rewritten after L5): "Children's birthdays, baby showers, baptisms, XV años, and weddings
  each have at least one published template." "Every layout and theme was chosen by the owner from visual directions
  before code was written." "Invitations pinned to an earlier version render unchanged after a layout or theme is
  improved; whether an improvement ships as a new `componentKey` or as a versioned renderer is decided in its slice."
  "Every theme follows the theme guardrail and passes contrast and mobile layout checks."
- S4 — ROADMAP non-goals (rewritten after L5): "No customer-side visual editor, per-customer custom designs, character
  artwork, logos, brand names, or design that depends on media uploads before Milestone 8."
- S5 — ROADMAP theme guardrail (rewritten after L5): "a themed design may take its color palette from a popular
  character or brand, and its fonts may be the official ones only when their license allows commercial use;
  otherwise a similar font with a commercial license is used. A design never includes character artwork, logos, or a
  protected name, in the template, its catalog name, or its marketing. Illustrations are original work."
- S6 — Owner, verbatim (L5): "la idea es tener varias plantillas para cumplenos [...] me gustaria usar paleta de
  colores tematicos por ejemplo de personajes o marcas obviamente si usar los logos pero si sus fontstyles esto para
  invitaciones de ninos, baby shower que son tematicas la mayoria de las veces ya para mas formales esos si son
  elegantes como 15 anos o bodas, lo mismo aplica para bautizos a veces es formal otras de tematicas"; "b porque
  estamos usando la paleta de colores nada mas no la marca en si y sus fontstyles si hay disponibles sino parecidos".
- S7 — Owner choice for the first birthday templates (L7), answering "¿Qué estructuras programamos primero: Mapa,
  Cartel, Cuento o las tres?", "¿Con qué temas arrancamos?", and "¿Confirmas que cada estructura nueva sea un diseño
  aparte y que el actual (`birthday-adventure-01`) quede intacto?": "1.- los 3, 2. los 8 3.- si". So: the three
  layouts in `design/birthday-adventure-v2/` (01 Mapa, 02 Cartel, 03 Cuento), the eight themes in
  `design/kids-themes/01-tablero-temas.html`, each layout a new allow-listed `componentKey`, and
  `birthday-adventure-01` unchanged.
- S8 — Implementation contract for T6, decided by the parent within S2, S5, and S7 (L8); workers treat it as spec:
  - **Keys.** Layouts: `birthday-map-01` (Mapa, `01-mapa-aventura.html`), `birthday-poster-01` (Cartel,
    `02-cartel-fiesta.html`), `birthday-story-01` (Cuento, `03-cuento-ilustrado.html`). Themes, in this order:
    `ice-kingdom` (Reino de hielo), `rescue-team` (Equipo de rescate), `spider-hero` (Héroe arácnido), `classic-mouse`
    (Ratón clásico), `dinosaurs` (Dinosaurios), `under-the-sea` (Bajo el mar), `fairytale-princess` (Princesa de
    cuento), `blocks-and-pixels` (Bloques y píxeles). `birthday-adventure-01` and its files, tests, seed row, and
    behavior stay unchanged.
  - **Content.** Each new layout uses exactly the eight `birthday-adventure-01` fields with the same types, limits, and
    required list (`celebrantName`, `age`, `date`, `time`, `location`, `address`, `mainPhoto`, `message`), so the
    creator form needs no change.
  - **Configuration.** Exactly `{ "componentKey": <layout key>, "theme": <theme key> }`; both required, unknown keys,
    other types, and unknown themes rejected, on the API and in the web parsers. Section order is fixed by each layout.
  - **Theme tokens** (web), seven colors in the order background, surface, soft, ink, accent, decoration 1,
    decoration 2, exactly as in `design/kids-themes/01-tablero-temas.html`, plus a display font and a motif.
    `ink` and `accent` reach 4.5:1 on background, surface, and soft, and white on `accent` reaches 4.5:1; a test pins
    it. Decoration colors never carry text.
  - **Fonts.** Display fonts per theme: Cinzel Decorative, Luckiest Guy, Bangers, Chewy, Lilita One, Pacifico, Great
    Vibes (already loaded), Press Start 2P (titles only). Each new family is a self-hosted latin `woff2` under
    `apps/web/app/fonts/<family>/` with its license file copied byte-for-byte from google/fonts (`OFL.txt`, or
    `LICENSE.txt` for Apache 2.0 families), loaded with `next/font/local` and `preload: false`. Body text stays Jost
    400/500; Great Vibes and Press Start 2P are used for names and titles only.
  - **Rendering.** Server components without client script, following each artboard's structure, with the theme
    applied through CSS variables, original decorative SVG motifs (`aria-hidden`), a real `<img>` for `mainPhoto`
    with alt text, mobile-first at 390 px, and the same failure behavior as `birthday-adventure-01` (props checked by
    `PROPS_CHECKS`; invalid props never render).
  - **Seed.** 24 templates in category `birthday`, key `birthday-<map|poster|story>-<theme key>`, Spanish name
    `<Mapa|Cartel|Cuento> · <theme display name>`, a short neutral Spanish description, each with a PUBLISHED version
    1 created only when that template is created by the run; re-running the seed creates nothing. No catalog name or
    description uses a protected name (S5).

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Add the catalog design track to `ROADMAP.md` | S1-S5 | inline | `db6c5f1` |
| T2 | Visual directions for the children's birthday layouts under `design/birthday-adventure-v2/` | S1-S5 | inline | `db6c5f1` |
| T3 | Rewrite the track and guardrail for layouts plus themes, more occasions, and palette-inspired themes (L5) | S1-S6 | inline | `fee7417` |
| T4 | Children's theme board: palette-inspired themes with contrast-checked palettes and font suggestions | S2, S5, S6 | inline | `fee7417` |
| T5 | Owner picks the birthday layouts (01-03) and the first themes; confirm new `componentKey` per layout | S3, S7 | owner | L7 |
| T6a | API: three renderer contracts, shared theme allow-list, registry, seed for 24 templates, tests, `docs/architecture/overview.md` | S2, S3, S5, S7, S8 | worker | `00cb26a` |
| T6b | Web: theme tokens and fonts, three layout renderers, parsers, registries, tests, `docs/design/theme.md` | S2, S3, S5, S7, S8 | worker | `2e9c69d`, `71e4830` |
| T6c | Integration check: key and theme lists in sync, full unit suites, typecheck, lint, 390 px screenshots | S3, S8 | inline | `71e4830` |
| T7 | Baby shower and themed baptism themes: directions, owner choice, implementation | S2-S5 | pending | |
| T8 | Elegant layouts and themes for XV años, weddings, and formal baptisms: directions, choice, implementation | S2-S5 | pending | |

## Log

- L1 — User (2026-11-12): "tenemos tareas para mejorar los disenos en el roadmap?" Answer: no; the roadmap only
  states the intent and has one design. Proposed a catalog design track. User: "si agrega al roadmap y luego continua
  con lo que sigue".
- L2 — Ordering decided by the parent within L1: the track runs in parallel with Milestones 6 to 9 and must be complete
  before Milestone 10. The owner may overturn it.
- L3 — Design system synced to `design/system.md` and `design/system.html` from `apps/web/app/globals.css`,
  `docs/design/theme.md`, and the `birthday-adventure-01` palettes. Directions written to `design/birthday-adventure-v2/`:
  `01-mapa-aventura.html`, `02-cartel-fiesta.html`, `03-cuento-ilustrado.html`. All three keep the eight current
  content fields and the five-variable palette contract (sunset, ocean, forest), so the chosen one can ship as a new
  `componentKey` without a schema change. Renderer map (explore `mwdzwovk-1-5423`): the registry maps one
  `componentKey` to one component with no version argument, so editing `birthday-adventure-01` would restyle every
  invitation pinned to it; parsers reject unknown configuration keys. Recommendation for T3: new key
  `birthday-adventure-02` plus a new template version. The directions use Jost weights 700/800, which
  `apps/web/app/layout.tsx` does not load (400/500 only); direction 03 also uses Cormorant Garamond, already loaded.
  Checked at 390 px in headless Chromium: no horizontal overflow.
- L4 — Slice 1 closes with T1-T2 (`db6c5f1`, `b53800b`, about 670 lines, almost all self-contained design artboards
  under `design/`). T4 (the birthday renderer) starts slice 2 after the owner's choice in T3.
- L5 — Owner (2026-11-12): "la idea es tener varias plantillas para cumplenos no se como lo tienes planeado y me
  gustaria usar paleta de colores tematicos por ejemplo de personajes o marcas obviamente si usar los logos pero si sus
  fontstyles esto para invitaciones de ninos, baby shower que son tematicas la mayoria de las veces ya para mas formales
  esos si son elegantes como 15 anos o bodas, lo mismo aplica para bautizos a veces es formal otras de tematicas". The
  parent recommended generic original themes (option A) and named the intellectual-property risk; the owner chose
  option B: "b porque estamos usando la paleta de colores nada mas no la marca en si y sus fontstyles si hay disponibles
  sino parecidos". The parent proposed the layout-plus-theme model; the three birthday directions become candidate
  layouts rather than competing options. The guardrail now allows palette inspiration and commercially licensed or
  similar fonts, and still forbids character artwork, logos, and protected names in templates, catalog names, and
  marketing. Theme names stay generic in the repository.
- L6 — T3-T4 in `fee7417`: ROADMAP rewritten for layouts plus themes, five occasions, and the theme guardrail;
  `design/kids-themes/01-tablero-temas.html` shows eight themes (Reino de hielo, Equipo de rescate, Héroe arácnido,
  Ratón clásico, Dinosaurios, Bajo el mar, Princesa de cuento, Bloques y píxeles) on the Cartel layout. Every
  palette's ink and accent reach at least 4.61:1 on background, surface, and soft, and white on accent at least 6.03:1
  (computed with the WCAG formula). Font licenses named on the board are to be confirmed when each font is added.
  Slice 1 ends here (about 810 lines, mostly design artboards); T6 starts slice 2.
- L7 — Owner (2026-11-12), verbatim: "1.- los 3, 2. los 8 3.- si". T5 closed; T6 starts slice 2. Implementation map
  requested from explore task `mwe1zdea-2-xfjf`.
- L8 — Implementation map from explore `mwe1zdea-2-xfjf`: renderer keys live in the API registry map and five API tests,
  and in the web registry, `PROPS_CHECKS`, and their tests; `registry-sync.test.ts` reads the API registry source as
  text; the creator form is schema-driven; there is no template-package link; `apps/web/lib/theme/fonts.test.ts`
  pins the exact font folder set and OFL licenses; tests run with `node --test` (API through `@swc-node/register`),
  and the seed db-spec needs a local Postgres. The parent fixed the S8 contract and split T6 into an API worker and a
  web worker with disjoint edit surfaces.
- L9 — T6a done in `00cb26a` (API: 1096 unit tests pass, tsc clean; the seed db-spec was not run because no database
  or Docker is available here). T6b passed 617 web tests, but the 390 px browser check (worker `mwe2z0ui-5-8byk`,
  27 renders) found defects: theme background never painted, `text-white` not emitted (ink on accent 2.2-2.8:1),
  duplicate React keys in the rescue-team motif, stretched motifs, motifs behind text, a clipped ticket time in
  blocks-and-pixels, and a long polaroid caption overlapping the photo. Fixes sent back to the web worker
  (`mwe3p3pm-6-a0t8`); T6b stays open until a second browser check passes.
- L10 — T6b and T6c done. Fonts in `2e9c69d` (seven self-hosted latin woff2 families, licenses byte-identical to
  google/fonts: OFL for Cinzel Decorative, Bangers, Lilita One, Pacifico, Press Start 2P; Apache 2.0 for Luckiest
  Guy and Chewy). Layouts in `71e4830`. Owner, verbatim: "como que no hay docker? ni db creala entonces". Docker was
  running; the shell's redirected HOME hid its socket. Evidence: web 638/638 tests, API 1096/1096 unit tests, API
  292/292 db-specs on `invitame_test` after `prisma migrate deploy`, both typechecks clean, docs check and Biome on the
  changed files clean. The dev database `invitame` was seeded: eight PUBLISHED versions each for `birthday-map-01`,
  `birthday-poster-01`, and `birthday-story-01`. Browser check at 390 px, round 2 (worker `mwe45ppc-7-jxzs`, 27 pages):
  the seven round-1 defects and three fidelity gaps pass, with 0 console errors, no overflow, contrast on accent
  surfaces 4.61-6.82:1, and no decoration over text. Round 3 (parent) fixed the one new defect, a poster motif hidden
  behind the polaroid: the motif is now in flow above the hero, with 0 hidden shapes, 0 text overlaps, and 0 console
  errors on all eight themes. Slice 2 ends here; T7 starts slice 3.
