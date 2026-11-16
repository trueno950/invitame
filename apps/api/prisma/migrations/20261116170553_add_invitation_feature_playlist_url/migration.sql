-- Additive feature data for the music feature (F6; S7): one nullable column on the existing one-to-one table. No
-- existing row is rewritten, no column is dropped, and no default is needed, because an invitation without a
-- playlist link simply reads NULL. Prisma generated the column; it cannot express the CHECK constraint below, so
-- `schema.prisma` only documents it.
--
-- Rollback / recovery: the change is additive, so recovery is either applying the previous migration set or
-- dropping the column by hand. Dropping loses only the playlist links; invitations, their content, their feature
-- settings row, and their lifecycle state are untouched. Run it as its own migration, never by editing this file
-- after it was applied:
--   ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "playlistUrl";

-- AlterTable
-- At most 500 characters: the domain refuses a longer link (domain/invitation-features.ts, S7) and the column is
-- the second bound, so a value written around the API cannot grow the row without limit.
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN     "playlistUrl" VARCHAR(500);

-- A stored link is https or NULL. The domain accepts only an `https` URL on an allow-listed music host
-- (`open.spotify.com`, `music.apple.com`, `music.youtube.com`, `www.youtube.com`, `youtube.com`, `youtu.be`,
-- `www.deezer.com`, `deezer.com`, `soundcloud.com`); like `InvitationFeatureSettings_whatsappPhone_format`, the
-- database checks the shape the column can state and the domain owns the allow-list.
ALTER TABLE "InvitationFeatureSettings"
ADD CONSTRAINT "InvitationFeatureSettings_playlistUrl_https"
CHECK ("playlistUrl" IS NULL OR starts_with("playlistUrl", 'https://'));
