-- Additive: no change to existing imported records, card cycle or allocations.
CREATE TABLE "Income" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "notes" VARCHAR(1000),
  "version" INTEGER NOT NULL DEFAULT 0,
  "state" VARCHAR(9) NOT NULL DEFAULT 'planned',
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "expectedOn" DATE,
  "expectedAmount" BIGINT,
  "origin" JSONB NOT NULL,
  "factEvidence" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Income_facts_check" CHECK (
    "currency" = 'BRL' AND "version" >= 0 AND "state" IN ('planned', 'cancelled') AND length(btrim("description")) > 0
    AND ("expectedAmount" IS NULL OR "expectedAmount" >= 0)
    AND ("expectedOn" IS NULL OR "expectedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
    AND COALESCE(jsonb_typeof("origin") = 'object' AND "origin"->>'kind' = 'manual' AND length("origin"->>'decisionId') > 0, false)
    AND jsonb_typeof("factEvidence") = 'object'
    AND NOT ("factEvidence" - 'expectedOn' - 'expectedAmount' <> '{}'::jsonb)
    AND (("expectedOn" IS NULL AND NOT ("factEvidence" ? 'expectedOn')) OR ("expectedOn" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'expectedOn') = 'object' AND "factEvidence"->'expectedOn'->>'kind' = 'user' AND length("factEvidence"->'expectedOn'->>'decisionId') > 0, false)))
    AND (("expectedAmount" IS NULL AND NOT ("factEvidence" ? 'expectedAmount')) OR ("expectedAmount" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'expectedAmount') = 'object' AND "factEvidence"->'expectedAmount'->>'kind' = 'user' AND length("factEvidence"->'expectedAmount'->>'decisionId') > 0, false)))
  )
);
CREATE UNIQUE INDEX "Income_id_userId_key" ON "Income"("id", "userId");
CREATE INDEX "Income_userId_createdAt_id_idx" ON "Income"("userId", "createdAt", "id");
CREATE TABLE "IncomeCommand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "incomeId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL,
  "changes" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncomeCommand_incomeId_userId_fkey" FOREIGN KEY ("incomeId", "userId") REFERENCES "Income"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IncomeCommand_data_check" CHECK (
    "version" >= 0 AND "key" ~ '^[A-Za-z0-9_-]{1,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof("changes") = 'object' AND jsonb_typeof("result") = 'object')
);
CREATE UNIQUE INDEX "IncomeCommand_userId_key_key" ON "IncomeCommand"("userId", "key");
CREATE UNIQUE INDEX "IncomeCommand_incomeId_version_key" ON "IncomeCommand"("incomeId", "version");
CREATE INDEX "IncomeCommand_incomeId_userId_idx" ON "IncomeCommand"("incomeId", "userId");
CREATE FUNCTION rovere_income_command_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Income commands are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER income_command_immutable BEFORE UPDATE OR DELETE ON "IncomeCommand"
  FOR EACH ROW EXECUTE FUNCTION rovere_income_command_immutable();
CREATE FUNCTION rovere_income_preserve_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."state" = 'cancelled' OR NEW."origin" IS DISTINCT FROM OLD."origin" OR NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'Income origin and cancellation are permanent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER income_preserve_origin BEFORE UPDATE ON "Income"
  FOR EACH ROW EXECUTE FUNCTION rovere_income_preserve_origin();
