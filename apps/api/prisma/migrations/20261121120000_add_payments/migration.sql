-- Additive payments (M7 S1, S4): one enum type, the `Payment` table, and the `PaymentEvent` table. Every object is
-- new, so no existing row is rewritten and nothing is deleted. Prisma generates the type and the columns; it cannot
-- express the CHECK constraints, the partial unique index, or the JSONB-free payload rule, so `schema.prisma` only
-- documents them and this file states them.

-- CreateEnum
-- The five stored statuses. The domain state machine is the rule; this type is the guard that keeps any other value
-- out of the column.
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'expired', 'refunded');

-- CreateTable
-- `amountMinor` and `currency` are the snapshot of the package price at checkout, so a later catalog change cannot
-- move the amount the owner saw (S1, S4). `provider` names the adapter, never a credential, and
-- `providerReference` is the provider's own checkout id, NULL until the adapter created it.
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "invitationId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "provider" VARCHAR(40) NOT NULL,
    "providerReference" VARCHAR(200),
    "idempotencyKey" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(6),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- One received provider event. The raw payload is never stored; `payloadSha256` is its digest and the normalized
-- columns are what replay investigation needs.
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID,
    "provider" VARCHAR(40) NOT NULL,
    "providerEventId" VARCHAR(200) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    -- The decision the intake took, written with the row; corrected to 'ignored_transition' when a concurrent
    -- delivery wins the guarded transition.
    "outcome" VARCHAR(40) NOT NULL,
    "payloadSha256" CHAR(64) NOT NULL,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- A retried or duplicated delivery finds this index and inserts nothing (S4).
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
-- The server-generated key of one checkout intent: a unique violation is how a retried request is answered with the
-- payment it already created.
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
-- One provider checkout reference per provider; NULLs are unconstrained, so a payment keeps no reference until its
-- adapter has created one.
CREATE UNIQUE INDEX "Payment_provider_providerReference_key" ON "Payment"("provider", "providerReference");

-- CreateIndex
-- Every gate read and every owner read of one invitation's payments goes through this index (S4).
CREATE INDEX "Payment_invitationId_status_idx" ON "Payment"("invitationId", "status");

-- CreateIndex
-- At most one `pending` payment per invitation makes two simultaneous checkouts converge on one row: the second
-- insert violates this index, and the application answers with the row the first request created (S4).
CREATE UNIQUE INDEX "Payment_one_pending_key" ON "Payment"("invitationId") WHERE "status" = 'pending';

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- The package a payment bought cannot be deleted while the payment exists: the money fact outlives the catalog.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The amount is in the smallest currency unit and can never be negative. The domain refuses a negative price
-- before a payment exists; this CHECK makes the column say the same thing.
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_amountMinor_non_negative" CHECK ("amountMinor" >= 0);

-- An ISO 4217 code, exactly three upper-case letters, as `PackagePrice` already stores it.
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');

-- `paidAt` is the API's receipt instant of the verified `paid` event: set while the payment is `paid`, kept when it
-- is later refunded, and NULL in every other status. Compared through the text form so the enum literal order of
-- this migration cannot matter.
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_paidAt_matches_status"
CHECK (("status"::text IN ('paid', 'refunded')) = ("paidAt" IS NOT NULL));

-- A recorded event carries one of the five outcomes the intake can decide. The values are the domain's own
-- (`PAYMENT_EVENT_OUTCOME`), stored verbatim so a support query reads the same words the code does.
ALTER TABLE "PaymentEvent"
ADD CONSTRAINT "PaymentEvent_outcome_allowed"
CHECK ("outcome" IN ('applied', 'ignored_transition', 'ignored_unknown_payment', 'refused_amount', 'refused_currency'));

-- A normalized event type, exactly the four the state machine names; no provider vocabulary reaches this column.
ALTER TABLE "PaymentEvent"
ADD CONSTRAINT "PaymentEvent_type_allowed"
CHECK ("type" IN ('paid', 'failed', 'expired', 'refunded'));

-- The payload digest is a lowercase SHA-256 hex digest and nothing else: the raw payload, with whatever personal data
-- a provider puts in it, is never stored.
ALTER TABLE "PaymentEvent"
ADD CONSTRAINT "PaymentEvent_payloadSha256_format" CHECK ("payloadSha256" ~ '^[0-9a-f]{64}$');
