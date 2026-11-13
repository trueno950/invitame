# Invitation features — first batch

Branch `feat/invitation-features` from `feat/catalog-designs` at `4918aa6`. The guest invitation shows the features its
package includes: map links, a live countdown, WhatsApp, and add-to-calendar, with feature data stored per invitation.

## Specs

- S1 — Owner request, verbatim: "me gusta lo que ya tenemos hasta ahora, pero me gustaria mejorar, pulir los disenos
  de plantillas, agregarle mejor diseno, y otra cosa aun no desarrollamos mas funcionalidades que mostrara cada
  invitacion no como mapa, playslist, y otras funcionalides no ?"
- S2 — Owner choices (L2), verbatim answers: «¿Qué hacemos primero?» → "Funcionalidades primero (Recomendado)";
  «¿Qué funcionalidades quieres en la primera tanda?» → "Rápidas: mapa, cuenta regresiva, WhatsApp, calendario";
  «¿Qué mejoras de diseño te interesan más?» → "Ilustraciones reales por tema" (a later feature, after this batch).
- S3 — Owner choices (L3), verbatim answers: feature data → "Aparte, por invitación (Recomendado)" — "Una sección
  «Funcionalidades» en el borrador, independiente de la plantilla. Agrega una tabla nueva en la base (migración que
  solo agrega, no borra). Cambiar de plantilla no las afecta."; time zone → "El cliente la elige"; calendar →
  "Sí, en todos (Recomendado)" — "Es básico para el invitado y no está en el catálogo de funcionalidades hoy.";
  countdown → "Días, horas y minutos en vivo (Recomendado)" — "Se ve viva; usa un poco de JavaScript solo en ese
  bloque. Sin JavaScript muestra el valor al abrir."
- S4 — Contract decided by the parent within S1-S3 (L3; the owner may overturn), workers treat it as spec:
  - **Gating.** The API decides which features a guest page shows: the invitation package's feature keys
    intersected with the implemented allow-list `COUNTDOWN`, `MAP`, `WHATSAPP`; add-to-calendar is always on and is not
    a catalog feature. WhatsApp also needs a stored phone. Package and feature names never select code paths beyond
    this explicit allow-list (AGENTS.md).
  - **Data.** Additive migration only. `Invitation.timeZone` is an IANA zone from an allow-list (Mexico's zones:
    `America/Mexico_City`, `America/Cancun`, `America/Mazatlan`, `America/Hermosillo`, `America/Chihuahua`,
    `America/Tijuana`, `America/Matamoros`, `America/Monterrey`, `America/Merida`, `America/Ojinaga`,
    `America/Bahia_Banderas` — narrow it to the zones current tz data treats as distinct if a worker proves some are
    aliases), default `America/Mexico_City` for new and existing rows. A one-to-one `InvitationFeatureSettings` table
    (invitation id primary key and foreign key, `whatsappPhone` nullable, timestamps) holds feature data; it is
    owned by the invitation's creator, and changing the template does not touch it.
  - **WhatsApp phone.** Accept a Mexican 10-digit number with spaces, dashes, or parentheses, or an international
    `+` number of 8 to 15 digits; store E.164 (`+52` added to a 10-digit Mexican number); never log it.
  - **API.** The draft read returns `timeZone`, `featureSettings: { whatsappPhone }`, and `availableFeatures` (the
    gated keys plus `CALENDAR`). Updating the time zone and feature settings is creator-owned, validated, and refused
    for archived invitations, like content saves. The public read returns `timeZone` and `features` with `countdown`,
    `map`, and `calendar` as booleans and `whatsapp` as `{ phone }` or null, and nothing else about the package.
  - **Guest page.** Each layout places one shared, themed features block in its flow, using the theme CSS variables.
    No feature data means no block, so current renders stay byte-identical. Map: «Cómo llegar» buttons to Google Maps
    and Waze per place (two places for baptisms), built from the layout's own address fields, with no embedded map and
    no API key. Countdown: days, hours, and minutes to the event start in the invitation's time zone, rendered on the
    server at request time, ticking in a small client island; it says the event is today or has passed when it
    should, and has no motion. Calendar: a Google Calendar link and an `.ics` download for a four-hour event at the
    start time in the invitation's zone; for baptisms the ceremony is the start and the reception goes in the
    description. WhatsApp: a button to `wa.me/<digits>` with a neutral prefilled Spanish greeting naming the
    celebration.
  - **Creator.** The draft page gets a «Funcionalidades» section with a time zone select (Spanish labels) and, when
    the package includes WhatsApp, a phone field; it lists the automatic features (map, countdown, calendar) the
    guests will see.
- S5 — Owner answers (L8), verbatim: "1 si es hoy 2 si 3 si" to: (1) «¿Prefieres "¡Es hoy!" mientras dura el
  evento?» — the countdown says «¡Es hoy!» from the start for the four hours the event lasts, then «La celebración ya
  pasó»; (2) «¿Los dejo así o los cambio?» about «Todo lo que necesitas» and the WhatsApp greeting — kept as they
  are; (3) «¿Lo quito y dejo solo el nombre del lugar?» — the time zone labels drop the IANA id.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| F1 | API: migration, time zone and phone domain, feature settings use cases and REST, gated public read, tests | S3, S4 | worker | `bb0e94e` |
