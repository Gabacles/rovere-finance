-- Additive RF-031: forecasts are not expenses, card charges, invoices or cash.
CREATE TABLE "ExpenseRecurrence" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "description" VARCHAR(500) NOT NULL, "notes" VARCHAR(1000), "cents" BIGINT NOT NULL, "anchorDay" INTEGER NOT NULL,
 "startsOn" DATE NOT NULL, "endsOn" DATE, "version" INTEGER NOT NULL DEFAULT 0, "state" VARCHAR(9) NOT NULL DEFAULT 'active',
 "evidence" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExpenseRecurrence_check" CHECK (length(btrim("description"))>0 AND "cents">=0 AND "anchorDay" BETWEEN 1 AND 31 AND "version">=0
 AND "state" IN ('active','paused','cancelled') AND "startsOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
 AND ("endsOn" IS NULL OR "endsOn" BETWEEN "startsOn" AND DATE '9999-12-31')
 AND COALESCE("evidence"->>'kind'='user' AND length("evidence"->>'decisionId')>0,false))
);
CREATE UNIQUE INDEX "ExpenseRecurrence_id_userId_key" ON "ExpenseRecurrence"("id","userId");
CREATE INDEX "ExpenseRecurrence_userId_createdAt_id_idx" ON "ExpenseRecurrence"("userId","createdAt","id");
CREATE TABLE "ExpenseRecurrenceRevision" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "effectiveFrom" VARCHAR(7) NOT NULL, "description" VARCHAR(500) NOT NULL, "notes" VARCHAR(1000), "cents" BIGINT NOT NULL,
 "anchorDay" INTEGER NOT NULL, "startsOn" DATE NOT NULL, "endsOn" DATE, "evidence" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExpenseRecurrenceRevision_ruleId_userId_fkey" FOREIGN KEY ("ruleId","userId") REFERENCES "ExpenseRecurrence"("id","userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ExpenseRecurrenceRevision_check" CHECK ("version">=0 AND "effectiveFrom" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("effectiveFrom",4)<>'0000'
 AND length(btrim("description"))>0 AND "cents">=0 AND "anchorDay" BETWEEN 1 AND 31
 AND "startsOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND ("endsOn" IS NULL OR "endsOn" BETWEEN "startsOn" AND DATE '9999-12-31')
 AND COALESCE("evidence"->>'kind'='user' AND length("evidence"->>'decisionId')>0,false))
);
CREATE UNIQUE INDEX "ExpenseRecurrenceRevision_ruleId_version_key" ON "ExpenseRecurrenceRevision"("ruleId","version");
CREATE INDEX "ExpenseRecurrenceRevision_ruleId_userId_effectiveFrom_idx" ON "ExpenseRecurrenceRevision"("ruleId","userId","effectiveFrom");
CREATE TABLE "ExpenseOccurrence" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "period" VARCHAR(7) NOT NULL,
 "originalExpectedOn" DATE NOT NULL, "originalCents" BIGINT NOT NULL, "ruleVersion" INTEGER NOT NULL, "evidence" JSONB NOT NULL,
 "description" VARCHAR(500) NOT NULL, "notes" VARCHAR(1000), "expectedOn" DATE NOT NULL, "cents" BIGINT NOT NULL,
 "state" VARCHAR(9) NOT NULL DEFAULT 'planned', "individual" BOOLEAN NOT NULL DEFAULT false, "version" INTEGER NOT NULL DEFAULT 0,
 "expenseId" TEXT, "confirmation" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExpenseOccurrence_ruleId_userId_fkey" FOREIGN KEY ("ruleId","userId") REFERENCES "ExpenseRecurrence"("id","userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ExpenseOccurrence_expenseId_userId_fkey" FOREIGN KEY ("expenseId","userId") REFERENCES "Expense"("id","userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ExpenseOccurrence_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("period",4)<>'0000'
 AND "originalExpectedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND "expectedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
 AND "originalCents">=0 AND "cents">=0 AND "version">=0 AND "ruleVersion">=0 AND length(btrim("description"))>0
 AND "state" IN ('planned','cancelled','recorded') AND COALESCE("evidence"->>'kind'='user' AND length("evidence"->>'decisionId')>0,false)
 AND (("state"='recorded' AND "expenseId" IS NOT NULL AND "confirmation" IS NOT NULL AND jsonb_typeof("confirmation")='object')
 OR ("state"<>'recorded' AND "expenseId" IS NULL AND "confirmation" IS NULL)))
);
CREATE UNIQUE INDEX "ExpenseOccurrence_id_userId_key" ON "ExpenseOccurrence"("id","userId");
CREATE UNIQUE INDEX "ExpenseOccurrence_ruleId_period_key" ON "ExpenseOccurrence"("ruleId","period");
CREATE UNIQUE INDEX "ExpenseOccurrence_expenseId_key" ON "ExpenseOccurrence"("expenseId");
CREATE UNIQUE INDEX "ExpenseOccurrence_expenseId_userId_key" ON "ExpenseOccurrence"("expenseId","userId");
CREATE INDEX "ExpenseOccurrence_ruleId_userId_period_idx" ON "ExpenseOccurrence"("ruleId","userId","period");
CREATE TABLE "ExpenseRecurrenceCommand" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "key" VARCHAR(100) NOT NULL, "requestHash" VARCHAR(64) NOT NULL,
 "version" INTEGER NOT NULL, "changes" JSONB NOT NULL, "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ExpenseRecurrenceCommand_ruleId_userId_fkey" FOREIGN KEY ("ruleId","userId") REFERENCES "ExpenseRecurrence"("id","userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "ExpenseRecurrenceCommand_check" CHECK ("version">=0 AND "key" ~ '^[A-Za-z0-9_-]{1,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("changes")='object' AND jsonb_typeof("result")='object')
);
CREATE UNIQUE INDEX "ExpenseRecurrenceCommand_userId_key_key" ON "ExpenseRecurrenceCommand"("userId","key");
CREATE UNIQUE INDEX "ExpenseRecurrenceCommand_ruleId_version_key" ON "ExpenseRecurrenceCommand"("ruleId","version");
CREATE FUNCTION rovere_expense_recurrence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Expense recurrence evidence is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER expense_recurrence_revision_immutable BEFORE UPDATE OR DELETE ON "ExpenseRecurrenceRevision" FOR EACH ROW EXECUTE FUNCTION rovere_expense_recurrence_immutable();
CREATE TRIGGER expense_recurrence_command_immutable BEFORE UPDATE OR DELETE ON "ExpenseRecurrenceCommand" FOR EACH ROW EXECUTE FUNCTION rovere_expense_recurrence_immutable();
CREATE FUNCTION rovere_expense_recurrence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expense recurrence history is immutable' USING ERRCODE='23514'; END IF;
 IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
 OR NEW."startsOn" IS DISTINCT FROM OLD."startsOn" OR NEW."evidence" IS DISTINCT FROM OLD."evidence" OR NEW."version"::bigint<>OLD."version"::bigint+1
 OR (OLD."state"='cancelled' AND (to_jsonb(NEW)-'version') IS DISTINCT FROM (to_jsonb(OLD)-'version')) THEN
 RAISE EXCEPTION 'Invalid expense recurrence update' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER expense_recurrence_guard BEFORE UPDATE OR DELETE ON "ExpenseRecurrence" FOR EACH ROW EXECUTE FUNCTION rovere_expense_recurrence_guard();
