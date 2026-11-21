-- Additive audit vocabulary (M9 T13; S5, S8, L15): one new label on the `AdminActionType` enum, so a settings save is
-- recorded like every other state-changing administrator action. No table, column, constraint, or row changes here, and
-- the label is appended last, so every stored row keeps the label it has.
--
-- This is a migration of its own on purpose. PostgreSQL cannot use a value added to an enum type in the same
-- transaction that adds it, and Prisma runs one migration file inside one transaction: the CHECK constraints that must
-- name `SETTINGS_UPDATED` therefore live in the next file
-- (`20261129120100_add_settings_admin_action`), which runs after this one commits.

-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'SETTINGS_UPDATED';
