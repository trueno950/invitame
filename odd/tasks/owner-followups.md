# Owner follow-ups after the location, music, and save-status work

Branch `fix/owner-followups` from master `dc88f77`. A bug the owner hit on the published guest page, the open items
listed after PR #85, and the owner's decisions on the blocked items. Mercado Pago and Cloudflare R2 get their own
feature documents; this one records the decisions and fixes the rest.

## Specs

- S1 — The published guest page logs no React DOM property warning. Owner: «al publicar y abrir la plantilla me da
  Invalid DOM property `referrerpolicy`. Did you mean `referrerPolicy`?». The cover keeps sending no referrer.
- S2 — «En el celular, la barra del estado de guardado no se queda fija al desplazarse.» → On a phone the editor's
  save-status strip stays visible while the owner scrolls the form; desktop is unchanged.
- S3 — «El texto «Publicar no tiene costo» aparece también en paquetes de pago.» → The publish copy says publishing
  has no cost only for a package that is free (or while payments run in free mode); a paid package never promises it.
- S4 — «Las revisiones dejaron avisos menores que no bloquean y están anotados en cada PR para más adelante.» → Each
  advisory finding of the five native reviews (#81-#85) is either fixed with a test or recorded here as not a defect,
  with the reason.
- S5 — «Hay ramas temporales (feat/lms-* y otras más antiguas) y un git stash que ya no hacen falta.» → Delete the
  temporary branches whose work is already in master, locally and on the remote, and drop the stash; keep `master`
  and anything not proven merged.
- S6 — Owner decisions (L2): payments with «Mercado Pago (recomendado)»; production photos in «Cloudflare R2
  (recomendado)»; refunds «Sin reembolso tras publicar» (full refund only when the invitation was never published);
  prices: «hacerlo configurable de hecho deberiamos tener un panel admin para todo eso que es configurable tenlo en
  el radar» → recorded in `ROADMAP.md` as an admin configuration panel (prices and other configurable catalog data).

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | `referrerPolicy` camel-case property on the music cover; test fails on any React console error | S1 | inline | |
| T2 | Sticky phone save-status strip | S2 | worker (editor UI) | |
| T3 | Publish copy only promises no cost for a free package | S3 | worker (editor UI) | |
| T4 | API review follow-ups (#81-#83) | S4 | worker (API) | |
| T5 | Web review follow-ups (#84, #85) | S4 | worker (web places) | |
| T6 | Delete merged temporary branches and the stash | S5 | inline | |
| T7 | Record the decisions and the admin configuration panel in `ROADMAP.md` | S6 | inline | |

### Review advisory findings (S4)

Only the id, lens, severity, and location survived the review closure; the worker inspects the location, names the
concrete weakness, and fixes it with a test or records why it is not a defect.

- #81 R1-001 risk WARNING, R4-001 resilience WARNING — `apps/api/src/invitations/domain/invitation-features.ts:248-271`
  (playlist title and cover normalization).
- #82 R4-malformed-stored-place resilience WARNING — `apps/api/src/invitations/domain/invitation-place.ts:234-242`.
- #82 R4-silent-photon-failures resilience WARNING — `apps/api/src/invitations/infrastructure/photon-place-search.ts:206-227`.
- #83 R4-002 resilience WARNING — `apps/api/src/invitations/application/invitation-place.use-cases.ts:103-120`.
- #83 R4-003 resilience WARNING — `apps/api/src/invitations/infrastructure/prisma-invitation.repository.ts:47-55`.
- #83 R4-001 resilience CRITICAL was refuted (place write racing an archive; archived invitations are read-only and
  not public): no change.
- #84 R4-001 resilience WARNING — `apps/web/lib/invitation-features/place-point.ts:124-129`.
- #84 R4-002 resilience WARNING — `apps/web/app/_components/invitation-features/place-map-island.ts:131-162`.
- #85 R1-001 risk WARNING — `apps/web/app/cuenta/invitaciones/[id]/_components/editor-fields.tsx:409-444`.
- #85 R1-002 risk SUGGESTION — `apps/web/app/cuenta/invitaciones/place-actions.ts:55-62`.
- #85 R2-001 readability WARNING — `editor-fields.tsx:312-332`; R2-002 readability SUGGESTION — `place-actions.ts:109-113`;
  R2-003 readability SUGGESTION — `apps/web/lib/customer/place-picker.test.ts:120-121`.
- #85 R4-001 resilience WARNING — `editor-fields.tsx:317-330`; R4-002 resilience WARNING — `editor-fields.tsx:434-437`.

## Log

- L1 — Owner request verbatim: «al publicar y abrir la plantilla me da Invalid DOM property `referrerpolicy`. Did you
  mean `referrerPolicy`? y de lo pendiente Pendientes, sin cambios respecto a antes: - En el celular, la barra del
  estado de guardado no se queda fija al desplazarse. - El texto «Publicar no tiene costo» aparece también en paquetes
  de pago. - Las revisiones dejaron avisos menores que no bloquean y están anotados en cada PR para más adelante. -
  Siguen pendientes tus decisiones sobre el proveedor de pagos, el almacenamiento de fotos en producción, los precios
  de los paquetes y los reembolsos. - Hay ramas temporales (feat/lms-* y otras más antiguas) y un git stash que ya no
  hacen falta. No los borré sin tu permiso. corrige»
- L2 — Owner answers: payments «Mercado Pago (recomendado)»; photos «Cloudflare R2 (recomendado)»; prices «hacerloc
  onfigurable de hcho deberiasmo tener un panel admin para todo eso que es configurable tenlo en el radar»; refunds
  «Sin reembolso tras publicar».
- L3 — T1 root cause: the cover `img` passed the lower-case `referrerpolicy` prop to `createElement`; React DOM wants
  `referrerPolicy` and warns in development. RED: the cover test now fails on any `console.error` during render
  (observed the warning); GREEN with `referrerPolicy`; the rendered attribute is unchanged (case-insensitive).
