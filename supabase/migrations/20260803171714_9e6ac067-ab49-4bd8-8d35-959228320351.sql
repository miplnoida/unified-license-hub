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
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_total int;
  v_kpi jsonb;
  v_sort text := lower(coalesce(_sort,'last_modified_at'));
  v_dir text := CASE WHEN lower(coalesce(_dir,'desc')) = 'asc' THEN 'ASC' ELSE 'DESC' END;
  v_limit int := least(greatest(coalesce(_limit,50),1),200);
  v_offset int := greatest(coalesce(_offset,0),0);
  v_where text;
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
                     AND (last_tested_at IS NULL OR last_tested_at < now() - interval '90 days')),
    'families', (SELECT jsonb_object_agg(f.family, f.c) FROM (
                   SELECT family, count(*) AS c FROM public.rule_inventory GROUP BY family) f),
    'failing', (SELECT count(*) FROM public.engine_rule_executions e
                 WHERE e.executed_at > now() - interval '30 days' AND e.reason ILIKE 'error%')
  ) INTO v_kpi
  FROM public.rule_inventory;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'kpis', v_kpi);
END; $$;

REVOKE ALL ON FUNCTION public.rule_inventory_search(text,text,text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rule_inventory_search(text,text,text,text,text,text,text,text,timestamptz,timestamptz,text,text,integer,integer) TO authenticated;