CREATE OR REPLACE FUNCTION public.supervisory_domain_regulatory_function(_domain_code text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT f.id
    FROM public.regulatory_functions f
   WHERE f.status = 'active'
     AND f.key = CASE upper(COALESCE(_domain_code, ''))
                   WHEN 'AML_CFT' THEN 'aml_cft'
                   WHEN 'PRUDENTIAL' THEN 'prudential'
                   WHEN 'MARKET_CONDUCT' THEN 'market_conduct'
                   ELSE NULL
                 END
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.supervisory_domain_regulatory_function(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_regulatory_function(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.supervisory_domain_regulatory_function(text) IS
'OS-02B: canonical supervisory domain -> regulatory_functions.id resolver. Returns NULL for domains with no canonical supervisory-function counterpart (OPERATIONAL_RESILIENCE, GOVERNANCE, CROSS_DOMAIN); callers must then use only function-unscoped entity assignments.';

CREATE OR REPLACE FUNCTION public.supervisory_domain_assignment(
  _entity_id uuid, _domain_code text)
RETURNS TABLE (
  assignment_id uuid,
  lead_supervisor_id uuid,
  lead_supervisor_name text,
  team_id uuid,
  team_name text,
  regulatory_function_id uuid,
  regulatory_function_key text,
  assignment_scope text,
  effective_from timestamptz,
  is_primary boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH fn AS (
    SELECT public.supervisory_domain_regulatory_function(_domain_code) AS id
  )
  SELECT a.id,
         COALESCE(a.lead_supervisor_user_id, a.supervisor_id),
         a.supervisor_name,
         a.team_id,
         a.team,
         a.regulatory_function_id,
         rf.key,
         CASE WHEN a.regulatory_function_id IS NOT NULL
              THEN 'DOMAIN_FUNCTION_SCOPED' ELSE 'ENTITY_LEVEL_UNSCOPED' END,
         a.effective_from,
         a.is_primary
    FROM public.entity_supervision_assignments a
    CROSS JOIN fn
    LEFT JOIN public.regulatory_functions rf ON rf.id = a.regulatory_function_id
   WHERE a.entity_id = _entity_id
     AND a.effective_to IS NULL
     AND (a.regulatory_function_id IS NULL
          OR (fn.id IS NOT NULL AND a.regulatory_function_id = fn.id))
   ORDER BY (a.regulatory_function_id IS NOT NULL) DESC,
            a.is_primary DESC NULLS LAST,
            a.effective_from DESC NULLS LAST,
            a.id
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.supervisory_domain_assignment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_domain_assignment(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.supervisory_domain_assignment(uuid, text) IS
'OS-02B: resolves the single active supervision assignment that owns an entity x supervisory domain. Precedence: (1) assignment scoped to the domain regulatory function, (2) function-unscoped entity assignment (disclosed as ENTITY_LEVEL_UNSCOPED). Tie-break: is_primary, latest effective_from, id. An assignment for another regulatory function is never returned.';