| F2 | Web: event facts per layout, features block, countdown island, map/WhatsApp/calendar links, ICS builder, placement in the five layouts | S3, S4 | worker | `d350dd0` |
| F3 | Web: public page wiring, `.ics` route, creator «Funcionalidades» section, API client, browser check | S3, S4 | worker | `aa246d4` |
| F5 | Countdown «¡Es hoy!» during the event; zone labels without IANA ids; keep the provisional copy | S5 | inline | `c779bcd` |
| F4 | Independent verification of the migration and the gating | S4 | verify | `617c2b5` |

## Log

- L1 — Owner request (S1). The parent explained that 9 features exist only as catalog data and that packages already
  promise some of them (Basic: COUNTDOWN, MAP, WHATSAPP); no layout implements any. Before charging (Milestone 7),
  each promised feature must work or the package text must change.
- L2 — Priorities chosen (S2): features first, starting with the quick batch; design polish later with real
  illustrations per theme; the elegant line after both.
- L3 — Data, time zone, calendar, and countdown choices (S3). The parent fixed the contract S4 and split the work: F1
  (API) and F2 (web rendering) run in parallel with disjoint surfaces; F3 waits for F1's real contract.
- L4 — F2 done in `d350dd0` (worker `mwf7dw2m-k-5ivx`). It adds pure helpers (start instant in an IANA zone, countdown,
  map, Google Calendar, an RFC 5545 `.ics` builder, and `wa.me` links), event facts for the five layouts, and one
  themed features block whose only client component is the countdown island; each layout places the block after its
  details. Web: 853/853 tests; tsc and Biome clean. Differential: with no features, all five layouts in every theme,
  with full and minimal content, rendered byte-identical to HEAD (25/25, run before commit). The parent then removed
  that HEAD-reading test from the committed file, because committed tests must not read git history. Owner flags:
  the countdown reads «ya pasó» from the start instant; the copy is provisional («Todo lo que necesitas», the WhatsApp
  greeting).
- L5 — F1 done in `bb0e94e` (worker `mwf7dvy1-j-dib2`). It adds the migration `20261113164740_add_invitation_features`, which
  is additive only: `Invitation.timeZone` NOT NULL with default `America/Mexico_City` and a format CHECK; the
  one-to-one `InvitationFeatureSettings` table with RESTRICT on delete and an E.164 CHECK on the phone. It also adds
  the domain gating, `PUT /invitations/:id/features`, and the gated public read. All 11 time zones are canonical in tz
  data, so none were dropped. A phone stored without the WHATSAPP package key is kept but never shown publicly. API:
  1173/1173 unit tests and 308/308 db-specs pass; tsc and Biome clean. The worker applied the migration to
  `invitame_test` only; the parent then applied it to the dev database. Dev check: the public read answers 200 with
  `timeZone` and the gated `features`. F3 and F4 launched.
- L6 — F4 independent verify `mwf8an7b-m-s8le` returned every point met. Migration: additive only; its checksum in
  both databases equals the file, so it was not edited after application; the dev database's 7 existing invitations
  read `America/Mexico_City`; the CHECKs and the RESTRICT foreign key match the domain; `docs/database/model.md` gives
  a real rollback. Gating: exactly package keys ∩ {COUNTDOWN, MAP, WHATSAPP} plus CALENDAR; a phone under a package
  without WHATSAPP never reaches the public body; nothing about the package leaks. Authorization: foreign id 404,
  archived 409, unknown DTO fields 400, the owner and status guard enforced in the same write, and stored rows
  unchanged on every refusal. The phone is never logged. The public read uses 6 queries for any feature count. API:
  1173 unit tests and 308 db-specs pass. Advisory: the database checks the zone's shape only, by design. The parent
  added the verifier's zone-versus-CHECK regression test (`test(api)` commit after `727e312`) and removed the
  verifier's scratch directory.
- L7 — F3 done in `aa246d4` (worker `mwf8an3l-l-6zhd`). It adds strict web parsers for the new API fields, the public page
  passing `features` and `calendarHref`, the `/i/<slug>/calendario.ics` route (`text/calendar`, attachment,
  `no-store`, 404 when not public), and the creator «Funcionalidades» section: a select of the 11 zones with Spanish
  labels, the WhatsApp field only when the package includes it (otherwise the stored phone is carried unchanged), the
  automatic features list, and a read-only state when archived. Web: 882/882 tests; tsc, docs, Biome, and
  `git diff --check` pass. A differential on the shared `lib/customer/invitations.ts` surface found 0 differences
  in 43 cases. In the browser at 390 and 1280 px: zone and phone saved, the block rendered in the theme, the countdown
  ticked, the Maps, Waze, WhatsApp, and Google Calendar links were correct, the `.ics` was parseable, 0 console
  errors, no overflow, and the minimum contrast in the block was 5.47:1. Not run: the Playwright e2e specs. Batch
  complete; next is the design polish with real illustrations per theme.
- L8 — Owner answers (S5). F5 done inline in `c779bcd`, test-first: 6 RED failures on «live» and the labels, then GREEN.
  A new status `live` covers the start through the four-hour `CALENDAR_EVENT_HOURS`. Labels are now only the place
  name. Web: 884/884 tests; tsc, docs, and Biome pass. Not checked in a browser: the change is copy and status logic
  pinned by markup tests.
