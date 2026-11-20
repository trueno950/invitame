-- The purchase funnel (M9 T11; S2, S7) reads daily totals from columns the rows already carry: drafts created
-- (`Invitation"."createdAt"`), checkouts started (`Payment"."createdAt"`), approved payments (`Payment"."paidAt"` where
-- the status is `paid`), and first publications (`Invitation"."firstPublishedAt"`). Each read is one aggregate over one
-- bounded window of days, so these three indexes keep it a range scan instead of a sequential scan of both tables.
--
-- Additive only: no row is rewritten, no column is added, and no default is needed. Prisma generated the indexes below
-- from `@@index([createdAt])` and `@@index([paidAt])` on `Payment` and `@@index([firstPublishedAt])` on `Invitation`;
-- `schema.prisma` and `docs/database/model.md` state which read each one serves.
--
-- Build: these are plain `CREATE INDEX` statements, not `CREATE INDEX CONCURRENTLY`. Prisma sends every migration file
-- as one simple query, so a file with more than one statement runs inside an implicit transaction block, and PostgreSQL
-- answers "CREATE INDEX CONCURRENTLY cannot run inside a transaction block" (observed on this very file with
-- `prisma migrate deploy` against PostgreSQL 17.11: SQLSTATE 25001). The single-statement precedent
-- `20261126120000_add_invitation_created_at_id_index` works precisely because it is one statement. The whole file is
-- therefore one transaction and the change is atomic — either all three indexes exist or none does — at the cost of
-- holding a SHARE lock on `Payment` and `Invitation` while each index is built, which blocks writes to those tables for
-- that moment but not reads. Both tables are small in the current product, so the build is short. When either grows,
-- each index can be rebuilt concurrently by dropping it and creating it in its own single-statement migration, which is
-- the only shape that can run concurrently through Prisma.
--
-- Rollback / recovery: the change is additive, so recovery is either applying the previous migration set or dropping
-- the indexes by hand. Dropping them costs the funnel its range scans and nothing else; no data is touched. Run it as
-- its own migration, never by editing this file after it was applied:
--   DROP INDEX "Payment_createdAt_idx";
--   DROP INDEX "Payment_paidAt_idx";
--   DROP INDEX "Invitation_firstPublishedAt_idx";
-- A plain build inside the file's transaction never leaves an INVALID index behind, so no recovery from an interrupted
-- concurrent build is needed here.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Invitation_firstPublishedAt_idx" ON "Invitation"("firstPublishedAt");
