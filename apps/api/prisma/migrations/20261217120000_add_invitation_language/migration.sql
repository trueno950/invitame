-- Additive invitation language (F14; S2.14, L19.1, L19.4): one NOT NULL text column with the default `es` on the existing
-- one-to-one feature settings table, the CHECK constraint that holds it to the three stored values, and the
-- ENGLISH_INVITATION catalog feature key with its three package links as data. No existing row is rewritten, no column is
-- dropped, and no value has to be filled: every row that existed before this migration reads `es`, which is the language
-- the product served until now, so a published invitation keeps rendering exactly what it rendered before until its owner
-- chooses both languages or English only.
--
-- What the column holds: one choice, never a text. The fixed guest-facing strings live in the web's typed dictionary
-- (`es` and `en`, complete by type) and are chosen from this value; nothing is machine-translated and nothing the owner
-- wrote is touched. The domain (`domain/invitation-language.ts`) is the authority on the three values and on the answer a
-- guest reads: the features write refuses any other value, and the public read answers the owner's choice only while the
-- pinned package grants ENGLISH_INVITATION, so a withdrawn key serves Spanish without losing the stored choice.
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new key.
-- Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature row and one
-- link per package.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "PackageFeature"
--    USING "Feature", "Package"
--    WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'ENGLISH_INVITATION'
--      AND "PackageFeature"."packageId" = "Package"."id";
--   DELETE FROM "Feature" WHERE "key" = 'ENGLISH_INVITATION';
--   ALTER TABLE "InvitationFeatureSettings" DROP CONSTRAINT "InvitationFeatureSettings_language_check";
--   ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "language";
-- The rollback deletes every ENGLISH_INVITATION link first, not only the seeded ones, so a link an administrator added by
-- hand never blocks the feature row's removal. Only the stored choices and the catalog key are lost; invitations, their
-- content, and every other feature setting are untouched. Run it as its own migration, never by editing this file after it
-- was applied.

-- AlterTable
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN     "language" VARCHAR(5) NOT NULL DEFAULT 'es';

-- The three values L19.1 names, checked by the database as well as by the domain, so a row written around the API can
-- never make the guest page choose a locale it does not have.
ALTER TABLE "InvitationFeatureSettings"
  ADD CONSTRAINT "InvitationFeatureSettings_language_check"
  CHECK ("language" IN ('es', 'es-en', 'en'));

-- The new gated capability, as data (S5, L19.4): feature keys never select a code path, the API's allow-list does.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'ENGLISH_INVITATION',
    'Invitación en inglés',
    'Los textos fijos de tu invitación en español y en inglés, con un botón ES / EN para tus invitados.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Every seeded package grants it (L19.4). The links are found by key, so this works on any database whose catalog keeps
-- the seeded keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" IN ('basic', 'premium', 'deluxe')
  AND "Feature"."key" = 'ENGLISH_INVITATION'
ON CONFLICT DO NOTHING;
