# Invitation media storage

This document describes the current, implemented media storage of the API (Milestone 8, S4). It is the operational
companion of the code: the rules live in `apps/api/src/media/domain/media-asset.ts`, the side-effect order in
`apps/api/src/media/application/media.use-cases.ts`, and the SQL in
`apps/api/src/media/infrastructure/prisma-media.repository.ts`.

## Shape

- `MediaStorage` (`apps/api/src/media/application/media-storage.ts`) is the port: `put` writes an object with its
  content type, `get` answers a stream with its size or null, `delete` is idempotent, and `listObjects` feeds the
  cleanup scan with every object under a prefix and the time it was last written (the file's modification time
  locally, the provider's `LastModified` on S3). Keys are the API's own `invitations/<invitationId>/<assetId>.webp`
  values, so no caller can name an arbitrary path or object.
- `MEDIA_STORAGE_DRIVER` selects the adapter: `local` (a directory, development and tests only) or `s3` (any
  S3-compatible provider: Cloudflare R2, AWS S3, MinIO).
- The local driver is refused at startup in production, because an ephemeral filesystem would lose the photos.
  Production therefore defaults to `s3` and fails closed until a bucket is configured.
- `sharp` re-encodes every accepted image to WebP at most 2000 px on its longest side and strips EXIF, GPS, XMP, and
  the ICC profile, so no location or camera data reaches a guest. Only JPEG, PNG, and WebP pass the magic-byte check,
  at most the configured upload size and at most 8000 px per side, read from the header before any decode.
- The header read is unbounded by pixels on purpose, and the decode is bounded (S4, A4, A2): an image whose header
  declares 9000 px a side is refused by the domain's 8000 px rule with the dimensions message instead of looking like
  a bad format, the decode path keeps `sharp`'s 8000 x 8000 pixel cap, and one API process runs one image operation
  at a time (`ProcessingLimiter`, `sharp.concurrency(1)`, no libvips operation cache), so two 64-megapixel decodes
  cannot be in memory at once.
- Binaries never enter PostgreSQL. The `MediaAsset` row names the object by `storageKey`; see
  [`../database/model.md`](../database/model.md).
- Public URLs are absolute API URLs built from `MEDIA_PUBLIC_BASE_URL`: `<origin>/media/<assetId>`. Nothing in a URL,
  a header, or a response names the provider, the bucket, a signed URL, or a credential.

## Limits

- The upload size, the gallery cap, and the stored-asset cap are the administrator's operational settings
  (`OperationalSettings`), read through `OPERATIONAL_SETTINGS_READER.current()` on every upload: the size before
  anything is decoded, and the two caps inside the transaction that writes the row while the invitation row is locked.
  The seeded values — 10 MB, 12 gallery photos, 40 stored assets — are what the code used before the panel existed, so
  nothing changed on deploy. A lowered cap refuses the next upload and leaves every stored photo exactly where it is
  (S8).
- `maxUploadMegabytes` is bounded at 15, so the static request-body cap of the one multipart upload route is 16 MB
  (`MAX_UPLOAD_REQUEST_BYTES`, passed by `apps/api/src/media/presentation/invitations-media.controller.ts`): the widest
  configured file plus room for the boundary, the `kind` and `alt` fields, and the part headers. Every other route
  keeps its own, smaller JSON limit. The response to an oversized body is 413 `PAYLOAD_TOO_LARGE`, and an upload
  over the configured size is 400 `INVALID_MEDIA_UPLOAD` with `file must be at most <n> MB`.
- The web uploads through a server action on a `/cuenta` page, so Next's own limits answer first. Before M9 they were
  Next's defaults (1 MB per server action, 10 MB through `proxy.ts`), which refused almost every phone photo before
  it reached the API. `apps/web/next.config.ts` sets both to 16 MB (`WEB_REQUEST_BODY_LIMIT`, pinned by
  `apps/web/lib/server/next-config.test.ts`), the same as `MAX_UPLOAD_REQUEST_BYTES`. Next has no per-route setting,
  so the limit applies to every server action and proxied route; each still requires a session.
- `GET /invitations/:id/media/limits` answers `{ maxUploadBytes }` for one owned invitation: the same
  `maxUploadMegabytes`, read on every call, in bytes. It exists because the web must refuse an oversized photo before
  it reads it, and a constant there would make any configured size above 10 MB unreachable. The route is owner-scoped
  like the rest of the media routes (a foreign or unknown invitation is the one 404 `MEDIA_NOT_FOUND`), it answers one
  number and nothing about the row, and it is a courtesy: the upload checks the same setting again, so the API stays the
  guard. The web falls back to refusing nothing client-side when this read does not answer, and lets the API's own 413
  or 400 decide.
- The two caps and the size are per platform, not per invitation or per package: a package grants the gallery, and the
  settings decide how large it may grow.

## Environment

Development and test need no new variable: the local driver, a gitignored directory inside `apps/api`
(`.local-media/`), and `http://localhost:3001` as the public base URL are the defaults. Startup validation is in
`apps/api/src/config/environment.ts` and refuses a missing or invalid value at boot.

| Variable | When | Rule |
| --- | --- | --- |
| `MEDIA_STORAGE_DRIVER` | No | `local` or `s3`. Defaults to `local` in development and test and to `s3` in production; `local` is refused in production. |
| `MEDIA_PUBLIC_BASE_URL` | No | An `http` or `https` origin used to build `/media/<assetId>` URLs. Defaults to `http://localhost:3001`; production requires `https`. |
| `MEDIA_LOCAL_DIRECTORY` | With `local` | An absolute or relative directory. Defaults to `apps/api/.local-media`, which is gitignored. |
| `MEDIA_S3_ENDPOINT` | With `s3` | The provider's `http` or `https` origin. Production requires `https`. |
| `MEDIA_S3_REGION` | With `s3` | A region name such as `auto` (R2) or `us-east-1`. |
| `MEDIA_S3_BUCKET` | With `s3` | A valid bucket name (lower-case letters, digits, dots, and hyphens). |
| `MEDIA_S3_ACCESS_KEY_ID` | With `s3` | The access key id. Never logged, echoed, or committed. |
| `MEDIA_S3_SECRET_ACCESS_KEY` | With `s3` | The secret access key. Never logged, echoed, or committed. |
| `MEDIA_S3_FORCE_PATH_STYLE` | No | `true` or `false`; defaults to `false`. MinIO usually needs `true`, R2 and AWS S3 `false`. |

Every S3 value is validated at startup, and every error message names the variable without echoing its value. Two of
them are credentials: they belong in the deployment's secret storage, and the adapter never puts a provider message,
an endpoint, a bucket, a key, or a signed URL into an error, a log, or a response.

Production checklist for the owner (any of R2, S3, or MinIO; the provider and its cost are the owner's decision):

1. Create the bucket and a credential limited to it.
2. Set the eight variables above, with `MEDIA_STORAGE_DRIVER=s3` and an `https` endpoint and public base URL.
3. Run `pnpm db:migrate` so `20261120120000_add_media_assets` is applied, then start the API; it refuses to start
   without the bucket.
4. Make sure the public base URL is reachable by guests' browsers: they fetch `/media/<id>` from the API origin with
   plain `<img>` elements, so the web app needs no image configuration and sends no Content-Security-Policy today. If
   a CSP is added later, its `img-src` must include this origin.

## Serving

`GET /media/<assetId>` is public, but it answers only what the invitation allows: a published invitation's image is
public with `Cache-Control: public, max-age=31536000, immutable`, and the owner sees a draft with
`private, no-store`. Every other case — missing, deleted, unpublished, foreign, or an object that is gone — is the
same 404, and the session is read only when the invitation is not published, so a public image never depends on the
auth store. The response is `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`,
`Content-Disposition: inline`, and `Cross-Origin-Resource-Policy: cross-origin`, because the web app on another
origin embeds it. The web app's own response parsers accept a media URL only on the configured API origin (its
`API_ORIGIN`, compared by origin with no path, query, or credentials), so a body that names another host is refused
as an invalid response instead of being rendered as an `<img src>`.

## Cleanup command

```text
pnpm media:cleanup                # deletes and reports counts
pnpm media:cleanup -- --dry-run   # reports what it would delete
pnpm --filter @invitame/api media:cleanup --dry-run
```

A pnpm script forwards an argument after a standalone `--`; the command drops that separator before it reads its
flags.

It deletes the objects of rows marked `deleted`, the objects under `invitations/` that no row names, and then the
rows whose object is gone. It is idempotent and prints one line of counts only (no key, id, owner, or image data).
Exit code 0 means every object it tried to delete is gone; 1 means at least one failed and the row is kept for the
next run, or the command itself failed. Run it after a failed upload or delete, or as a periodic job; it needs
`NODE_ENV`, the database URL, and the media variables, but no auth or web secret.

### The orphan grace period

`MEDIA_ORPHAN_GRACE_MS` (`apps/api/src/media/domain/media-asset.ts`) is **one hour**, and it is the reason the scan
is safe to run at any time. An upload writes its object *before* it inserts the row, so an object with no row may be
an upload in flight; deleting it in that window would leave a `stored` row whose object is gone. The scan therefore
only treats an object as an orphan once its last-modified time is older than the grace period, and an object the
adapter cannot date (a provider that answered no `LastModified`) is treated as recent. The counts name both groups:
`orphanObjects` are the objects the run deleted or would delete, and `skippedRecentObjects` are the ones it left
alone for now. The objects of rows marked `deleted` are never subject to the grace period: the row already records
that the object is abandoned.
