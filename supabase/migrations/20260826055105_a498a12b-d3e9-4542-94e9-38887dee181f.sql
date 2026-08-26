UPDATE public.workflow_instances wi
   SET status = 'paused', updated_at = now()
  FROM public.complaints c
 WHERE wi.entity_type = 'complaint'
   AND wi.entity_id = c.id
   AND c.idempotency_key IN ('mc01-runtime-cert-20260826-a','mc01-runtime-edge-20260826-b')
   AND wi.status = 'active';