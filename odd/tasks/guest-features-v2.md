# Guest features v2

Close the feature gap against the market (Mexican digital invitation services and Joy/Zola/Paperless Post/Greenvelope),
one feature at a time, in priority order. Each feature gets design directions, the owner's pick, implementation,
verification, CI, and its own merge to `master` before the next starts. Task IDs: `F<n>` in the table is task `T<n>`
(F3 = T3).

## Specs

- S1 — Owner, verbatim: "el del dominio si descartalo el de recordatorios por whatsapp lo puedes implementar pero lo
  podemos dejar pendiente y activarlo luego cuando tengamos para pagar la subs de sms si ese no, arranca por todos, epro
  en orden de prioridad"
- S2 — Scope and order (owner approved the package column, «Sí, así»): 1 itinerary (all packages); 2 gift registry with
  several links and bank transfer details (Deluxe); 3 RSVP with companion names, children, and dietary restrictions
  (Premium, Deluxe); 4 lodging and transport (Premium, Deluxe); 5 table number on the guest pass (Deluxe); 6 WhatsApp
  reminders, built but switched off until the owner activates a provider subscription (Deluxe); 7 guestbook (Premium,
  Deluxe); 8 guest photo album with QR upload and moderation (Deluxe); 9 livestream link (Premium, Deluxe); 10 opening
  animation (all); 11 custom invitation address `/i/<name>` (all); 12 co-hosts (Premium, Deluxe); 13 password-protected
  invitation (Deluxe); 14 English invitation (all). Discarded: custom domain per customer, SMS.
- S3 — Owner: «Propuestas en todas» — every feature starts with design directions under `design/<slug>/` and waits for
  the owner's pick.
- S4 — Owner: «Una por una a master» — each feature is finished, verified, passes CI, and merges before the next one.
- S5 — Package gating is data: each new capability is a catalog feature key granted by packages (`AGENTS.md`: feature
  keys never select code paths by name; behavior lives behind an allow-listed implementation), editable from the
  administration panel.
- S6 — Paid providers stay behind ports: WhatsApp reminders use a provider port whose default adapter sends nothing
  and reports «not configured»; turning it on needs only configuration, never code.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| F1 | Itinerary | S2.1, S3-S5 | design → worker | 4889297, e3e7357, d30c9c6, fix below |
| F2 | Gift registry with several links and transfer details | S2.2, S3-S5 | design → worker | |
| F3 | RSVP with companions, children, dietary restrictions | S2.3, S3-S5 | design → worker | |
| F4 | Lodging and transport | S2.4, S3-S5 | design → worker | |
| F5 | Table number on the guest pass | S2.5, S3-S5 | design → worker | |
| F6 | WhatsApp reminders (switched off) | S2.6, S3-S6 | design → worker | |
| F7 | Guestbook | S2.7, S3-S5 | design → worker | |
| F8 | Guest photo album | S2.8, S3-S5 | design → worker | |
| F9 | Livestream link | S2.9, S3-S5 | design → worker | |
| F10 | Opening animation | S2.10, S3, S4 | design → worker | |
| F11 | Custom invitation address | S2.11, S3, S4 | design → worker | |
| F12 | Co-hosts | S2.12, S3-S5 | design → worker | |
| F13 | Password-protected invitation | S2.13, S3-S5 | design → worker | |
| F14 | English invitation | S2.14, S3, S4 | design → worker | |

## Log

- L1 — Owner request, verbatim: see S1. Market comparison and running-cost review delivered in conversation before it.
- L3 — F1: owner picked `design/itinerary/01-linea-de-tiempo.html` («Línea de tiempo»); the other two are
  alternatives. Parent decisions for F1 (binding):
  1. Data: a new nullable `itinerary` JSONB column on `InvitationFeatureSettings` holding a versioned, validated payload
     `{ version: 1, items: [{ time: "HH:MM", title, place?, address? }] }`, 1-15 items, `title` 1-60 chars, `place`
     and `address` up to 160 chars, kept in the owner's order; an absent or empty list means no itinerary. Additive
     migration; never edit an applied one. Documented in `docs/database/model.md` as a bounded presentation payload.
  2. Gating: a new catalog feature key `ITINERARY` added to the domain allow-list and granted to basic, premium and
     deluxe. The seed never updates existing packages, so the same migration inserts the feature row and the three
     package links by key (idempotent `ON CONFLICT DO NOTHING`); the seed also declares it for fresh databases.
  3. API: the existing `PUT /invitations/:id/features` (and its read) carries `itinerary`; the public read answers
     `features.itinerary` (the items) only when the pinned package grants `ITINERARY` and the list is not empty.
  4. Web editor: the «Funciones» tab gets an «Itinerario» block to add, edit, remove and reorder moments (time,
     title, optional place and address), saved through the existing autosave.
  5. Guest page: the shared features block draws the timeline of the artboard with the theme's own tokens
     (`--inv-*`), so every layout gets it; a moment with an address shows «Cómo llegar» as a Google Maps search
     link; the first moment is the filled dot.
