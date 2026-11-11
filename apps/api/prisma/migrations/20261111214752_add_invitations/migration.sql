-- Additive invitation persistence (M4 T1; S2, S3, S5, S10, A3): one new enum and one new table, no
-- existing row is rewritten. Prisma generated the enum, the table, the indexes, and the foreign keys; it
-- cannot express the CHECK constraints and the trigger below, so `schema.prisma` only documents them.

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('DRAFT', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "templateVersionId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_slug_key" ON "Invitation"("slug");

-- CreateIndex
CREATE INDEX "Invitation_ownerId_idx" ON "Invitation"("ownerId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A generated public slug is lower-case alphanumerics joined by single hyphens, three to sixty
-- characters long. Uniqueness above is a unique index, so PostgreSQL enforces it, not a preflight query.
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_slug_length" CHECK (char_length("slug") BETWEEN 3 AND 60);

-- Draft content is always a JSON object: the pinned version's schema validates its fields, never its shape.
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_content_object" CHECK (jsonb_typeof("content") = 'object');

-- Archiving is the only lifecycle step Milestone 4 writes, and `archivedAt` records exactly that state.
ALTER TABLE "Invitation"
ADD CONSTRAINT "Invitation_archivedAt_matches_status"
CHECK (("status" = 'ARCHIVED') = ("archivedAt" IS NOT NULL));

-- An invitation keeps rendering the version it was created with: the pinned version, the owner, the
-- package, and the slug never change. An update that leaves them as they were stays allowed.
CREATE FUNCTION "prevent_invitation_pinned_field_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."templateVersionId" IS DISTINCT FROM OLD."templateVersionId"
    OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."slug" IS DISTINCT FROM OLD."slug" THEN
    RAISE EXCEPTION 'Invitation pinned fields are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Invitation_pinned_fields_immutable"
BEFORE UPDATE ON "Invitation"
FOR EACH ROW
EXECUTE FUNCTION "prevent_invitation_pinned_field_mutation"();
