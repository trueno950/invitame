-- Additive operational settings (M9 T13; S5, S8, L15): one new table, one new row, and no change to any existing table.
-- Nothing is rewritten and nothing is deleted. Prisma generated the table and the columns; it cannot express the
-- single-row check, the per-column bound checks, or the two cross-field checks, so `schema.prisma` only documents them
-- and this file states them.
--
-- What a row is: the administrator's configuration panel, as one row. There is exactly one — the `id` check pins it to
-- the literal 'default' — so a read needs no ordering, no limit, and no cache, and a save is one UPDATE of one row
-- (S5, S8).
--
-- Why the row is seeded here: the values below are the limits the code used before this slice, so nothing changes on
-- deploy (L15 «Cada ajuste arranca con el valor que tiene hoy en el código»). They are confirmed against the constants
-- they replace: `DEFAULT_RSVP_PARTY_LIMIT` (4), `RSVP_PARTY_LIMIT_MAX` (10), `MAX_GALLERY_PHOTOS` (12),
-- `MAX_STORED_ASSETS` (40), `MAX_UPLOAD_BYTES` (10 MB), `PLACE_RESULT_LIMIT` (5), and
-- `ANALYTICS_DEFAULT_WINDOW_DAYS` (30).
--
-- What a row is not: it carries no email, name, or any other personal datum, and no secret. A limit is a number the
-- panel states and the code reads; deploy-only configuration (payments, abuse limits, refunds, retention, secrets)
-- stays in the environment and never becomes a column here (S8).

-- CreateTable
CREATE TABLE "OperationalSettings" (
    -- The only row this table ever has. The check below pins the value, so a second row cannot exist.
    "id" VARCHAR(7) NOT NULL,
    -- The party limit a new invitation starts with, and the widest party an owner may set and a guest may submit (S5).
    "rsvpDefaultPartyLimit" INTEGER NOT NULL,
    "rsvpMaxPartyLimit" INTEGER NOT NULL,
    -- How many gallery photos, and how many stored assets of both kinds together, one invitation may hold (S5).
    "galleryPhotoLimit" INTEGER NOT NULL,
    "storedAssetLimit" INTEGER NOT NULL,
    -- The largest upload the API accepts, in whole megabytes (S5 «Tamaño de foto»).
    "maxUploadMegabytes" INTEGER NOT NULL,
    -- How many place suggestions the owner sees, and the analytics window a request that names no bound reads (S5).
    "placeSearchResultLimit" INTEGER NOT NULL,
    "analyticsDefaultWindowDays" INTEGER NOT NULL,
    -- The instant of the last save; the panel answers it and nothing else reads it.
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalSettings_pkey" PRIMARY KEY ("id")
);

-- The one row. A second row, or a row identified by anything else, is refused instead of stored: the module addresses
-- this row by its literal id, so a row without it would be a table nothing can read.
ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_single_row"
CHECK ("id" = 'default');

-- A bound per column: the safe ranges the owner chose (S8 «límites seguros»). The domain states the same ranges, so a
-- value it accepts is a value this table can store, and a hand-written statement that skips the domain is refused here.
ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_rsvpDefaultPartyLimit_range"
CHECK ("rsvpDefaultPartyLimit" >= 1 AND "rsvpDefaultPartyLimit" <= 10);

ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_rsvpMaxPartyLimit_range"
CHECK ("rsvpMaxPartyLimit" >= 1 AND "rsvpMaxPartyLimit" <= 10);

ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_galleryPhotoLimit_range"
CHECK ("galleryPhotoLimit" >= 1 AND "galleryPhotoLimit" <= 24);

ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_storedAssetLimit_range"
CHECK ("storedAssetLimit" >= 1 AND "storedAssetLimit" <= 80);

ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_maxUploadMegabytes_range"
CHECK ("maxUploadMegabytes" >= 1 AND "maxUploadMegabytes" <= 15);

ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_placeSearchResultLimit_range"
CHECK ("placeSearchResultLimit" >= 1 AND "placeSearchResultLimit" <= 10);

ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_analyticsDefaultWindowDays_range"
CHECK ("analyticsDefaultWindowDays" >= 7 AND "analyticsDefaultWindowDays" <= 90);

-- The two rules a column's own bound cannot state (S5). A default party limit above the maximum would create new
-- invitations the same panel considers too large...
ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_rsvp_default_within_max"
CHECK ("rsvpDefaultPartyLimit" <= "rsvpMaxPartyLimit");

-- ...and a stored-asset allowance that a full gallery could fill would leave the main photo no slot, so the gallery
-- always leaves room for at least one more asset.
ALTER TABLE "OperationalSettings"
ADD CONSTRAINT "OperationalSettings_stored_assets_above_gallery"
CHECK ("storedAssetLimit" >= "galleryPhotoLimit" + 1);

-- The one row, with the values the code has today, so the panel starts exactly where the product already is (L15).
INSERT INTO "OperationalSettings" (
    "id",
    "rsvpDefaultPartyLimit",
    "rsvpMaxPartyLimit",
    "galleryPhotoLimit",
    "storedAssetLimit",
    "maxUploadMegabytes",
    "placeSearchResultLimit",
    "analyticsDefaultWindowDays"
)
VALUES ('default', 4, 10, 12, 40, 10, 5, 30);
