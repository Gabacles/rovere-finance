-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "coverage" VARCHAR(8),
ADD COLUMN     "coverageHash" VARCHAR(64);

-- AlterTable
ALTER TABLE "CardCharge" ADD COLUMN     "classificationEvidence" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "classificationKind" VARCHAR(16),
ADD COLUMN     "classifiedCents" BIGINT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CardChargeCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardChargeCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardChargeCommand_chargeId_userId_idx" ON "CardChargeCommand"("chargeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardChargeCommand_userId_key_key" ON "CardChargeCommand"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CardChargeCommand_chargeId_version_key" ON "CardChargeCommand"("chargeId", "version");

-- AddForeignKey
ALTER TABLE "CardChargeCommand" ADD CONSTRAINT "CardChargeCommand_chargeId_creditAccountId_userId_fkey" FOREIGN KEY ("chargeId", "creditAccountId", "userId") REFERENCES "CardCharge"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_classification_check" CHECK (
  "version" >= 0 AND jsonb_typeof("classificationEvidence") = 'object'
  AND (("classificationKind" IS NULL AND "classifiedCents" IS NULL AND "classificationEvidence" = '{}'::jsonb)
    OR ("classificationKind" IS NOT NULL AND "classificationKind" IN ('purchase','fee','interest','refund','other_credit','other_debit','previous_balance','payment','informational')
      AND "classifiedCents" IS NOT NULL AND "classifiedCents" >= 0 AND "classifiedCents"::numeric = abs("cents"::numeric)
      AND COALESCE("classificationEvidence"->>'kind' = 'user', false) AND COALESCE(length("classificationEvidence"->>'decisionId') > 0, false))));
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_coverage_check" CHECK (
  ("coverage" IS NULL AND "coverageHash" IS NULL AND NOT ("factEvidence" ? 'coverage'))
  OR ("coverage" IS NOT NULL AND "coverage" IN ('complete','partial') AND COALESCE(jsonb_typeof("factEvidence"->'coverage') = 'object', false)
    AND COALESCE("factEvidence"->'coverage'->>'kind' = 'user', false) AND COALESCE(length("factEvidence"->'coverage'->>'decisionId') > 0, false)
    AND (("coverage" = 'complete' AND "coverageHash" IS NOT NULL AND "coverageHash" ~ '^[a-f0-9]{64}$') OR ("coverage" = 'partial' AND "coverageHash" IS NULL))));
ALTER TABLE "CardChargeCommand" ADD CONSTRAINT "CardChargeCommand_values_check" CHECK (
  "version" > 0 AND "key" ~ '^[A-Za-z0-9_-]{1,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof("changes") = 'object' AND jsonb_typeof("result") = 'object');
CREATE FUNCTION rovere_card_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Card charge commands are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER card_command_immutable BEFORE UPDATE OR DELETE ON "CardChargeCommand"
  FOR EACH ROW EXECUTE FUNCTION rovere_card_command_immutable();
