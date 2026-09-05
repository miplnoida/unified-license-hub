-- OS-02C: converge monitoring visibility onto the canonical scope contract.

-- 1. Canonical domain -> module derivation (via regulatory_functions.module_key).
CREATE OR REPLACE FUNCTION public.supervisory_domain_modules(_domain_code text)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT CASE
    WHEN f.module_key IS NOT NULL THEN ARRAY['supervisory_spine', f.module_key]
    ELSE CASE upper(COALESCE(_domain_code,'CROSS_DOMAIN'))
      WHEN 'OPERATIONAL_RESILIENCE' THEN ARRAY['supervisory_spine','prudential_supervision']
      WHEN 'GOVERNANCE' THEN ARRAY['supervisory_spine','fit_and_proper','prudential_supervision']
      ELSE ARRAY['supervisory_spine','prudential_supervision','aml_supervision','market_conduct']
    END
  END
  FROM (
    SELECT (SELECT rf.module_key FROM public.regulatory_functions rf
             WHERE rf.id = public.supervisory_domain_regulatory_function(_domain_code)) AS module_key
  ) f;
$fn$;

REVOKE ALL ON FUNCTION public.supervisory_domain_modules(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_modules(text) TO authenticated, service_role;

-- 2. Monitoring scope becomes a thin delegation to the canonical contract.
--    No independent interpretation of role scope, portfolio, mandate,
--    assignment or team coverage survives here.
CREATE OR REPLACE FUNCTION public.supervisory_monitoring_scope_admits(
  _uid uuid, _domain_code text, _entity_id uuid,
  _regulator_id uuid, _sector_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  _fn uuid;
  _m  text;
BEGIN
  -- _regulator_id / _sector_id are retained for signature stability only;
  -- classification is always derived server-side by the canonical contract.
  IF _uid IS NULL OR _entity_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_uid) THEN RETURN true; END IF;

  _fn := public.supervisory_domain_regulatory_function(_domain_code);

  FOREACH _m IN ARRAY public.supervisory_domain_modules(_domain_code) LOOP
    IF public.regulatory_scope_allows(
         _uid, _m, 'view', NULL, NULL, NULL, _entity_id, NULL,
         COALESCE(_fn, public.regulatory_function_for_module(_m))) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_scope_admits(uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_scope_admits(uuid,text,uuid,uuid,uuid)
  TO authenticated, service_role;

-- 3. Options derive from exactly the authorised register population.
CREATE OR REPLACE FUNCTION public.supervisory_monitoring_register_options()
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $fn$
DECLARE
  _uid  uuid := public.sup_read_guard();
  _doms text[];
  _out  jsonb;
BEGIN
  SELECT array_agg(v.d ORDER BY v.ord) INTO _doms
    FROM (VALUES (1,'PRUDENTIAL'),(2,'AML_CFT'),(3,'MARKET_CONDUCT'),
                 (4,'OPERATIONAL_RESILIENCE'),(5,'GOVERNANCE'),(6,'CROSS_DOMAIN')) v(ord, d)
   WHERE public.sup_domain_readable(_uid, v.d);

  IF _doms IS NULL THEN
    RETURN jsonb_build_object(
      'generated_at', now(), 'scope_basis', 'CANONICAL_REGULATORY_SCOPE_ALLOWS',
      'domains', '[]'::jsonb, 'regulators', '[]'::jsonb, 'sectors', '[]'::jsonb,
      'risk_ratings', '[]'::jsonb, 'engagement_types', '[]'::jsonb,
      'attention_states', '[]'::jsonb, 'reassessment_states', '[]'::jsonb,
      'returns_states', '[]'::jsonb, 'sort_keys', '[]'::jsonb,
      'teams', '[]'::jsonb, 'owners', '[]'::jsonb);
  END IF;

  WITH ents AS (
    SELECT l.id, l.sector_id, l.lead_regulator_id AS regulator_id
      FROM public.licensees l
  ),
  pairs AS (
    SELECT e.id AS entity_id, d.domain_code
      FROM ents e CROSS JOIN unnest(_doms) AS d(domain_code)
     WHERE public.supervisory_monitoring_scope_admits(
             _uid, d.domain_code, e.id, e.regulator_id, e.sector_id)
  ),
  owners AS (
    SELECT DISTINCT o.lead_supervisor_id AS id, o.lead_supervisor_name AS name,
                    o.team_id, o.team_name
      FROM pairs p
      CROSS JOIN LATERAL public.supervisory_domain_assignment(p.entity_id, p.domain_code) o
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'scope_basis', 'CANONICAL_REGULATORY_SCOPE_ALLOWS',
    'domains', COALESCE((SELECT jsonb_agg(DISTINCT p.domain_code) FROM pairs p), '[]'::jsonb),
    'regulators', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) ORDER BY r.name)
        FROM public.regulators r
       WHERE EXISTS (SELECT 1 FROM pairs p JOIN public.licensees l ON l.id = p.entity_id
                      WHERE l.lead_regulator_id = r.id)), '[]'::jsonb),
    'sectors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code) ORDER BY s.name)
        FROM public.sectors s
       WHERE EXISTS (SELECT 1 FROM pairs p JOIN public.licensees l ON l.id = p.entity_id
                      WHERE l.sector_id = s.id)), '[]'::jsonb),
    'risk_ratings', COALESCE((
      SELECT jsonb_agg(DISTINCT upper(a.residual_rating))
        FROM public.supervisory_assessment a
        JOIN pairs p ON p.entity_id = a.entity_id
                    AND COALESCE(a.domain_code,'CROSS_DOMAIN') = p.domain_code
       WHERE a.residual_rating IS NOT NULL
         AND a.status = 'approved' AND COALESCE(a.is_current, false)), '[]'::jsonb),
    'engagement_types', COALESCE((
      SELECT jsonb_agg(DISTINCT upper(x.engagement_type))
        FROM public.examinations x
        JOIN pairs p ON p.entity_id = x.entity_id
                    AND COALESCE(x.domain_code,'CROSS_DOMAIN') = p.domain_code
       WHERE x.engagement_type IS NOT NULL), '[]'::jsonb),
    'attention_states', to_jsonb(ARRAY['OPEN','NONE']),
    'reassessment_states', to_jsonb(ARRAY['REQUIRED','OVERDUE','NONE']),
    'returns_states', to_jsonb(ARRAY['CLEAN','LATE','MISSING','NOT_AVAILABLE']),
    'sort_keys', to_jsonb(ARRAY['entity','risk','last_assessment','due_date',
                                'open_findings','overdue_remediation','as_of']),
    'teams', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', o.team_id, 'name', o.team_name))
        FROM owners o WHERE o.team_id IS NOT NULL), '[]'::jsonb),
    'owners', COALESCE((
      SELECT jsonb_agg(DISTINCT jsonb_build_object('id', o.id, 'name', o.name))
        FROM owners o WHERE o.id IS NOT NULL), '[]'::jsonb))
  INTO _out;

  RETURN _out;
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_monitoring_register_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_monitoring_register_options() TO authenticated, service_role;