# Invitation editor redesign

The draft editor `/cuenta/invitaciones/<id>` is one long page with several independent forms; saving one form
discards what was typed in the others. Design directions first, then implement the one the owner chooses.

## Specs

- S1 — Owner, verbatim: "al crear una invitacion mucho scroll
  http://localhost:3000/cuenta/invitaciones/204edb11-2051-4526-82fe-8c9c6398bdbc?notice=features-saved muchos campos
  y si me voy con la finta y ya llene datos y alf inal le doy guardar al boton de ultimo los datos anteriores se
  pierden mejora el diseno"
- S2 — Reproduced defect: invitation `204edb11-…` (Ornamental · Terracota y salvia, Premium) is stored with content
  `{}` after the owner filled the content fields and pressed «Guardar funcionalidades» (`?notice=features-saved`).
  Every section of the page is its own `<form>`; submitting one reloads the page and drops unsaved input elsewhere.
  Whatever the chosen design, no save action may silently discard input typed in another part of the editor.
- S3 — The editor must need noticeably less scrolling to fill and publish an invitation, on a phone (390 px) and on
  desktop, while keeping every current capability: template content fields (grouped by the template's sections),
  main photo upload, gallery (when the package grants it), features (time zone, WhatsApp), RSVP settings and the
  guest list link (when granted), payment panel, publish, unpublish, archive, and the public link.

- S4 — Owner choice, verbatim: "Implement the design artboard design/editor-redesign/03-pestanas-y-vista-previa.html".
  Visual spec: that artboard (tabs on a left rail, form in the middle, the invitation rendered live at phone width on
  the right; on the phone the tabs sit on top and «Ver vista previa» is the fixed action; each field autosaves and one
  status line says «Guardando…» / «Guardado hace un momento» / «No se pudo guardar · Reintentar»). Map it to the
  project's components and the tokens in `design/system.md`; never copy the artboard HTML. Parent decisions within S4:
  the preview shows the last saved draft (it refreshes after each successful save), so it never shows data the API has
  not accepted; content autosave sends only the changed fields and the server merges them into the stored content, so
  an autosave never overwrites a field written elsewhere (such as the uploaded main photo).

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Three design directions under `design/editor-redesign/` (desktop and phone in each) | S1-S3 | worker | |
| T2a | Autosave: result-returning server actions (content fields merged into stored content, features, RSVP settings), a client save queue with debounce, one in-flight save, retry, and the status line; navigation guard while unsaved | S2, S4 | worker | |
| T2b | Owner preview route `/cuenta/invitaciones/<id>/vista-previa` rendering the stored draft through the renderer registry (owner only, noindex) | S3, S4 | worker | |
| T2c | Editor shell: tabs Contenido / Fotos / Funciones / Asistencia / Publicar, left rail and live preview pane on desktop, top tabs and «Ver vista previa» on the phone, existing sections moved into tabs | S1-S4 | worker, after T2a and T2b | |
| T3 | Verify in a browser at 390 and 1280 px, including the S2 reproduction | S2, S3 | verify | |
| T4 | Gates, review, PR, merge | S1-S3 | inline | |

## Log

- L1 — Owner request, verbatim: see S1. Context: the owner had deferred design polish to the end and is now doing the
  final visual review.
- L2 — T1 design directions: design/editor-redesign/ with 01-pasos-guiados.html, 02-un-solo-guardado.html, 03-pestanas-y-vista-previa.html.
- L3 — Owner chose `03-pestanas-y-vista-previa.html` (canvas handoff, status in_progress); the other two artboards are
  alternatives. T2 split into T2a (autosave), T2b (preview route), T2c (editor shell).