CREATE FUNCTION rovere_expense_occurrence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual "Expense"%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Expense occurrence history is immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
 IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."ruleId" IS DISTINCT FROM OLD."ruleId"
 OR NEW."period" IS DISTINCT FROM OLD."period" OR NEW."originalExpectedOn" IS DISTINCT FROM OLD."originalExpectedOn"
 OR NEW."originalCents" IS DISTINCT FROM OLD."originalCents" OR NEW."ruleVersion" IS DISTINCT FROM OLD."ruleVersion"
 OR NEW."evidence" IS DISTINCT FROM OLD."evidence" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
 OR NEW."version"::bigint<>OLD."version"::bigint+1 OR OLD."state"='cancelled' OR (OLD."individual" AND NOT NEW."individual")
 OR (OLD."state"='recorded' AND (to_jsonb(NEW)-'version'-'confirmation') IS DISTINCT FROM (to_jsonb(OLD)-'version'-'confirmation')) THEN
 RAISE EXCEPTION 'Invalid expense occurrence update' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW."expenseId" IS NOT NULL THEN
 SELECT * INTO STRICT actual FROM "Expense" WHERE "id"=NEW."expenseId" AND "userId"=NEW."userId";
 IF NOT COALESCE(NEW."confirmation"->>'id'=actual."id"
 AND NEW."confirmation"->'facts'->'purchasedOn'->>'state'='confirmed' AND NEW."confirmation"->'facts'->'total'->>'state'='confirmed'
 AND NEW."confirmation"->'facts'->'purchasedOn'->>'value'=to_char(actual."purchasedOn",'YYYY-MM-DD')
 AND NEW."confirmation"->'facts'->'total'->'value'->>'cents'=actual."total"::text,false) THEN
 RAISE EXCEPTION 'Confirmation requires known current expense facts' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER expense_occurrence_guard BEFORE INSERT OR UPDATE OR DELETE ON "ExpenseOccurrence" FOR EACH ROW EXECUTE FUNCTION rovere_expense_occurrence_guard();
