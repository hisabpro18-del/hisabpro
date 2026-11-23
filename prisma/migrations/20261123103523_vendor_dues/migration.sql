-- CreateTable
CREATE TABLE "VendorDue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "refId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VendorDue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VendorDue_tenantId_status_idx" ON "VendorDue"("tenantId", "status");

-- desktop PCs pull vendor due dates like every other synced table (see src/sync/registry.js)
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "VendorDue" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();

-- a promise made together with an "udhaar given" entry (phone app) remembers the entry
ALTER TABLE "PaymentPromise" ADD COLUMN "refId" TEXT;
