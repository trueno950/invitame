-- Additive invitation feature data (F1; S3, S4): one new column with a default and one new table. No existing row
-- is rewritten and nothing is deleted. Prisma generated the column, the table, the primary key, and the foreign
-- key; it cannot express the CHECK constraints below, so `schema.prisma` only documents them.
--
-- Rollback / recovery: the change is additive, so recovery is either applying the previous migration set or
-- dropping the two objects by hand. Dropping loses only feature data (`Invitation.timeZone` and every
-- `InvitationFeatureSettings` row); invitations, their content, and their lifecycle state are untouched. Run it
-- as its own migration, never by editing this file after it was applied:
--   DROP TABLE "InvitationFeatureSettings";
--   ALTER TABLE "Invitation" DROP COLUMN "timeZone";

-- AlterTable
-- The zone is NOT NULL with a default, so every row that existed before this migration reads
-- 'America/Mexico_City' and no backfill is needed. The API's allow-list (domain/invitation-features.ts, S4) is
-- what limits the written values; the database only checks the shape below, the same way `PackagePrice` checks
-- its currency format while the domain limits the allowed currencies.
ALTER TABLE "Invitation" ADD COLUMN     "timeZone" VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City';

-- An IANA zone name is a region and one or more slash-separated location segments.
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_timeZone_format" CHECK ("timeZone" ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)+$');

-- CreateTable
-- One row per invitation at most: the invitation id is the primary key and the foreign key. Feature data is
-- stored apart from the template, so changing the template never touches it (S3).
CREATE TABLE "InvitationFeatureSettings" (
    "invitationId" UUID NOT NULL,
    "whatsappPhone" VARCHAR(16),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InvitationFeatureSettings_pkey" PRIMARY KEY ("invitationId")
);

-- AddForeignKey
-- RESTRICT, not CASCADE: an invitation is never hard-deleted (archiving is its only terminal lifecycle write), so
-- this reference behaves like the invitation's own three references. Deleting an invitation that still carries
-- feature settings is refused by PostgreSQL.
ALTER TABLE "InvitationFeatureSettings" ADD CONSTRAINT "InvitationFeatureSettings_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A stored phone is E.164 or NULL: `+`, a non-zero country digit, and seven to fourteen more digits. The domain
-- normalizes a Mexican ten-digit number to `+52` and validates an international number, so a stored value always
-- satisfies this check.
ALTER TABLE "InvitationFeatureSettings"
ADD CONSTRAINT "InvitationFeatureSettings_whatsappPhone_format"
CHECK ("whatsappPhone" IS NULL OR "whatsappPhone" ~ '^\+[1-9][0-9]{7,14}$');
