-- Re-pin an existing DRAFT invitation to its template's current PUBLISHED version (S5, S8.6). The invitation is
-- still pinned at creation and still keeps rendering the version it was created with, but an existing draft may now
-- follow the catalog once, through `pnpm --filter @invitame/api invitations:repin-drafts`, so a customer who has not
-- published yet gets the new version of their template with the omittable-section extension.
--
-- This migration rewrites no row: it replaces the body of the function the existing `Invitation_pinned_fields_immutable`
-- trigger already runs, and keeps the trigger, its name, and its message exactly as they are. Everything the trigger
-- refused before is refused now, with the same `Invitation pinned fields are immutable` error, except one case:
-- a `BEFORE UPDATE` row whose `templateVersionId` changes is allowed only when all three of these hold, and refused
-- otherwise:
--   1. the stored row is `DRAFT` and the update leaves it `DRAFT` (a PUBLISHED or ARCHIVED invitation never moves, and
--      a move can never be combined with a publication in the same statement);
--   2. the old and the new version belong to the same `Template`, so a re-pin never changes the template; and
--   3. the new version is `PUBLISHED` right now, so it is the version a new draft of that template would pin.
-- `ownerId`, `packageId`, and `slug` stay immutable for every row in every status, and `content` stays editable as
-- before. `Invitation.templateVersionId` still references `TemplateVersion` and the trigger still answers through
-- `TemplateVersion`, never through mutable `Template` metadata.
--
-- Down / recovery (this file is applied: never edit it, add a migration instead):
--   CREATE OR REPLACE FUNCTION "prevent_invitation_pinned_field_mutation"()
--   RETURNS TRIGGER AS $$
--   BEGIN
--     IF NEW."templateVersionId" IS DISTINCT FROM OLD."templateVersionId"
--       OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
--       OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
--       OR NEW."slug" IS DISTINCT FROM OLD."slug" THEN
--       RAISE EXCEPTION 'Invitation pinned fields are immutable';
--     END IF;
--
--     RETURN NEW;
--   END;
--   $$ LANGUAGE plpgsql;
-- Restoring that body returns the strict rule of 20261111214752_add_invitations byte for byte and needs no data
-- change: the trigger guards updates, so the drafts the script already re-pinned keep the version they now pin, and
-- their content stays valid because the new version only adds the `x-omittable`/`x-require-one` extensions and the
-- optional `omittedSections` property. Rolling back the re-pin itself is a deliberate data change (each moved draft
-- names its previous version in the operator's report), and only drafts are affected: no PUBLISHED or ARCHIVED
-- invitation was ever touched, so nothing public changes.

CREATE OR REPLACE FUNCTION "prevent_invitation_pinned_field_mutation"()
RETURNS TRIGGER AS $$
DECLARE
  pinned_template_id UUID;
  target_template_id UUID;
  target_status "TemplateVersionStatus";
BEGIN
  IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."slug" IS DISTINCT FROM OLD."slug" THEN
    RAISE EXCEPTION 'Invitation pinned fields are immutable';
  END IF;

  IF NEW."templateVersionId" IS DISTINCT FROM OLD."templateVersionId" THEN
    -- Only a draft that stays a draft follows the catalog (S5, S8.6).
    IF OLD."status" <> 'DRAFT' OR NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Invitation pinned fields are immutable';
    END IF;

    SELECT "templateId" INTO pinned_template_id
    FROM "TemplateVersion"
    WHERE "id" = OLD."templateVersionId";

    SELECT "templateId", "status" INTO target_template_id, target_status
    FROM "TemplateVersion"
    WHERE "id" = NEW."templateVersionId";

    -- The new version must be the PUBLISHED version of the same template; both references exist (foreign keys), so
    -- the NULL checks only keep the rule readable for a row written around the API.
    IF pinned_template_id IS NULL
      OR target_template_id IS NULL
      OR target_template_id <> pinned_template_id
      OR target_status <> 'PUBLISHED' THEN
      RAISE EXCEPTION 'Invitation pinned fields are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
