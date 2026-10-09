-- AlterTable
ALTER TABLE "ImportRow" ADD COLUMN     "distinctBankEntryId" TEXT,
ADD COLUMN     "distinctCardChargeId" TEXT,
ADD COLUMN     "linkBankEntryId" TEXT,
ADD COLUMN     "linkCardChargeId" TEXT;

-- CreateTable
CREATE TABLE "BankEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "postedOn" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "fingerprint" VARCHAR(64) NOT NULL,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardCharge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "cardId" TEXT,
    "postedOn" DATE NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "cents" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "installment" JSONB NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankExternalIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "namespace" VARCHAR(100) NOT NULL,
    "externalId" VARCHAR(256) NOT NULL,
    "entryId" TEXT NOT NULL,

    CONSTRAINT "BankExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardExternalIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "namespace" VARCHAR(100) NOT NULL,
    "externalId" VARCHAR(256) NOT NULL,
    "chargeId" TEXT NOT NULL,

    CONSTRAINT "CardExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "reviewVersion" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportOutcome" (
    "sourceRecordId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" VARCHAR(7) NOT NULL,
    "entryId" TEXT,
    "chargeId" TEXT,
    "decision" JSONB NOT NULL,

    CONSTRAINT "ImportOutcome_pkey" PRIMARY KEY ("sourceRecordId")
);

-- CreateIndex
CREATE INDEX "BankEntry_userId_fingerprint_idx" ON "BankEntry"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "BankEntry_accountId_userId_postedOn_idx" ON "BankEntry"("accountId", "userId", "postedOn");

-- CreateIndex
CREATE UNIQUE INDEX "BankEntry_id_userId_key" ON "BankEntry"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankEntry_id_accountId_userId_key" ON "BankEntry"("id", "accountId", "userId");

-- CreateIndex
CREATE INDEX "CardCharge_userId_fingerprint_idx" ON "CardCharge"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "CardCharge_creditAccountId_userId_postedOn_idx" ON "CardCharge"("creditAccountId", "userId", "postedOn");

-- CreateIndex
CREATE UNIQUE INDEX "CardCharge_id_userId_key" ON "CardCharge"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardCharge_id_creditAccountId_userId_key" ON "CardCharge"("id", "creditAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BankExternalIdentity_userId_accountId_namespace_externalId_key" ON "BankExternalIdentity"("userId", "accountId", "namespace", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CardExternalIdentity_userId_creditAccountId_namespace_exter_key" ON "CardExternalIdentity"("userId", "creditAccountId", "namespace", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportConfirmation_batchId_key" ON "ImportConfirmation"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportConfirmation_batchId_userId_key" ON "ImportConfirmation"("batchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportConfirmation_userId_key_key" ON "ImportConfirmation"("userId", "key");

-- CreateIndex
CREATE INDEX "ImportOutcome_batchId_userId_idx" ON "ImportOutcome"("batchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportOutcome_sourceRecordId_batchId_userId_key" ON "ImportOutcome"("sourceRecordId", "batchId", "userId");

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_linkBankEntryId_userId_fkey" FOREIGN KEY ("linkBankEntryId", "userId") REFERENCES "BankEntry"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_linkCardChargeId_userId_fkey" FOREIGN KEY ("linkCardChargeId", "userId") REFERENCES "CardCharge"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_distinctBankEntryId_userId_fkey" FOREIGN KEY ("distinctBankEntryId", "userId") REFERENCES "BankEntry"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_distinctCardChargeId_userId_fkey" FOREIGN KEY ("distinctCardChargeId", "userId") REFERENCES "CardCharge"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_creditAccountId_userId_fkey" FOREIGN KEY ("creditAccountId", "userId") REFERENCES "CreditAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_statementId_creditAccountId_userId_fkey" FOREIGN KEY ("statementId", "creditAccountId", "userId") REFERENCES "Statement"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_cardId_creditAccountId_userId_fkey" FOREIGN KEY ("cardId", "creditAccountId", "userId") REFERENCES "Card"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankExternalIdentity" ADD CONSTRAINT "BankExternalIdentity_entryId_accountId_userId_fkey" FOREIGN KEY ("entryId", "accountId", "userId") REFERENCES "BankEntry"("id", "accountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardExternalIdentity" ADD CONSTRAINT "CardExternalIdentity_chargeId_creditAccountId_userId_fkey" FOREIGN KEY ("chargeId", "creditAccountId", "userId") REFERENCES "CardCharge"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportConfirmation" ADD CONSTRAINT "ImportConfirmation_batchId_userId_fkey" FOREIGN KEY ("batchId", "userId") REFERENCES "ImportBatch"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOutcome" ADD CONSTRAINT "ImportOutcome_sourceRecordId_batchId_userId_fkey" FOREIGN KEY ("sourceRecordId", "batchId", "userId") REFERENCES "ImportSourceRecord"("id", "batchId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOutcome" ADD CONSTRAINT "ImportOutcome_batchId_userId_fkey" FOREIGN KEY ("batchId", "userId") REFERENCES "ImportBatch"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOutcome" ADD CONSTRAINT "ImportOutcome_entryId_userId_fkey" FOREIGN KEY ("entryId", "userId") REFERENCES "BankEntry"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportOutcome" ADD CONSTRAINT "ImportOutcome_chargeId_userId_fkey" FOREIGN KEY ("chargeId", "userId") REFERENCES "CardCharge"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_value_check" CHECK ("currency" = 'BRL' AND length(btrim("description")) > 0 AND "postedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
ALTER TABLE "CardCharge" ADD CONSTRAINT "CardCharge_value_check" CHECK ("currency" = 'BRL' AND length(btrim("description")) > 0 AND "postedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31');
ALTER TABLE "ImportRow" DROP CONSTRAINT "ImportRow_action_check";
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_action_check" CHECK (
  (NOT "selected" AND "action" = 'skip' AND "linkBankEntryId" IS NULL AND "linkCardChargeId" IS NULL AND "distinctBankEntryId" IS NULL AND "distinctCardChargeId" IS NULL) OR
  ("selected" AND "action" = 'create' AND "linkBankEntryId" IS NULL AND "linkCardChargeId" IS NULL AND NOT ("distinctBankEntryId" IS NOT NULL AND "distinctCardChargeId" IS NOT NULL)) OR
  ("selected" AND "action" = 'link' AND (("linkBankEntryId" IS NOT NULL AND "linkCardChargeId" IS NULL) OR ("linkBankEntryId" IS NULL AND "linkCardChargeId" IS NOT NULL)) AND "distinctBankEntryId" IS NULL AND "distinctCardChargeId" IS NULL));
ALTER TABLE "ImportOutcome" ADD CONSTRAINT "ImportOutcome_target_check" CHECK (
  ("action" = 'skipped' AND "entryId" IS NULL AND "chargeId" IS NULL) OR
  ("action" IN ('created', 'linked') AND (("entryId" IS NOT NULL AND "chargeId" IS NULL) OR ("entryId" IS NULL AND "chargeId" IS NOT NULL))));
