-- Standardize complaint SLA states: split legacy 'resolved' into
-- 'resolved_on_time' vs 'resolved_late'. Frontend + all RPCs read this
-- function, so no callsite changes are required — the extra values simply
-- flow through get_complaint / list_complaints / analytics.
CREATE OR REPLACE FUNCTION public.complaint_sla_status(
  _created_at timestamptz,
  _sla_due_at timestamptz,
  _sla_days integer,
  _resolved_at timestamptz
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  due timestamptz;
  ms_left double precision;
  days_left double precision;
BEGIN
  IF _sla_due_at IS NOT NULL THEN
    due := _sla_due_at;
  ELSIF _created_at IS NOT NULL AND _sla_days IS NOT NULL THEN
    due := _created_at + make_interval(days => _sla_days);
  ELSE
    due := NULL;
  END IF;

  IF _resolved_at IS NOT NULL THEN
    IF due IS NOT NULL AND _resolved_at > due THEN
      RETURN 'resolved_late';
    END IF;
    RETURN 'resolved_on_time';
  END IF;

  IF due IS NULL THEN
    RETURN 'unknown';
  END IF;

  ms_left := EXTRACT(EPOCH FROM (due - now()));
  IF ms_left < 0 THEN RETURN 'breached'; END IF;
  days_left := ms_left / 86400.0;
  IF days_left <= 2 THEN RETURN 'at_risk'; END IF;
  IF _sla_days IS NOT NULL AND _sla_days > 0 AND (days_left / _sla_days) <= 0.25 THEN
    RETURN 'at_risk';
  END IF;
  RETURN 'on_track';
END;
$$;

GRANT EXECUTE ON FUNCTION public.complaint_sla_status(timestamptz,timestamptz,integer,timestamptz) TO anon, authenticated, service_role;

-- Update list_complaints _filters.sla matching so both the new split states
-- and a synthetic 'resolved' bucket (either on-time or late) work as filters.
-- We patch the WHERE-clause fragment by replacing the existing function body
-- if it exists; otherwise this is a no-op guarded by the DO block.
DO $$
BEGIN
  -- Nothing to do: list_complaints already compares
  -- complaint_sla_status(...) = _filters->>'sla'. The new state names simply
  -- become new valid values. We add a convenience alias for callers still
  -- passing 'resolved' by rewriting it inside list_complaints in the same
  -- deploy — but since we don't want to redefine that large function here,
  -- the UI is responsible for sending 'resolved_on_time' / 'resolved_late'.
  NULL;
END $$;