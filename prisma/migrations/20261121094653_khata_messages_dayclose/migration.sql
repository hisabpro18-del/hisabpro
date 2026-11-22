-- CreateTable
CREATE TABLE "PaymentPromise" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "promisedDate" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "remindedAt" TIMESTAMP(3),
    "remindCount" INTEGER NOT NULL DEFAULT 0,
    "lastAutoDay" TEXT NOT NULL DEFAULT '',
    "keptAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentPromise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "to" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPENED',
    "provider" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "refId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayClose" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "openingCash" BIGINT NOT NULL DEFAULT 0,
    "cashIn" BIGINT NOT NULL DEFAULT 0,
    "cashOut" BIGINT NOT NULL DEFAULT 0,
    "expected" BIGINT NOT NULL DEFAULT 0,
    "counted" BIGINT NOT NULL DEFAULT 0,
    "difference" BIGINT NOT NULL DEFAULT 0,
    "salesTotal" BIGINT NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DayClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentPromise_tenantId_status_idx" ON "PaymentPromise"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MessageLog_tenantId_createdAt_idx" ON "MessageLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DayClose_tenantId_day_idx" ON "DayClose"("tenantId", "day");
