-- Additive publication lifecycle (M5 T1; S2, S7, S8, A2): one new enum value and two nullable columns, no
-- existing row is rewritten and no row is deleted. Prisma generated the enum value and the columns; it
-- cannot express the CHECK constraint it does not know about, so `schema.prisma` only documents it.

-- AlterEnum
-- PostgreSQL appends the value after DRAFT and ARCHIVED, so the physical order is DRAFT, ARCHIVED,
-- PUBLISHED; no code compares invitation statuses ordinally, and every existing row keeps its status.
ALTER TYPE "InvitationStatus" ADD VALUE 'PUBLISHED';

-- AlterTable
-- Both columns have no default, so every existing row reads NULL and stays valid. `publishedAt` is the
-- publication marker (S7, A2); `expiresAt` is the expiry the database carries but Milestone 5 never sets,
-- because the expiry rule is decided in a later milestone (S8).
ALTER TABLE "Invitation" ADD COLUMN     "publishedAt" TIMESTAMPTZ(6),
ADD COLUMN     "expiresAt" TIMESTAMPTZ(6);

-- `publishedAt` is set exactly while the invitation is published: publishing sets it, unpublishing and
-- archiving clear it (S7, A2). It is compared in its text form because a literal of the enum type added
-- above cannot be used in this same transaction (PostgreSQL: "unsafe use of new value of enum type"); the
-- comparison is still exact, since invitation statuses are never renamed.
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_publishedAt_matches_status"
CHECK (("status"::text = 'PUBLISHED') = ("publishedAt" IS NOT NULL));

-- The archive check from 20261111214752 is kept as written. `("status" = 'ARCHIVED') = ("archivedAt" IS NOT
-- NULL)` was already correct for two statuses and stays correct for three: a DRAFT or PUBLISHED row has a
-- NULL `archivedAt`, so both sides are false, and an ARCHIVED row has one, so both sides are true.
--
-- No index is added for the public read by slug. `Invitation_slug_key` is already unique on `slug`, so
-- resolving `WHERE slug = $1 AND status = 'PUBLISHED'` reads at most one row through that index and filters
-- the status on it; a partial index on `(slug) WHERE status = 'PUBLISHED'` would add write cost and a second
-- index to maintain while making the read no cheaper.