- L4 — F2: owner picked `design/gift-registry/01-botones-de-tienda.html` («Botones de tienda»); the other two are
  alternatives. Parent decisions for F2 (binding):
  1. Data: a new nullable `giftRegistry` JSONB column on `InvitationFeatureSettings`, versioned and validated:
     `{ version: 1, stores: [{ name, reference?, url }] (0-8; name 1-40, reference up to 60, url https only up to
     500), transfer?: { bank, holder, clabe } (bank/holder 1-60; clabe 18 digits with a valid CLABE control digit),
     envelopes: boolean, note?: string (up to 200) }`. Empty means no registry. Additive migration; documented.
  2. Gating: the existing `GIFT_REGISTRY` feature key (Deluxe); no new key.
  3. Legacy: the old content text field `giftRegistry` stays for existing invitations. When the structured registry has
     at least one store, a transfer, or envelopes, the guest page shows only the new card: the API adds the legacy
     field to the public `hiddenFields` and withholds it, reusing the omitted-sections mechanism.
  4. Editor: the «Funciones» tab gets a «Mesa de regalos» block (stores with add, remove, reorder; transfer data;
     «Lluvia de sobres» switch; note), autosaved; shown only when the package grants the key.
  5. Guest page: the shared features block draws the artboard's card with the theme tokens: one row per store with
     its reference and a «Ver mesa» link (new tab, `rel="noopener noreferrer"`), the transfer data with a «Copiar
     CLABE» client button (clipboard with a select-text fallback and a visible confirmation), and an envelopes line.
  Queued until F1 finishes: both change `InvitationFeatureSettings` and the features block. F2 must also pass the
  stored registry through `autosaveFeaturesAction` (`app/cuenta/invitaciones/autosave-actions.ts`), because the
  features PUT replaces every field (see L5).
- L6 — F3: owner picked `design/rsvp-companions/01-un-solo-formulario.html` («Un solo formulario»); the other two
  are alternatives. Parent decisions for F3 (binding):
  1. Data: additive migration on the answer tables of both RSVP paths (the open form's `RsvpResponse` and the guest
     list's personal answer): `companions` JSONB `[{ name, child }]` (0 to the party limit minus one; `name` 0-60
     trimmed, blank allowed so a guest may confirm a count without every name; `child` boolean) and `dietaryNotes`
     text up to 300. The stored party size stays the source of the count: `companions.length` must equal the party
     size minus one when attending, and is empty when not attending.
  2. Gating: the existing `RSVP` (and `GUEST_LIST`) keys; no new key.
  3. Guest form (both public and personal page): the artboard's single form — name, attending yes/no, «¿Cuántos van
     contigo?», one row per companion with its name and a «Niño» checkbox appearing as the count grows, dietary
     restrictions, optional message; it still works without client script (server-rendered rows up to the limit,
     progressively enhanced), keeps the honeypot and rate limits, and never exceeds the party limit.
  4. Owner: the responses page and both CSV exports add the companion names, the number of children, and the dietary
     notes; totals show adults and children. Existing answers without the new data keep rendering (empty).
- L7 — F4: owner picked `design/lodging/01-tarjetas-de-hotel.html` («Tarjetas de hotel»); the other two are
  alternatives. Parent decisions for F4 (binding):
  1. Data: a new nullable `lodging` JSONB column on `InvitationFeatureSettings`, versioned and validated:
     `{ version: 1, hotels: [{ name, distance?, price?, groupCode?, bookingUrl?, address? }] (0-6; name 1-60,
     distance up to 40, price up to 60, groupCode up to 40, bookingUrl https only up to 500, address up to 160),
     transport?: string (up to 400) }`. Empty (no hotel and no transport) means no lodging section. Additive
     migration; documented.
  2. Gating: a new catalog feature key `LODGING` granted to premium and deluxe, inserted by the same migration by
     key (idempotent) and declared in the seed.
  3. API: the features PUT accepts it as OPTIONAL, like the itinerary after review R3-001: an omitted `lodging` keeps
     the stored one, `null` or an empty value clears it; the public read answers `features.lodging` only when the
     package grants `LODGING` and it is not empty.
  4. Web: the feature autosave passes the stored lodging through (as with the itinerary); the «Funciones» tab gets
     a «Hospedaje y transporte» block (hotels with add, remove, reorder; transport text), never sending an
     incomplete hotel (a hotel needs its name) and keeping a stored hotel's last complete version while retyped.
  5. Guest page: the shared features block draws the artboard's cards with the theme tokens: name with the distance
     as a badge, address and price line, group code row, «Reservar» (booking URL, new tab,
     `rel="noopener noreferrer"`) and «Cómo llegar» (Google Maps search of the address) when present, then a
     transport card. Queued after F2 and F3.
- L8 — F5: owner picked `design/table-number/02-junto-al-qr.html` («Junto al QR») for the guest pass; the owner's
  assignment follows `03-asignacion-en-lista.html` (parent decision: the pass needs a place to set the table, and 03
  was proposed as its complement); `01` is the alternative. Parent decisions for F5 (binding):
  1. Data: additive migration adding a nullable `tableLabel` (text, 1-12 characters trimmed, e.g. «7» or
     «Principal») to the guest-list `Guest` row; blank clears it.
  2. Gating: the existing `GUEST_LIST` / `QR_PASS` keys (Deluxe); no new key.
  3. Owner: the guest create/edit route accepts `tableLabel` as optional (omitted keeps the stored one); the guest
     list page gets an editable «Mesa» column and a per-table summary («Mesa 7 · 3 personas», «Sin mesa · N»);
     the guest-list CSV adds the table.
  4. Guest: the personal page's access pass draws the artboard's ticket — QR on one side, «Mesa» (large, accent)
     and «Personas» on the other, a dashed tear line and the venue hint; without a table it shows only the people
     count. The guest personal read adds the table to the guest block only. Queued after F4.
