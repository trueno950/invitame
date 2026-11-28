-- Password-protected invitation (F13; S2.13, L18). Two additive columns on `Invitation`, and the PASSWORD_PROTECTION
-- catalog feature key with its one package link as data. No existing row is rewritten, no column is dropped, and no
-- value has to be filled: every invitation that existed before this migration reads no password and version 0, which is
-- exactly what it behaved like — nothing but an owner's explicit set can lock an invitation.
--
-- Where the columns live and why: on `Invitation`, not on `InvitationFeatureSettings`. The access code is access
-- control, not presentation data. The feature settings row is writable through the features PUT by any collaborator
-- holding `EDIT_CONTENT` (L17.2), and no collaborator may set, replace, or remove the owner's code (L18, owner-only).
-- The gate also has to run before anything is rendered, and the invitation row is what every public route reads first.
--
-- What the columns hold:
--   * `passwordHash`: the encoded `crypto.scrypt` hash — `scrypt$<N>$<r>$<p>$<salt>$<key>`, with a random 16-byte salt
--     per password and the cost stated by the API's own code — or NULL while the invitation has no access code. The
--     plain value is never stored, logged, or answered back; the owner's read answers only whether a code is set.
--   * `passwordVersion`: how many times the code changed, its removal included. It starts at 0, every set, replace, or
--     remove adds one, and the access token's HMAC covers it, so a changed or removed code invalidates every token
--     minted before it (L18.2).
--
-- Neither column is a user credential: the code is shared by every guest of the invitation, it names no person, and it
-- grants nothing beyond that one invitation's public page.
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new
-- key (L16). Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature
-- row and one link.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "PackageFeature"
--    USING "Feature"
--    WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'PASSWORD_PROTECTION';
--   DELETE FROM "Feature" WHERE "key" = 'PASSWORD_PROTECTION';
--   ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_password_hash_format";
--   ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_password_version";
--   ALTER TABLE "Invitation" DROP COLUMN "passwordVersion";
--   ALTER TABLE "Invitation" DROP COLUMN "passwordHash";
-- The rollback deletes every PASSWORD_PROTECTION link first, not only the seeded one, so a link an administrator added
-- by hand never blocks the feature row's removal. It also removes every stored access code: an invitation that was
-- locked becomes public again, which is why it is a deliberate, human-approved action and not routine recovery.

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "passwordHash" VARCHAR(255),
ADD COLUMN     "passwordVersion" INTEGER NOT NULL DEFAULT 0;

-- The stored value is either absent or the encoded scrypt form, and the version never goes backwards. Prisma cannot
-- state either rule, and a row written around the API must not be able to store a value no verifier can parse (which
-- the API reads as "no access code", silently unlocking the invitation) or a negative version.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_password_hash_format"
  CHECK ("passwordHash" IS NULL OR "passwordHash" LIKE 'scrypt$%');
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_password_version"
  CHECK ("passwordVersion" >= 0);

-- The new gated capability, as data (S5, L18.5): feature keys never select a code path, the API's allow-list does.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'PASSWORD_PROTECTION',
    'Invitación con contraseña',
    'Protege tu invitación con un código de acceso que compartes con tus invitados.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Deluxe grants it (L18.5). The link is found by key, so this works on any database whose catalog keeps the seeded
-- keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" = 'deluxe'
  AND "Feature"."key" = 'PASSWORD_PROTECTION'
ON CONFLICT DO NOTHING;
