-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "total" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "count" INTEGER NOT NULL,
    "firstPeriod" VARCHAR(7) NOT NULL,
    "cadence" VARCHAR(7) NOT NULL DEFAULT 'monthly',
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentForecast" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "plannedCents" BIGINT NOT NULL,

    CONSTRAINT "InstallmentForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentMatch" (
    "forecastId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "confirmedCents" BIGINT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentMatch_pkey" PRIMARY KEY ("forecastId")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlan_expenseId_key" ON "InstallmentPlan"("expenseId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_creditAccountId_userId_idx" ON "InstallmentPlan"("creditAccountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlan_expenseId_userId_key" ON "InstallmentPlan"("expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlan_id_expenseId_userId_key" ON "InstallmentPlan"("id", "expenseId", "userId");

-- CreateIndex
CREATE INDEX "InstallmentForecast_expenseId_userId_idx" ON "InstallmentForecast"("expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentForecast_planId_number_key" ON "InstallmentForecast"("planId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentForecast_id_expenseId_userId_key" ON "InstallmentForecast"("id", "expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentMatch_chargeId_key" ON "InstallmentMatch"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentMatch_forecastId_expenseId_userId_key" ON "InstallmentMatch"("forecastId", "expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentMatch_chargeId_expenseId_userId_key" ON "InstallmentMatch"("chargeId", "expenseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCharge_chargeId_expenseId_userId_key" ON "ExpenseCharge"("chargeId", "expenseId", "userId");

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_expenseId_userId_fkey" FOREIGN KEY ("expenseId", "userId") REFERENCES "Expense"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_creditAccountId_userId_fkey" FOREIGN KEY ("creditAccountId", "userId") REFERENCES "CreditAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentForecast" ADD CONSTRAINT "InstallmentForecast_planId_expenseId_userId_fkey" FOREIGN KEY ("planId", "expenseId", "userId") REFERENCES "InstallmentPlan"("id", "expenseId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentMatch" ADD CONSTRAINT "InstallmentMatch_forecastId_expenseId_userId_fkey" FOREIGN KEY ("forecastId", "expenseId", "userId") REFERENCES "InstallmentForecast"("id", "expenseId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentMatch" ADD CONSTRAINT "InstallmentMatch_chargeId_expenseId_userId_fkey" FOREIGN KEY ("chargeId", "expenseId", "userId") REFERENCES "ExpenseCharge"("chargeId", "expenseId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_values_check" CHECK (
  "currency" = 'BRL' AND "total" >= 0 AND "count" BETWEEN 1 AND 10000 AND "cadence" = 'monthly'
  AND "firstPeriod" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND substring("firstPeriod", 1, 4) <> '0000'
  AND jsonb_typeof("evidence") = 'object');
ALTER TABLE "InstallmentForecast" ADD CONSTRAINT "InstallmentForecast_values_check" CHECK (
  "plannedCents" >= 0 AND "number" BETWEEN 1 AND 10000
  AND "period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND substring("period", 1, 4) <> '0000');
ALTER TABLE "InstallmentMatch" ADD CONSTRAINT "InstallmentMatch_values_check" CHECK (
  "confirmedCents" >= 0 AND jsonb_typeof("evidence") = 'object');
CREATE FUNCTION rovere_installment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Confirmed installment data is immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER installment_plan_immutable BEFORE UPDATE OR DELETE ON "InstallmentPlan"
  FOR EACH ROW EXECUTE FUNCTION rovere_installment_immutable();
CREATE TRIGGER installment_forecast_immutable BEFORE UPDATE OR DELETE ON "InstallmentForecast"
  FOR EACH ROW EXECUTE FUNCTION rovere_installment_immutable();
CREATE TRIGGER installment_match_immutable BEFORE UPDATE ON "InstallmentMatch"
  FOR EACH ROW EXECUTE FUNCTION rovere_installment_immutable();
