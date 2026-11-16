-- Additive guest-list data (M6 G2; S1, S3, S4): one new table and one nullable column. No existing row is rewritten:
-- `Guest` is new, and `RsvpResponse.guestId` is nullable, so every answer the open form already stored stays valid
-- and keeps answering through its `(invitationId, dedupeKey)` unique index. Nothing is deleted. Prisma generated the
-- table, the primary key, the unique indexes, and the foreign keys; it cannot express the CHECK constraints below,
-- so `schema.prisma` only documents them.
--
-- The personal token is not stored: `tokenHash` holds its SHA-256 hex digest behind a unique index, which is what a
-- personal link is looked up through, so a reader of this table cannot replay a link and no secret is compared in
-- application code.
--
-- Rollback / recovery: the change is additive, so recovery is either redeploying the previous migration set or
-- dropping the objects by hand. Dropping loses the guest lists and the personal-link answers; invitations, their
-- content, their feature data, their lifecycle state, and the open form's answers are untouched. Run it as its own
-- migration, never by editing this file after it was applied:
--   ALTER TABLE "RsvpResponse" DROP CONSTRAINT "RsvpResponse_guestId_fkey",
--     DROP COLUMN "guestId";
--   DROP TABLE "Guest";

-- CreateTable
-- One person on one invitation's guest list. The owner is reached through the invitation, so there is no owner
-- column: every statement joins the invitation and names its owner. `seats` is the party this guest may confirm.
CREATE TABLE "Guest" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "seats" INTEGER NOT NULL,
    "phone" VARCHAR(16),
    "note" VARCHAR(200),
    "tokenHash" VARCHAR(64) NOT NULL,
    "tokenIssuedAt" TIMESTAMPTZ(6) NOT NULL,
    "checkedInAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The digest of the personal token: unique, so a personal link resolves to at most one guest, and the only column a
-- personal link is ever looked up through.
CREATE UNIQUE INDEX "Guest_tokenHash_key" ON "Guest"("tokenHash");

-- CreateIndex
-- The guest list of one invitation, read in one query through the invitation id.
CREATE INDEX "Guest_invitationId_idx" ON "Guest"("invitationId");

-- AddForeignKey
-- RESTRICT, not CASCADE: an invitation is never hard-deleted (archiving is its only terminal lifecycle write), so
-- deleting an invitation that still carries guests is refused, like its feature settings and responses.
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A stored name is 1 to 80 characters; the domain trims and collapses it before the write.
ALTER TABLE "Guest"
ADD CONSTRAINT "Guest_name_length"
CHECK (char_length("name") >= 1 AND char_length("name") <= 80);

-- Seats are 1 to 10: the same range an RSVP party uses, checked by the domain as well.
ALTER TABLE "Guest"
ADD CONSTRAINT "Guest_seats_range"
CHECK ("seats" >= 1 AND "seats" <= 10);

-- A stored phone is E.164 or NULL, exactly like the WhatsApp contact and the response phone. The domain normalizes
-- it with the same rule, so a stored value always satisfies this check. The phone is never logged.
ALTER TABLE "Guest"
ADD CONSTRAINT "Guest_phone_format"
CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');

-- A stored note is 1 to 200 characters or NULL: the domain stores NULL for a blank note, never an empty one.
ALTER TABLE "Guest"
ADD CONSTRAINT "Guest_note_length"
CHECK ("note" IS NULL OR (char_length("note") >= 1 AND char_length("note") <= 200));

-- The stored token digest is exactly a lower-case SHA-256 hex digest, so a write around the API cannot store a
-- plaintext token or a truncated one.
ALTER TABLE "Guest"
ADD CONSTRAINT "Guest_tokenHash_format"
CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

-- AlterTable
-- The guest an answer belongs to, or NULL for an answer to the open form (M6 G2). Nullable, so no existing answer
-- is rewritten.
ALTER TABLE "RsvpResponse" ADD COLUMN "guestId" UUID;

-- CreateIndex
-- One answer per guest: a personal-link submission upserts on this unique column, so a change of mind updates the
-- same row and a concurrent duplicate ends in one row.
CREATE UNIQUE INDEX "RsvpResponse_guestId_key" ON "RsvpResponse"("guestId");

-- AddForeignKey
-- RESTRICT like every other reference here; the guest's own removal deletes the answer in the same statement, so a
-- response never outlives the guest it answers for.
ALTER TABLE "RsvpResponse" ADD CONSTRAINT "RsvpResponse_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
