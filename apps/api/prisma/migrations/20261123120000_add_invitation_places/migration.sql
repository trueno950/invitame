-- Precise locations (S1, S2): the point an owner chose for one address field of one invitation. The address text
-- keeps living in the template content, so no existing row is rewritten, no column is dropped, and an invitation that
-- never picked a suggestion reads exactly as it does today. Prisma generated the table below; it cannot express the
-- two CHECK constraints, so `schema.prisma` only documents them.
--
-- The primary key is the pair (invitationId, field): one address field of one invitation has at most one point, so a
-- second choice replaces the first instead of adding a row. The reference is ON DELETE RESTRICT, like every other
-- invitation reference, because an invitation is never hard-deleted here.
--
-- Rollback / recovery: the change is additive, so recovery is either applying the previous migration set or dropping
-- the table by hand. Dropping loses only the stored points; invitations, their content, and their address text are
-- untouched. Run it as its own migration, never by editing this file after it was applied:
--   DROP TABLE "InvitationPlace";

-- CreateTable
CREATE TABLE "InvitationPlace" (
    "invitationId" UUID NOT NULL,
    "field" VARCHAR(64) NOT NULL,
    "label" VARCHAR(300) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InvitationPlace_pkey" PRIMARY KEY ("invitationId","field")
);

-- AddForeignKey
ALTER TABLE "InvitationPlace" ADD CONSTRAINT "InvitationPlace_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The two bounds PostgreSQL states for the domain: a point outside them is not a point on Earth, and a row written
-- around the API must not be able to store one. The API refuses the same ranges with its own message.
ALTER TABLE "InvitationPlace"
ADD CONSTRAINT "InvitationPlace_lat_range" CHECK ("lat" >= -90 AND "lat" <= 90);

ALTER TABLE "InvitationPlace"
ADD CONSTRAINT "InvitationPlace_lng_range" CHECK ("lng" >= -180 AND "lng" <= 180);
