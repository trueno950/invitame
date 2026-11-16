-- Additive RSVP data (M6 G1; S1, S3, S4): two columns on the existing invitation and one new table. No existing row
-- is rewritten: the deadline is nullable and the party limit has a default, so every invitation that existed before
-- this migration keeps accepting responses with a limit of 4. Nothing is deleted. Prisma generated the columns, the
-- table, the primary key, the unique index, and the foreign key; it cannot express the CHECK constraints below, so
-- `schema.prisma` only documents them.
--
-- Rollback / recovery: the change is additive, so recovery is either redeploying the previous migration set or
-- dropping the objects by hand. Dropping loses only RSVP data (the settings of every invitation and every
-- response); invitations, their content, their feature data, and their lifecycle state are untouched. Run it as its
-- own migration, never by editing this file after it was applied:
--   DROP TABLE "RsvpResponse";
--   ALTER TABLE "Invitation" DROP COLUMN "rsvpPartyLimit";
--   ALTER TABLE "Invitation" DROP COLUMN "rsvpDeadline";

-- AlterTable
-- The deadline is optional: NULL means RSVP never closes. The limit is NOT NULL with a default, so every row that
-- existed before this migration reads 4 without a backfill.
ALTER TABLE "Invitation" ADD COLUMN     "rsvpDeadline" TIMESTAMPTZ(6),
ADD COLUMN     "rsvpPartyLimit" INTEGER NOT NULL DEFAULT 4;

-- A party limit is 1 to 10. The domain checks the same bounds (`domain/invitation-rsvp.ts`, S4); the column is the
-- second bound, so a write around the API cannot exceed what a guest page can render.
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_rsvpPartyLimit_range"
CHECK ("rsvpPartyLimit" >= 1 AND "rsvpPartyLimit" <= 10);

-- CreateTable
-- One row per response. There is no guest column in this migration: the guest table arrives with the guest list
-- (M6 G2), which adds its nullable reference then. The response carries bounded values only, never free-form JSONB.
CREATE TABLE "RsvpResponse" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "dedupeKey" VARCHAR(200) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "attending" BOOLEAN NOT NULL,
    "partySize" INTEGER NOT NULL,
    "phone" VARCHAR(16),
    "message" VARCHAR(280),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RsvpResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The normalized name and phone of one guest inside one invitation. This unique index is what makes a retry an
-- update instead of a duplicate, and what makes two concurrent identical submissions end in exactly one row.
CREATE UNIQUE INDEX "RsvpResponse_invitationId_dedupeKey_key" ON "RsvpResponse"("invitationId", "dedupeKey");

-- AddForeignKey
-- RESTRICT, not CASCADE: an invitation is never hard-deleted (archiving is its only terminal lifecycle write), so
-- deleting an invitation that still carries responses is refused, like its feature settings row.
ALTER TABLE "RsvpResponse" ADD CONSTRAINT "RsvpResponse_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A stored name is 1 to 80 characters; the domain trims and collapses it before the write.
ALTER TABLE "RsvpResponse"
ADD CONSTRAINT "RsvpResponse_name_length"
CHECK (char_length("name") >= 1 AND char_length("name") <= 80);

-- A party size is 0 to 10: 10 is the widest party any invitation allows, whatever its own limit says.
ALTER TABLE "RsvpResponse"
ADD CONSTRAINT "RsvpResponse_partySize_range"
CHECK ("partySize" >= 0 AND "partySize" <= 10);

-- A declined response names no people, and an attending one names at least one. The per-invitation limit lives on
-- the Invitation row and is checked by the domain, because a CHECK cannot read another table.
ALTER TABLE "RsvpResponse"
ADD CONSTRAINT "RsvpResponse_partySize_matches_attending"
CHECK (("attending" AND "partySize" >= 1) OR (NOT "attending" AND "partySize" = 0));

-- A stored phone is E.164 or NULL: `+`, a non-zero country digit, and seven to fourteen more digits. The domain
-- normalizes it with the WhatsApp rules, so a stored value always satisfies this check. The phone is never logged.
ALTER TABLE "RsvpResponse"
ADD CONSTRAINT "RsvpResponse_phone_format"
CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');

-- A stored message is 1 to 280 characters or NULL: the domain stores NULL for a blank message, never an empty one.
ALTER TABLE "RsvpResponse"
ADD CONSTRAINT "RsvpResponse_message_length"
CHECK ("message" IS NULL OR (char_length("message") >= 1 AND char_length("message") <= 280));
