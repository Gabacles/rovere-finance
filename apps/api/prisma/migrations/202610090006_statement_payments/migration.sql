-- AlterTable
ALTER TABLE "BankEntry" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StatementPaymentBasis" (
    "statementId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "total" BIGINT NOT NULL,
    "referenceHash" VARCHAR(64) NOT NULL,
    "evidence" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "StatementPaymentBasis_pkey" PRIMARY KEY ("statementId")
);

-- CreateTable
CREATE TABLE "StatementPaymentSource" (
    "bankEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalCents" BIGINT NOT NULL,
    "confirmedCents" BIGINT NOT NULL,
    "evidence" JSONB NOT NULL,

    CONSTRAINT "StatementPaymentSource_pkey" PRIMARY KEY ("bankEntryId")
);

-- CreateTable
CREATE TABLE "StatementPaymentAllocation" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cents" BIGINT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversalId" TEXT,

    CONSTRAINT "StatementPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementPaymentCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "bankEntryId" TEXT,
    "accountId" TEXT,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "changes" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementPaymentCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StatementPaymentBasis_statementId_creditAccountId_userId_key" ON "StatementPaymentBasis"("statementId", "creditAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementPaymentSource_bankEntryId_accountId_userId_key" ON "StatementPaymentSource"("bankEntryId", "accountId", "userId");

-- CreateIndex
CREATE INDEX "StatementPaymentAllocation_statementId_userId_idx" ON "StatementPaymentAllocation"("statementId", "userId");

-- CreateIndex
CREATE INDEX "StatementPaymentAllocation_bankEntryId_userId_idx" ON "StatementPaymentAllocation"("bankEntryId", "userId");

-- CreateIndex
CREATE INDEX "StatementPaymentCommand_statementId_userId_idx" ON "StatementPaymentCommand"("statementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementPaymentCommand_userId_key_key" ON "StatementPaymentCommand"("userId", "key");

-- AddForeignKey
ALTER TABLE "StatementPaymentBasis" ADD CONSTRAINT "StatementPaymentBasis_statementId_creditAccountId_userId_fkey" FOREIGN KEY ("statementId", "creditAccountId", "userId") REFERENCES "Statement"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementPaymentSource" ADD CONSTRAINT "StatementPaymentSource_bankEntryId_accountId_userId_fkey" FOREIGN KEY ("bankEntryId", "accountId", "userId") REFERENCES "BankEntry"("id", "accountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementPaymentAllocation" ADD CONSTRAINT "StatementPaymentAllocation_statementId_creditAccountId_use_fkey" FOREIGN KEY ("statementId", "creditAccountId", "userId") REFERENCES "StatementPaymentBasis"("statementId", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementPaymentAllocation" ADD CONSTRAINT "StatementPaymentAllocation_bankEntryId_accountId_userId_fkey" FOREIGN KEY ("bankEntryId", "accountId", "userId") REFERENCES "StatementPaymentSource"("bankEntryId", "accountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementPaymentCommand" ADD CONSTRAINT "StatementPaymentCommand_statementId_creditAccountId_userId_fkey" FOREIGN KEY ("statementId", "creditAccountId", "userId") REFERENCES "Statement"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementPaymentCommand" ADD CONSTRAINT "StatementPaymentCommand_bankEntryId_accountId_userId_fkey" FOREIGN KEY ("bankEntryId", "accountId", "userId") REFERENCES "BankEntry"("id", "accountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_version_check" CHECK ("version" >= 0);
ALTER TABLE "StatementPaymentBasis" ADD CONSTRAINT "StatementPaymentBasis_check" CHECK (
  "kind" IN ('declared','calculated') AND "total" >= 0 AND "referenceHash" ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof("snapshot") = 'object' AND COALESCE("evidence"->>'kind' = 'user', false) AND COALESCE(length("evidence"->>'decisionId') > 0, false));
ALTER TABLE "StatementPaymentSource" ADD CONSTRAINT "StatementPaymentSource_check" CHECK (
  "confirmedCents" > 0 AND "confirmedCents"::numeric = abs("originalCents"::numeric)
  AND COALESCE("evidence"->>'kind' = 'user', false) AND COALESCE(length("evidence"->>'decisionId') > 0, false));
ALTER TABLE "StatementPaymentAllocation" ADD CONSTRAINT "StatementPaymentAllocation_check" CHECK (
  "cents" > 0 AND COALESCE("evidence"->>'kind' = 'user', false) AND COALESCE(length("evidence"->>'decisionId') > 0, false)
  AND (("reversedAt" IS NULL AND "reversalId" IS NULL) OR ("reversedAt" IS NOT NULL AND "reversalId" IS NOT NULL AND length("reversalId") > 0)));
ALTER TABLE "StatementPaymentCommand" ADD CONSTRAINT "StatementPaymentCommand_check" CHECK (
  "key" ~ '^[A-Za-z0-9_-]{1,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$'
  AND (("bankEntryId" IS NULL AND "accountId" IS NULL) OR ("bankEntryId" IS NOT NULL AND "accountId" IS NOT NULL))
  AND jsonb_typeof("changes") = 'object' AND jsonb_typeof("result") = 'object');
CREATE FUNCTION rovere_payment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Payment evidence is immutable' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER payment_source_immutable BEFORE UPDATE OR DELETE ON "StatementPaymentSource" FOR EACH ROW EXECUTE FUNCTION rovere_payment_immutable();
CREATE TRIGGER payment_command_immutable BEFORE UPDATE OR DELETE ON "StatementPaymentCommand" FOR EACH ROW EXECUTE FUNCTION rovere_payment_immutable();
CREATE FUNCTION rovere_payment_allocation_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Allocation history is immutable' USING ERRCODE = '23514'; END IF;
  IF ROW(NEW."id",NEW."userId",NEW."statementId",NEW."creditAccountId",NEW."bankEntryId",NEW."accountId",NEW."cents",NEW."evidence",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."userId",OLD."statementId",OLD."creditAccountId",OLD."bankEntryId",OLD."accountId",OLD."cents",OLD."evidence",OLD."createdAt")
    OR OLD."reversedAt" IS NOT NULL OR NEW."reversedAt" IS NULL THEN RAISE EXCEPTION 'Only explicit allocation reversal is allowed' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_allocation_immutable BEFORE UPDATE OR DELETE ON "StatementPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION rovere_payment_allocation_reversal();
