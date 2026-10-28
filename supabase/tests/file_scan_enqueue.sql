BEGIN;
CREATE TEMP TABLE scan_enqueue_probe (id uuid, scan_status text);
CREATE TRIGGER scan_enqueue AFTER INSERT OR UPDATE OF scan_status ON scan_enqueue_probe
FOR EACH ROW EXECUTE FUNCTION public.file_upload_enqueue_scan();
DO $test$
DECLARE v_id uuid := gen_random_uuid(); v_count integer;
BEGIN
  INSERT INTO scan_enqueue_probe VALUES(v_id,'pending_scan');
  UPDATE scan_enqueue_probe SET scan_status='pending_scan' WHERE id=v_id;
  SELECT count(*) INTO v_count FROM public.job_queue WHERE type='file_processing' AND payload->>'file_upload_id'=v_id::text;
  IF v_count <> 1 THEN RAISE EXCEPTION 'expected one scan job, got %',v_count; END IF;
  UPDATE scan_enqueue_probe SET scan_status='clean' WHERE id=v_id;
  SELECT count(*) INTO v_count FROM public.job_queue WHERE type='file_processing' AND payload->>'file_upload_id'=v_id::text;
  IF v_count <> 1 THEN RAISE EXCEPTION 'verdict generated another job'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.job_queue'::regclass AND polname='Client queue inserts cannot forge file scan jobs' AND NOT polpermissive) THEN
    RAISE EXCEPTION 'missing restrictive client scan-job protection';
  END IF;
END $test$;
ROLLBACK;