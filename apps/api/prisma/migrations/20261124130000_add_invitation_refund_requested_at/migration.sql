-- The refund claim of one invitation (T2, S3): one nullable column with no default and no backfill, so every
-- existing row stays valid. Publishing refuses a row that carries one, and a refund writes it only when it is null.

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "refundRequestedAt" TIMESTAMPTZ(6);
