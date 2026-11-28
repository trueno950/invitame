-- Co-hosts (F12; S2.12, L17, owner approval): one new table that stores who may collaborate on one invitation, the
-- three permissions they may hold, and the single-use acceptance token in its hashed form; plus the CO_HOSTS catalog
-- feature key and its Premium and Deluxe links as data. No existing row is rewritten, no column is added to an existing
-- table, and no default is needed: an invitation whose owner never invited anybody answers exactly what it answered
-- before.
--
-- What the table holds: the invitation, the invited address (trimmed and lower-cased on the way in), the account that
-- accepted it, the permission set, the SHA-256 hex digest of the acceptance token with the instant it stops being
-- valid, and the three instants that describe the row (invited, accepted, revoked). It never holds the plain token, an
-- email body, a session, or a password; the digest is what the acceptance looks up, so a database reader cannot
-- replay a link.
--
-- Why the invitation reference is ON DELETE RESTRICT (L24): the same convention as every other reference to
-- `Invitation` in this schema. An invitation is archived, never hard-deleted — archiving is its only terminal
-- lifecycle write — so the RESTRICT key never blocks an operation the owner has, and a collaborator row can never
-- outlive the invitation it authorizes. The user reference is RESTRICT for the same reason: an account is disabled,
-- never deleted. Neither key reaches `Guest`, `MediaAsset`, `Payment`, or any other row, so a collaborator never keeps
-- the owner from removing a guest, a photo, or a payment.
--
-- The rules below repeat what the API domain already enforces (`collaborators/domain/invitation-collaborator.ts`), for
-- a reader that does not go through the API. Prisma cannot express a partial unique index, a count across rows, or a
-- CHECK that compares two columns of the same row, so `schema.prisma` documents them here instead:
--
--   * "InvitationCollaborator_invitationId_email_key" (partial unique): one address is invited once per invitation
--     while its row stands, so a second invitation to the same address is refused instead of opening two links. A
--     revoked row leaves the index (it is not one of the non-revoked rows), so the owner may invite that address again.
--   * "InvitationCollaborator_permissions_granted": at least one permission, so a row can never mean "no access" while
--     the resolver treats a row as access.
--   * "InvitationCollaborator_acceptedAt_matches_user": the accepting account and the acceptance instant are both set
--     or both NULL, so a row never claims an acceptance without an account or an account without an acceptance.
--   * "InvitationCollaborator_email_lowercase": the stored address is already lower-cased, so the acceptance compares
--     two values normalized the same way instead of relying on the caller.
--   * "InvitationCollaborator_token_expiry": the token window is positive, and a burned token carries no expiry.
--   * the "InvitationCollaborator_max_active" trigger: at most five non-revoked collaborators per invitation (L17.1).
--     PostgreSQL has to count them, because a CHECK cannot read other rows, and the count has to run under the
--     invitation's own row lock, because two simultaneous invitations would otherwise both read four.
--
-- Down / recovery (this file is applied: never edit it, add a migration instead):
--   DROP TRIGGER "InvitationCollaborator_max_active" ON "InvitationCollaborator";
--   DROP FUNCTION "guard_invitation_collaborator_count"();
--   DELETE FROM "PackageFeature"
--     USING "Feature"
--     WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'CO_HOSTS';
--   DELETE FROM "Feature" WHERE "key" = 'CO_HOSTS';
--   DROP TABLE "InvitationCollaborator";
--   DROP TYPE "InvitationCollaboratorPermission";
-- The rollback deletes every CO_HOSTS link first, not only the Premium and Deluxe ones, so a link an administrator
-- added by hand never blocks the feature row's removal. Only the collaborator rows and the catalog key are lost;
-- invitations, their content, their feature settings, and every other permission stay exactly as they are, and every
-- collaborator stops having any access at all, which is the safe direction.

-- CreateEnum
CREATE TYPE "InvitationCollaboratorPermission" AS ENUM ('EDIT_CONTENT', 'VIEW_ATTENDANCE', 'PUBLISH');

