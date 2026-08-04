-- 1. Separate deactivate privilege
INSERT INTO public.permission_actions (module_id, key, label, description, sort_order, is_system, audience)
SELECT pm.id, 'deactivate', 'Deactivate', 'Deactivate an active rule (requires justification)',
       COALESCE((SELECT max(sort_order) FROM public.permission_actions WHERE module_id = pm.id), 0) + 1,
       true, (SELECT audience FROM public.permission_actions WHERE module_id = pm.id ORDER BY sort_order LIMIT 1)
FROM public.permission_modules pm
WHERE pm.key = 'rule_engine'
  AND NOT EXISTS (
    SELECT 1 FROM public.permission_actions pa WHERE pa.module_id = pm.id AND pa.key = 'deactivate'
  );

INSERT INTO public.permissions (module, name, description)
SELECT 'rule_engine', 'deactivate', 'Deactivate an active rule (requires justification)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions WHERE module = 'rule_engine' AND name = 'deactivate'
);

CREATE OR REPLACE FUNCTION public.can_deactivate_rule_engine(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'rule_engine', 'deactivate')
    OR public.has_permission(_user_id, 'rule_engine', 'activate')
    OR public.has_permission(_user_id, 'rule_engine', 'edit')
  );
$function$;

CREATE OR REPLACE FUNCTION public.engine_rule_deactivate(_rule_id uuid, _justification text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_row public.engine_rules; v_open int; v_before jsonb;
BEGIN
  IF NOT public.can_deactivate_rule_engine(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF coalesce(btrim(_justification),'') = '' THEN RAISE EXCEPTION 'justification_required'; END IF;

  SELECT to_jsonb(r) INTO v_before FROM public.engine_rules r WHERE r.id = _rule_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;

  UPDATE public.engine_rules
     SET status = 'inactive', deactivation_reason = btrim(_justification), updated_by = auth.uid()
   WHERE id = _rule_id RETURNING * INTO v_row;

  -- R-ADM-017: open alerts remain open.
  SELECT count(*) INTO v_open FROM public.engine_rule_alerts WHERE rule_id = _rule_id AND status = 'open';

  PERFORM public.create_audit_log(auth.uid(), 'ADMIN_RULE_DEACTIVATED', 'engine_rule', v_row.id::text,
    v_before, jsonb_build_object('status', 'inactive', 'version', v_row.version,
                                 'justification', btrim(_justification), 'open_alerts_retained', v_open));

  RETURN jsonb_build_object('ok', true, 'rule', to_jsonb(v_row), 'open_alerts_retained', v_open);
END; $function$;

-- 2. Inventory search: add facets + always-present family counts
CREATE OR REPLACE FUNCTION public.rule_inventory_search(
  _search text DEFAULT NULL,
  _family text DEFAULT NULL,
  _module text DEFAULT NULL,
  _sub_module text DEFAULT NULL,
  _rule_type text DEFAULT NULL,
  _status text DEFAULT NULL,
  _severity text DEFAULT NULL,
  _tag text DEFAULT NULL,
  _triggered_from timestamptz DEFAULT NULL,
  _triggered_to timestamptz DEFAULT NULL,
  _sort text DEFAULT 'last_modified_at',
  _dir text DEFAULT 'desc',
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
  v_total int;
  v_kpi jsonb;
  v_facets jsonb;
  v_sort text := lower(coalesce(_sort,'last_modified_at'));
  v_dir text := CASE WHEN lower(coalesce(_dir,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_limit int := least(greatest(coalesce(_limit,50),1),200);
  v_offset int := greatest(coalesce(_offset,0),0);
  v_where text;
  v_families text[] := ARRAY['shared_engine','return_validation','prudential','conduct',
                             'complaint_triage','sufficiency','rfi_auto','correspondence','escalation'];
BEGIN
  IF NOT public.can_view_rule_engine(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_sort NOT IN ('rule_code','name','family','module','rule_type','severity','status',
                    'trigger_count','last_triggered_at','last_tested_at','last_modified_at') THEN
    v_sort := 'last_modified_at';
  END IF;

  v_where := $w$
    ($1 IS NULL OR btrim($1) = ''
      OR concat_ws(' ', i.rule_code, i.name, i.description, i.module, i.sub_module,
                   array_to_string(i.tags,' ')) ILIKE '%' || btrim($1) || '%')
    AND ($2 IS NULL OR $2 = 'all' OR i.family = $2)
    AND ($3 IS NULL OR $3 = 'all' OR i.module = $3)
    AND ($4 IS NULL OR $4 = 'all' OR i.sub_module = $4)
    AND ($5 IS NULL OR $5 = 'all' OR i.rule_type = $5)
    AND ($6 IS NULL OR $6 = 'all' OR i.status = $6)
    AND ($7 IS NULL OR $7 = 'all' OR i.severity = $7)
    AND ($8 IS NULL OR $8 = 'all' OR i.tags @> ARRAY[$8])
    AND ($9 IS NULL OR i.last_triggered_at >= $9)
    AND ($10 IS NULL OR i.last_triggered_at <= $10)
  $w$;

  EXECUTE 'SELECT count(*) FROM public.rule_inventory i WHERE ' || v_where
  INTO v_total
  USING _search, _family, _module, _sub_module, _rule_type, _status, _severity, _tag,
        _triggered_from, _triggered_to;

  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
             'owner_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = x.owner_user_id),
             'modified_by_name', (SELECT p.full_name FROM public.profiles p WHERE p.id = x.last_modified_by)
           )), '[]'::jsonb)
    FROM (
      SELECT * FROM public.rule_inventory i
      WHERE %1$s
      ORDER BY i.%2$I %3$s NULLS LAST, i.rule_code ASC
      LIMIT %4$s OFFSET %5$s
    ) x
  $q$, v_where, v_sort, v_dir, v_limit, v_offset)
  INTO v_rows
  USING _search, _family, _module, _sub_module, _rule_type, _status, _severity, _tag,
        _triggered_from, _triggered_to;

  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE status = 'active'),
    'draft', count(*) FILTER (WHERE status = 'draft'),
    'inactive', count(*) FILTER (WHERE status = 'inactive'),
    'never_executed', count(*) FILTER (WHERE coalesce(trigger_count,0) = 0),
    'never_tested', count(*) FILTER (WHERE last_tested_at IS NULL AND capabilities->>'test' = 'true'),
    'stale_tests', count(*) FILTER (WHERE capabilities->>'test' = 'true'
                     AND last_tested_at IS NOT NULL AND last_tested_at < now() - interval '90 days'),
    'families', (
      SELECT jsonb_object_agg(f.fam, coalesce(c.cnt, 0))
      FROM unnest(v_families) AS f(fam)
      LEFT JOIN (SELECT family, count(*) AS cnt FROM public.rule_inventory GROUP BY family) c
             ON c.family = f.fam
    ),
    'failing', (
      SELECT count(DISTINCT e.rule_id) FROM public.engine_rule_executions e
       WHERE e.executed_at > now() - interval '30 days' AND e.reason ILIKE 'error%'
    )
  ) INTO v_kpi
  FROM public.rule_inventory;

  SELECT jsonb_build_object(
    'modules', (SELECT coalesce(jsonb_agg(DISTINCT i.module), '[]'::jsonb)
                  FROM public.rule_inventory i WHERE i.module IS NOT NULL),
    'sub_modules', (SELECT coalesce(jsonb_agg(DISTINCT i.sub_module), '[]'::jsonb)
                  FROM public.rule_inventory i WHERE i.sub_module IS NOT NULL),
    'rule_types', (SELECT coalesce(jsonb_agg(DISTINCT i.rule_type), '[]'::jsonb)
                  FROM public.rule_inventory i WHERE i.rule_type IS NOT NULL),
    'severities', (SELECT coalesce(jsonb_agg(DISTINCT i.severity), '[]'::jsonb)
                  FROM public.rule_inventory i WHERE i.severity IS NOT NULL),
    'tags', (SELECT coalesce(jsonb_agg(DISTINCT tg), '[]'::jsonb)
                  FROM public.rule_inventory i, unnest(coalesce(i.tags, ARRAY[]::text[])) AS t(tg))
  ) INTO v_facets;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'kpis', v_kpi, 'facets', v_facets);
END; $function$;

GRANT EXECUTE ON FUNCTION public.rule_inventory_search(text,text,text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_deactivate_rule_engine(uuid) TO authenticated;