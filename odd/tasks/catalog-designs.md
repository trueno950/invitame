# Catalog design track

Branch `feat/catalog-designs` from `master` at `6a6d19c`. Grow the catalog from one design (`birthday-adventure-01`)
to a first set that covers XV años, weddings, and children's birthdays; every design is chosen visually by the owner
before code. Renderer map: explore task `mwdzwovk-1-5423` (2026-11-12).

## Specs

- S1 — ROADMAP outcome: "Grow the catalog from one design to a curated first set that covers every launch occasion,
  with each design chosen visually by the owner before it is implemented."
- S2 — ROADMAP key scope: "an improved children's birthday design based on `birthday-adventure-01`; one original XV
  años design; one original wedding design; for each design: visual directions under `design/<slug>/`, the owner's
  choice, then an allow-listed renderer, its validated schema/configuration contract, catalog seed data, and tests;
  and mobile-first, accessible guest rendering, because invitations are mostly opened from shared links on phones."
- S3 — ROADMAP exit criteria: "XV años, weddings, and children's birthdays each have at least one published design."
  "Every design was chosen by the owner from visual directions before code was written." "Invitations pinned to an
  earlier version render unchanged after a design is improved; whether an improvement ships as a new `componentKey`
  or as a versioned renderer is decided in its slice." "Every design follows the original-design guardrail and passes
  contrast and mobile layout checks."
- S4 — ROADMAP non-goals: "No customer-side visual editor, per-customer custom designs, licensed themes, or design
  that depends on media uploads before Milestone 8."
- S5 — ROADMAP guardrail: "Catalog designs are original work: no licensed characters, brands, or franchise themes,
  including in children's designs."

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Add the catalog design track to `ROADMAP.md` | S1-S5 | inline | this commit |
| T2 | Visual directions for the improved children's birthday design under `design/` | S1-S5 | inline | this commit |
| T3 | Owner chooses a birthday direction; decide new `componentKey` vs. versioned renderer | S3 | owner | |
| T4 | Implement the chosen birthday design: renderer, contract, seed, tests | S2, S3 | pending T3 | |
| T5 | Visual directions for the XV años design | S1-S5 | pending | |
| T6 | Implement the chosen XV años design | S2, S3 | pending T5 | |
| T7 | Visual directions for the wedding design | S1-S5 | pending | |
| T8 | Implement the chosen wedding design | S2, S3 | pending T7 | |

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
