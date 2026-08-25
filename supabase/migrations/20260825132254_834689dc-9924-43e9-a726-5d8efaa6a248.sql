CREATE OR REPLACE FUNCTION public.returns_new_return_options(_entity_id uuid)
RETURNS TABLE(
  sector_id uuid,
  sector_name text,
  reporting_year integer,
  definition_id uuid,
  definition_code text,
  definition_name text,
  frequency text,
  obligation_id uuid,
  period_id uuid,
  period_label text,
  period_start date,
  period_end date,
  due_date date,
  period_status text,
  filing_id uuid,
  filing_reference text,
  filing_status text,
  current_version_id uuid,
  is_overdue boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH allowed AS (
    SELECT (public.is_super_admin(auth.uid())
            OR public.has_permission(auth.uid(),'returns_management','view')
            OR public.entity_membership_capability(auth.uid(), _entity_id, 'returns.view')) AS ok
  ),
  eligible AS (
    -- Canonical licence entitlement resolver: only sectors of licences that
    -- currently permit new regulated activity, resolved through the alias map.
    SELECT DISTINCT
      e.sector_id,
      public.sector_effective_id(e.sector_id) AS effective_sector_id,
      e.sub_sector_id
    FROM public.entity_license_entitlements(_entity_id) e
    WHERE e.is_eligible_for_new_activity
      AND e.sector_id IS NOT NULL
  ),
  obligations AS (
    SELECT o.id AS obligation_id,
           o.return_definition_id,
           o.frequency,
           r.sector_id AS rule_sector_id,
           r.sub_sector_id AS rule_sub_sector_id
      FROM public.entity_reporting_obligations o
      LEFT JOIN public.reporting_obligation_rules r ON r.id = o.source_rule_id
     WHERE o.entity_id = _entity_id
       AND o.status = 'ACTIVE'
  ),
  scoped AS (
    -- Obligations carrying a sector rule must match an eligible licensed sector.
    SELECT ob.obligation_id, ob.return_definition_id, ob.frequency,
           el.sector_id, ob.rule_sub_sector_id AS sub_sector_id
      FROM obligations ob
      JOIN eligible el
        ON public.sector_effective_id(ob.rule_sector_id) = el.effective_sector_id
     WHERE ob.rule_sector_id IS NOT NULL
    UNION ALL
    -- Legacy obligations without a sector rule are attributed to the entity's
    -- eligible licensed sector(s) so nothing currently filable disappears.
    SELECT ob.obligation_id, ob.return_definition_id, ob.frequency,
           el.sector_id, NULL::uuid
      FROM obligations ob
      CROSS JOIN eligible el
     WHERE ob.rule_sector_id IS NULL
  )
  SELECT s.sector_id,
         sec.name,
         EXTRACT(YEAR FROM p.period_end)::int,
         d.id, d.code, d.name,
         COALESCE(s.frequency, d.frequency),
         s.obligation_id,
         p.id, p.period_label, p.period_start, p.period_end, p.due_date, p.status,
         f.id, f.filing_reference, f.status,
         (SELECT v.id FROM public.return_filing_versions v
           WHERE v.return_filing_id = f.id ORDER BY v.version_number DESC LIMIT 1),
         (p.due_date < CURRENT_DATE
          AND COALESCE(f.status,'DRAFT') NOT IN ('ACCEPTED','SUBMITTED','UNDER_REVIEW'))
    FROM scoped s
    JOIN public.return_definitions d ON d.id = s.return_definition_id
    JOIN public.reporting_periods p ON p.entity_reporting_obligation_id = s.obligation_id
    LEFT JOIN public.sectors sec ON sec.id = s.sector_id
    LEFT JOIN public.return_filings f ON f.reporting_period_id = p.id
   WHERE (SELECT ok FROM allowed)
     AND COALESCE(p.status,'OPEN') <> 'WAIVED'
     AND public.returns_entitlement_ok(auth.uid(), _entity_id, s.sector_id, s.sub_sector_id)
   ORDER BY 3 DESC, d.name, p.period_start;
$function$;

REVOKE ALL ON FUNCTION public.returns_new_return_options(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.returns_new_return_options(uuid) TO authenticated, service_role;

-- One filing per reporting period (duplicate-filing prevention enforced server-side).
CREATE UNIQUE INDEX IF NOT EXISTS return_filings_reporting_period_uniq
  ON public.return_filings(reporting_period_id);