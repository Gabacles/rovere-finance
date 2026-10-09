-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "notes" VARCHAR(1000),
    "purchasedOn" DATE,
    "total" BIGINT,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "factEvidence" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCharge" (
    "chargeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCharge_pkey" PRIMARY KEY ("chargeId")
);

-- CreateTable
CREATE TABLE "ExpenseCommand" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "changes" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_userId_createdAt_idx" ON "Expense"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_id_userId_key" ON "Expense"("id", "userId");

-- CreateIndex
CREATE INDEX "ExpenseCharge_expenseId_userId_idx" ON "ExpenseCharge"("expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCharge_chargeId_userId_key" ON "ExpenseCharge"("chargeId", "userId");

-- CreateIndex
CREATE INDEX "ExpenseCommand_expenseId_userId_idx" ON "ExpenseCommand"("expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCommand_userId_key_key" ON "ExpenseCommand"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCommand_expenseId_version_key" ON "ExpenseCommand"("expenseId", "version");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCharge" ADD CONSTRAINT "ExpenseCharge_expenseId_userId_fkey" FOREIGN KEY ("expenseId", "userId") REFERENCES "Expense"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCharge" ADD CONSTRAINT "ExpenseCharge_chargeId_userId_fkey" FOREIGN KEY ("chargeId", "userId") REFERENCES "CardCharge"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCommand" ADD CONSTRAINT "ExpenseCommand_expenseId_userId_fkey" FOREIGN KEY ("expenseId", "userId") REFERENCES "Expense"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_facts_check" CHECK (
  "currency" = 'BRL' AND "version" >= 0 AND length(btrim("description")) > 0
  AND ("total" IS NULL OR "total" >= 0)
  AND ("purchasedOn" IS NULL OR "purchasedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
  AND jsonb_typeof("factEvidence") = 'object'
  AND (("purchasedOn" IS NULL AND NOT ("factEvidence" ? 'purchasedOn')) OR ("purchasedOn" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'purchasedOn') = 'object', false)))
  AND (("total" IS NULL AND NOT ("factEvidence" ? 'total')) OR ("total" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'total') = 'object', false))));
ALTER TABLE "ExpenseCommand" ADD CONSTRAINT "ExpenseCommand_data_check" CHECK (
  "version" >= 0 AND "key" ~ '^[A-Za-z0-9_-]{1,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof("changes") = 'object' AND jsonb_typeof("result") = 'object');
CREATE FUNCTION rovere_expense_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Expense commands are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER expense_command_immutable BEFORE UPDATE OR DELETE ON "ExpenseCommand"
  FOR EACH ROW EXECUTE FUNCTION rovere_expense_command_immutable();
