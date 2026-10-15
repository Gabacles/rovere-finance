CREATE TABLE "RecurrenceRule" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL,
  "description" VARCHAR(500) NOT NULL, "notes" VARCHAR(1000),
  "cents" BIGINT NOT NULL, "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "anchorDay" INTEGER NOT NULL, "startsOn" DATE NOT NULL, "endsOn" DATE,
  "version" INTEGER NOT NULL DEFAULT 0, "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurrenceRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecurrenceRule_check" CHECK (
    length(btrim("description")) > 0 AND "cents" >= 0 AND "currency" = 'BRL' AND "anchorDay" BETWEEN 1 AND 31 AND "version" >= 0
    AND "startsOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND ("endsOn" IS NULL OR ("endsOn" BETWEEN "startsOn" AND DATE '9999-12-31'))
    AND COALESCE("evidence"->>'kind' = 'user' AND length("evidence"->>'decisionId') > 0, false))
);
CREATE UNIQUE INDEX "RecurrenceRule_id_userId_key" ON "RecurrenceRule"("id", "userId");
CREATE INDEX "RecurrenceRule_userId_createdAt_id_idx" ON "RecurrenceRule"("userId", "createdAt", "id");
CREATE TABLE "ScheduledOccurrence" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "ruleId" TEXT NOT NULL,
  "period" VARCHAR(7) NOT NULL, "expectedOn" DATE NOT NULL, "cents" BIGINT NOT NULL,
  "ruleVersion" INTEGER NOT NULL, "incomeId" TEXT NOT NULL, "evidence" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledOccurrence_ruleId_userId_fkey" FOREIGN KEY ("ruleId", "userId") REFERENCES "RecurrenceRule"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScheduledOccurrence_incomeId_userId_fkey" FOREIGN KEY ("incomeId", "userId") REFERENCES "Income"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ScheduledOccurrence_check" CHECK (
    "cents" >= 0 AND "ruleVersion" >= 0 AND "expectedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'
    AND "period" = to_char("expectedOn", 'YYYY-MM')
    AND COALESCE("evidence"->>'kind' = 'user' AND length("evidence"->>'decisionId') > 0, false))
);
CREATE UNIQUE INDEX "ScheduledOccurrence_incomeId_key" ON "ScheduledOccurrence"("incomeId");
CREATE UNIQUE INDEX "ScheduledOccurrence_incomeId_userId_key" ON "ScheduledOccurrence"("incomeId", "userId");
CREATE UNIQUE INDEX "ScheduledOccurrence_ruleId_period_key" ON "ScheduledOccurrence"("ruleId", "period");
CREATE INDEX "ScheduledOccurrence_ruleId_userId_idx" ON "ScheduledOccurrence"("ruleId", "userId");
CREATE TABLE "RecurrenceCommand" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "ruleId" TEXT NOT NULL,
  "key" VARCHAR(100) NOT NULL, "requestHash" VARCHAR(64) NOT NULL, "version" INTEGER NOT NULL,
  "changes" JSONB NOT NULL, "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurrenceCommand_ruleId_userId_fkey" FOREIGN KEY ("ruleId", "userId") REFERENCES "RecurrenceRule"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecurrenceCommand_check" CHECK ("version" >= 0 AND "key" ~ '^[A-Za-z0-9_-]{1,100}$' AND "requestHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("changes") = 'object' AND jsonb_typeof("result") = 'object')
);
CREATE UNIQUE INDEX "RecurrenceCommand_userId_key_key" ON "RecurrenceCommand"("userId", "key");
CREATE UNIQUE INDEX "RecurrenceCommand_ruleId_version_key" ON "RecurrenceCommand"("ruleId", "version");
CREATE FUNCTION rovere_recurrence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Recurrence evidence is immutable in RF-029' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER recurrence_command_immutable BEFORE UPDATE OR DELETE ON "RecurrenceCommand" FOR EACH ROW EXECUTE FUNCTION rovere_recurrence_immutable();
CREATE TRIGGER scheduled_occurrence_immutable BEFORE UPDATE OR DELETE ON "ScheduledOccurrence" FOR EACH ROW EXECUTE FUNCTION rovere_recurrence_immutable();
CREATE FUNCTION rovere_recurrence_version_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Recurrence history is immutable' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'version') OR NEW."version"::bigint <> OLD."version"::bigint + 1 THEN
    RAISE EXCEPTION 'Only confirmed generation may advance recurrence version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER recurrence_rule_immutable BEFORE UPDATE OR DELETE ON "RecurrenceRule" FOR EACH ROW EXECUTE FUNCTION rovere_recurrence_version_only();

