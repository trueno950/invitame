# Creation flow UX

Make the customer flow from choosing a template to publishing intuitive, so a customer does not abandon it.
Evidence: a browser walkthrough with a test customer (desktop 1440 px and phone 390 px) plus a code map.

## Specs

- S1 — Owner, verbatim: "Volver a mis invitaciones siento que no se ve por el diseno, eso pasa en todos los pasos,
  mira tu todo ese flujo desde selecionar plantilla hasta publicar para que desde tu perspectiva mires que podriamos
  mejorar y que sea mas intuitivo y facil para el usuario ya que se se le hace dificil lo va dejar y ya no lo hara"
- S2 — Owner approved all seven proposals ("1-3: guía, compartir y volver", "4: faltantes con enlace", "5: celular",
  "6-7: lista y textos"):
  1. Editor first steps: "una tarjeta de «Primeros pasos» con progreso (Completa tus datos → Agrega fotos → Publica)
     y una barra de «3 de 16 listos» en lugar de un «faltan 13» que asusta". The editor heading names the
     customer's own invitation instead of only the template name.
  2. Publish success: "un panel de éxito con esos tres botones grandes" — copy link, share by WhatsApp, view my
     invitation.
  3. Back navigation: "el mismo botón «← Mis invitaciones» arriba a la izquierda en todos los pasos, también en
     celular".
  4. Missing fields: "que cada faltante sea un enlace que te lleve directo a ese campo".
  5. Phone: «Atrás» visible in the chooser bar; the editor's bottom bar shows the next step, not only the preview.
  6. List: "mostrar el nombre del festejado, la fecha y una miniatura" instead of the slug.
  7. Copy: fix "usa Pagar y publicar *en el resumen*" — that summary no longer exists in the layout.
- S3 — Keep what works: autosave and its status line, nothing typed is ever lost, the live preview, server-first
  pages (client components only for real interactivity), every state readable without relying on color alone.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Editor: first-steps card with progress, heading, missing fields as links, publish success share panel, phone bottom bar next step, payment copy fix | S2.1, S2.2, S2.4, S2.5 (editor), S2.7, S3 | worker A | |
| T2 | Navigation and list: «← Mis invitaciones» on every step (chooser, editor, payment, preview, guests), chooser «Atrás» on phone, list cards with celebrant name, date, and miniature | S2.3, S2.5 (chooser), S2.6, S3 | worker B | |
| T3 | Browser walkthrough again at 1440 and 390 px, gates, commit, push, CI | S1-S3 | inline | |

## Log

- L1 — Owner request, verbatim: see S1.
- L2 — Walkthrough evidence: on the chooser, «Volver a mis invitaciones» is a 20 px text link at the bottom of the
  page after all content; the editor header shows the template name and «Contenido faltan 13»; the publish tab shows
  the link only as read-only text with no copy or share action; list cards are titled by slug
  (`invitacion-z1o9m3`); the chooser hides «Atrás» below `sm`.
- L3 — Owner approved all seven proposals (S2).
