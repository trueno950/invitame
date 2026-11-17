# Milestone 8 — Media: photo uploads and gallery

Branch `feat/m8-media` from `master` at `d870c93`. Creators upload the invitation's main photo and, when the package
includes `GALLERY`, a small photo gallery; binaries live in object storage, never in PostgreSQL.

## Specs

- S1 — ROADMAP Milestone 8, verbatim outcome: "Support bounded invitation media without putting binaries in PostgreSQL
  or trusting an ephemeral filesystem." Key scope: "approved object-storage adapter; `MediaAsset` ownership, storage
  key, MIME, size, dimensions, lifecycle, and retention metadata; upload validation and safe public/private access
  modes; cleanup/retry policy for failed uploads and deleted invitations; and integration tests for ownership, limits,
  and storage failure." Exit criteria: "Size, type, dimensions, ownership, and retention are enforced before
  acceptance." "Public URLs do not expose private media or provider credentials." "Database truth and storage side
  effects have an explicit retry/recovery policy." Non-goals: "No video pipeline, advanced image editing, shared file
  drive, or unbounded user uploads."
- S2 — Owner (invitation-features L9), verbatim: "si dale, tienes mi autorizacion de hacer merge y autorizo cada
  revison no te detengas hasta el final para la revision visual", after the proposed order whose step 3 is «Subir
  fotos y galería», noting that a storage provider (S3, Cloudflare R2) is an owner decision with a cost.
- S3 — Catalog promise: Premium and Deluxe include `GALLERY`.
- S4 — Contract decided by the parent within S1-S3 (L1; the owner may overturn). Choosing and paying for a production
  storage provider is the owner's decision, so this milestone ships a provider-neutral port, a local adapter for
  development and tests, and an S3-compatible adapter (works with Cloudflare R2, AWS S3, or MinIO) that stays disabled
  until the owner configures a bucket:
  - **Storage port.** `MediaStorage` (put, get stream, delete) in the API's application layer; adapters in
    infrastructure: `local` (a configured directory, development and tests only; startup refuses it in production)
    and `s3` (endpoint, region, bucket, access key, secret from environment, validated at startup; never logged).
    Selection by `MEDIA_STORAGE_DRIVER`; secrets never reach the web or any response.
  - **Uploads.** The web sends the file to the API (multipart) from a server action. The API accepts only JPEG, PNG,
    or WebP detected by magic bytes (not the client's MIME or extension), at most 10 MB, at most 8000 px per side, and
    then re-encodes with `sharp` to WebP, longest side at most 2000 px, stripping metadata (EXIF and GPS) so no
    location leaks. Stored key: `invitations/<invitationId>/<assetId>.webp` (no user-supplied names).
  - **MediaAsset.** Additive migration: id, invitationId (RESTRICT), owner through the invitation, kind
    (`main-photo` or `gallery`), storage key (unique), MIME, byte size, width, height, position (gallery order), alt
    text (≤ 120, optional), status (`stored` or `deleted`), timestamps. Limits: one current main photo per invitation
    (replacing marks the old one deleted), at most 12 gallery photos, at most 40 stored assets per invitation.
  - **Serving.** `GET /media/<assetId>` streams the image with `Content-Type: image/webp`, `X-Content-Type-Options:
    nosniff`, long cache for published invitations, and `no-store` otherwise; served only when the invitation is
    published (public) or the requester owns it (session); anything else is a 404 without revealing existence. URLs
    never contain provider names, buckets, or credentials.
  - **Main photo.** The draft editor offers «Subir foto» next to the existing link field; a successful upload writes
    the public media URL into the template's `mainPhoto` field, so every layout keeps working unchanged.
  - **Gallery.** `GALLERY` joins the gating allow-list; the public read gains `features.gallery: [{ url, width,
    height, alt }]` (ordered) only when the package includes it; the shared features block renders a themed,
    responsive grid with lazy loading and width/height attributes; each photo links to its full image. The creator
    manages the gallery in a «Galería» section (upload, alt text, reorder, remove).
  - **Retry and recovery.** Upload order: process, put object, then insert the row; if the insert fails, delete the
    object (best effort, logged without personal data). Deletion marks the row `deleted` first, then deletes the
    object; a failed object delete leaves a `deleted` row for a documented cleanup command (`pnpm media:cleanup`,
    idempotent) that also removes objects whose rows are missing. Invitations are archived, never deleted, so their
    media stays until a later retention decision.
  - **Dependencies.** `sharp` (image processing) and `@aws-sdk/client-s3` (S3-compatible adapter), pinned; both in
    `apps/api` only.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| M1 | API: storage port and adapters, env validation, MediaAsset migration, upload processing, limits, serving, gallery gating, cleanup command, tests | S1, S3, S4 | worker | |
| M2 | Web: main-photo upload in the editor, gallery manager, gallery rendering in the features block, parsers, tests, browser check | S1, S3, S4 | worker, after M1 | |
| M3 | Independent verification: validation, privacy, ownership, credentials, recovery | S1, S4 | verify | |
| M4 | Integration: full gates, dev setup (local driver), docs, PR, merge | S1-S4 | inline | |

## Log

- L1 — The parent fixed contract S4. Owner decisions for the end: the production storage provider and its cost; the
  limits (10 MB upload, 2000 px output, 12 gallery photos, 40 assets); the retention of archived invitations' media;
  and the two new dependencies.
- L2 — M1 `5fdcc1e` (API: port with local and S3-compatible adapters, MediaAsset migration, sharp processing,
  limits, serving, GALLERY gating, `media:cleanup`) and M2 `f20b3fb` (web: «Subir foto», «Galería» manager, guest
  gallery), plus `1ab0874` (browser-test media base URL, checklist). The native review attempt on the API stopped with
  `lens_context_budget_exceeded`. M3 independent verification `mwkyk87i-1d-vefx`: every point met, no blockers. Its
  probes covered magic bytes and polyglots, the 10 MB and 8000 px bounds, GPS/XMP/ICC stripping, traversal
  refusal, no credentials echoed, an identical 404, limits under concurrency, and the recovery order. Its advisories
  were fixed in the next commit: A3, a cleanup grace period of one hour so in-flight uploads survive; A4, the
  dimension message; A5, media URLs restricted to the API origin on the web; A2, one sharp decode at a time; A1, the
  test-DB checksum corrected. API: 1490 unit and 355 db-specs pass. Web: 1442 tests pass. Owner decisions for the
  end: the production provider (bucket, credentials, public base URL), the limits, and the retention of archived
  invitations' media. Note: `.env.example` and the README env table could not be edited (the policy blocks `.env*`);
  `docs/development/media-storage.md` lists every variable.
- L3 — Build fix `954391a`: the API build compiled `scripts/` outside `rootDir`, so `tsconfig.build.json` now excludes
  `scripts`; the cleanup command runs through `@swc-node/register`. Full gates pass (docs, format, lint, typecheck,
  test, build). Native review of the advisory-fix range (`1ab0874..954391a`, 1,230 lines; lenses risk and
  resilience; lineage `review-efb3b4c0042eb541`) was APPROVED, and its authority was acknowledged and burned.
