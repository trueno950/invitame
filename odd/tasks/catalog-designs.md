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

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Add the catalog design track to `ROADMAP.md` | S1-S5 | inline | `db6c5f1` |
| T2 | Visual directions for the children's birthday layouts under `design/birthday-adventure-v2/` | S1-S5 | inline | `db6c5f1` |
| T3 | Rewrite the track and guardrail for layouts plus themes, more occasions, and palette-inspired themes (L5) | S1-S6 | inline | this commit |
| T4 | Children's theme board: palette-inspired themes with contrast-checked palettes and font suggestions | S2, S5, S6 | inline | this commit |
| T5 | Owner picks the birthday layouts (01-03) and the first themes; confirm new `componentKey` per layout | S3 | owner | |
| T6 | Implement the chosen birthday layouts with the theme contract: renderer, contract, themes, seed, tests | S2, S3, S5 | pending T5 | |
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
