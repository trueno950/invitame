-- Additive publication rules for TemplateVersion (S5, L4); no stored row is rewritten.
-- Prisma cannot express a partial unique index, so `schema.prisma` only documents it.

-- At most one PUBLISHED version per template: publishing retires the previous one first.
CREATE UNIQUE INDEX "TemplateVersion_templateId_published_key"
ON "TemplateVersion"("templateId")
WHERE "status" = 'PUBLISHED';

-- Only DRAFT -> PUBLISHED and PUBLISHED -> RETIRED may change the status; an update that leaves it
-- unchanged stays allowed. Complements "prevent_template_version_snapshot_mutation".
CREATE FUNCTION "enforce_template_version_status_transition"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status"
    AND NOT (
      (OLD."status" = 'DRAFT' AND NEW."status" = 'PUBLISHED')
      OR (OLD."status" = 'PUBLISHED' AND NEW."status" = 'RETIRED')
    ) THEN
    RAISE EXCEPTION 'TemplateVersion status change not allowed: % -> %', OLD."status", NEW."status";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TemplateVersion_status_transition"
BEFORE UPDATE ON "TemplateVersion"
FOR EACH ROW
EXECUTE FUNCTION "enforce_template_version_status_transition"();
