-- sync triggers for the tables added in khata_messages_dayclose
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "PaymentPromise" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "MessageLog" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
CREATE TRIGGER hp_sync_log AFTER INSERT OR UPDATE ON "DayClose" FOR EACH ROW EXECUTE FUNCTION hp_sync_log();
