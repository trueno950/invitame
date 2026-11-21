-- Relax the two target checks for the one action that names nothing (M9 T13; S5, S8, L15). The settings panel changes
-- platform-wide configuration, so its audit row has no invitation and no account to point at; every existing action
-- keeps exactly the rule it had. Both constraints are replaced under their own names, and the new expressions accept
-- every row the old ones accepted, so nothing is rewritten and no stored row is refused.
--
-- The new `SETTINGS_UPDATED` label arrives in `20261129120050_add_settings_admin_action_type`, which commits before this
-- file runs: PostgreSQL cannot use a new enum value in the transaction that added it.

-- A target-less action names no target at all, while every other action still names exactly one. Compared through the
-- text form, like the original check, so the enum's physical order cannot matter.
ALTER TABLE "AdminAction" DROP CONSTRAINT "AdminAction_exactly_one_target";
ALTER TABLE "AdminAction"
ADD CONSTRAINT "AdminAction_exactly_one_target"
CHECK (
  ("action"::text = 'SETTINGS_UPDATED' AND num_nonnulls("targetUserId", "invitationId") = 0)
  OR ("action"::text <> 'SETTINGS_UPDATED' AND num_nonnulls("targetUserId", "invitationId") = 1)
);

-- The target is the one the action means: the settings change names none, INVITATION_UNPUBLISHED names an invitation,
-- and the three account actions name an account. A row can therefore never point at a resource it did not change.
ALTER TABLE "AdminAction" DROP CONSTRAINT "AdminAction_target_matches_action";
ALTER TABLE "AdminAction"
ADD CONSTRAINT "AdminAction_target_matches_action"
CHECK (
  ("action"::text = 'SETTINGS_UPDATED' AND "targetUserId" IS NULL AND "invitationId" IS NULL)
  OR (
    "action"::text = 'INVITATION_UNPUBLISHED'
    AND "invitationId" IS NOT NULL
    AND "targetUserId" IS NULL
  )
  OR (
    "action"::text NOT IN ('SETTINGS_UPDATED', 'INVITATION_UNPUBLISHED')
    AND "targetUserId" IS NOT NULL
    AND "invitationId" IS NULL
  )
);
