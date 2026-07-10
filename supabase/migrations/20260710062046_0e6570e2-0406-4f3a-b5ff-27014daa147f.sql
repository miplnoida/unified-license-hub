
-- 1. Trigger function: apply complaint_type sla_days on insert
CREATE OR REPLACE FUNCTION public.apply_complaint_type_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sla_days integer;
BEGIN
  IF NEW.complaint_type_id IS NOT NULL THEN
    SELECT sla_days INTO v_sla_days
    FROM public.complaint_types
    WHERE id = NEW.complaint_type_id;
  END IF;

  IF v_sla_days IS NULL THEN
    v_sla_days := 20;
  END IF;

  IF NEW.sla_days IS NULL THEN
    NEW.sla_days := v_sla_days;
  END IF;

  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := COALESCE(NEW.created_at, now()) + (NEW.sla_days || ' days')::interval;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_complaint_type_sla ON public.complaints;
CREATE TRIGGER trg_apply_complaint_type_sla
BEFORE INSERT ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.apply_complaint_type_sla();

-- 2. Backfill existing complaints (skip resolved/closed)
UPDATE public.complaints c
SET
  sla_days = COALESCE(c.sla_days, ct.sla_days, 20),
  sla_due_at = COALESCE(
    c.sla_due_at,
    c.created_at + (COALESCE(c.sla_days, ct.sla_days, 20) || ' days')::interval
  )
FROM (SELECT id, sla_days FROM public.complaint_types) ct
WHERE (c.complaint_type_id = ct.id OR c.complaint_type_id IS NULL)
  AND (c.sla_days IS NULL OR c.sla_due_at IS NULL)
  AND COALESCE(c.status, '') NOT IN ('resolved', 'closed');

-- Handle any remaining rows where complaint_type_id is null (not matched by join above)
UPDATE public.complaints
SET
  sla_days = COALESCE(sla_days, 20),
  sla_due_at = COALESCE(sla_due_at, created_at + (COALESCE(sla_days, 20) || ' days')::interval)
WHERE (sla_days IS NULL OR sla_due_at IS NULL)
  AND COALESCE(status, '') NOT IN ('resolved', 'closed');
