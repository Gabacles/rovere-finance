-- AlterTable
ALTER TABLE "StatementPaymentBasis" ADD COLUMN     "excessReviewConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ManualCardAdjustment" (
    "chargeId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualCardAdjustment_pkey" PRIMARY KEY ("chargeId")
);

-- CreateTable
CREATE TABLE "CardAdjustmentReversal" (
    "originalChargeId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reversalChargeId" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardAdjustmentReversal_pkey" PRIMARY KEY ("originalChargeId")
);

-- CreateTable
CREATE TABLE "ExpenseRefund" (
    "chargeId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "cents" BIGINT NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseRefund_pkey" PRIMARY KEY ("chargeId")
);

-- CreateTable
CREATE TABLE "CardAdjustmentCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "chargeId" TEXT,
    "expenseId" TEXT,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "changes" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardAdjustmentCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualCardAdjustment_chargeId_creditAccountId_userId_key" ON "ManualCardAdjustment"("chargeId", "creditAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardAdjustmentReversal_reversalChargeId_key" ON "CardAdjustmentReversal"("reversalChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "CardAdjustmentReversal_originalChargeId_creditAccountId_use_key" ON "CardAdjustmentReversal"("originalChargeId", "creditAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardAdjustmentReversal_reversalChargeId_creditAccountId_use_key" ON "CardAdjustmentReversal"("reversalChargeId", "creditAccountId", "userId");

-- CreateIndex
CREATE INDEX "ExpenseRefund_expenseId_userId_idx" ON "ExpenseRefund"("expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseRefund_chargeId_creditAccountId_userId_key" ON "ExpenseRefund"("chargeId", "creditAccountId", "userId");

-- CreateIndex
CREATE INDEX "CardAdjustmentCommand_statementId_userId_idx" ON "CardAdjustmentCommand"("statementId", "userId");

-- CreateIndex
CREATE INDEX "CardAdjustmentCommand_expenseId_userId_idx" ON "CardAdjustmentCommand"("expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardAdjustmentCommand_userId_key_key" ON "CardAdjustmentCommand"("userId", "key");

-- AddForeignKey
ALTER TABLE "ManualCardAdjustment" ADD CONSTRAINT "ManualCardAdjustment_chargeId_creditAccountId_userId_fkey" FOREIGN KEY ("chargeId", "creditAccountId", "userId") REFERENCES "CardCharge"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAdjustmentReversal" ADD CONSTRAINT "CardAdjustmentReversal_originalChargeId_creditAccountId_us_fkey" FOREIGN KEY ("originalChargeId", "creditAccountId", "userId") REFERENCES "ManualCardAdjustment"("chargeId", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAdjustmentReversal" ADD CONSTRAINT "CardAdjustmentReversal_reversalChargeId_creditAccountId_us_fkey" FOREIGN KEY ("reversalChargeId", "creditAccountId", "userId") REFERENCES "CardCharge"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRefund" ADD CONSTRAINT "ExpenseRefund_chargeId_creditAccountId_userId_fkey" FOREIGN KEY ("chargeId", "creditAccountId", "userId") REFERENCES "CardCharge"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRefund" ADD CONSTRAINT "ExpenseRefund_expenseId_userId_fkey" FOREIGN KEY ("expenseId", "userId") REFERENCES "Expense"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAdjustmentCommand" ADD CONSTRAINT "CardAdjustmentCommand_statementId_creditAccountId_userId_fkey" FOREIGN KEY ("statementId", "creditAccountId", "userId") REFERENCES "Statement"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAdjustmentCommand" ADD CONSTRAINT "CardAdjustmentCommand_chargeId_creditAccountId_userId_fkey" FOREIGN KEY ("chargeId", "creditAccountId", "userId") REFERENCES "CardCharge"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAdjustmentCommand" ADD CONSTRAINT "CardAdjustmentCommand_expenseId_userId_fkey" FOREIGN KEY ("expenseId", "userId") REFERENCES "Expense"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManualCardAdjustment" ADD CONSTRAINT "ManualCardAdjustment_check" CHECK (
  length(btrim("reason")) > 0 AND COALESCE("evidence"->>'kind' = 'user',false) AND COALESCE(length("evidence"->>'decisionId') > 0,false));
ALTER TABLE "CardAdjustmentReversal" ADD CONSTRAINT "CardAdjustmentReversal_check" CHECK (
  "originalChargeId" <> "reversalChargeId" AND COALESCE("evidence"->>'kind' = 'user',false) AND COALESCE(length("evidence"->>'decisionId') > 0,false));
ALTER TABLE "ExpenseRefund" ADD CONSTRAINT "ExpenseRefund_check" CHECK (
  "cents" > 0 AND length(btrim("reason")) > 0 AND COALESCE("evidence"->>'kind' = 'user',false) AND COALESCE(length("evidence"->>'decisionId') > 0,false));
ALTER TABLE "CardAdjustmentCommand" ADD CONSTRAINT "CardAdjustmentCommand_check" CHECK (
  "key" ~ '^[A-Za-z0-9_-]{1,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("changes") = 'object' AND jsonb_typeof("result") = 'object');
CREATE FUNCTION rovere_adjustment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Adjustment origin and history are immutable' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER manual_adjustment_immutable BEFORE UPDATE OR DELETE ON "ManualCardAdjustment" FOR EACH ROW EXECUTE FUNCTION rovere_adjustment_immutable();
CREATE TRIGGER adjustment_reversal_immutable BEFORE UPDATE OR DELETE ON "CardAdjustmentReversal" FOR EACH ROW EXECUTE FUNCTION rovere_adjustment_immutable();
CREATE TRIGGER adjustment_command_immutable BEFORE UPDATE OR DELETE ON "CardAdjustmentCommand" FOR EACH ROW EXECUTE FUNCTION rovere_adjustment_immutable();
CREATE TRIGGER refund_values_immutable BEFORE UPDATE ON "ExpenseRefund" FOR EACH ROW EXECUTE FUNCTION rovere_adjustment_immutable();
