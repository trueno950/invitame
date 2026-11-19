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
| T3 | Locations: geocoding port with a Photon adapter, stored coordinates, editor suggestions, coordinate links, guest map | S1-S3 | worker | |
| T4 | Music: oEmbed port (Spotify, YouTube), stored title and cover, guest cover card | S1-S3 | worker | |
| T5 | Verification, gates, native review, PRs, CI, merge | S1-S3 | inline | |

## Log

- L1 — Owner request verbatim (S1) and decisions (S2).
- L2 — T1: `savedStatusLabel` says «Guardado hace un momento» for 5 s and then «Todo guardado» (no relative time);
  the line describes only a stored state, so it collapses while a change is pending; the ticker runs every second.
  RED observed on the new test, web suite 1536 pass.
