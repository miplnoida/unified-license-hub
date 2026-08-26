UPDATE public.complaints
   SET status = 'closed',
       updated_at = now()
 WHERE idempotency_key IN ('mc01-runtime-cert-20260826-a','mc01-runtime-edge-20260826-b')
   AND status <> 'closed';