- L9 — F6: owner picked `design/whatsapp-reminders/01-automaticos.html` («Automáticos»); the other two are
  alternatives. Parent decisions for F6 (binding):
  1. Settings: two owner switches per invitation — «Recordar a quien no ha confirmado» (7 and 2 days before the RSVP
     deadline) and «Recordatorio del evento» (one day before the event) — stored as a small validated JSONB
     `reminders` on `InvitationFeatureSettings` (`{ version: 1, pendingRsvp: boolean, eventEve: boolean }`); the
     features PUT accepts it as OPTIONAL (omitted keeps the stored value), like the itinerary.
  2. Gating: a new feature key `WHATSAPP_REMINDERS` granted to deluxe (migration by key, seed).
  3. Recipients: guest-list guests with a stored phone only; pending means no answer yet. A guest without a phone is
     listed as not reachable.
  4. Delivery (S6): an application port `ReminderSender` with a default adapter that sends nothing and reports
     `not_configured`; a WhatsApp Business adapter is NOT implemented now (no paid provider), only the port, its
     contract test, and the configuration keys it would read documented as unset. A command
     `pnpm --filter @invitame/api reminders:send` (`--dry-run`) finds the reminders due today, records each attempt in
     a new `ReminderDelivery` table (unique per invitation, guest, kind, and due date, so a second run sends nothing
     twice), and with the default adapter records them as skipped `not_configured`. It is documented in the runbook
     but not scheduled.
  5. Owner UI: the artboard's screen in the editor (Deluxe): the «Aún no está activo» status while the sender is not
     configured (the API exposes the capability, never a secret), the two switches (saved, so they work as soon as it
     is activated), and the message preview built from the invitation's own data.
  6. Message: neutral Spanish template naming the guest, the occasion, the deadline or the event time, and the public
     link; no personal data beyond what the guest already sees. Queued after F5.
- L10 — F7: owner picked `design/guestbook/01-muro-de-mensajes.html` («Muro de mensajes») for guests; moderation
  follows `03-moderacion-anfitrion.html` (parent decision: proposed as its complement); `02` is the alternative.
  Parent decisions for F7 (binding):
  1. Data: a new `GuestbookEntry` table (`invitationId`, `authorName` 1-60 trimmed, `message` 1-500 trimmed,
     `hidden` boolean default false, `createdAt`); additive migration; documented.
  2. Gating: a new feature key `GUESTBOOK` granted to premium and deluxe (migration by key, seed).
  3. Public write: `POST /public/invitations/:slug/guestbook` without a session, refused unless the invitation is
     published, not expired, and its package grants `GUESTBOOK`; honeypot field answered like a success; limited per
     client address and invitation on the shared `RateLimit` store (like the open RSVP); plain text only (escaped on
     render, no links turned clickable).
  4. Public read: `features.guestbook` with the visible entries, newest first, at most 50, only when granted.
  5. Guest page: the artboard's wall in the shared features block (notes with the signature in the script face from
     the theme, the form below with «Firmar el libro»), works without client script (server action + redirect
     notice), closed with a note when the invitation expired.
  6. Owner: a «Libro de firmas» screen per invitation with «Visibles» and «Ocultos», hide and show again (owner-only,
     404 for anyone else); entries are published immediately and never deleted by the guest. Queued after F6.
- L11 — F8: owner picked `design/guest-album/03-aprobacion-anfitrion.html` («Aprobación del anfitrión»); the guest
  upload view follows `01-cuadricula-con-subir.html` (parent decision: approval needs a way to upload); the poster
  `02` is deferred as an alternative. Parent decisions for F8 (binding):
  1. Data: a new `GuestPhoto` table (`invitationId`, storage key, `status` PENDING | PUBLISHED | HIDDEN,
     `uploaderName` optional up to 60, `createdAt`, `reviewedAt`); binaries go through the existing media storage
     port (local in development, the S3-compatible bucket in production), never into PostgreSQL; additive migration.
  2. Gating: a new feature key `GUEST_ALBUM` granted to deluxe (migration by key, seed).
  3. Public upload: without a session, refused unless the invitation is published, not expired, and granted; reuses
     the existing upload validation (type allow-list, the configured size limit, dimension bounds, re-encoding);
     bounded per invitation (at most 300 photos stored, pending included) and per client address on the shared
     `RateLimit` store; every new photo is PENDING and invisible to guests until the owner publishes it. Security-
     sensitive (anonymous upload): independent verification and native review are required.
  4. Public read: `features.guestAlbum` with the PUBLISHED photos only (newest first, at most 60) and the count.
  5. Guest page: the shared features block draws `01` — «Subir mis fotos», the grid, and the count — with the
     theme tokens; after an upload the guest sees «Gracias, tu foto aparecerá cuando la aprueben».
  6. Owner: the `03` screen per invitation with «Por revisar», «Publicadas», «Ocultas», publish/hide/show-again;
     owner-only (404 for anyone else); hidden and never-published photos fall under the existing media retention
     cleanup. Queued after F7.
  Owner approval of the security design, verbatim choice: «Sí, apruebo» (the six-point summary: published and
  unexpired only; the existing photo validation — JPEG/PNG/WebP, configured size, dimension bounds, re-encoding that
  strips metadata such as GPS location; at most 300 photos per invitation and an hourly per-person limit; every photo
  PENDING and invisible to guests until the owner publishes it; hidden and never-published photos removed by the
  existing media cleanup; owner-only moderation, 404 for anyone else). The metadata stripping must be proven by a
  test, not assumed.
