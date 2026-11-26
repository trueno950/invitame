-- Additive guest table label (F5; S2.5, S3-S5, L8.1): one nullable column on the existing guest list, so the owner can
-- seat a guest and the guest's access pass can print the table. No existing row is rewritten, no column is dropped, and
-- no default is needed: a guest stored before this migration reads NULL and renders exactly what it rendered before.
--
-- What the column holds: the table the owner assigned, 1 to 12 trimmed characters such as «7» or «Principal», or NULL
-- while none is assigned. The domain (`domain/invitation-guest.ts`) trims it and stores NULL for a blank value, so the
-- owner can clear a table by leaving the field empty. The CHECK below repeats the bound for a reader that does not go
-- through the API; Prisma cannot express it, so `schema.prisma` documents it.
--
-- No catalog statement belongs here: the feature is gated by the existing `GUEST_LIST` and `QR_PASS` keys, so this
-- feature adds no key and changes no package link (L8.2). A database whose administrator changed those links keeps its
-- decision.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   ALTER TABLE "Guest" DROP COLUMN "tableLabel";
-- Only the assigned tables are lost; every guest, their answer, their personal token digest, their check-in instant,
-- and every other column are untouched. Run it as its own migration, never by editing this file after it was applied:

-- AlterTable
ALTER TABLE "Guest" ADD COLUMN     "tableLabel" VARCHAR(12);

-- A stored table label is 1 to 12 characters or NULL: the domain stores NULL for a blank value, never an empty one.
ALTER TABLE "Guest"
ADD CONSTRAINT "Guest_tableLabel_length"
CHECK ("tableLabel" IS NULL OR (char_length("tableLabel") >= 1 AND char_length("tableLabel") <= 12));
