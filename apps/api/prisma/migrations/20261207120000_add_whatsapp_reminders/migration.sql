-- Additive WhatsApp reminders (F6; S2.6, S3-S6, L9.1, L9.2, L9.4): one nullable JSONB column on the existing
-- one-to-one feature settings table, one new table that records the attempts, and the WHATSAPP_REMINDERS catalog
-- feature key with its Deluxe link as data. No existing row is rewritten, no column is dropped, and no default is
-- needed: an invitation that never switched a reminder on reads NULL and renders exactly the page it rendered before,
-- and the guest page keeps rendering it, because reminders are never a guest feature.
--
-- What the column holds: the versioned switches `{ "version": 1, "pendingRsvp": boolean, "eventEve": boolean }` the
-- API validates (domain/invitation-reminders.ts). It is bounded presentation data — two booleans and a version — and
-- it never carries a phone, a provider, or a credential, so it stays inside the rule that JSONB is only for bounded,
-- versioned, presentation payloads. Prisma cannot express that shape, so the column is the storage and the domain is
-- the authority on the contents.
--
-- What the table holds: one row per attempt to deliver one reminder, unique on (invitationId, guestId, kind, dueDate),
-- which is exactly what makes a second run of the same day send nothing twice (L9.4). `dueDate` is a DATE of the
-- invitation's own calendar zone, not an instant, so two runs on the same day agree whatever hour they start at.
-- `status` starts as `pending` when a run claims the attempt and becomes `sent`, `skipped` (with its stable reason,
-- `not_configured` while no provider exists, S6), or `failed`. No phone, name, or message body is stored: the guest's
-- own data stays in the guest list, and the API's report carries counts only.
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new
-- key. Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature row
-- and one link.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "ReminderDelivery";
--   DELETE FROM "PackageFeature"
--     USING "Feature"
--     WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'WHATSAPP_REMINDERS';
--   DELETE FROM "Feature" WHERE "key" = 'WHATSAPP_REMINDERS';
--   ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "reminders";
--   DROP TABLE "ReminderDelivery";
--   DROP TYPE "ReminderDeliveryStatus";
--   DROP TYPE "ReminderKind";
-- Only the stored switches, the attempt record, and the catalog key are lost; invitations, their content, and every
-- other feature setting are untouched. Run it as its own migration, never by editing this file after it was applied:

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('PENDING_RSVP_7D', 'PENDING_RSVP_2D', 'EVENT_EVE');

-- CreateEnum
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('pending', 'sent', 'skipped', 'failed');

-- AlterTable
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN "reminders" JSONB;

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "guestId" UUID NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'pending',
    "reason" VARCHAR(40),
    "attemptedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one attempt per invitation, guest, kind, and day (L9.4).
CREATE UNIQUE INDEX "ReminderDelivery_invitationId_guestId_kind_dueDate_key" ON "ReminderDelivery"("invitationId", "guestId", "kind", "dueDate");

-- CreateIndex
CREATE INDEX "ReminderDelivery_invitationId_attemptedAt_idx" ON "ReminderDelivery"("invitationId", "attemptedAt");

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderDelivery" ADD CONSTRAINT "ReminderDelivery_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The new gated capability, as data (S5, L9.2): feature keys never select a code path, the command's own allow-list of
-- one key does, and the panel may grant or withdraw it without a deployment.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'WHATSAPP_REMINDERS',
    'Recordatorios por WhatsApp',
    'Recordatorios automáticos para tus invitados; se activan cuando el servicio esté disponible.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Deluxe grants it (L9.2). The link is found by key, so this works on any database whose catalog keeps the seeded
-- keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" = 'deluxe'
  AND "Feature"."key" = 'WHATSAPP_REMINDERS'
ON CONFLICT DO NOTHING;
