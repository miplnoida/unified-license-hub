-- Narrow, rolled-back trigger regression; no real action is changed.
BEGIN;
CREATE TEMP TABLE overdue_trigger_probe (
  id uuid, due_date date, status text, entity_id uuid, title text, source_module text
);
CREATE TRIGGER overdue_probe BEFORE INSERT OR UPDATE OF due_date,status ON overdue_trigger_probe
FOR EACH ROW EXECUTE FUNCTION public.conduct_action_overdue_alert();
DO $test$
DECLARE v_id uuid := gen_random_uuid(); v_key text; v_count integer; v_status text;
BEGIN
  v_key := encode(extensions.digest(('action_overdue:'||v_id::text)::bytea,'sha1'),'hex');
  INSERT INTO overdue_trigger_probe VALUES (v_id,CURRENT_DATE-1,'open',NULL,'Monitoring rollback probe','complaints');
  SELECT status INTO v_status FROM overdue_trigger_probe WHERE id=v_id;
  IF v_status <> 'overdue' THEN RAISE EXCEPTION 'overdue status not set'; END IF;
  SELECT count(*) INTO v_count FROM public.conduct_alerts WHERE dedupe_key=v_key;
  IF v_count <> 1 THEN RAISE EXCEPTION 'expected one overdue alert, got %',v_count; END IF;
  UPDATE overdue_trigger_probe SET status='in_progress' WHERE id=v_id;
  SELECT count(*) INTO v_count FROM public.conduct_alerts WHERE dedupe_key=v_key;
  IF v_count <> 1 THEN RAISE EXCEPTION 'duplicate overdue alert'; END IF;
  INSERT INTO overdue_trigger_probe VALUES (gen_random_uuid(),CURRENT_DATE-1,'completed',NULL,'Terminal probe','complaints');
  IF (SELECT status FROM overdue_trigger_probe WHERE title='Terminal probe') <> 'completed' THEN
    RAISE EXCEPTION 'terminal status changed';
  END IF;
END $test$;
ROLLBACK;