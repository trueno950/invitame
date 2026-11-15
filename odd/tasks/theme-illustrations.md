# Theme illustrations — hand-built SVG

Branch `feat/theme-illustrations` from `feat/invitation-features` at `618b95f`. Replace the geometric placeholder
motifs of the 22 guest themes (8 birthday, 8 baby shower, 6 baptism) with richer original illustrations drawn as SVG code, after the owner approves a style
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
- S4 — Owner choice through the design canvas (L3), verbatim: "Implement the design artboard
  design/theme-illustrations/01-papel-recortado.html" — «Paper cut-out», tradeoff: "Chunky, warm and instantly
  readable at 390 px, and each theme becomes a physical diorama; the heaviest hand-drawing of the three, and a busy
  scene needs a tall header". Handoff instruction: "Implement it in the project's real stack. Use the artboard as the
  visual spec: map its parts to the project's existing components and styles, and do not copy the artboard HTML
  verbatim." Parent decisions within S4 (L3; owner may overturn): every theme gets a header scene, a divider, and a
  footer strip in the paper-cut technique (layered flat sheets, 3-4 px offset shadows, torn edges, subtle grain),
  drawn as original SVG from the theme's seven colors; decoration stays in its own zones, never behind text; each
  theme's illustration stays under about 25 KB; the illustrations replace today's motif strips in all five layouts,
  so existing invitations change look (pre-launch, accepted); a theme without an illustration yet keeps its motif
  strip.
- S5 — Owner review of the 22 illustrations (L6), verbatim: "baby-safari y el del oso mejoralos, y los de cumpleanos
  si mejoralos mas se ven muy simples". Parent decisions within S5 (L6): richer, deeper scenes for `baby-safari`,
  `teddy-honey`, and all eight birthday themes — more depth layers, more detail on the hero objects, secondary
  props, and texture — in the same paper-cut technique and within S3; the per-theme markup budget rises from 25 KB
  to 40 KB.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| I1 | Style samples: Dinosaurios on the Cartel layout at 390 px in three SVG illustration styles under `design/theme-illustrations/` | S1-S3 | worker | |
| I2 | Owner picks a style (or a mix) | S2, S4 | owner | L3 |
| I3a | Paper-cut illustration system: shared SVG primitives, per-theme contract, Dinosaurios, placement in the five layouts with fallback to today's motif strips, tests, browser check | S1-S4 | worker | `d945484` |
| I3b | Paper-cut illustrations for the other 7 birthday themes | S1-S4 | worker | `493acdf` |
| I3c | Paper-cut illustrations for the 8 baby shower themes | S1-S4 | worker | `493acdf` |
| I3d | Paper-cut illustrations for the 6 themed baptism themes | S1-S4 | worker | `493acdf` |
| I4a | Richer `baby-safari` and `teddy-honey` | S3, S5 | worker | |
| I4b | Richer birthday scenes: dinosaurs, ice-kingdom, rescue-team, spider-hero | S3, S5 | worker | |
| I4c | Richer birthday scenes: classic-mouse, under-the-sea, fairytale-princess, blocks-and-pixels | S3, S5 | worker | |
| I4d | Integration: checks, browser review, new contact sheets | S5 | inline | |
| I3e | Integration: all 22 themes in the browser at 390 px, docs, canvas handoff | S1-S4 | worker | `493acdf` |

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
- L3 — Owner chose `01-papel-recortado.html` through the canvas handoff (S4); the parent recommended the mix 01 + 03,
  and the owner chose 01 alone. Correction: there are 22 guest themes, not 28. I3 split into I3a (system,
  Dinosaurios, placement), I3b-I3d (themes per occasion, parallel workers after I3a), and I3e (integration). Canvas
  handoff reported `in_progress`.
- L4 — I3a done in `d945484` (worker `mwh85o4n-o-n6ur`). The paper-cut system under
  `app/_components/renderers/illustrations/` includes cut-sheet primitives with offset shadows, deterministic torn
  edges, grain with per-render ids, and colors only from the `--inv-*` variables (`ThemePaint` type). It also
  includes the per-theme contract {scene, divider, footer}, `DecorationZone`, and per-occasion registries. The
  Dinosaurios drawing is 17.1 KB, with a redrawn volcano. All five layouts place it in decoration-only zones;
  themes without a drawing keep their motif strip byte-identical, pinned in tests. Web: 915/915 tests; tsc, docs,
  and Biome pass. Browser: 16 runs at 390 and 1280 px with 0 overflow, 0 decoration over text, and 0 console
  errors; minimum contrast 5.14:1. Adding a theme takes one file plus one line in its occasion registry. I3b-I3d
  launched in parallel.
- L5 — I3b-I3e done in `493acdf`. Workers `mwh954dn-p-r13d` (7 birthday), `mwh954jg-q-s8yj` (8 baby shower), and
  `mwh954yq-r-5qst` (6 baptism) drew the remaining themes. Each worker stopped on the same shared-test assumption
  (only dinosaurs illustrated); I3e (worker `mwhb7ko1-s-sl76`) resolved it. The registry test now requires exactly
  the 22 catalog keys. The fallback is proven with an unregistered key per layout shape, plus a real layout with
  one registry entry removed for a single render. The per-theme property block runs for all 22 themes. I3e also
  added the missing baptism divider zone and refined six drawings (dove wing, lamb wool, star rays, safari leaves,
  bunny carrots, blocks depth); it fixed a duplicate React key in woodland-friends found by the broadened suite.
  Sizes: 9.0-24.9 KB per theme (dove-olive 24.9 KB is near the 25 KB budget). Checks: web 1030/1030, tsc, docs, Biome,
  and `git diff --check` pass. Browser: 38 pages at 390 px plus 5 at 1280 px with 0 overflow, 0 decoration over
  text, 0 console errors, and no text below 4.5:1. The parent reviewed the three contact sheets for the theme
  guardrail and found no character, logo, or franchise element. Canvas handoff reported implemented.
- L6 — Owner review (S5): improve baby-safari and the teddy bear, and make the birthday themes richer because they look
  too simple. The parent raised the markup budget to 40 KB (test constant and docs) and split the work into three
  parallel workers with disjoint theme files (I4a-I4c), then integration (I4d).
