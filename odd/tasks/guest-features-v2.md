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
| F1 | Itinerary | S2.1, S3-S5 | design → worker | |
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
- L5 — F1 worker stopped before writing: the feature autosave rebuilds the PUT body by hand in
  `app/cuenta/invitaciones/autosave-actions.ts`, outside its surfaces, so an itinerary would be cleared by the next
  time-zone/phone/playlist save. Parent approved option B: that file (pass the stored itinerary through) plus
  `_components/features-form.tsx` (read-only summary); the PUT stays a full replacement (L3.3 unchanged).
- L2 — F1 design decision (parent): the itinerary is per-invitation feature data shown in the shared features block, so
  one implementation serves all eleven layouts and no template version changes; gated by a new feature key granted to
  every package.
