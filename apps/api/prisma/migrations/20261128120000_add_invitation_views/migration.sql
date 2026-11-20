-- Additive view counting (M9 T11; S2, S3, S7, L12): one enum type and the `InvitationView` table. Every object is new,
-- so no existing row is rewritten and nothing is deleted. Prisma generated the type, the table, the primary key, the
-- index, and the foreign key; it cannot express the CHECK constraint, so `schema.prisma` only documents it and this
-- file states it.
--
-- What a row is: one calendar day in `America/Mexico_City`, one of the two links the invitation was opened through
-- (`PUBLIC` for the public page, `GUEST` for a personal guest link), and how many openings that pair counted. Nothing
-- about the visitor is stored — no IP address, user agent, referrer, cookie, session, token, or slug — so the table
-- cannot become personal-data storage (S2, S7).
--
-- The primary key `(invitationId, day, source)` is also the upsert's conflict target: one increment is
-- `INSERT … ON CONFLICT ("invitationId", "day", "source") DO UPDATE SET "count" = "count" + 1`, so a retry and two
-- concurrent requests both increment the same row instead of duplicating it. The count is bounded to what one day of
-- one link can reach and can never be negative (check below).

-- CreateEnum
-- The two links a view can open (S7): counted together and separately.
CREATE TYPE "InvitationViewSource" AS ENUM ('PUBLIC', 'GUEST');

-- CreateTable
-- One counted pair of an invitation, a Ciudad de México calendar day, and a source.
CREATE TABLE "InvitationView" (
    "invitationId" UUID NOT NULL,
    -- The calendar day the openings were counted in, cut in `America/Mexico_City` by the writing statement.
    "day" DATE NOT NULL,
    "source" "InvitationViewSource" NOT NULL,
    -- How many openings of that link that day. The upsert increments it; the check below keeps it non-negative.
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvitationView_pkey" PRIMARY KEY ("invitationId", "day", "source")
);

-- CreateIndex
-- The retention command deletes by day and both analytics reads scan one window of days, so the day is the one
-- additional key those statements need; the primary key leads with the invitation and cannot serve them.
CREATE INDEX "InvitationView_day_idx" ON "InvitationView"("day");

-- AddForeignKey
-- An invitation is never hard-deleted here — archiving is its only terminal lifecycle write — so RESTRICT matches every
-- other invitation reference, and a database suite must delete its view rows before its invitation fixtures.
ALTER TABLE "InvitationView" ADD CONSTRAINT "InvitationView_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A counter is never negative: the API only increments, and a hand-written statement that would subtract below zero is
-- refused instead of storing a count no read can explain.
ALTER TABLE "InvitationView"
ADD CONSTRAINT "InvitationView_count_non_negative"
CHECK ("count" >= 0);
