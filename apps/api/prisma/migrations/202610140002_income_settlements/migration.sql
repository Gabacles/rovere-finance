-- Common direction confirmation. Existing payment sources keep IDs/evidence/reservations.
CREATE TABLE "BankEntryConfirmation" (
  "bankEntryId" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "direction" VARCHAR(7) NOT NULL,
  "originalCents" BIGINT NOT NULL,
  "confirmedCents" BIGINT NOT NULL,
  "evidence" JSONB NOT NULL,
  CONSTRAINT "BankEntryConfirmation_bankEntryId_accountId_userId_fkey" FOREIGN KEY ("bankEntryId", "accountId", "userId") REFERENCES "BankEntry"("id", "accountId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankEntryConfirmation_check" CHECK (
    "direction" IN ('inflow', 'outflow') AND "confirmedCents" > 0
    AND "confirmedCents"::numeric = abs("originalCents"::numeric)
    AND COALESCE("evidence"->>'kind' = 'user' AND length("evidence"->>'decisionId') > 0, false))
);
CREATE UNIQUE INDEX "BankEntryConfirmation_bankEntryId_accountId_userId_direction_key" ON "BankEntryConfirmation"("bankEntryId", "accountId", "userId", "direction");
CREATE UNIQUE INDEX "BankEntryConfirmation_bankEntryId_accountId_userId_key" ON "BankEntryConfirmation"("bankEntryId", "accountId", "userId");
INSERT INTO "BankEntryConfirmation" ("bankEntryId", "accountId", "userId", "direction", "originalCents", "confirmedCents", "evidence")
  SELECT "bankEntryId", "accountId", "userId", 'outflow', "originalCents", "confirmedCents", "evidence" FROM "StatementPaymentSource";
ALTER TABLE "StatementPaymentSource" ADD COLUMN "direction" VARCHAR(7) NOT NULL DEFAULT 'outflow';
ALTER TABLE "StatementPaymentSource" ADD CONSTRAINT "StatementPaymentSource_direction_check" CHECK ("direction" = 'outflow');
ALTER TABLE "StatementPaymentSource" ADD CONSTRAINT "StatementPaymentSource_confirmation_fkey" FOREIGN KEY ("bankEntryId", "accountId", "userId", "direction") REFERENCES "BankEntryConfirmation"("bankEntryId", "accountId", "userId", "direction") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER bank_confirmation_immutable BEFORE UPDATE OR DELETE ON "BankEntryConfirmation" FOR EACH ROW EXECUTE FUNCTION rovere_payment_immutable();

-- Compatibility for existing SQL writers: payment confirmation also reserves the direction.
CREATE FUNCTION rovere_confirm_payment_direction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "BankEntryConfirmation" ("bankEntryId", "accountId", "userId", "direction", "originalCents", "confirmedCents", "evidence")
    VALUES (NEW."bankEntryId", NEW."accountId", NEW."userId", 'outflow', NEW."originalCents", NEW."confirmedCents", NEW."evidence") ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM "BankEntryConfirmation" c WHERE c."bankEntryId" = NEW."bankEntryId" AND c."accountId" = NEW."accountId" AND c."userId" = NEW."userId" AND c."direction" = 'outflow' AND c."originalCents" = NEW."originalCents" AND c."confirmedCents" = NEW."confirmedCents") THEN
    RAISE EXCEPTION 'Bank direction conflicts with existing confirmation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_source_direction BEFORE INSERT ON "StatementPaymentSource" FOR EACH ROW EXECUTE FUNCTION rovere_confirm_payment_direction();

CREATE TABLE "IncomeSettlement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "incomeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "bankEntryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "direction" VARCHAR(7) NOT NULL DEFAULT 'inflow',
  "cents" BIGINT NOT NULL,
  "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversalId" TEXT,
  CONSTRAINT "IncomeSettlement_incomeId_userId_fkey" FOREIGN KEY ("incomeId", "userId") REFERENCES "Income"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IncomeSettlement_source_fkey" FOREIGN KEY ("bankEntryId", "accountId", "userId", "direction") REFERENCES "BankEntryConfirmation"("bankEntryId", "accountId", "userId", "direction") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IncomeSettlement_check" CHECK (
    "direction" = 'inflow' AND "cents" > 0 AND COALESCE("evidence"->>'kind' = 'user' AND length("evidence"->>'decisionId') > 0, false)
    AND (("reversedAt" IS NULL AND "reversalId" IS NULL) OR ("reversedAt" IS NOT NULL AND "reversalId" IS NOT NULL AND length("reversalId") > 0)))
);
CREATE INDEX "IncomeSettlement_incomeId_userId_idx" ON "IncomeSettlement"("incomeId", "userId");
CREATE INDEX "IncomeSettlement_bankEntryId_userId_idx" ON "IncomeSettlement"("bankEntryId", "userId");
CREATE FUNCTION rovere_income_settlement_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Income settlement history is immutable' USING ERRCODE = '23514'; END IF;
  IF ROW(NEW."id",NEW."userId",NEW."incomeId",NEW."bankEntryId",NEW."accountId",NEW."direction",NEW."cents",NEW."evidence",NEW."createdAt") IS DISTINCT FROM ROW(OLD."id",OLD."userId",OLD."incomeId",OLD."bankEntryId",OLD."accountId",OLD."direction",OLD."cents",OLD."evidence",OLD."createdAt")
    OR OLD."reversedAt" IS NOT NULL OR NEW."reversedAt" IS NULL THEN RAISE EXCEPTION 'Only explicit settlement reversal is allowed' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER income_settlement_immutable BEFORE UPDATE OR DELETE ON "IncomeSettlement" FOR EACH ROW EXECUTE FUNCTION rovere_income_settlement_reversal();
