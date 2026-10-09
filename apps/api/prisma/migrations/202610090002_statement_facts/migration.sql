-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "closingOn" DATE,
ADD COLUMN     "cycle" VARCHAR(6),
ADD COLUMN     "declaredTotal" BIGINT,
ADD COLUMN     "dueOn" DATE,
ADD COLUMN     "factEvidence" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StatementFactChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatementFactChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatementFactChange_statementId_userId_idx" ON "StatementFactChange"("statementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementFactChange_statementId_version_key" ON "StatementFactChange"("statementId", "version");

-- AddForeignKey
ALTER TABLE "StatementFactChange" ADD CONSTRAINT "StatementFactChange_statementId_creditAccountId_userId_fkey" FOREIGN KEY ("statementId", "creditAccountId", "userId") REFERENCES "Statement"("id", "creditAccountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Statement" ADD CONSTRAINT "Statement_facts_check" CHECK (
  "version" >= 0 AND ("cycle" IS NULL OR "cycle" IN ('open', 'closed'))
  AND ("closingOn" IS NULL OR "closingOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
  AND ("dueOn" IS NULL OR "dueOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
  AND jsonb_typeof("factEvidence") = 'object'
  AND (("closingOn" IS NULL AND NOT ("factEvidence" ? 'closingOn')) OR ("closingOn" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'closingOn') = 'object', false)))
  AND (("dueOn" IS NULL AND NOT ("factEvidence" ? 'dueOn')) OR ("dueOn" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'dueOn') = 'object', false)))
  AND (("declaredTotal" IS NULL AND NOT ("factEvidence" ? 'declaredTotal')) OR ("declaredTotal" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'declaredTotal') = 'object', false)))
  AND (("cycle" IS NULL AND NOT ("factEvidence" ? 'cycle')) OR ("cycle" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'cycle') = 'object', false))));
ALTER TABLE "StatementFactChange" ADD CONSTRAINT "StatementFactChange_version_check" CHECK ("version" > 0);
CREATE FUNCTION rovere_statement_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Statement history is immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER statement_history_immutable BEFORE UPDATE ON "StatementFactChange"
  FOR EACH ROW EXECUTE FUNCTION rovere_statement_history_immutable();
