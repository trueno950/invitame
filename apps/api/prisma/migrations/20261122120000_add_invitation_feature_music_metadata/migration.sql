-- Additive music metadata for the playlist card (S2): two nullable columns on the existing one-to-one table, so no
-- existing row is rewritten, no column is dropped, and no default is needed. An invitation whose playlist lookup
-- never ran, or failed, simply reads NULL in both and renders the link-only card it renders today. Prisma generated
-- the columns; it cannot express the CHECK constraint below, so `schema.prisma` only documents it.
--
-- Rollback / recovery: the change is additive, so recovery is either applying the previous migration set or
-- dropping the columns by hand. Dropping loses only the stored titles and covers; invitations, their content,
-- their feature settings row, and their playlist links are untouched. Run it as its own migration, never by editing
-- this file after it was applied:
--   ALTER TABLE "InvitationFeatureSettings" DROP COLUMN "playlistCoverUrl", DROP COLUMN "playlistTitle";

-- AlterTable
-- At most 200 characters: the domain trims the provider's title to this width (domain/invitation-features.ts, S2)
-- and the column is the second bound, so a value written around the API cannot grow the row without limit.
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN     "playlistTitle" VARCHAR(200);

-- AlterTable
-- At most 500 characters: the same width as the playlist link the cover belongs to.
ALTER TABLE "InvitationFeatureSettings" ADD COLUMN     "playlistCoverUrl" VARCHAR(500);

-- A stored cover is https or NULL. The domain accepts only an `https` URL on an allow-listed image host
-- (`i.scdn.co`, `image-cdn-*.spotifycdn.com`, `i.ytimg.com`); like `InvitationFeatureSettings_playlistUrl_https`,
-- the database checks the shape the column can state and the domain owns the allow-list.
ALTER TABLE "InvitationFeatureSettings"
ADD CONSTRAINT "InvitationFeatureSettings_playlistCoverUrl_https"
CHECK ("playlistCoverUrl" IS NULL OR starts_with("playlistCoverUrl", 'https://'));
