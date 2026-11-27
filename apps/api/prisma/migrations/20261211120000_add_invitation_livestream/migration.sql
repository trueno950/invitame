-- Additive livestream (F9; S2.9, L12.1, L12.2): one nullable JSONB column on the existing one-to-one feature settings
-- table, plus the LIVESTREAM catalog feature key and its two package links as data. No existing row is rewritten, no
-- column is dropped, and no default is needed: an invitation that never saved a livestream reads NULL and renders
-- exactly the page it rendered before.
--
-- What the column holds: the versioned presentation payload
-- { "version": 1, "url": "https://…", "note"? } the API validates (domain/invitation-livestream.ts). It is bounded
-- presentation data — one `https` link of at most 500 characters and one optional note of at most 120 — and it never
-- carries embed markup, an image, or a provider payload, so it stays inside the rule that JSONB is only for bounded,
-- versioned, presentation payloads. Prisma cannot express that shape, so the column is the storage and the domain is
-- the authority on the contents; the domain also decides which link may be embedded (only a YouTube video, resolved to
-- its eleven-character id).
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new
-- key. Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature row
-- and one link per package.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "PackageFeature"
--    USING "Feature", "Package"
--    WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'LIVESTREAM'
--      AND "PackageFeature"."packageId" = "Package"."id";
--   DELETE FROM "Feature" WHERE "key" = 'LIVESTREAM';
--   ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "livestream";
-- The rollback deletes every LIVESTREAM link first, not only the premium and deluxe ones, so a link an administrator
-- added by hand never blocks the feature row's removal. Only the stored livestreams and the catalog key are lost;
-- invitations, their content, and every other feature setting are untouched. Run it as its own migration, never by
-- editing this file after it was applied.

-- AlterTable
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN     "livestream" JSONB;

-- The new gated capability, as data (S5): feature keys never select a code path, the API's allow-list does.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'LIVESTREAM',
    'Transmisión en vivo',
    'El enlace de tu transmisión, con un reproductor para verla desde la invitación.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Premium and Deluxe grant it (L12.2). The links are found by key, so this works on any database whose catalog keeps
-- the seeded keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" IN ('premium', 'deluxe')
  AND "Feature"."key" = 'LIVESTREAM'
ON CONFLICT DO NOTHING;
