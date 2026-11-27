-- CreateTable
CREATE TABLE "StockPriceLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "field" TEXT NOT NULL,
    "oldPrice" BIGINT,
    "newPrice" BIGINT,
    "oldQty" DOUBLE PRECISION,
    "newQty" DOUBLE PRECISION,
    "reason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "batchId" TEXT,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StockPriceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockPriceLog_tenantId_date_idx" ON "StockPriceLog"("tenantId", "date");

-- CreateIndex
CREATE INDEX "StockPriceLog_tenantId_productId_idx" ON "StockPriceLog"("tenantId", "productId");

-- desktop PCs sync the Stock & Price history like every other business table (see src/sync/registry.js)
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "StockPriceLog" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
