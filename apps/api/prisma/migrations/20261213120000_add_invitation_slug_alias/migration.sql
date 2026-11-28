-- Custom invitation address (F11; S2.11, L15, approval): one new table of previous public addresses, and one rewrite of
-- the function the existing `Invitation_pinned_fields_immutable` trigger runs. No existing row is rewritten, no column
-- is dropped, and no value has to be filled: every invitation keeps its current slug, its owner, its package, and its
-- pinned version exactly as they were.
--
-- What changes, and what stays exactly as today:
--
--   * `Invitation.ownerId` and `Invitation.packageId` keep refusing every change with the same
--     `Invitation pinned fields are immutable` error the trigger has always raised.
--   * `Invitation.templateVersionId` keeps the one exception the draft re-pin migration added (a DRAFT that stays a
--     DRAFT may follow the same template's PUBLISHED version) and refuses everything else as before.
--   * `Invitation.slug` may now change, but ONLY inside the API's own rename: the same transaction must set the
--     transaction-local `invitame.slug_rename` setting to the id of the invitation it renames
--     (`set_config('invitame.slug_rename', <id>, true)`), the new slug must not be one of the stored previous addresses,
--     and, because the check is deferred to COMMIT, the same transaction must have recorded the previous slug in
--     `InvitationSlugAlias`. An `UPDATE` of the slug that does not carry that setting is still refused with the same
--     error, so a stray script, a migration, or any code path outside the rename changes nothing.
--
-- `InvitationSlugAlias` holds one row per previous public address, with the slug as its primary key, so PostgreSQL
-- enforces that a previous address is unique. Three more rules need a trigger, because they read more than one row:
-- an alias may never equal a current `Invitation.slug`, a new invitation may never take an alias that already points
-- somewhere, and an invitation keeps at most five aliases (the owner's five renames, L15.2). The foreign key is
-- ON DELETE RESTRICT, for the reason L24 states about a RESTRICT key: an invitation is never hard-deleted here
-- (archiving is its only terminal lifecycle write), so the restriction blocks no operation the product allows, and it
-- keeps a previous address from outliving the invitation it redirects to.
--
-- Down / recovery (this file is applied: never edit it, add a migration instead):
--   DROP TRIGGER "Invitation_slug_not_aliased" ON "Invitation";
--   DROP TRIGGER "Invitation_slug_rename_records_alias" ON "Invitation";
--   DROP TRIGGER "InvitationSlugAlias_guards" ON "InvitationSlugAlias";
--   DROP FUNCTION "guard_invitation_new_slug"();
--   DROP FUNCTION "require_invitation_slug_alias"();
--   DROP FUNCTION "guard_invitation_slug_alias"();
--   CREATE OR REPLACE FUNCTION "prevent_invitation_pinned_field_mutation"() ... (the body of
--     20261201120000_allow_draft_invitation_repin, byte for byte)
--   DROP TABLE "InvitationSlugAlias";
-- Restoring that body returns the strict rule: `slug` is immutable again. Rolling back the aliases themselves is a
-- deliberate data change, and the operator must first know that every previous address stops resolving; the current
-- slug of each invitation is untouched either way, so no published invitation changes its address.

-- CreateTable
CREATE TABLE "InvitationSlugAlias" (
    "slug" VARCHAR(60) NOT NULL,
    "invitationId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationSlugAlias_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "InvitationSlugAlias_invitationId_idx" ON "InvitationSlugAlias"("invitationId");

-- AddForeignKey
ALTER TABLE "InvitationSlugAlias" ADD CONSTRAINT "InvitationSlugAlias_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The pinned-field guard, rewritten. The owner and the package are refused exactly as before, the pinned version keeps
-- the draft re-pin exception of 20261201120000, and the slug may change only when the renaming transaction says so.
CREATE OR REPLACE FUNCTION "prevent_invitation_pinned_field_mutation"()
RETURNS TRIGGER AS $$
DECLARE
  pinned_template_id UUID;
  target_template_id UUID;
  target_status "TemplateVersionStatus";
  rename_scope TEXT;
BEGIN
  IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
    OR NEW."packageId" IS DISTINCT FROM OLD."packageId" THEN
    RAISE EXCEPTION 'Invitation pinned fields are immutable';
  END IF;

  IF NEW."slug" IS DISTINCT FROM OLD."slug" THEN
    -- The API's rename sets this setting for its own transaction only (`SET LOCAL`, or `set_config(..., true)`), naming
    -- the one invitation it renames. Anything else leaves the setting unset and is refused like it always was.
    rename_scope := current_setting('invitame.slug_rename', true);

    IF rename_scope IS NULL OR rename_scope <> OLD."id"::text THEN
      RAISE EXCEPTION 'Invitation pinned fields are immutable';
    END IF;

    -- A previous address is final: reusing one would make the redirect of an older link ambiguous.
    IF EXISTS (SELECT 1 FROM "InvitationSlugAlias" WHERE "slug" = NEW."slug") THEN
      RAISE EXCEPTION 'Invitation slug is already a previous address';
    END IF;
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

-- The other half of the rename rule, checked when the transaction commits: a slug that moved must have left its
-- previous value behind as an alias of the same invitation. A rename that stores nothing therefore stores nothing at
-- all, instead of leaving a link that silently stops working.
CREATE FUNCTION "require_invitation_slug_alias"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."slug" IS DISTINCT FROM OLD."slug" THEN
    IF NOT EXISTS (
      SELECT 1 FROM "InvitationSlugAlias"
      WHERE "invitationId" = OLD."id" AND "slug" = OLD."slug"
    ) THEN
      RAISE EXCEPTION 'Invitation slug rename must record the previous slug as an alias';
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "Invitation_slug_rename_records_alias"
AFTER UPDATE ON "Invitation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "require_invitation_slug_alias"();

-- One previous address: it may not be somebody's current address, and one invitation keeps at most five of them
-- (L15.2, approval). The count reads the rows of the same transaction, so two concurrent renames cannot both take the
-- sixth place.
CREATE FUNCTION "guard_invitation_slug_alias"()
RETURNS TRIGGER AS $$
DECLARE
  alias_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM "Invitation" WHERE "slug" = NEW."slug") THEN
    RAISE EXCEPTION 'Invitation slug alias is a live invitation slug';
  END IF;

  SELECT count(*) INTO alias_count
  FROM "InvitationSlugAlias"
  WHERE "invitationId" = NEW."invitationId";

  IF alias_count >= 5 THEN
    RAISE EXCEPTION 'Invitation slug alias limit reached';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InvitationSlugAlias_guards"
BEFORE INSERT ON "InvitationSlugAlias"
FOR EACH ROW
EXECUTE FUNCTION "guard_invitation_slug_alias"();

-- A new invitation may not take an address another invitation once left behind: the old link must keep redirecting to
-- the invitation it belonged to, never to somebody else's page.
CREATE FUNCTION "guard_invitation_new_slug"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InvitationSlugAlias" WHERE "slug" = NEW."slug") THEN
    RAISE EXCEPTION 'Invitation slug is already a previous address';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Invitation_slug_not_aliased"
BEFORE INSERT ON "Invitation"
FOR EACH ROW
EXECUTE FUNCTION "guard_invitation_new_slug"();
