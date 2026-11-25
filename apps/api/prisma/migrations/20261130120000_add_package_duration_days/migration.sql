-- Package duration (S1, S4, T1): how long a published invitation of a package stays live, counted from its
-- publication instant, in whole days. Additive: one NOT NULL column with a default, so every package stored before
-- this migration keeps a valid lifetime.

-- AlterTable
ALTER TABLE "Package" ADD COLUMN "durationDays" INTEGER NOT NULL DEFAULT 30;

-- Backfill the three seeded catalog packages to their known lifetimes (S1: basic 30, premium 90, deluxe 180).
-- Every package stored before this migration first lands on the basic default; these updates set the correct
-- value for the catalog keys only, before an administrator can customize any of them. The seed's never-update
-- rule then preserves whatever an administrator sets afterwards.
UPDATE "Package" SET "durationDays" = 90 WHERE "key" = 'premium';
UPDATE "Package" SET "durationDays" = 180 WHERE "key" = 'deluxe';

-- What Prisma cannot express: a duration of zero or less would publish an invitation that is already expired, so the
-- database refuses it. The upper bound is the domain's own (3650 days) and stays there, because widening or
-- narrowing it must not require a migration.
ALTER TABLE "Package"
ADD CONSTRAINT "Package_durationDays_positive"
CHECK ("durationDays" > 0);
