# Editor «Contenido» grouping

The tabbed editor shipped in #73-#78 still shows every template field of «Contenido» at once, so a formal baptism
(14 fields, 12 required) is a long column of inputs. Design directions first, then implement the one the owner chooses.

## Specs

- S1 — Owner, verbatim: "dale una pasada mas al diseno de
  http://localhost:3000/cuenta/invitaciones/b1491b14-0438-4d9a-9686-72cb352dc10e?notice=created&seccion=contenido
  siento que en contenido son muchos inputs que ve el usuario y hace scroll podriamos agruparlo mejor dale una pasada
  mas para mejoras la experiencia"
- S2 — The owner's case: «Ornamental · Azul medianoche y oro», package Premium, fields of the formal baptism schema:
  Nombre de la persona bautizada*, Padres*, Padrinos*, Fecha*, Hora de la ceremonia*, Lugar de la ceremonia*,
  Dirección de la ceremonia*, Hora de la recepción*, Lugar de la recepción*, Dirección de la recepción*, Mensaje*
  (500), Confirmar asistencia*, Foto principal (URL), Mesa de regalos (200) — * required to publish.
- S3 — Keep what already works: every field autosaves with the status line, the «Contenido · faltan N» count, the live
  preview beside the form, the other four tabs, and the rule that nothing typed is ever lost. Fewer inputs visible at
  once and clearer groups, on a phone (390 px) and on desktop.

- S4 — Owner choice, verbatim: "Implement the design artboard design/editor-content-grouping/01-tarjetas-resumen.html".
  Visual spec: that artboard; map it to the project's components and the tokens in `design/system.md`; never copy its
  HTML. The grouping must work for every template schema, not only the baptism: cards come from the template's own
  sections, required-to-publish state and counts come from the same rule as «Contenido · faltan N», and optional fields
  without a required sibling gather in a last «Extras opcionales» card.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Three design directions for «Contenido» under `design/editor-content-grouping/` | S1-S3 | worker | |
| T2 | Implement `01-tarjetas-resumen.html` in the «Contenido» tab: cards by meaning, one open at a time, closed-card summary and state, paired fields, «Siguiente: …», tests | S1-S4 | worker | |
| T3 | Browser check at 390 and 1280 px | S3 | inline | |
| T4 | Gates, native review, PR, CI, merge | S1-S3 | inline | |

## Log

- L1 — Owner request, verbatim: see S1.
- L2 — T1 design directions: design/editor-content-grouping/ with 01-tarjetas-resumen.html, 02-un-grupo-por-pantalla.html, 03-resumen-editable.html.
- L3 — Owner chose `01-tarjetas-resumen.html` (canvas handoff in progress); the other two artboards are alternatives.
- L4 — T2 summary cards: pure card model `lib/customer/content-cards.ts` (cards from the template's own sections,
  paired date/time and place/address rows, one-line summaries, states computed with `missingRequiredNames`, an
  «Extras opcionales» card only for sections made entirely of optional fields), the accordion island
  `content-cards.tsx` (one open card, «Siguiente: …» with focus move, flush on switching cards), required fields marked
  with an asterisk and one legend line. Deviation from the artboard: a section's optional fields stay in their card
  when the section also has required ones, so the baptism shows «Foto principal» and «Mesa de regalos» inside «Mensaje
  y contacto». Web suite 1536 pass; browser check at 390 and 1280 px: states and counts agree, pairs stack on the phone
  and share a row on desktop, nothing typed is lost when switching cards or reloading.