- L12 — F9: owner picked `design/livestream/02-reproductor-incrustado.html` («Reproductor dentro de la
  invitación»); the other two are alternatives. Parent decisions for F9 (binding):
  1. Data: a new nullable `livestream` JSONB on `InvitationFeatureSettings` (`{ version: 1, url, note? }`: `url`
     https only up to 500, `note` up to 120, e.g. «Inicia a las 17:00 h»); the features PUT accepts it as OPTIONAL
     (omitted keeps the stored value), and the autosave passes the stored value through, like the itinerary.
  2. Gating: a new feature key `LIVESTREAM` granted to premium and deluxe (migration by key, seed).
  3. Provider allow-list: only a YouTube link (`youtube.com/watch?v=`, `youtube.com/live/`, `youtu.be/`) is embedded,
     resolved by the API to its video id and rendered from `https://www.youtube-nocookie.com/embed/<id>`; any other
     https link (Zoom, Facebook, Vimeo…) shows only an «Abrir la transmisión» link (new tab,
     `rel="noopener noreferrer"`).
  4. Click to load: the guest page draws a facade (16:9 card with «▶» and the note) and inserts the iframe only
     after the guest taps it; before that no request reaches the provider. The iframe is sandboxed to what playback
     needs, carries a title, and the page's Content Security Policy (if any) allows only that embed origin.
  5. Placement: the shared features block («Míralo en vivo»), with the fallback link «Si no carga, ábrela aquí».
     Queued after F8.
- L14 — F10: owner picked `design/opening-animation/01-sobre-con-sello.html` («Sobre con sello»); the other two
  are alternatives. Parent decisions for F10 (binding):
  1. Scope: the public invitation `/i/<slug>` and the guest's personal page; never the owner preview or the editor.
  2. Behavior: a client-only overlay over the already server-rendered invitation (without script the guest sees the
     invitation directly): the seal fades, the flap opens, the card rises with the occasion and the celebrant's name
     (or initials) in the theme's own tokens and script face, the envelope drops away; about 3 s in total; one tap,
     click, Enter, Escape, or Space skips it at once; it plays once per browser session per invitation
     (`sessionStorage`), so a reload does not replay it; `prefers-reduced-motion: reduce` skips it entirely; the
     overlay is `aria-hidden`, never traps focus, and the page content stays in the accessibility tree.
  3. Owner control: a switch «Animación de apertura» in «Funciones», on by default, stored as a boolean on
     `InvitationFeatureSettings` (`openingAnimation`, additive column with default true) and accepted as OPTIONAL
     by the features PUT (omitted keeps the stored value), passed through by the autosave like the itinerary.
  4. Gating: a new feature key `OPENING_ANIMATION` granted to every package (migration by key, seed), so the
     catalog can withdraw it later without code.
  5. Weight: CSS animations only (transform and opacity), no new dependency, no image download beyond the theme's
     own fonts. Queued after F9.
- L15 — F11: owner picked `design/custom-address/01-campo-libre.html` («Campo libre con verificación»), placed in the
  editor's «Publicar» tab; the other two are alternatives. Parent decisions for F11 (binding; high risk — a stored
  identifier changes and a database guard is widened: own commits, independent verification, native review):
  1. Rule: a slug is 3-40 characters of lowercase letters, digits, and inner hyphens (`^[a-z0-9][a-z0-9-]{1,38}
     [a-z0-9]$`, no double hyphen), not a reserved word (route and product names such as `admin`, `api`, `cuenta`,
     `ingresar`, `i`, `health`, `invitame`), unique across current slugs and every previous slug.
  2. Database: a new migration lets `Invitation.slug` change only through the API's rename (the pinned-field trigger
     keeps refusing owner, package, and any other change exactly as today) and adds an `InvitationSlugAlias` table
     (`slug` unique, `invitationId`, `createdAt`) recording every previous slug; at most 5 renames per invitation.
  3. API: owner-only `GET /invitations/:id/slug-availability?slug=` (rate-limited on the shared `RateLimit` store,
     answers available / taken / invalid / reserved without naming another owner) and `PUT /invitations/:id/slug`
     (validates, checks uniqueness in one transaction, stores the old slug as an alias, refused for an archived
     invitation). The public read by an alias answers a redirect target, and `/i/<alias>` (and its personal and
     calendar routes) redirect permanently to the current slug.
  4. Web: the artboard's block in «Publicar» — prefix `invitame.mx/i/` (the real origin), the field, a live
     «✓ Disponible» / «Ya está en uso» / «No es válida» state (debounced, server-checked), the rule hint, «Guardar
     dirección», and the note that the previous link keeps working; the share panel and the list show the new
     address. Queued after F10.
  Owner approval, verbatim choice: «Sí, apruebo» (the six-point summary: 3-40 lowercase letters, digits, inner
  hyphens, no reserved words; unique across current and previous slugs; at most 5 renames; every previous slug keeps
  working through a permanent redirect, including the personal and calendar routes; the database lets the slug change
  only through the rename, everything else stays guarded as today; owner-only, refused when archived, and the
  availability check never reveals who holds a taken slug).
