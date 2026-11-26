# Guest features v2

Close the feature gap against the market (Mexican digital invitation services and Joy/Zola/Paperless Post/Greenvelope),
one feature at a time, in priority order. Each feature gets design directions, the owner's pick, implementation,
verification, CI, and its own merge to `master` before the next starts.

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
