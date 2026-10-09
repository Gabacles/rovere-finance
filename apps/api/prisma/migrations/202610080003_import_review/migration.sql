-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" VARCHAR(160) NOT NULL,
    "format" VARCHAR(3) NOT NULL,
    "configuration" JSONB NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "creationKey" VARCHAR(100) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'uploaded',
    "version" INTEGER NOT NULL DEFAULT 0,
    "size" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" VARCHAR(100),
    "parsedMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportFile" (
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("batchId")
);

-- CreateTable
CREATE TABLE "ImportBlock" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(4) NOT NULL,
    "metadata" JSONB NOT NULL,
    "financialAccountId" TEXT,
    "creditAccountId" TEXT,
    "cardId" TEXT,
    "statementId" TEXT,
    "periodOverride" BOOLEAN NOT NULL DEFAULT false,
    "decisionId" TEXT,

    CONSTRAINT "ImportBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportSourceRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "raw" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "period" JSONB NOT NULL,

    CONSTRAINT "ImportSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "candidate" JSONB NOT NULL,
    "corrections" JSONB NOT NULL DEFAULT '{}',
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "action" VARCHAR(6) NOT NULL DEFAULT 'create',
    "reason" VARCHAR(500),

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportReviewRevision" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportReviewRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_status_leaseUntil_createdAt_idx" ON "ImportBatch"("status", "leaseUntil", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_userId_createdAt_idx" ON "ImportBatch"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_id_userId_key" ON "ImportBatch"("id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_userId_creationKey_key" ON "ImportBatch"("userId", "creationKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportFile_batchId_userId_key" ON "ImportFile"("batchId", "userId");

-- CreateIndex
CREATE INDEX "ImportBlock_batchId_userId_idx" ON "ImportBlock"("batchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBlock_id_batchId_userId_key" ON "ImportBlock"("id", "batchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportSourceRecord_id_batchId_userId_key" ON "ImportSourceRecord"("id", "batchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportSourceRecord_batchId_ordinal_key" ON "ImportSourceRecord"("batchId", "ordinal");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_userId_idx" ON "ImportRow"("batchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_sourceRecordId_batchId_userId_key" ON "ImportRow"("sourceRecordId", "batchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportReviewRevision_batchId_version_key" ON "ImportReviewRevision"("batchId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Card_id_creditAccountId_userId_key" ON "Card"("id", "creditAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_id_creditAccountId_userId_key" ON "Statement"("id", "creditAccountId", "userId");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_batchId_userId_fkey" FOREIGN KEY ("batchId", "userId") REFERENCES "ImportBatch"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBlock" ADD CONSTRAINT "ImportBlock_batchId_userId_fkey" FOREIGN KEY ("batchId", "userId") REFERENCES "ImportBatch"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBlock" ADD CONSTRAINT "ImportBlock_financialAccountId_userId_fkey" FOREIGN KEY ("financialAccountId", "userId") REFERENCES "FinancialAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBlock" ADD CONSTRAINT "ImportBlock_creditAccountId_userId_fkey" FOREIGN KEY ("creditAccountId", "userId") REFERENCES "CreditAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBlock" ADD CONSTRAINT "ImportBlock_cardId_creditAccountId_userId_fkey" FOREIGN KEY ("cardId", "creditAccountId", "userId") REFERENCES "Card"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBlock" ADD CONSTRAINT "ImportBlock_statementId_creditAccountId_userId_fkey" FOREIGN KEY ("statementId", "creditAccountId", "userId") REFERENCES "Statement"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSourceRecord" ADD CONSTRAINT "ImportSourceRecord_blockId_batchId_userId_fkey" FOREIGN KEY ("blockId", "batchId", "userId") REFERENCES "ImportBlock"("id", "batchId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_sourceRecordId_batchId_userId_fkey" FOREIGN KEY ("sourceRecordId", "batchId", "userId") REFERENCES "ImportSourceRecord"("id", "batchId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportReviewRevision" ADD CONSTRAINT "ImportReviewRevision_batchId_userId_fkey" FOREIGN KEY ("batchId", "userId") REFERENCES "ImportBatch"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_bounds_check" CHECK (
  "format" IN ('csv', 'ofx') AND "status" IN ('uploaded', 'parsing', 'review', 'failed', 'cancelled', 'confirmed')
  AND "version" >= 0 AND "attempts" BETWEEN 0 AND 3 AND "size" BETWEEN 0 AND 10485760 AND "rowCount" BETWEEN 0 AND 10000);
ALTER TABLE "ImportFile" ADD CONSTRAINT "ImportFile_size_check" CHECK (octet_length("bytes") BETWEEN 1 AND 10485760);
ALTER TABLE "ImportBlock" ADD CONSTRAINT "ImportBlock_target_check" CHECK (
  ("kind" = 'bank' AND "creditAccountId" IS NULL AND "cardId" IS NULL AND "statementId" IS NULL AND NOT "periodOverride") OR
  ("kind" = 'card' AND "financialAccountId" IS NULL AND
    ("creditAccountId" IS NOT NULL OR ("cardId" IS NULL AND "statementId" IS NULL)) AND
    (NOT "periodOverride" OR "statementId" IS NOT NULL)));
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_action_check" CHECK (
  ("selected" AND "action" = 'create') OR (NOT "selected" AND "action" = 'skip'));

-- Evidence stays immutable; corrections live in separate fields and versions.
CREATE FUNCTION rovere_import_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Import evidence is immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER import_source_immutable BEFORE UPDATE ON "ImportSourceRecord"
  FOR EACH ROW EXECUTE FUNCTION rovere_import_evidence_immutable();
CREATE TRIGGER import_file_immutable BEFORE UPDATE ON "ImportFile"
  FOR EACH ROW EXECUTE FUNCTION rovere_import_evidence_immutable();
CREATE FUNCTION rovere_import_candidate_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."candidate" IS DISTINCT FROM OLD."candidate" THEN
    RAISE EXCEPTION 'Import candidate is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER import_candidate_immutable BEFORE UPDATE ON "ImportRow"
  FOR EACH ROW EXECUTE FUNCTION rovere_import_candidate_immutable();
