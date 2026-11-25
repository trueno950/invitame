-- Package duration (S1, S4, T1): how long a published invitation of a package stays live, counted from its
-- publication instant, in whole days. Additive: one NOT NULL column with a default, so every package stored before
-- this migration keeps a valid lifetime and no row is rewritten, deleted, or made invalid.

-- AlterTable
ALTER TABLE "Package" ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 30;

-- The column default is the basic month, the shortest catalog duration, so an existing package behaves like the
-- basic one until an administrator sets its own duration. The seed gives each catalog package its own value
-- (basic 30, premium 90, deluxe 180).
--
-- What Prisma cannot express: a duration of zero or less would publish an invitation that is already expired, so the
-- database refuses it. The upper bound is the domain's own (3650 days) and stays there, because widening or
-- narrowing it must not require a migration.
ALTER TABLE "Package"
ADD CONSTRAINT "Package_durationDays_positive"
CHECK ("durationDays" > 0);
