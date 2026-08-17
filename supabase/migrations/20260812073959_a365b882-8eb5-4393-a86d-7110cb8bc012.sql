UPDATE public.applications AS a
SET decision_rationale = source.comments,
    updated_at = greatest(coalesce(a.updated_at, source.created_at), source.created_at)
FROM (
  SELECT aa.application_id, trim(aa.comments) AS comments, aa.created_at
  FROM public.approval_actions aa
  WHERE nullif(trim(coalesce(aa.comments, '')), '') IS NOT NULL
    AND (
      lower(trim(coalesce(aa.action, ''))) IN (
        'approve', 'approved', 'conditional_approve', 'conditionally_approved',
        'reject', 'rejected', 'return', 'resubmission_requested', 'defer', 'deferred'
      )
      OR lower(trim(coalesce(aa.action_type, ''))) IN (
        'approve', 'approved', 'conditional_approve', 'conditionally_approved',
        'reject', 'rejected', 'return', 'resubmission_requested', 'defer', 'deferred'
      )
    )
) AS source
WHERE nullif(trim(coalesce(a.decision_rationale, '')), '') IS NULL
  AND source.application_id = a.id
  AND source.created_at = (
    SELECT max(latest.created_at)
    FROM public.approval_actions latest
    WHERE latest.application_id = a.id
      AND nullif(trim(coalesce(latest.comments, '')), '') IS NOT NULL
      AND (
        lower(trim(coalesce(latest.action, ''))) IN ('approve','approved','conditional_approve','conditionally_approved','reject','rejected','return','resubmission_requested','defer','deferred')
        OR lower(trim(coalesce(latest.action_type, ''))) IN ('approve','approved','conditional_approve','conditionally_approved','reject','rejected','return','resubmission_requested','defer','deferred')
      )
  );