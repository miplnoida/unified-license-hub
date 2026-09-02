-- Legal hold rows in public.document_holds were never reflected onto
-- public.document_groups.legal_hold_status, which is the value the governed
-- disposal RPCs (dms_archive, dms_soft_delete) actually check. A recorded hold
-- therefore did not block disposal. Sync it with a trigger; this strengthens an
-- existing control and changes nothing else.

CREATE OR REPLACE FUNCTION public.document_holds_sync_group_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _group uuid := COALESCE(NEW.document_group_id, OLD.document_group_id);
BEGIN
  UPDATE public.document_groups g
     SET legal_hold_status = CASE
           WHEN EXISTS (SELECT 1 FROM public.document_holds h
                         WHERE h.document_group_id = _group AND h.status = 'active')
             THEN 'on_hold'
           WHEN EXISTS (SELECT 1 FROM public.document_holds h
                         WHERE h.document_group_id = _group)
             THEN 'released'
           ELSE 'none' END,
         updated_at = now()
   WHERE g.id = _group;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_document_holds_sync_group_status ON public.document_holds;
CREATE TRIGGER trg_document_holds_sync_group_status
AFTER INSERT OR UPDATE OR DELETE ON public.document_holds
FOR EACH ROW EXECUTE FUNCTION public.document_holds_sync_group_status();

-- Reconcile existing records so current holds take effect immediately.
UPDATE public.document_groups g
   SET legal_hold_status = 'on_hold'
 WHERE g.legal_hold_status <> 'on_hold'
   AND EXISTS (SELECT 1 FROM public.document_holds h
                WHERE h.document_group_id = g.id AND h.status = 'active');

UPDATE public.document_groups g
   SET legal_hold_status = 'released'
 WHERE g.legal_hold_status = 'on_hold'
   AND NOT EXISTS (SELECT 1 FROM public.document_holds h
                    WHERE h.document_group_id = g.id AND h.status = 'active');