-- Invitation media (M8 S4). Additive: two enums, one table, its indexes, and CHECK constraints. No existing row is
-- rewritten and nothing is deleted. The binary never lives in PostgreSQL: a row names its object by `storageKey`.

CREATE TYPE "MediaAssetKind" AS ENUM ('main-photo', 'gallery');
CREATE TYPE "MediaAssetStatus" AS ENUM ('stored', 'deleted');

CREATE TABLE "MediaAsset" (
  "id" UUID NOT NULL,
  "invitationId" UUID NOT NULL,
  "kind" "MediaAssetKind" NOT NULL,
  "storageKey" VARCHAR(200) NOT NULL,
  "mime" VARCHAR(64) NOT NULL DEFAULT 'image/webp',
  "byteSize" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "position" INTEGER,
  "alt" VARCHAR(120),
  "status" "MediaAssetStatus" NOT NULL DEFAULT 'stored',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- A storage key is written once per asset and is unique, so one object belongs to exactly one row.
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- The gallery read and the owner list read one invitation's assets by kind and status in position order.
CREATE INDEX "MediaAsset_invitationId_kind_status_position_idx"
  ON "MediaAsset"("invitationId", "kind", "status", "position");

-- At most one current main photo per invitation (S4). Replacing it marks the previous row deleted in the same
-- transaction, so this partial unique index can never be violated by a legal write.
CREATE UNIQUE INDEX "MediaAsset_one_stored_main_photo"
  ON "MediaAsset"("invitationId")
  WHERE "kind" = 'main-photo' AND "status" = 'stored';

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_invitationId_fkey"
  FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bounded values only (S4): 0 < byteSize <= 10 MB, 0 < width, height <= 2000 px, and the one MIME the API serves.
ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_byteSize_range"
  CHECK ("byteSize" > 0 AND "byteSize" <= 10485760);

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_dimensions_range"
  CHECK ("width" > 0 AND "width" <= 2000 AND "height" > 0 AND "height" <= 2000);

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_mime_webp"
  CHECK ("mime" = 'image/webp');

-- A gallery photo has a non-negative position; the main photo has none.
ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_position_matches_kind"
  CHECK (
    ("kind" = 'gallery') = ("position" IS NOT NULL)
    AND ("position" IS NULL OR "position" >= 0)
  );

ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_alt_length"
  CHECK ("alt" IS NULL OR char_length("alt") <= 120);

-- The key is always `invitations/<invitationId>/<assetId>.webp` with lower-case UUIDs, so no stored value can
-- name another prefix, another file extension, or a traversing path.
ALTER TABLE "MediaAsset"
  ADD CONSTRAINT "MediaAsset_storageKey_format"
  CHECK (
    "storageKey" ~ '^invitations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
  );
