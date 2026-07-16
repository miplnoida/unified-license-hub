
-- 1) Extend status check to include 'processing' and add claim columns.
ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_status_check;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
  CHECK (status IN ('pending','processing','sent','failed','dead'));

ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by text;

CREATE INDEX IF NOT EXISTS ix_notification_outbox_processing
  ON public.notification_outbox(status, claimed_at) WHERE status = 'processing';

-- 2) Atomic claim function (FOR UPDATE SKIP LOCKED).
CREATE OR REPLACE FUNCTION public.claim_notification_outbox(_limit int DEFAULT 50, _worker text DEFAULT NULL)
RETURNS SETOF public.notification_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.notification_outbox
    WHERE status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT GREATEST(_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_outbox o
     SET status     = 'processing',
         claimed_at = now(),
         claimed_by = COALESCE(_worker, 'worker')
    FROM picked
   WHERE o.id = picked.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_outbox(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox(int, text) TO service_role;

-- 3) Stuck-claim reaper: rows stuck in 'processing' > 10 min → 'pending'.
CREATE OR REPLACE FUNCTION public.reap_stuck_notification_outbox()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  WITH reaped AS (
    UPDATE public.notification_outbox
       SET status = 'pending',
           claimed_at = NULL,
           claimed_by = NULL,
           next_attempt_at = now()
     WHERE status = 'processing'
       AND claimed_at < now() - INTERVAL '10 minutes'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM reaped;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.reap_stuck_notification_outbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reap_stuck_notification_outbox() TO service_role;

-- 4) Admin retry: reset dead rows to pending (for admin dashboards).
CREATE OR REPLACE FUNCTION public.retry_dead_notification_outbox(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  WITH revived AS (
    UPDATE public.notification_outbox
       SET status = 'pending',
           retry_count = 0,
           last_error = NULL,
           next_attempt_at = now(),
           claimed_at = NULL,
           claimed_by = NULL
     WHERE id = ANY(_ids) AND status = 'dead'
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM revived;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_dead_notification_outbox(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_dead_notification_outbox(uuid[]) TO authenticated;
