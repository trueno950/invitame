# Theme illustrations — hand-built SVG

Branch `feat/theme-illustrations` from `feat/invitation-features` at `618b95f`. Replace the geometric placeholder
motifs of the 28 guest themes with richer original illustrations drawn as SVG code, after the owner approves a style
on one sample theme.

## Specs

- S1 — Owner request (from `odd/tasks/invitation-features.md` S1-S2), verbatim: "me gustaria mejorar, pulir los
  disenos de plantillas, agregarle mejor diseno"; chosen improvement: "Ilustraciones reales por tema".
- S2 — Owner choices, verbatim: about AI images, "a pero que no se vean tan ia"; after learning no image model is
  reachable (no OpenRouter credit, no ChatGPT image login, OpenCode Go has no image models), the owner chose option
  3, "SVG hecho por mí: gratis. Empezaría con Dinosaurios en 2 o 3 estilos para que veas si te convence antes de
  hacer los demás.", answering "3".
- S3 — Rules inherited from the catalog design track: original artwork only, never character artwork, logos, or
  protected names (ROADMAP theme guardrail); decoration never behind text; colors only from the theme's seven
  tokens; motion-free; WCAG AA for any text; mobile-first at 390 px.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| I1 | Style samples: Dinosaurios on the Cartel layout at 390 px in three SVG illustration styles under `design/theme-illustrations/` | S1-S3 | worker | |
| I2 | Owner picks a style (or a mix) | S2 | owner | |
| I3 | Illustration contract and the 28 themes in the chosen style, wired into the five layouts, tests, browser check | S1-S3 | pending I2 | |

## Log

- L1 — Owner chose hand-built SVG (S2). `pi-codex-image-gen@0.2.0` was installed into Gentle Shell's agent
  (`settings.json` backup `settings.json.bak-20261114-pre-codex-image-gen`) at the owner's request, but it needs a
  ChatGPT image login that the owner does not use, so it is not used here. `design/system.md` is stale for the
  guest theme tokens; the samples take colors straight from `apps/web/lib/renderers/birthday-themes.ts`.
- L2 — I1 done by worker `mwh6rzof-n-eqwg`: `design/theme-illustrations/` holds three versions of the Dinosaurios Cartel
  at 390 px, each with a different illustration style: `01-papel-recortado.html`, `02-trazo-y-acuarela.html`, and
  `03-risografia.html`. All three have no overflow, no console errors, and no decoration over text; minimum contrast
  5.85:1; illustration SVG 17.8, 19.3, and 21.2 KB. The worker recommends 01, or 01's header scene with 03's screens
  for dividers and footers. Costs: the header grows from 64 to about 200 px; estimated 5-8 h per theme for
  paper-cut, less for riso. Waiting for the owner's choice (I2).
