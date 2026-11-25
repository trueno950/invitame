# Invitation expiration

Give a published invitation a package-based lifetime: after it expires the invitation stays visible read-only
and the RSVP closes. Today the database carries `expiresAt` but nothing sets it, and an expired invitation is
filtered out as a 404 — this feature reverses that into a read-only closed state.

## Specs

- S1 — Duration: "30 / 90 / 180 días" — "Básico 30 días, Premium 90 días, Deluxe 180 días desde la publicación."
- S2 — On expiry: "Solo lectura" — "La invitación se sigue viendo, pero el RSVP se cierra."
- S3 — Extension: "No, por ahora" — the expiration is definitive for the MVP.
- S4 — Packages are "basic", "premium", "deluxe" (`apps/api/prisma/catalog-seed.ts`); duration is a new package
  field (no duration column exists today).

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Package duration: Prisma column + migration, seed values (30/90/180), DTO + admin edit field | S1, S4 | worker | |
| T2 | Set `expiresAt` at publish from the package duration; keep unpublish/archive clear it | S1 | worker | |
| T3 | Public read: return an `expired`/closed signal instead of 404; keep the invitation visible | S2 | worker | |
| T4 | RSVP: reject submissions on an expired invitation (read-only) | S2 | worker | |
| T5 | Web `/i/[slug]`: render read-only with the RSVP closed note; guest page too | S2 | worker | |
| T6 | Tests (domain/application/controller/db + web + e2e) and docs sync | S1-S3 | worker | |

## Log

- L1 — Owner: "no aun tenemos epndientes en la pagina y debemos de mejorar, arreglar construir esa
  funcionalidades que faltan, como esta el roadmap? que nos falta? que tenemos?" (2026-11-30).
