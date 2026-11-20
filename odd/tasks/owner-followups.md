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
| T1 | `referrerPolicy` camel-case property on the music cover; test fails on any React console error | S1 | inline | 2271770 |
| T2 | Sticky phone save-status strip | S2 | worker (editor UI) | see L6 |
| T3 | Publish copy only promises no cost for a free package | S3 | worker (editor UI) | see L6 |
| T4 | API review follow-ups (#81-#83) | S4 | worker (API) | see L7 |
| T5 | Web review follow-ups (#84, #85) | S4 | worker (web places) | |
| T6 | Delete merged temporary branches and the stash | S5 | inline | no commit (git state, L4) |
| T7 | Record the decisions and the admin configuration panel in `ROADMAP.md` | S6 | inline | pending commit |

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
- L4 — T6: dropped `stash@{0}` (a copy of b2dcca6's web tree, already in master); deleted 97 local branches and 85
  remote branches. Every one was an ancestor of master except six superseded reference branches, checked by tree:
  `feat/m7-payments` and `feat/m7-payments-split` equal master at #72 (`7ff470d`); `feat/lms-1-status-music` equals
  `b78f8f2`, inside `feat/location-music-status`, whose tree equals master minus Log L6; `feat/editor-redesign`,
  `tmp-t2c-full`, and `feat/m7-payments-a` are earlier states of work master holds with its review corrections.
  Kept: `master` and `fix/owner-followups`.
- L5 — T7: `ROADMAP.md` now records Mercado Pago and the refund rule under Milestone 7, Cloudflare R2 under
  Milestone 8, and the admin configuration panel under Milestone 9. Evidence: package prices are already editable in
  the admin catalog (`apps/web/app/admin/catalogo/paquetes/[id]/page.tsx`), and the S3 driver already supports R2
  (`apps/api/src/media/infrastructure/s3-media-storage.ts`, `MEDIA_S3_REGION=auto`), so R2 is configuration plus a
  bucket, not code.
- L6 — T2/T3 (worker): the phone strip was inert because the customer frame is `overflow-hidden`, a scroll container
  that never scrolls; below `lg` the frame now uses `overflow: clip` (`paper-wash:has([data-editor-shell])`), so the
  existing `sticky top-0` strip pins (Playwright 390 px: strip top 139 px → 0 px after scrolling; 1280 px unchanged).
  `publishHintFor(payment)` keeps «Publicar no tiene costo.» only for free mode or a zero-price package; a paid package
  or an unreadable payment read gets the hint without the promise. RED on the paid cases, web 1608 pass.
- L7 — T4 (worker), each finding fixed test-first: #81 playlist titles are one bounded line of visible text cut on a
  grapheme boundary, and a cover with whitespace or control characters is refused before the https CHECK can fail the
  save; #82 malformed stored places are skipped by `isStoredPlacePoint`; #82 Photon failures emit one structured
  warning (`place-search-failed`, category, status) without the query; #83 R4-002 a failed lookup is no longer cached
  as an empty answer; #83 R4-003 the repository keeps only stored rows the domain accepts. API 1688 unit and 144
  invitations db-specs pass.