-- CreateTable
CREATE TABLE "InvitationCollaborator" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "userId" UUID,
    "permissions" "InvitationCollaboratorPermission"[],
    "tokenHash" VARCHAR(64),
    "tokenExpiresAt" TIMESTAMPTZ(6),
    "invitedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMPTZ(6),
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "InvitationCollaborator_pkey" PRIMARY KEY ("id")
);

-- The owner's screen reads one invitation's rows, and the resolver reads one account's row for one invitation.
CREATE INDEX "InvitationCollaborator_invitationId_idx" ON "InvitationCollaborator"("invitationId");
CREATE INDEX "InvitationCollaborator_userId_idx" ON "InvitationCollaborator"("userId");

-- One link names one row: a replay of the same token finds exactly one collaborator, and a burned token (NULL) is
-- never found again. PostgreSQL's unique index allows the many NULLs a burned or revoked row leaves behind.
CREATE UNIQUE INDEX "InvitationCollaborator_tokenHash_key" ON "InvitationCollaborator"("tokenHash");

-- One address is invited once per invitation while its row stands; a revoked row leaves the index, so the owner may
-- invite that address again later.
CREATE UNIQUE INDEX "InvitationCollaborator_invitationId_email_key"
    ON "InvitationCollaborator"("invitationId", "email")
    WHERE "revokedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "InvitationCollaborator" ADD CONSTRAINT "InvitationCollaborator_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvitationCollaborator" ADD CONSTRAINT "InvitationCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The rules a CHECK can state: at least one permission, an acceptance with its account, a lower-cased address, and a
-- positive token window that a burned token no longer carries.
ALTER TABLE "InvitationCollaborator"
    ADD CONSTRAINT "InvitationCollaborator_permissions_granted"
        CHECK (cardinality("permissions") >= 1 AND cardinality("permissions") <= 3),
    ADD CONSTRAINT "InvitationCollaborator_acceptedAt_matches_user"
        CHECK (("acceptedAt" IS NULL) = ("userId" IS NULL)),
    ADD CONSTRAINT "InvitationCollaborator_email_lowercase"
        CHECK ("email" = lower("email") AND length("email") >= 3),
    ADD CONSTRAINT "InvitationCollaborator_token_expiry"
        CHECK ("tokenHash" IS NULL OR ("tokenExpiresAt" IS NOT NULL AND "tokenExpiresAt" > "invitedAt"));

-- At most five non-revoked collaborators per invitation (L17.1). The count runs after the invitation's row is locked,
-- so two simultaneous invitations cannot both read four and store a sixth; the row being written or un-revoked is
-- excluded from its own count.
CREATE FUNCTION "guard_invitation_collaborator_count"()
RETURNS TRIGGER AS $$
DECLARE
  active_count INTEGER;
BEGIN
  IF NEW."revokedAt" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM "Invitation" WHERE "id" = NEW."invitationId" FOR UPDATE;

  SELECT count(*) INTO active_count
  FROM "InvitationCollaborator"
  WHERE "invitationId" = NEW."invitationId"
    AND "revokedAt" IS NULL
    AND "id" <> NEW."id";

  IF active_count >= 5 THEN
    RAISE EXCEPTION 'An invitation keeps at most five non-revoked collaborators';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InvitationCollaborator_max_active"
    BEFORE INSERT OR UPDATE ON "InvitationCollaborator"
    FOR EACH ROW
    EXECUTE FUNCTION "guard_invitation_collaborator_count"();

-- The new gated capability, as data (S5): feature keys never select a code path, the API's allow-list does.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'CO_HOSTS',
    'Co-anfitriones',
    'Invita a otras personas a ayudarte con la invitación, con los permisos que tú elijas.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Premium and Deluxe grant it (L17.5). The links are found by key, so this works on any database whose catalog keeps
-- the seeded keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" IN ('premium', 'deluxe')
  AND "Feature"."key" = 'CO_HOSTS'
ON CONFLICT DO NOTHING;
