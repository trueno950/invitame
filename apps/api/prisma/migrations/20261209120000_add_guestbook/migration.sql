-- Additive guestbook (F7; S2.7, S5, L10.1, L10.2, L24): one new table that stores the messages one invitation's guests
-- signed, and the GUESTBOOK catalog feature key with its Premium and Deluxe links as data. No existing row is
-- rewritten, no column is added to an existing table, and no default is needed: an invitation whose package does not
-- grant the key renders exactly the page it rendered before.
--
-- What the table holds: the signature and the message the guest typed, both plain text trimmed and bounded by the API
-- domain (`domain/invitation-guestbook.ts`) — 1 to 60 and 1 to 500 characters — and the owner's one moderation switch,
-- `hidden`. The two CHECK constraints below repeat the length bounds for a reader that does not go through the API;
-- Prisma cannot express them, so `schema.prisma` documents them there. No IP address, session, token, or guest id is
-- stored: a guestbook entry is the guest's public words, and the rate limit keeps its own hashed key in `RateLimit`.
--
-- Why the invitation reference is ON DELETE RESTRICT (L24): this is the same convention as every other reference to
-- `Invitation` in this schema. An invitation is archived, never hard-deleted — archiving is its only terminal lifecycle
-- write — so a RESTRICT key never blocks an operation the owner has. The guestbook adds no reference to `Guest`, so it
-- also cannot keep the owner from removing a guest.
--
-- Why the catalog rows are inserted here and not only in the seed: the seed never updates an existing package (an
-- administrator may have removed a link on purpose), so a database that was already seeded would never grant the new
-- key. Both statements are idempotent, so a fresh database that the seed also prepares keeps exactly one feature row
-- and one link per package.
--
-- Rollback / recovery: the change is additive. Recovery is applying the previous migration set, or by hand:
--   DELETE FROM "PackageFeature"
--     USING "Feature"
--     WHERE "PackageFeature"."featureId" = "Feature"."id" AND "Feature"."key" = 'GUESTBOOK';
--   DELETE FROM "Feature" WHERE "key" = 'GUESTBOOK';
--   DROP TABLE "GuestbookEntry";
-- Only the signed messages and the catalog key are lost; invitations, their content, and every other feature are
-- untouched. Run it as its own migration, never by editing this file after it was applied:

-- CreateTable
CREATE TABLE "GuestbookEntry" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "authorName" VARCHAR(60) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestbookEntry_pkey" PRIMARY KEY ("id")
);

-- The guest wall reads one invitation's visible entries newest first, and the owner's screen reads them all in the same
-- order, so one index serves both.
CREATE INDEX "GuestbookEntry_invitationId_hidden_createdAt_idx" ON "GuestbookEntry"("invitationId", "hidden", "createdAt");

-- AddForeignKey: the invitation is archived, never deleted, so RESTRICT is the convention every other invitation
-- reference follows and never blocks an owner operation (L24).
ALTER TABLE "GuestbookEntry" ADD CONSTRAINT "GuestbookEntry_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A stored entry always carries a signature and a message of 1 to 60 and 1 to 500 characters: the domain trims them, so
-- a blank value is never stored, and the API refuses anything wider before it reaches this table.
ALTER TABLE "GuestbookEntry"
ADD CONSTRAINT "GuestbookEntry_authorName_length"
CHECK (char_length("authorName") >= 1 AND char_length("authorName") <= 60);

ALTER TABLE "GuestbookEntry"
ADD CONSTRAINT "GuestbookEntry_message_length"
CHECK (char_length("message") >= 1 AND char_length("message") <= 500);

-- The new gated capability, as data (S5, L10.2): feature keys never select a code path, the API's allow-list does, and
-- the panel may grant or withdraw it without a deployment.
INSERT INTO "Feature" ("id", "key", "name", "description", "updatedAt")
VALUES (
    gen_random_uuid(),
    'GUESTBOOK',
    'Libro de firmas',
    'Un muro de mensajes para que tus invitados te dejen sus mejores deseos.',
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- Premium and Deluxe grant it (L10.2). Every link is found by key, so this works on any database whose catalog keeps
-- the seeded keys, and inserts nothing where the link already exists or the package does not exist.
INSERT INTO "PackageFeature" ("packageId", "featureId")
SELECT "Package"."id", "Feature"."id"
FROM "Package", "Feature"
WHERE "Package"."key" IN ('premium', 'deluxe')
  AND "Feature"."key" = 'GUESTBOOK'
ON CONFLICT DO NOTHING;
