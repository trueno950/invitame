-- Additive itinerary (F1; S2.1, S3-S5, L3.1, L3.2): one nullable JSONB column on the existing one-to-one feature
-- settings table, plus the ITINERARY catalog feature key and its three package links as data. No existing row is
-- rewritten, no column is dropped, and no default is needed: an invitation that never saved an itinerary reads NULL
-- and renders exactly the page it rendered before.
--
-- What the column holds: the versioned presentation payload { "version": 1, "items": [...] } the API validates
-- (domain/invitation-features.ts). It is bounded presentation data — at most 15 moments, each one time, a title, and
-- two optional texts — and it never carries an image, a URL, or a provider payload, so it stays inside the rule that
-- JSONB is only for bounded, versioned, presentation payloads. Prisma cannot express that shape, so the column is the
-- storage and the domain is the authority on the contents.
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new
-- key. Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature row
-- and one link per package.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "PackageFeature"
--    USING "Feature", "Package"
--    WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'ITINERARY'
--      AND "PackageFeature"."packageId" = "Package"."id" AND "Package"."key" IN ('basic', 'premium', 'deluxe');
--   DELETE FROM "Feature" WHERE "key" = 'ITINERARY';
--   ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "itinerary";
-- Only the stored itineraries and the catalog key are lost; invitations, their content, and every other feature
-- setting are untouched. Run it as its own migration, never by editing this file after it was applied:

-- AlterTable
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN     "itinerary" JSONB;

-- The new gated capability, as data (S5): feature keys never select a code path, the API's allow-list does.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'ITINERARY',
    'Itinerario',
    'El programa del día: cada momento con su hora, su lugar y cómo llegar.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Basic, Premium, and Deluxe grant it (L3.2). The links are found by key, so this works on any database whose catalog
-- keeps the seeded keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" IN ('basic', 'premium', 'deluxe')
  AND "Feature"."key" = 'ITINERARY'
ON CONFLICT DO NOTHING;
