-- Keeping the free 500 MB database small.
-- 1. PCs never download the activity log (they only push theirs up), so its rows need no change-log entry.
DROP TRIGGER IF EXISTS hp_sync_log ON "AuditLog";
-- 2. The activity log stays append-only for everyone, except the nightly retention job, which marks its own transaction
--    with hp.retention = 'on' to remove entries older than the retention period (AUDIT_RETENTION_DAYS, default 365).
CREATE OR REPLACE FUNCTION hp_audit_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('hp.retention', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'AuditLog is append-only';
END $$ LANGUAGE plpgsql;
