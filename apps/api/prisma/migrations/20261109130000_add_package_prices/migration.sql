-- Additive package prices (S4, L4): one new table, no existing row is rewritten.
-- Prisma generated the table, the index, and the foreign key; it cannot express what follows the
-- foreign key, so `schema.prisma` only documents it.

-- CreateTable
CREATE TABLE "PackagePrice" (
    "id" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMPTZ(6),

    CONSTRAINT "PackagePrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagePrice_packageId_idx" ON "PackagePrice"("packageId");

-- AddForeignKey
ALTER TABLE "PackagePrice" ADD CONSTRAINT "PackagePrice_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The currency is an uppercase ISO 4217 shape; which codes are accepted is the API domain's allow-list,
-- so adding a currency needs no migration. The amount is in minor units and never negative.
ALTER TABLE "PackagePrice"
ADD CONSTRAINT "PackagePrice_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "PackagePrice"
ADD CONSTRAINT "PackagePrice_amountMinor_non_negative" CHECK ("amountMinor" >= 0);

-- At most one current (not retired) price per package and currency; retired rows are the history.
CREATE UNIQUE INDEX "PackagePrice_current_key"
ON "PackagePrice"("packageId", "currency")
WHERE "retiredAt" IS NULL;

-- A price never changes. The only legal update sets `retiredAt` on a current row; once set it is neither
-- cleared nor changed. An update that leaves every column as it was stays allowed.
CREATE FUNCTION "prevent_package_price_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."packageId" IS DISTINCT FROM OLD."packageId"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (OLD."retiredAt" IS NOT NULL AND NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt") THEN
    RAISE EXCEPTION 'PackagePrice rows are immutable except for retiring them';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PackagePrice_immutable"
BEFORE UPDATE ON "PackagePrice"
FOR EACH ROW
EXECUTE FUNCTION "prevent_package_price_mutation"();