- L17 — F12: owner picked `design/co-hosts/02-con-permisos.html` («Con permisos»); the other two are alternatives.
  Security-sensitive (authorization): per `AGENTS.md` the owner must approve this security design before
  implementation. Proposed design (binding once approved):
  1. Data: an `InvitationCollaborator` table (`invitationId`, invited `email`, `userId` set on acceptance, a set of
     permissions, `invitedAt`, `acceptedAt`, a hashed single-use acceptance token with a 7-day expiry); at most 5 per
     invitation; additive migration.
  2. Permissions: `EDIT_CONTENT` (content, photos, features), `VIEW_ATTENDANCE` (answers, guest list, CSV),
     `PUBLISH` (publish and unpublish). Owner-only, never grantable: paying, refunds, archiving, the address rename,
     and managing collaborators; the «Pagar» chip is shown locked with «Solo el dueño».
  3. Invitation: the owner enters an email; the API emails a link (existing email provider); the recipient signs in
     with the existing email code and must hold that exact email to accept; a wrong account, an expired or reused
     token answers the same refusal. The owner can revoke a pending or accepted collaborator at any time; revoking
     ends access on the next request.
  4. Authorization: every invitation route resolves the caller as owner or as an accepted collaborator and checks the
     route's permission on the backend (deny by default; another user's invitation still answers 404); the web hides
     what a collaborator cannot do but never relies on that.
  5. Web: the artboard's screen per invitation (owner only); «Mis invitaciones» also lists invitations shared with the
     user, marked «Compartida contigo», with only the allowed tabs. Gating: a new feature key `CO_HOSTS` granted to
     premium and deluxe.
  6. Evidence: independent verification with an authorization matrix (owner, each permission, revoked, stranger)
     and native review are required. Queued after F11.
  Owner approval, verbatim choice: «Sí, apruebo» (the four-point security summary: email-bound single-use 7-day
  acceptance; edit content, view attendance, publish; never pay, refund, archive, rename the address, or manage
  collaborators; at most 5, revocable with immediate effect; backend checks every permission).
- L18 — F13: owner picked `design/password-invitation/01-pantalla-con-candado.html` («Pantalla con candado»); the
  owner setting follows `03-ajuste-anfitrion.html` (parent decision: proposed as its complement); `02` is the
  alternative. Security-sensitive: the owner approves the security design below before implementation.
  1. The password is a shared access code (4-40 characters), never a user credential; the API stores only its hash
     with Node's built-in `crypto.scrypt` and a random salt (no invented cryptography, no new dependency); the owner
     sees it once while setting it (with the ready-to-share message) and can replace or remove it, never read it back.
  2. The API owns the gate: while a password is set, the public read, the RSVP and guestbook writes, the photo
     upload, and the calendar file answer a locked state with no invitation data (only the display name for the
     lock screen); a correct password returns an access token (HMAC over the invitation id and the password version
     with a new server secret `INVITATION_ACCESS_SECRET`, 30 days), stored by the web in an `HttpOnly`, `Secure`,
     `SameSite=Lax` cookie scoped to that invitation; changing or removing the password invalidates old tokens.
  3. Attempts are limited per client address and invitation on the shared `RateLimit` store; a wrong password and a
     locked-out attempt answer the same neutral message.
  4. A guest's personal link `/i/<slug>/g/<token>` already carries a secret and skips the password.
  5. Gating: a new feature key `PASSWORD_PROTECTION` granted to deluxe. Independent verification (lock matrix) and
     native review are required. Queued after F12.
  Owner approval, verbatim choice: «Sí, apruebo» (the five-point summary: hashed shared code shown once; server
  locks the read, RSVP, guestbook, photos, and calendar; 30-day device memory invalidated by a change; limited
  attempts; personal guest links skip it).
- L19 — F14: owner picked `design/english-invitation/02-idioma-anfitrion.html` («Idioma elegido por el anfitrión»);
  when the owner chooses both languages, guests get the ES / EN switch of `01-selector-de-idioma.html` (parent
  decision: proposed as its complement); `03` is the alternative. Parent decisions for F14 (binding):
  1. Setting: `language` on `InvitationFeatureSettings` — `es` (default), `es-en`, or `en` — additive column with a
     check constraint; the features PUT accepts it as OPTIONAL (omitted keeps the stored value), passed through by
     the autosave; the editor's «Funciones» tab shows the artboard's three options.
  2. What is translated: every fixed guest-facing text — renderer kickers and headings, the features block
     (countdown, map, calendar, WhatsApp, playlist, itinerary, gift registry, lodging, livestream, guestbook, album),
     the RSVP and guestbook forms with their errors and notices, the access pass, the lock screen, the opening
     animation, the expired note, the calendar file — from one typed dictionary per locale (`es`, `en`), never
     machine translation; dates and times formatted with `Intl` for the locale. What the owner wrote stays as
     written.
  3. Guest choice: with `es-en`, a server-rendered ES / EN switch (a link carrying `?idioma=en`, remembered in a
     cookie), so it works without client script; `en` renders English only; the document `lang` attribute follows
     the rendered locale.
  4. Gating: a new feature key `ENGLISH_INVITATION` granted to every package (migration by key, seed). Queued after
     F13 (it must cover the texts every earlier feature adds).
