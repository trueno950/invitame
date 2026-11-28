-- Hardening of the co-host table (F12; S2.12, L17.1). Additive in the sense that matters: no column, index, or row is
-- removed, no existing value changes meaning, and an invitation whose owner never invited anybody answers exactly what
-- it answered before. It closes two gaps the first migration stated as intent but could not express on a nullable
-- column, and it is the database half of three native-review advisories on 9e1617d, d16f24e and 5f408da.
--
-- 1. `permissions` is NOT NULL. It already carried `InvitationCollaborator_permissions_granted`
--    (`cardinality(...) >= 1`), but a CHECK is satisfied by NULL, and Prisma creates a scalar-list column without
--    NOT NULL, so a writer that did not go through the API could store a row with no permissions at all. The resolver
--    treats such a row as no access, which is safe, but the table then holds a row that means "no access" while the
--    comment says it never can. Both constraints now state it. Existing rows comply — Prisma always writes an array, and
--    the API refuses an empty one before the write — so nothing is rewritten here. A row written around the API with
--    NULL permissions cannot be repaired without granting somebody a permission, so this migration fails loudly instead:
--    nothing is deleted and nothing is granted.
--
-- 2. A burned token has no expiry. The original constraint said "a burned token carries no expiry" but only enforced
--    the other direction: `tokenHash IS NULL OR (tokenExpiresAt IS NOT NULL AND tokenExpiresAt > invitedAt)` accepted a
--    row with a NULL digest and a live expiry, which is a link that no longer resolves yet still claims a window. The
--    acceptance and the revoke already clear both columns in the same statement; the constraint now makes that the only
--    shape, so a reader that does not go through the API cannot leave a half-burned token behind.
--
-- What this migration does not do: it adds no column, changes no index, and touches no other table. `permissions` and
-- the token window are the two columns the reviews named; the partial unique index over (invitationId, email), the
-- five-collaborator trigger, and both ON DELETE RESTRICT keys stay exactly as they were.
--
-- Down / recovery (this file is applied: never edit it, add a migration instead):
--   ALTER TABLE "InvitationCollaborator" DROP CONSTRAINT "InvitationCollaborator_token_expiry";
--   ALTER TABLE "InvitationCollaborator" ADD CONSTRAINT "InvitationCollaborator_token_expiry"
--       CHECK ("tokenHash" IS NULL OR ("tokenExpiresAt" IS NOT NULL AND "tokenExpiresAt" > "invitedAt"));
--   ALTER TABLE "InvitationCollaborator" DROP CONSTRAINT "InvitationCollaborator_permissions_granted";
--   ALTER TABLE "InvitationCollaborator" ALTER COLUMN "permissions" DROP NOT NULL;
--   ALTER TABLE "InvitationCollaborator" ADD CONSTRAINT "InvitationCollaborator_permissions_granted"
--       CHECK (cardinality("permissions") >= 1 AND cardinality("permissions") <= 3);
-- The rollback restores the two weaker rules and keeps every row exactly as it is. It loses only the hardening: a row
-- could again hold no permissions, and a burned token could again keep an expiry. No collaborator gains or loses access.

-- A burned digest keeps no expiry. This normalizes only the state the old rule tolerated and that no code writes: it
-- removes a meaningless window from a token that no longer resolves, and it never extends or grants anything.
UPDATE "InvitationCollaborator"
SET "tokenExpiresAt" = NULL
WHERE "tokenHash" IS NULL AND "tokenExpiresAt" IS NOT NULL;

ALTER TABLE "InvitationCollaborator" ALTER COLUMN "permissions" SET NOT NULL;

ALTER TABLE "InvitationCollaborator" DROP CONSTRAINT "InvitationCollaborator_permissions_granted";
ALTER TABLE "InvitationCollaborator"
    ADD CONSTRAINT "InvitationCollaborator_permissions_granted"
        CHECK (
            "permissions" IS NOT NULL
            AND cardinality("permissions") >= 1
            AND cardinality("permissions") <= 3
        );

ALTER TABLE "InvitationCollaborator" DROP CONSTRAINT "InvitationCollaborator_token_expiry";
ALTER TABLE "InvitationCollaborator"
    ADD CONSTRAINT "InvitationCollaborator_token_expiry"
        CHECK (
            ("tokenHash" IS NULL) = ("tokenExpiresAt" IS NULL)
            AND ("tokenExpiresAt" IS NULL OR "tokenExpiresAt" > "invitedAt")
        );
