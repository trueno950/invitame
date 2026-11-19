# Precise locations, music cover, and a calmer save status

Three owner requests after the editor redesign: the save line ages forever, typed addresses break the Google Maps and
Waze links when misspelled, and the music link shows no cover.

## Specs

- S1 — Owner, verbatim: "despues que lleno todos los campos se queda el mensaje Guardado hace 1 minuto, otra
  funcionalidad que considero util la de la ubicacion si la escriben mal al abrir en google maps o weeze sino la
  escriben bien no se vera y no tien caso hay que buscar la manera de que si salga la direccion o incluso mostrar el
  mapa seria un plus ya sea en una libreria opensource. lo mismo para el playlist no se mostrar la caratula si se puede
  no se algun plus mas no se si halla alternativas opensource"
- S2 — Owner decisions (2026-11-19), verbatim choices: «Buscador gratuito + mapa (Recomendado)», «Carátula y título
  (Recomendado)», «Cambiar a «Todo guardado» (Recomendado)». Meaning:
  - Save status: a few seconds after a successful save the line reads «✓ Todo guardado» with no relative time;
    «Guardando…» and the error with «Reintentar» are unchanged.
  - Locations: while typing an address the editor offers real suggestions from Photon (OpenStreetMap, public, no key);
    choosing one stores its coordinates with the place; Google Maps and Waze links use the coordinates when present
    (text otherwise, as today); the guest page shows a map of the point with MapLibre GL and OpenFreeMap tiles, with
    the OpenStreetMap attribution. The public Photon instance is best-effort: requests go through our own backend
    behind a port (debounced, cached, bounded, minimum query length), so a self-hosted Photon can replace it later
    by configuration. Public Nominatim is never used for typeahead.
  - Music: when the playlist link is saved, the API fetches the provider's public oEmbed once (Spotify and YouTube,
    allow-listed, no key) and stores the title and cover URL; the guest page shows the cover, the title, and the
    existing button to open it. A failed or unknown lookup keeps today's behavior.
- S3 — AGENTS.md boundaries apply: providers behind ports and adapters, the API owns persistence and validation,
  bounded payloads, no secrets, no personal data in logs, server-first web, guest renderers without client script
  except a deliberate, lazy feature island (the map), and fail-closed behavior when a provider is unavailable.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Save status settles on «✓ Todo guardado» | S1, S2 | inline | see L2 |
| T2 | Map the current place, maps-link, music, and feature-storage code | S2, S3 | explore | |
| T3a | Locations API: place search port with a Photon adapter, rate limit and cache, `InvitationPlace` storage, owner routes, gated `places` on both reads | S1-S3 | worker | see L4 |
| T3b | Locations web: editor address combobox, coordinate Google Maps and Waze links, lazy MapLibre map island on the guest page, browser check | S1-S3 | worker | see L5 |
| T4 | Music: oEmbed port (Spotify, YouTube), stored title and cover, guest cover card | S1-S3 | worker | |
| T5 | Verification, gates, native review, PRs, CI, merge | S1-S3 | inline | |

## Log

- L1 — Owner request verbatim (S1) and decisions (S2).
- L2 — T1: `savedStatusLabel` says «Guardado hace un momento» for 5 s and then «Todo guardado» (no relative time);
  the line describes only a stored state, so it collapses while a change is pending; the ticker runs every second.
  RED observed on the new test, web suite 1536 pass.
- L3 — T4 music cover: `MusicMetadataProvider` port with a strict oEmbed adapter (Spotify, YouTube; 3 s timeout, no
  redirects, 16 KiB cap, cover hosts allow-listed), additive migration `20261122120000_add_invitation_feature_music_metadata`
  (applied to test and dev), one lookup when the link changes, nulls on clear or failure, `features.music.{title,coverUrl}`
  on both reads, and a guest card with the cover and title. `MUSIC_METADATA_LOOKUP` (`off` in test, so CI never calls
  the network). API 1623 and db 380, web 1545 pass (parent re-run).
- L4 — T3a locations API: `PlaceSearch` port with a Photon adapter (3 s timeout, no redirects, 64 KiB cap, Mexico
  bias; the public instance refuses `lang=es`, so no `lang` is sent), owner routes `GET /invitations/:id/places/search`,
  `PUT`/`DELETE /invitations/:id/places/:field` (address fields derived from the pinned schema), 60 searches per 10
  minutes per owner on the shared `RateLimit` table, a bounded 3-minute in-process cache, additive migration
  `20261123120000_add_invitation_places` (applied to test and dev), `places` on the owner read and, with `MAP` and only
  while the stored label equals the content text, on the public read. API 1679 and db 390 pass (parent re-run). Known
  limit: a place write that races a concurrent archive can store a point on a just-archived invitation (harmless:
  archived invitations are read-only and not public). The web slice follows as T3b.
- L5 — T3b locations web: owner and public `places` parsing, three server actions, an ARIA combobox on every address
  field (350 ms debounce, 3 characters, 5 options, «Ubicación confirmada en el mapa» / «Elige una sugerencia para
  ubicarla con precisión»), coordinate Google Maps and Waze links, and a lazy MapLibre island (`maplibre-gl` 6.19.0,
  OpenFreeMap liberty, cooperative gestures, attribution) loaded only when the map scrolls into view; the worker URL is
  set explicitly because the bundled client chunk hides MapLibre's own URL, and the production build emits the worker
  asset. Web 1605 pass, format, lint, and `pnpm build` pass; browser check with live Photon suggestions, a confirmed
  ceremony point, coordinate links, and the rendered map (screenshots in /private/tmp/invitame-hojas/mapa).
- L6 — T5 delivery as chained PRs because the native review refuses candidates past its context budget: #81 save status
  and music API (review-55aaee9a86c9f1b5); #82 place search port, Photon adapter, rate limit and cache
  (review-6d5169b04dc242bc); #83 places storage, routes and gated reads (review-010e6182e8c79692, one critical
  finding refuted); then guest web (music cover, place parsing, coordinate links, lazy map) and editor address
  combobox with place actions. The last PR's tree equals the reference branch `feat/location-music-status` plus
  this entry.
