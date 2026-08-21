-- EPR-01: canonical server-side Returns aggregates for supervisory/dashboard consumers.
-- All functions are SECURITY INVOKER (RLS-scoped) and STABLE.

CREATE OR REPLACE FUNCTION public.returns_supervisory_summary(_sector_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT w.*
    FROM public.v_return_filing_workflow_state w
    LEFT JOIN public.licensees l ON l.id = w.entity_id
    WHERE _sector_id IS NULL OR l.sector_id = _sector_id
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scoped),
    'draft', (SELECT count(*) FROM scoped WHERE status = 'DRAFT'),
    'submitted', (SELECT count(*) FROM scoped WHERE status IN ('SUBMITTED','UNDER_REVIEW','CORRECTION_REQUESTED','ACCEPTED','REJECTED')),
    'pending_review', (SELECT count(*) FROM scoped WHERE status IN ('SUBMITTED','UNDER_REVIEW')),
    'correction_requested', (SELECT count(*) FROM scoped WHERE status = 'CORRECTION_REQUESTED'),
    'accepted', (SELECT count(*) FROM scoped WHERE status = 'ACCEPTED'),
    'rejected', (SELECT count(*) FROM scoped WHERE status = 'REJECTED'),
    'overdue', (SELECT count(*) FROM scoped WHERE is_overdue),
    'due_soon', (SELECT count(*) FROM scoped WHERE NOT is_overdue AND sla_state = 'DUE_SOON'),
    'sla_breached', (SELECT count(*) FROM scoped WHERE sla_state = 'BREACHED'),
    'top_overdue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', filing_id, 'filing_reference', filing_reference, 'entity_id', entity_id,
        'entity_name', entity_name, 'definition_name', definition_name,
        'period_label', period_label, 'due_date', due_date, 'days_late', days_late,
        'status', status, 'stage', stage))
      FROM (SELECT * FROM scoped WHERE is_overdue ORDER BY due_date NULLS LAST LIMIT 5) t
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.returns_filing_trend(_months integer DEFAULT 6)
RETURNS TABLE(month text, filings bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_char(date_trunc('month', f.created_at), 'YYYY-MM') AS month, count(*)::bigint
  FROM public.return_filings f
  WHERE f.created_at >= date_trunc('month', now()) - ((GREATEST(_months, 1) - 1) || ' months')::interval
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.returns_entity_summary(_entity_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT * FROM public.v_return_filing_workflow_state
    WHERE entity_id = ANY(COALESCE(_entity_ids, ARRAY[]::uuid[]))
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM scoped),
    'draft', (SELECT count(*) FROM scoped WHERE status = 'DRAFT'),
    'pending_review', (SELECT count(*) FROM scoped WHERE status IN ('SUBMITTED','UNDER_REVIEW')),
    'correction_requested', (SELECT count(*) FROM scoped WHERE status = 'CORRECTION_REQUESTED'),
    'accepted', (SELECT count(*) FROM scoped WHERE status = 'ACCEPTED'),
    'overdue', (SELECT count(*) FROM scoped WHERE is_overdue),
    'due_soon', (SELECT count(*) FROM scoped WHERE NOT is_overdue AND sla_state = 'DUE_SOON'),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', filing_id, 'filing_reference', filing_reference, 'definition_name', definition_name,
        'period_label', period_label, 'due_date', due_date, 'status', status,
        'status_label', status_label, 'is_overdue', is_overdue))
      FROM (SELECT * FROM scoped WHERE status NOT IN ('ACCEPTED','WITHDRAWN') ORDER BY due_date NULLS LAST LIMIT 10) t
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.returns_entity_filing_history(_entity_id uuid)
RETURNS TABLE(
  filing_id uuid,
  filing_reference text,
  definition_name text,
  period_label text,
  period_start date,
  period_end date,
  due_date date,
  status text,
  status_label text,
  submitted_at timestamptz,
  accepted_at timestamptz,
  current_version_number integer,
  accepted_version_id uuid,
  breach_count bigint,
  metric_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT w.filing_id, w.filing_reference, w.definition_name, w.period_label,
         w.period_start, w.period_end, w.due_date, w.status, w.status_label,
         w.submitted_at, w.accepted_at, w.current_version_number, w.accepted_version_id,
         (SELECT count(*) FROM public.return_threshold_breaches b WHERE b.return_filing_id = w.filing_id),
         (SELECT count(*) FROM public.return_metric_values mv
           WHERE mv.return_filing_version_id = COALESCE(w.accepted_version_id, w.current_version_id))
  FROM public.v_return_filing_workflow_state w
  WHERE w.entity_id = _entity_id
  ORDER BY w.period_end DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.returns_supervisory_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_filing_trend(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_entity_summary(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_entity_filing_history(uuid) TO authenticated;