-- Additive publication history for the refund rule (T2, S3): one nullable column with no default, so every existing
-- row stays valid and nothing is deleted. `firstPublishedAt` is the first instant an invitation was ever published;
-- unlike `publishedAt`, which unpublishing and archiving clear, nothing clears it, so an invitation that returned to
-- DRAFT or was archived still says it was once public.

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "firstPublishedAt" TIMESTAMPTZ(6);

-- Backfill: for the rows published today, `publishedAt` is the only publication history the schema kept, so it is
-- copied once. The product is pre-launch, so no once-published, now-unpublished row exists outside development data.
UPDATE "Invitation" SET "firstPublishedAt" = "publishedAt" WHERE "publishedAt" IS NOT NULL;

-- A stored row can never claim it is published without ever having been published. A DRAFT that was published before
-- keeps `firstPublishedAt` and reads `publishedAt` NULL, which this check allows.
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_firstPublishedAt_when_published"
CHECK ("publishedAt" IS NULL OR "firstPublishedAt" IS NOT NULL);
