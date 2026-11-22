-- Every insert/update of a synced table is written to ChangeLog (PCs pull from it). Generated from src/sync/registry.js.
-- The per-client advisory lock makes the sequence numbers of one client follow commit order, so a PC that pulled up to N
-- never misses a change that commits later with a smaller number. The app takes the same lock at the start of its write
-- transactions (src/db.js lockTenant), so the order of locks is always the same and two writers cannot deadlock.
CREATE OR REPLACE FUNCTION hp_sync_log() RETURNS trigger AS $$
DECLARE t text;
BEGIN
  IF TG_TABLE_NAME = 'Tenant' THEN t := NEW."id"; ELSE t := NEW."tenantId"; END IF;
  IF t IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('hp:' || t));
  INSERT INTO "ChangeLog"("tenantId", "tbl", "rowId", "deviceId", "at")
    VALUES (t, TG_TABLE_NAME, NEW."id", NULLIF(current_setting('hp.device', true), ''), now());
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Tenant" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Setting" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Category" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Brand" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Unit" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Color" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Size" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Product" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "ProductSerial" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Party" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Account" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "AccountTxn" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Sale" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "SaleItem" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "SalePayment" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "HeldSale" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "SaleReturn" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "SaleReturnItem" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Purchase" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "PurchaseItem" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "PurchaseReturn" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "PurchaseReturnItem" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "ExpenseCategory" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Expense" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Cheque" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "CapitalTxn" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Tax" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Employee" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Shift" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Attendance" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "LeaveRequest" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Payslip" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Advance" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "JobPosting" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Candidate" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Appraisal" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "Disciplinary" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "AssetAssignment" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();

-- The activity log can only be added to: no change, no removal (also not with SQL).
CREATE OR REPLACE FUNCTION hp_audit_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'AuditLog is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER hp_audit_no_update BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION hp_audit_append_only();
CREATE TRIGGER hp_audit_no_truncate BEFORE TRUNCATE ON "AuditLog" FOR EACH STATEMENT EXECUTE FUNCTION hp_audit_append_only();
