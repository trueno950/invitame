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

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| E1 | Elegant directions under `design/elegant-line/`: three layout directions and a theme board, plus «Datos que pide esta ocasión» for XV años and weddings | S1-S3 | worker | |
| E2 | Owner picks layouts, themes, and content fields | S3 | owner | |
| E3 | Implementation: API contracts, categories, seed, fonts, web layouts, themes, form, tests, browser check | S1-S3 | pending E2 | |

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
