-- Minimal destinations only. No balances, limits, charges or inferred invoice data.
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "creationKey" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditAccount_currency_check" CHECK ("currency" = 'BRL'),
    CONSTRAINT "CreditAccount_name_check" CHECK (length(btrim("name")) > 0)
);
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "creationKey" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Card_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Card_kind_check" CHECK ("kind" IN ('physical', 'virtual', 'additional')),
    CONSTRAINT "Card_name_check" CHECK (length(btrim("name")) > 0)
);
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "periodOrigin" VARCHAR(10) NOT NULL DEFAULT 'manual',
    "creationKey" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Statement_period_check" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left("period", 4) <> '0000'),
    CONSTRAINT "Statement_origin_check" CHECK ("periodOrigin" = 'manual')
);
CREATE UNIQUE INDEX "CreditAccount_id_userId_key" ON "CreditAccount"("id", "userId");
CREATE UNIQUE INDEX "CreditAccount_userId_creationKey_key" ON "CreditAccount"("userId", "creationKey");
CREATE UNIQUE INDEX "Card_id_userId_key" ON "Card"("id", "userId");
CREATE UNIQUE INDEX "Card_userId_creationKey_key" ON "Card"("userId", "creationKey");
CREATE INDEX "Card_creditAccountId_userId_idx" ON "Card"("creditAccountId", "userId");
CREATE UNIQUE INDEX "Statement_id_userId_key" ON "Statement"("id", "userId");
CREATE UNIQUE INDEX "Statement_userId_creationKey_key" ON "Statement"("userId", "creationKey");
CREATE UNIQUE INDEX "Statement_creditAccountId_period_key" ON "Statement"("creditAccountId", "period");
CREATE INDEX "Statement_creditAccountId_userId_idx" ON "Statement"("creditAccountId", "userId");
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_creditAccountId_userId_fkey" FOREIGN KEY ("creditAccountId", "userId") REFERENCES "CreditAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_creditAccountId_userId_fkey" FOREIGN KEY ("creditAccountId", "userId") REFERENCES "CreditAccount"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
