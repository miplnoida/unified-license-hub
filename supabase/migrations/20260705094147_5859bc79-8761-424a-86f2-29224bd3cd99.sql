
ALTER TABLE public.licensees ADD COLUMN IF NOT EXISTS assigned_supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.licensees ADD COLUMN IF NOT EXISTS systemic_importance TEXT;

-- Assessments: allow storing review notes distinct from override_reason
ALTER TABLE public.prudential_assessments ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Actions: cancellation reason for auditability
ALTER TABLE public.prudential_actions ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Escalations: priority
ALTER TABLE public.prudential_escalations ADD COLUMN IF NOT EXISTS priority TEXT;

-- Widen dashboard metrics with sector risk distribution helper
CREATE OR REPLACE FUNCTION public.prudential_sector_risk_distribution()
RETURNS TABLE(sector_id UUID, sector_name TEXT, entity_count BIGINT, breach_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name,
         COUNT(DISTINCT l.id) AS entity_count,
         COUNT(b.id) AS breach_count
  FROM public.sectors s
  LEFT JOIN public.licensees l ON l.sector_id = s.id
  LEFT JOIN public.returns_filed rf ON rf.entity_id = l.id
  LEFT JOIN public.return_threshold_breaches b ON b.return_id = rf.id
  GROUP BY s.id, s.name
  ORDER BY s.name;
$$;
GRANT EXECUTE ON FUNCTION public.prudential_sector_risk_distribution() TO authenticated;
