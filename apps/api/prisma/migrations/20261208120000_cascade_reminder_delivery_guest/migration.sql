-- F6 review R3-001: a recorded reminder attempt must never keep the owner from removing a guest. The attempts are an
-- operational record of the reminders module whose lifetime is bounded by the guest, so removing the guest removes them
-- in the database, and the invitations module never has to know the reminders table exists. The invitation foreign key
-- stays RESTRICT: an invitation is archived, never deleted.
--
-- Rollback: drop the constraint and add it back with ON DELETE RESTRICT; no row changes either way.

-- DropForeignKey
ALTER TABLE "ReminderDelivery" DROP CONSTRAINT "ReminderDelivery_guestId_fkey";

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
