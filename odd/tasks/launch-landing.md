# Launch landing

Convert the honest pre-launch landing (`apps/web/lib/landing/copy.ts`, "Próximamente") into the real launch
page that leads to creating an invitation. Design first, then implement the chosen direction.

## Specs

- S1 — Owner priority choice: "Landing de lanzamiento" — "Quitar los «Próximamente» y conectar la landing al
  catálogo, los precios y el registro. Primero propongo direcciones de diseño."
- S2 — Primary goal: "Llevar a crear invitación" — "El botón principal lleva a registrarse y empezar una
  invitación."
- S3 — Section "Galería de diseños reales" — "Muestras del catálogo publicado, por ocasión."
- S4 — Section "Paquetes y precios" — "Los precios en MXN que vienen del panel de administración."
- S5 — Section "Cómo funciona" — "Elegir diseño, llenar los datos, pagar y compartir."
- S6 — Section "Preguntas frecuentes" — "RSVP, cuánto dura la invitación, pagos y reembolsos."
- S7 — Owner: "Sí, sincroniza" the design system before designing (done: `design/system.md`, `design/system.html`).

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Design directions for the landing (`design/launch-landing/`), owner picks one | S1-S6 | inline | see Log |
| T2 | Replace `copy.ts` with the launch copy and the active CTA (create-invitation) | S2 | worker | |
| T3 | Gallery section: real catalog designs by occasion | S3 | worker | |
| T4 | Pricing section: packages and MXN prices from the catalog/admin | S4 | worker | |
| T5 | How-it-works and FAQ sections | S5, S6 | worker | |
| T6 | Update `copy.test.ts` and landing/e2e tests; docs sync | S1-S6 | worker | |

## Log

- L1 — Owner: "no aun tenemos epndientes en la pagina y debemos de mejorar, arreglar construir esa
  funcionalidades que faltan, como esta el roadmap? que nos falta? que tenemos?" (2026-11-30).
- L2 — Design system synced (`design/system.md`, `design/system.html`: the guest layer now documents the
  seven-role themed system instead of the deleted `birthday-adventure-01` palettes). Landing directions
  proposed in `design/launch-landing/` (`01-editorial-romantica.html`, `02-galeria-protagonista.html`,
  `03-directa-funcional.html`); awaiting the owner's pick. Prices in the artboards are illustrative MXN
  placeholders — the real values come from the admin panel.
