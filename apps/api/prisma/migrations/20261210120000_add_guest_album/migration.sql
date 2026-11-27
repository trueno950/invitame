-- Additive guest photo album (F8; S2.8, S5, L11.1, L11.2, L24): one new table that stores the photos guests uploaded to
-- one invitation, and the GUEST_ALBUM catalog feature key with its Deluxe link as data. No existing row is rewritten, no
-- column is added to an existing table, and no default is needed: an invitation whose package does not grant the key
-- renders exactly the page it rendered before.
--
-- What the table holds: the invitation, the storage key of the object, the moderation state, the optional name the guest
-- typed (1 to 60 trimmed characters), when the photo arrived, and when the owner reviewed it. No binary, no uploader
-- address, no session, no guest id: the photo lives in the media storage (local in development, the S3-compatible bucket
-- in production), exactly like the owner's own gallery, and under the same
-- `invitations/<invitationId>/<photoId>.webp` key space, so one storage adapter, one serving route, and one cleanup scan
-- serve both.
--
-- The CHECK constraints below repeat the rules the API domain already enforces (`media/domain/guest-photo.ts`), for a
-- reader that does not go through the API. Prisma cannot express them, so `schema.prisma` documents them there.
--
-- Why the invitation reference is ON DELETE RESTRICT (L24): this is the same convention as every other reference to
-- `Invitation` in this schema. An invitation is archived, never hard-deleted — archiving is its only terminal lifecycle
-- write — so a RESTRICT key never blocks an operation the owner has. The album adds no reference to `Guest`, `User`, or
-- any media row, so it also cannot keep the owner from removing a guest, replacing a photo, or archiving the invitation.
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new
-- key. Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature row and
-- one link per package.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "PackageFeature"
--     USING "Feature"
--     WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'GUEST_ALBUM';
--   DELETE FROM "Feature" WHERE "key" = 'GUEST_ALBUM';
--   DROP TABLE "GuestPhoto";
--   DROP TYPE "GuestPhotoStatus";
-- Only the album rows and the catalog key are lost; invitations, their content, and every other feature are untouched.
-- The objects under `invitations/` become orphans that no row names, which the next `pnpm media:cleanup` removes once
-- they are older than its one-hour grace period. Run it as its own migration, never by editing this file after it was
-- applied:

-- CreateEnum
CREATE TYPE "GuestPhotoStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN');

-- CreateTable
CREATE TABLE "GuestPhoto" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "storageKey" VARCHAR(200) NOT NULL,
    "status" "GuestPhotoStatus" NOT NULL DEFAULT 'PENDING',
    "uploaderName" VARCHAR(60),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "GuestPhoto_pkey" PRIMARY KEY ("id")
);

-- The public read and the owner's screen both read one invitation's photos newest first, filtered by state or not,
-- so one index serves both; the retention scan filters by state and the state instant.
CREATE INDEX "GuestPhoto_invitationId_status_createdAt_idx" ON "GuestPhoto"("invitationId", "status", "createdAt");
CREATE INDEX "GuestPhoto_status_createdAt_idx" ON "GuestPhoto"("status", "createdAt");

-- One object belongs to exactly one photo: a replay of the same upload cannot store the same binary twice.
CREATE UNIQUE INDEX "GuestPhoto_storageKey_key" ON "GuestPhoto"("storageKey");

-- AddForeignKey: the invitation is archived, never deleted, so RESTRICT is the convention every other invitation
-- reference follows and never blocks an owner operation (L24).
ALTER TABLE "GuestPhoto" ADD CONSTRAINT "GuestPhoto_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A stored photo always carries an object of this API's own key space (the same format as `MediaAsset`), so no value
-- written around the API can name a path outside `invitations/`.
ALTER TABLE "GuestPhoto"
ADD CONSTRAINT "GuestPhoto_storageKey_format"
CHECK (
  "storageKey" ~ '^invitations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$'
);

-- The name a guest types is optional; when it is present it is one trimmed word of 1 to 60 characters.
ALTER TABLE "GuestPhoto"
ADD CONSTRAINT "GuestPhoto_uploaderName_length"
CHECK ("uploaderName" IS NULL OR (char_length("uploaderName") >= 1 AND char_length("uploaderName") <= 60));

-- A photo is pending exactly while the owner has not reviewed it; publishing or hiding one stamps the instant.
ALTER TABLE "GuestPhoto"
ADD CONSTRAINT "GuestPhoto_reviewedAt_matches_status"
CHECK (("status" = 'PENDING') = ("reviewedAt" IS NULL));

-- The new gated capability, as data (S5, L11.2): feature keys never select a code path, the API's allow-list does, and
-- the panel may grant or withdraw it without a deployment.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'GUEST_ALBUM',
    'Álbum de fotos de invitados',
    'Tus invitados suben sus fotos y tú decides cuáles aparecen en la invitación.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Deluxe grants it (L11.2). The link is found by key, so this works on any database whose catalog keeps the seeded
-- keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" = 'deluxe'
  AND "Feature"."key" = 'GUEST_ALBUM'
ON CONFLICT DO NOTHING;
