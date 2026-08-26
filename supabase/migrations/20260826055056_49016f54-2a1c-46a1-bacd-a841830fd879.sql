DELETE FROM public.notification_outbox n
USING public.complaints c
WHERE n.entity_type = 'complaint'
  AND n.entity_id = c.id
  AND c.idempotency_key IN ('mc01-runtime-cert-20260826-a','mc01-runtime-edge-20260826-b');