- L20 — F2 evidence: commits `64d0360` (API), `a42dc3a` (review correction), `f10a978` (web). Native review
  `review-0e4eb9d157cc6132` found R3-001 (the public `features.giftRegistry` changed from the boolean gate to the card,
  breaking an already-deployed page during a rolling deploy); corrected in `a42dc3a` by keeping `giftRegistry` the
  boolean gate and answering the card as `giftRegistryDetails`; approved and acknowledged. Advisory R3-002 (the
  hidden-fields helper treats only null as an empty registry; the caller normalizes) is a follow-up. Gates green; API
  2183/2183, web 2127/2127, db-specs 481/481 on a fresh seeded database; browser check of the guest card and «Copiar
  CLABE». Independent verification: no blockers (API 19/19 and web 9/9 probes, baseline parity, live read).
- L21 — F3 evidence: commits `7d4a447` (API, migration `20261204120000_add_rsvp_companions`) and `d3b136b` (web).
  Native review `review-fcd9b9f0ff326c49` approved (one reviewer transport failure, relaunched once on the reoffered
  slot; the CSV column-order finding was refuted). Independent verification: every L6 item met, 70 probes with no
  failure, baseline differential with no unintended difference; db-specs 484/484 on a fresh seeded database; browser
  check of a three-person answer (stored companions and dietary notes). Deployment note: the API must deploy before the
  web, because an older API refuses the new submission fields (`forbidNonWhitelisted`).
- L22 — F4 evidence: commits `881eda0` (API, migration `20261205120000_add_invitation_lodging`, key `LODGING` for
  premium and deluxe) and `363798b` (web; the fixed section line was changed to «Te dejamos opciones para hospedarte
  cerca del evento.», since a fixed promise of special rates is not true for every owner). Native review
  `review-7cbe2f37872fb9a7` approved; advisories: R3-002 (the migration's rollback notes delete only the premium and
  deluxe links before the feature row; a manual rollback must delete every `LODGING` link first) and R3-003 (no HTTP
  test for a non-null lodging; closed by the controller test in the evidence commit). Independent verification: every
  L7 item met, 58 probes with no failure, migration idempotent, baseline differential differs only by the added
  `features.lodging`; db-specs 486/486 on a fresh seeded database; browser check of the hotel and transport cards.
  Deployment note (as L21): the API deploys before the web.
- L23 — F5 evidence: commits `ade5fde` (API, migration `20261206120000_add_guest_table_label`) and `0f73ca1` (web).
  Native review `review-d2f52c80101728ba` approved with no finding. Independent verification: every L8 item met, 36
  probes with no failure; the open public read and the open-form CSV are byte-identical to the base, and the personal
  read differs only by the added `guest.tableLabel`; db-specs 488/488 on a fresh seeded database; browser check of the
  owner's «Mesa» column and summary and of a confirmed guest's pass («Mesa 7», «Personas 1», venue hint). The evidence
  commit adds the verifier's two regression tests (numeric table order; the open read never carries the table) and
  drops the unused `passTitle` copy. Deployment note (as L21): the API deploys before the web.
- L24 — F6 evidence: commits `dcfeb33` (switch validation, schedule, message), `8dfad2c` (settings, migration
  `20261207120000_add_whatsapp_reminders`, key `WHATSAPP_REMINDERS` for deluxe, not-configured sender), `6c9baff`
  (`reminders:send`, once per attempt) and `244e21c` (web). Parent decision: the event-eve reminder skips a guest who
  answered no. Independent verification: every S2.6, S6 and L9 item met, 77 probes with no failure; the guest public
  and personal reads are byte-identical to the base. Browser check of the editor block («Aún no está activo», switches
  saved across a reload). The React «unique key» warning in the editor predates F6 (reproduced on the base) and is a
  separate follow-up. Native review: after the owner fixed the stalled
  reviewer provider, `review-68a1d655dc2620ee` found R3-001 (the `ReminderDelivery.guestId` RESTRICT key would keep the
  owner from removing a guest once a run recorded an attempt); corrected by `c7ccd53` (new migration
  `20261208120000_cascade_reminder_delivery_guest`, guest key ON DELETE CASCADE, db-spec through the guest removal use
  case, RED then GREEN). The correction added paths, so the provider asked for a scope-changed recovery the facade
  could not submit (its `input` is always parsed as an object); the same range was reviewed anew as
  `review-b348e3db9dcc0c86` (`dcfeb33..c7ccd53`, approved) and the command as `review-72c37a9a3892dfad` (approved;
  resilience findings refuted). Activation checklist for when a provider is paid for (advisories, not defects while
  nothing is sent): the command builds `NotConfiguredReminderSender` directly and must resolve the configured sender;
  a claim left `pending` by a crash is not retried that day; the message is built before the send `try`; the command's
  argument and exit-code paths have no direct test; a db-spec with stored switches. Pending regression tests from the
  verifier: catalog INSERT replay and due day in the invitation zone. Correction of earlier evidence: the disposable
  database was never actually dropped by `prisma db execute` (it runs the script in a transaction), so the runs called
  «fresh» for F2-F5 used an accumulated database; CI's fresh database passed each of them, and F6 was rerun on a truly
  fresh database (dropped through the client): db-specs 495/495.