-- Preserve all RF-027 checks, extending only the allowed origin shape.
ALTER TABLE "Income" DROP CONSTRAINT "Income_facts_check";
ALTER TABLE "Income" ADD CONSTRAINT "Income_facts_check" CHECK (
  "currency" = 'BRL' AND "version" >= 0 AND "state" IN ('planned', 'cancelled') AND length(btrim("description")) > 0
  AND ("expectedAmount" IS NULL OR "expectedAmount" >= 0)
  AND ("expectedOn" IS NULL OR "expectedOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
  AND COALESCE(jsonb_typeof("origin") = 'object' AND "origin"->>'kind' IN ('manual','recurrence') AND length("origin"->>'decisionId') > 0, false)
  AND ("origin"->>'kind' = 'manual' OR COALESCE(length("origin"->>'ruleId') > 0 AND length("origin"->>'occurrenceId') > 0, false))
  AND jsonb_typeof("factEvidence") = 'object' AND NOT ("factEvidence" - 'expectedOn' - 'expectedAmount' <> '{}'::jsonb)
  AND (("expectedOn" IS NULL AND NOT ("factEvidence" ? 'expectedOn')) OR ("expectedOn" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'expectedOn') = 'object' AND "factEvidence"->'expectedOn'->>'kind' = 'user' AND length("factEvidence"->'expectedOn'->>'decisionId') > 0, false)))
  AND (("expectedAmount" IS NULL AND NOT ("factEvidence" ? 'expectedAmount')) OR ("expectedAmount" IS NOT NULL AND COALESCE(jsonb_typeof("factEvidence"->'expectedAmount') = 'object' AND "factEvidence"->'expectedAmount'->>'kind' = 'user' AND length("factEvidence"->'expectedAmount'->>'decisionId') > 0, false)))
);
CREATE FUNCTION rovere_income_occurrence_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id TEXT; owner_id TEXT; income_row "Income"%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'Income' THEN target_id := NEW."id"; owner_id := NEW."userId";
  ELSE target_id := NEW."incomeId"; owner_id := NEW."userId"; END IF;
  SELECT * INTO STRICT income_row FROM "Income" WHERE "id" = target_id AND "userId" = owner_id;
  IF income_row."origin"->>'kind' = 'recurrence' THEN
    IF NOT EXISTS (SELECT 1 FROM "ScheduledOccurrence" o JOIN "RecurrenceRule" r ON r."id" = o."ruleId" AND r."userId" = o."userId"
      WHERE o."incomeId" = target_id AND o."userId" = owner_id AND o."id" = income_row."origin"->>'occurrenceId' AND o."ruleId" = income_row."origin"->>'ruleId'
        AND o."expectedOn" = income_row."expectedOn" AND o."cents" = income_row."expectedAmount" AND o."cents" = r."cents") THEN
      RAISE EXCEPTION 'Income recurrence origin requires compatible typed occurrence' USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM "ScheduledOccurrence" WHERE "incomeId" = target_id) THEN
    RAISE EXCEPTION 'Manual income cannot be a generated occurrence' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER income_occurrence_origin AFTER INSERT OR UPDATE ON "Income" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rovere_income_occurrence_origin();
CREATE CONSTRAINT TRIGGER occurrence_income_origin AFTER INSERT ON "ScheduledOccurrence" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rovere_income_occurrence_origin();
