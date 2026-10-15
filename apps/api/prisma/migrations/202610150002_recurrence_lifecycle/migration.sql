ALTER TABLE "RecurrenceRule" ADD COLUMN "state" VARCHAR(9) NOT NULL DEFAULT 'active';
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_state_check" CHECK ("state" IN ('active','paused','cancelled'));
CREATE TABLE "RecurrenceRevision" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "version" INTEGER NOT NULL,
 "effectiveFrom" VARCHAR(7) NOT NULL, "description" VARCHAR(500) NOT NULL, "notes" VARCHAR(1000), "cents" BIGINT NOT NULL,
 "anchorDay" INTEGER NOT NULL, "startsOn" DATE NOT NULL, "endsOn" DATE, "evidence" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RecurrenceRevision_ruleId_userId_fkey" FOREIGN KEY ("ruleId","userId") REFERENCES "RecurrenceRule"("id","userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RecurrenceRevision_check" CHECK ("version" >= 0 AND "effectiveFrom" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("effectiveFrom",4) <> '0000'
 AND length(btrim("description")) > 0 AND "cents" >= 0 AND "anchorDay" BETWEEN 1 AND 31
 AND "startsOn" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' AND ("endsOn" IS NULL OR "endsOn" BETWEEN "startsOn" AND DATE '9999-12-31')
 AND COALESCE("evidence"->>'kind' = 'user' AND length("evidence"->>'decisionId') > 0,false))
);
CREATE UNIQUE INDEX "RecurrenceRevision_ruleId_version_key" ON "RecurrenceRevision"("ruleId","version");
CREATE INDEX "RecurrenceRevision_ruleId_userId_effectiveFrom_idx" ON "RecurrenceRevision"("ruleId","userId","effectiveFrom");
INSERT INTO "RecurrenceRevision" ("id","userId","ruleId","version","effectiveFrom","description","notes","cents","anchorDay","startsOn","endsOn","evidence","createdAt")
 SELECT "id" || '_initial',"userId","id",0,'0001-01',"description","notes","cents","anchorDay","startsOn","endsOn","evidence","createdAt" FROM "RecurrenceRule";
CREATE UNIQUE INDEX "ScheduledOccurrence_incomeId_ruleId_userId_key" ON "ScheduledOccurrence"("incomeId","ruleId","userId");
CREATE TABLE "RecurrenceException" (
 "incomeId" TEXT PRIMARY KEY, "ruleId" TEXT NOT NULL, "userId" TEXT NOT NULL, "evidence" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "RecurrenceException_incomeId_ruleId_userId_fkey" FOREIGN KEY ("incomeId","ruleId","userId") REFERENCES "ScheduledOccurrence"("incomeId","ruleId","userId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "RecurrenceException_check" CHECK (COALESCE("evidence"->>'kind' = 'user' AND length("evidence"->>'decisionId') > 0,false))
);
CREATE UNIQUE INDEX "RecurrenceException_incomeId_ruleId_userId_key" ON "RecurrenceException"("incomeId","ruleId","userId");
CREATE TRIGGER recurrence_revision_immutable BEFORE UPDATE OR DELETE ON "RecurrenceRevision" FOR EACH ROW EXECUTE FUNCTION rovere_recurrence_immutable();
CREATE TRIGGER recurrence_exception_immutable BEFORE UPDATE OR DELETE ON "RecurrenceException" FOR EACH ROW EXECUTE FUNCTION rovere_recurrence_immutable();
CREATE OR REPLACE FUNCTION rovere_recurrence_version_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Recurrence history is immutable' USING ERRCODE='23514'; END IF;
 IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."userId" IS DISTINCT FROM OLD."userId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
 OR NEW."startsOn" IS DISTINCT FROM OLD."startsOn" OR NEW."evidence" IS DISTINCT FROM OLD."evidence" OR NEW."currency" IS DISTINCT FROM OLD."currency"
 OR NEW."version"::bigint <> OLD."version"::bigint + 1 OR (OLD."state"='cancelled' AND (to_jsonb(NEW)-'version') IS DISTINCT FROM (to_jsonb(OLD)-'version')) THEN
 RAISE EXCEPTION 'Invalid recurrence lifecycle update' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
-- The occurrence is immutable evidence of generation; current Income facts may now be explicitly corrected.
CREATE OR REPLACE FUNCTION rovere_income_occurrence_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id TEXT; owner_id TEXT; income_row "Income"%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='Income' THEN target_id:=NEW."id"; owner_id:=NEW."userId"; ELSE target_id:=NEW."incomeId"; owner_id:=NEW."userId"; END IF;
 SELECT * INTO STRICT income_row FROM "Income" WHERE "id"=target_id AND "userId"=owner_id;
 IF income_row."origin"->>'kind'='recurrence' THEN
 IF NOT EXISTS (SELECT 1 FROM "ScheduledOccurrence" o WHERE o."incomeId"=target_id AND o."userId"=owner_id AND o."id"=income_row."origin"->>'occurrenceId' AND o."ruleId"=income_row."origin"->>'ruleId') THEN
 RAISE EXCEPTION 'Income recurrence origin requires typed occurrence' USING ERRCODE='23514'; END IF;
 ELSIF EXISTS (SELECT 1 FROM "ScheduledOccurrence" WHERE "incomeId"=target_id) THEN RAISE EXCEPTION 'Manual income cannot be a generated occurrence' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
