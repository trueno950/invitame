-- Additive opening animation (F10; S2.10, L14.3, L14.4): one NOT NULL boolean column with a default on the existing
-- one-to-one feature settings table, plus the OPENING_ANIMATION catalog feature key and its three package links as data.
-- No existing row is rewritten, no column is dropped, and no value has to be filled: every row that existed before this
-- migration reads `true`, which is the default the owner's switch starts at, so a published invitation keeps rendering
-- exactly what it rendered before until its owner switches the animation off.
--
-- What the column holds: one presentation switch, never a payload. The animation itself is drawn by the guest page from
-- theme tokens and CSS only, so nothing about it — no markup, no image, no player, no provider — is stored. The domain
-- (`domain/invitation-features.ts`) is the authority on the shape: the features write refuses any value that is not a
-- boolean, and the public read answers the animation only while the pinned package grants the key and this column is
-- true.
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new
-- key. Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature row and
-- one link per package.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "PackageFeature"
--    USING "Feature", "Package"
--    WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'OPENING_ANIMATION'
--      AND "PackageFeature"."packageId" = "Package"."id";
--   DELETE FROM "Feature" WHERE "key" = 'OPENING_ANIMATION';
--   ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "openingAnimation";
-- The rollback deletes every OPENING_ANIMATION link first, not only the seeded ones, so a link an administrator added by
-- hand never blocks the feature row's removal. Only the stored switches and the catalog key are lost; invitations,
-- their content, and every other feature setting are untouched. Run it as its own migration, never by editing this file
-- after it was applied.

-- AlterTable
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN     "openingAnimation" BOOLEAN NOT NULL DEFAULT true;

-- The new gated capability, as data (S5, L14.4): feature keys never select a code path, the API's allow-list does.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'OPENING_ANIMATION',
    'Animación de apertura',
    'Un sobre con sello que tus invitados abren antes de ver la invitación.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Every seeded package grants it (L14.4). The links are found by key, so this works on any database whose catalog keeps
-- the seeded keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" IN ('basic', 'premium', 'deluxe')
  AND "Feature"."key" = 'OPENING_ANIMATION'
ON CONFLICT DO NOTHING;
