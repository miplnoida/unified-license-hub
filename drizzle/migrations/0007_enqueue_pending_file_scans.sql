CREATE UNIQUE INDEX IF NOT EXISTS job_queue_pending_file_scan_unique ON public.job_queue ((payload->>'file_upload_id')) WHERE type = 'file_processing' AND status IN ('pending','processing') AND payload->>'operation' = 'malware_scan';
CREATE OR REPLACE FUNCTION public.file_upload_enqueue_scan() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.scan_status IS DISTINCT FROM 'pending_scan' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.scan_status IS NOT DISTINCT FROM NEW.scan_status THEN RETURN NEW; END IF;
  INSERT INTO public.job_queue (type,payload,status,priority,attempts,max_attempts)
  VALUES ('file_processing',jsonb_build_object('file_upload_id',NEW.id,'operation','malware_scan'),'pending',0,0,3)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.file_upload_enqueue_scan() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_file_upload_enqueue_scan AFTER INSERT OR UPDATE OF scan_status ON public.file_uploads FOR EACH ROW EXECUTE FUNCTION public.file_upload_enqueue_scan();
CREATE POLICY "Client queue inserts cannot forge file scan jobs" ON public.job_queue AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (type <> 'file_processing');