- L25 — F7 evidence: commits `83bc18a` (table, migration `20261209120000_add_guestbook`, key `GUESTBOOK` for premium
  and deluxe, public wall read), `7435f3a` (public write and owner moderation routes), `ee47695` (review hardening:
  control characters refused, expiry judged by the database clock, owner read bounded to the newest 500, malformed entry
  id answers the entry's 404, honeypot pinned) and `9b290c1` (web). Native review: `review-022b93dde409d033` reviewed
  `83bc18a` alone and its only blocker was that the routes were not wired, an artifact of the commit split (they are in
  `7435f3a`); it stays open because closing it needs an operator disposition. `review-9dc6877fd9b6cc93` reviewed
  `83bc18a..ee47695` (routes plus hardening) and approved. Follow-ups (advisories): a per-invitation total cap on
  entries; a truncation notice or pagination past 500 in the owner read; the honeypot DTO refuses a non-string value
  with 400; an owner-moderation test for a package that no longer grants the key; the verifier's catalog replay test.
  Independent verification: every S2.7 and L10 item met, 66 probes with no failure, differential with only the added
  `features.guestbook`, no guest text in logs; db-specs 509/509 on a truly recreated database; browser check of the
  wall without client script and of owner hide and show.
- L26 — F8 owner decision after review (anonymous uploads could fill the 300-photo cap and lock the album for 30
  days): verbatim choice «Ocultar libera espacio + tope de pendientes (recomendado)» — only PENDING and PUBLISHED photos
  count toward the 300 cap, hiding a photo frees its place, and at most 100 photos may be PENDING at once (refused with
  its own code and a Spanish notice). Parent decisions from the same reviews: the album dependencies of the public read,
  the media serving, and the media cleanup become required (missing wiring must fail at startup, never silently serve
  an empty album, answer 404 for every photo, or let the orphan sweep delete live photos); the retention delete
  re-checks the state and the cutoff in the same statement; the uploader name also refuses Unicode format characters
  (`\p{Cf}`, bidi overrides and zero-width characters); the port contract of `findPublishedBySlug` matches its behavior.
- L27 — F8 evidence: commits `086ea80` (table, migration
  `20261210120000_add_guest_album`, key `GUEST_ALBUM` for deluxe, persistence), `ab75a4e` (use cases, serving,
  retention, public read), `b97928e` (routes and wiring), `b2737d7` (L26 hardening), `7fc79a7` (review correction:
  showing a hidden photo again re-checks the 300 cap under the invitation lock; joiners U+200C/U+200D allowed in
  uploader names; runbook cleanup order), `044e5c6` and `96968e9` (web). Native review: `review-24ce346be9c383fa`
  approved `086ea80`; `review-f4b093edfc89f4af` reviewed `ab75a4e` alone and its blockers were the wiring that lives in
  `b97928e` (open, closing needs an operator disposition); `review-80e0334030e28f6d` reviewed `ab75a4e..b2737d7`, found
  the republish cap hole, took the 169-line correction plan, and approved it after the owner fixed the stalled validator
  provider. Advisories for later: the anonymous
  upload reads the whole body (up to 16 MB) before the rate limit. Independent verification: every S2.8, L11, approval,
  and L26 item met (76 probes, served WebP carries no EXIF GPS, pending and hidden photos 404 to anyone but the owner,
  caps and 429, retention keeps published photos, differential only `features.guestAlbum`, no names in logs); the
  personal-read baseline differential was not executed (no code path changed there). Gates: API 2347/2347, web
  2308/2308, db-specs 529/529 on a recreated database; browser check of the scriptless upload, the pending state, and
  owner publishing. The evidence commit adds the verifier's uploader-name escaping test; the cleanup command end-to-end
  test remains a follow-up.
- L28 — F9 evidence: commits `bc0d212` (API, migration `20261211120000_add_invitation_livestream`, key `LIVESTREAM`
  for premium and deluxe), `beb87dc` (review correction: control characters refused in the note; the gated-keys
  assertion spelled out — the reviewer's arity claim was wrong, the helper takes nine arguments) and `32a5a74` (web:
  click-to-load YouTube player, `frame-src https://www.youtube-nocookie.com` on `/i/*` only). Native review:
  `review-e22451ed0a65b9e2` (API, approved after the correction) and `review-133d100deffdcd3c` (web, approved; its
  only finding, that a link could not be typed, was refuted and also disproved in the browser). Independent
  verification: every S2.9 and L12 item met except one case the parent rules out of scope: `www.youtu.be` and
  `m.youtu.be` are not embedded because L12.3 lists only `youtu.be/` for the short form; they stay an open link (pinned
  by a test). The embed address appears in the page payload as the island's prop, but no request reaches the provider
  before the tap. Gates: API 2364/2364, web 2339/2339, db-specs 531/531 on a recreated database; browser check of the
  facade, the tap, the sandboxed iframe, and typing the link in the editor. The evidence commit adds the verifier's
  host allow-list spec and livestream card test. Advisory: a partially typed link may autosave (harmless).
- L29 — F10 evidence: commits `f70624f` (API, migration `20261212120000_add_invitation_opening_animation`, key
  `OPENING_ANIMATION` for every package) and `ffa6345` (web). The first web version passed every test but looked wrong
  frame by frame (envelope below center, flap opening downward, card detached, a leftover block); it was rebuilt and the
  parent checked the new frames on phone and desktop before committing. Parent decision: the seal fades out before the
  flap opens (L14.2 wording), although the artboard's seal reads as a fade-in. Native review `review-a538d079e0d95d95`
  (API) approved with no finding; the web commit is client-only animation and was covered by the verifier.
  Independent verification: every L14 item met, live Playwright behavior (skips, 3 s, once per session, reduced motion,
  no extra requests, aria-hidden, no focus) and frames matching the artboard; the guest-token page, the owner preview,
  and the authenticated PUT were checked in code only. Gates: API 2372/2372, web 2377/2377, db-specs 533/533 on a
  recreated database. Pending regression tests from the verifier (truth tables, catalog replay, e2e).
- L30 — F11 evidence: commits `a18e315` (API: migration `20261213120000_add_invitation_slug_alias`, rewritten pinned-field
  trigger, alias table, routes, redirect target), `f64dd84` (web block and permanent redirects), `30587f4` (review
  hardening: real renames-left count in every owned answer, concurrent rename refusals mapped to 409 codes, the
  per-owner limit consumed first on both address routes) and the evidence commit (`invitations` added to the reserved
  words, with a test that reads every web route segment and API prefix from the code). The block was polished after a
  browser check (save only after «✓ Disponible», no empty box, «Tu dirección actual» / «Así quedará»). Native review:
  `review-b6cee7e60ac16706` (API, approved; the concurrency critical was refuted) and `review-32d8f15591ad4cf4`
  (hardening, approved). Advisories for later: the publish answer adds a sequential alias count read; the P2002
  handler runs a follow-up query. Independent verification: every L15 item and the approval met, with a base-versus-
  candidate comparison of the database guard, 308 redirects for the public, personal, and calendar routes through a
  chain of renames, six concurrent renames without a 500, and only the added fields in the reads. Gates: API
  2411/2411, web 2441/2441, db-specs 543/543 on a recreated database. A transient git pack-index message during a commit
  was checked with `git fsck` (clean).
- L31 — F12 evidence: commits `9e1617d` (data: table, migration `20261214120000_add_invitation_collaborators`, key
  `CO_HOSTS` for premium and deluxe), `d16f24e` (invite, accept, update, revoke; resolver and guard), `5f408da` (every
  invitation, media, and payment route declares its permission; shared list; generated authorization matrix),
  `e6b5865` (hardening from the three reviews: fail-closed scope decorators, `no-store` on every authorized answer,
  migration `20261215120000_harden_invitation_collaborators` with non-empty permissions and no expiry on a burned
  token, owner-scoped writes, inactive `CO_HOSTS` refuses, idempotent revoke, the caller's role in every answer, shared
  list without own or invalid rows, `colaboraciones` reserved), `a2c70a2` (web: co-hosts screen, acceptance at
  `/colaboraciones/aceptar` with the sign-in return, «Compartida contigo», role-based tabs) and `05e49d5` (a collaborator
  opening the co-hosts screen reads «Solo el dueño…» instead of a passing failure; native assess: not due, 15 lines).
  Native review: `review-6608b338d803d375`, `review-00765ca03e3d81d6`, `review-21712d467b5b59ba`,
  `review-8ee3bd0e474fa319`, `review-4f2feab8ac32e8fc`, all approved. Browser check with two real accounts: invite,
  email link, accept, permission-limited tabs, «Compartida contigo», owner sees «Aceptó», revoke takes effect on the
  next load. Independent verification: every L17 item met, its own 315-cell matrix on a real database and sessions,
  one identical refusal for every bad acceptance, no open redirect on the sign-in return, no token in logs or bodies,
  owner behavior unchanged versus the base. Gates: API 2439/2439, web 2471/2471 (2487 with e2e helpers), db-specs
  568/568 on a recreated database (one sign-in-code expiry test flaked once in the full run and passed 3/3 alone; a
  pre-existing timing flake). Follow-ups: an e2e test of the acceptance return route (it imports `next/headers`, so the
  node test runner cannot load it); anonymous invitation answers carry no `Cache-Control` (pre-existing global guard);
  a malformed id on publish answers 404 instead of 400.
- L16 — CI run 262 failed after F1's merge: `catalog-seed.prisma.db-spec.ts` hardcodes the seeded feature keys and
  premium's list, so a fresh database (CI) seeded `ITINERARY` while the spec did not expect it; the local dev DB hid
  it because its packages predate the key and the seed never updates them. Fixed in `644a535` (reproduced and green on
  a disposable fresh DB `invitame_ci_check`). Rule for every feature that adds a catalog key (F4, F6, F7, F8, F9, F10):
  update that spec's key lists and run all db-specs on a fresh, seeded, disposable database before merging.
- L13 — F1 closed: browser walkthrough found that adding a moment saved an empty one (fixed: only complete moments are
  sent; a stored moment being retyped keeps its last complete version). Native review `review-ad6cbbf18331c6a9` on the
  API commit required one correction (the features PUT made `itinerary` required, breaking an older client during a
  deploy); fixed in `e3e7357` (omitted keeps the stored one, RED observed) and approved; the web commit was medium,
  not due. Independent verification: L3.1-L3.5 met, no-itinerary output byte-identical to the base; one blocking
  finding — the autosave status line showed the field sentence for every channel, an unrequested change — narrowed to
  the itinerary only, and the verifier's probes were added as regression tests. Guest timeline checked in a browser on
  `invitacion-p6wrfv` (dev data).
- L5 — F1 worker stopped before writing: the feature autosave rebuilds the PUT body by hand in
  `app/cuenta/invitaciones/autosave-actions.ts`, outside its surfaces, so an itinerary would be cleared by the next
  time-zone/phone/playlist save. Parent approved option B: that file (pass the stored itinerary through) plus
  `_components/features-form.tsx` (read-only summary); the PUT stays a full replacement (L3.3 unchanged).
- L2 — F1 design decision (parent): the itinerary is per-invitation feature data shown in the shared features block, so
  one implementation serves all eleven layouts and no template version changes; gated by a new feature key granted to
  every package.
