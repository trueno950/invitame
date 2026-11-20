-- Additive administrator audit (M9 T6; S4, S6, L9): two enum types and the `AdminAction` table. Every object is new,
-- so no existing row is rewritten and nothing is deleted. Prisma generated the types, the table, the columns, the
-- indexes, and the foreign keys; it cannot express the CHECK constraints or the append-only trigger, so
-- `schema.prisma` only documents them and this file states them.

-- CreateEnum
-- The four state-changing support actions that are audited (S4). Viewing a payment is deliberately absent: S6 decided
-- that a read is not an action, so it writes no row. The labels are the domain's own (`ADMIN_ACTION`), stored
-- verbatim so a support query reads the same words the code does.
CREATE TYPE "AdminActionType" AS ENUM ('INVITATION_UNPUBLISHED', 'ACCOUNT_DISABLED', 'ACCOUNT_REACTIVATED', 'SIGN_IN_CODE_RESENT');

-- CreateEnum
-- The closed set of reasons an administrator gives (L8, L9, S6). A free-form reason would make the column
-- unqueryable; `OTHER` is the one value that requires the note instead.
CREATE TYPE "AdminActionReason" AS ENUM ('ABUSE', 'OWNER_REQUEST', 'PAYMENT_ERROR', 'OTHER');

-- CreateTable
-- One append-only audit row: who acted, what they did, why, and which one target they changed. No email address,
-- client address, or provider payload is stored, so the row cannot become personal-data storage of its own.
CREATE TABLE "AdminAction" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "action" "AdminActionType" NOT NULL,
    "reason" "AdminActionReason" NOT NULL,
    -- Optional and trimmed by the domain; required and non-blank while the reason is OTHER (check below).
    "note" VARCHAR(500),
    -- The account the three account actions changed, or NULL.
    "targetUserId" UUID,
    -- The invitation INVITATION_UNPUBLISHED changed, or NULL.
    "invitationId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The audit reads newest first and its key-set pages continue on `id`.
CREATE INDEX "AdminAction_createdAt_id_idx" ON "AdminAction"("createdAt", "id");

-- CreateIndex
-- One account's audit history.
CREATE INDEX "AdminAction_targetUserId_idx" ON "AdminAction"("targetUserId");

-- CreateIndex
-- One invitation's audit history.
CREATE INDEX "AdminAction_invitationId_idx" ON "AdminAction"("invitationId");

-- AddForeignKey
-- The actor is the signed-in administrator, taken from the session and never from client input. RESTRICT, so the
-- audit history outlives any attempt to remove the account that wrote it.
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- The account the action changed is never hard-deleted here (disabling is the terminal account write), and a row that
-- names it must not disappear with it: RESTRICT keeps the audited target in place.
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- An invitation is never hard-deleted here either — archiving is its only terminal lifecycle write — so RESTRICT
-- matches every other invitation reference.
ALTER TABLE "AdminAction" ADD CONSTRAINT "AdminAction_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The note is bounded by the column as well; the check states it, so the width is not the only guard.
ALTER TABLE "AdminAction"
ADD CONSTRAINT "AdminAction_note_length"
CHECK ("note" IS NULL OR char_length("note") <= 500);

-- A note is optional, with one exception: «Otro» (L9) must say what the administrator meant, and a note of spaces
-- says nothing. Every other reason may carry a note or not. Compared through the text form, like the payment and
-- invitation checks, so the enum's physical order cannot matter.
ALTER TABLE "AdminAction"
ADD CONSTRAINT "AdminAction_note_required_for_other"
CHECK ("reason"::text <> 'OTHER' OR ("note" IS NOT NULL AND btrim("note") <> ''));

-- Exactly one target per row: the three account actions name a user, and INVITATION_UNPUBLISHED names an invitation.
ALTER TABLE "AdminAction"
ADD CONSTRAINT "AdminAction_exactly_one_target"
CHECK (num_nonnulls("targetUserId", "invitationId") = 1);

-- The target is the one the action means, so an account action can never point at an invitation or the reverse.
ALTER TABLE "AdminAction"
ADD CONSTRAINT "AdminAction_target_matches_action"
CHECK (
  ("action"::text = 'INVITATION_UNPUBLISHED' AND "invitationId" IS NOT NULL)
  OR ("action"::text <> 'INVITATION_UNPUBLISHED' AND "targetUserId" IS NOT NULL)
);

-- A stored row is final: the audit is append-only, so no later statement may rewrite why an administrator acted or
-- remove the record that they did. Copied from the `Invitation_pinned_fields_immutable` pattern: one function and one
-- trigger, refusing the write instead of filtering it, so a caller learns its statement was refused.
CREATE FUNCTION "prevent_admin_action_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AdminAction rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminAction_append_only"
BEFORE UPDATE OR DELETE ON "AdminAction"
FOR EACH ROW
EXECUTE FUNCTION "prevent_admin_action_mutation"();
