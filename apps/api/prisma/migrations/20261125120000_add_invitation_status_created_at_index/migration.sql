-- The administrator's invitation status view (M9 T2; S1) reads one page of invitations newest first, optionally
-- filtered by one status: `WHERE status = $1 ORDER BY createdAt DESC, id DESC` (and the same order without the
-- filter). This additive index serves both shapes — the status-scoped page through the whole index, the unfiltered
-- page through its leading column plus the key-set predicate — so the operational read never scans the table.
--
-- Additive only: no row is rewritten, no column is added, and no default is needed. Prisma generated the index below
-- from `@@index([status, createdAt])`; `schema.prisma` documents which read it serves.
--
-- Rollback / recovery: the change is additive, so recovery is either applying the previous migration set or dropping
-- the index by hand. Dropping it costs the read its index and nothing else; no data is touched. Run it as its own
-- migration, never by editing this file after it was applied:
--   DROP INDEX "Invitation_status_createdAt_idx";

-- CreateIndex
CREATE INDEX "Invitation_status_createdAt_idx" ON "Invitation"("status", "createdAt");
