CREATE OR REPLACE FUNCTION public.entity_ownership_network_core(
  _entity_id uuid, _as_of date, _max_depth int, _max_nodes int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_seed uuid; v_reg uuid; v_out jsonb;
BEGIN
  SELECT l.party_id INTO v_seed FROM public.licensees l WHERE l.id = _entity_id;
  IF v_seed IS NULL THEN
    RAISE EXCEPTION 'SEED_ENTITY_NOT_CANONICAL' USING ERRCODE='22023';
  END IF;
  v_reg := public.entity_reporting_regulator(_entity_id);

  WITH RECURSIVE eff AS (
    SELECT o.id, o.owner_party_id, o.owned_party_id,
           o.economic_interest_percentage ec, o.voting_rights_percentage vt,
           COALESCE(o.is_controller,false) is_controller
      FROM public.ownership_interests o
     WHERE o.superseded_at IS NULL
       AND o.approval_status = 'APPROVED'
       AND o.is_direct                    -- derived/indirect rows are never structural edges
       AND o.owned_party_id IS NOT NULL
       AND o.effective_from::date <= _as_of
       AND (o.effective_to IS NULL OR o.effective_to::date > _as_of)
  ), walk AS (
    SELECT e.id edge_id, e.owner_party_id, e.owned_party_id, 1 depth,
           ARRAY[v_seed, e.owner_party_id]::uuid[] path,
           COALESCE(e.ec,0)/100 ec_prod, COALESCE(e.vt,0)/100 vt_prod,
           e.is_controller ctrl_path, e.ec IS NULL ec_missing, e.vt IS NULL vt_missing,
           false is_cycle
      FROM eff e WHERE e.owned_party_id = v_seed
    UNION ALL
    SELECT e.id, e.owner_party_id, e.owned_party_id, w.depth + 1,
           w.path || e.owner_party_id,
           w.ec_prod * COALESCE(e.ec,0)/100, w.vt_prod * COALESCE(e.vt,0)/100,
           w.ctrl_path OR e.is_controller, w.ec_missing OR e.ec IS NULL,
           w.vt_missing OR e.vt IS NULL,
           e.owner_party_id = ANY (w.path)
      FROM walk w
      JOIN eff e ON e.owned_party_id = w.owner_party_id
     WHERE w.depth < _max_depth AND NOT w.is_cycle
  ), live AS (
    SELECT * FROM walk WHERE NOT is_cycle
  ), stat AS (
    SELECT owner_party_id pid, min(depth) min_depth, count(DISTINCT path) paths,
           sum(ec_prod) ec, sum(vt_prod) vt, bool_or(ctrl_path) ctrl,
           bool_or(ec_missing) ec_missing, bool_or(vt_missing) vt_missing
      FROM live GROUP BY 1
  ), kept AS (
    SELECT * FROM stat ORDER BY min_depth, pid LIMIT _max_nodes
  ), k AS (
    SELECT k.*, p.display_name, p.party_kind,
           COALESCE(pk.is_natural_person,false) natural_person,
           COALESCE(pk.is_legal_arrangement,false) legal_arrangement,
           l.id licensee_id,
           NOT EXISTS (SELECT 1 FROM eff u WHERE u.owned_party_id = k.pid) terminal,
           (SELECT bool_or(o.is_ubo) FROM public.ownership_interests o
             WHERE o.owner_party_id = k.pid AND o.superseded_at IS NULL) declared_ubo
      FROM kept k
      JOIN public.parties p ON p.id = k.pid
      LEFT JOIN public.party_kinds pk ON pk.key = p.party_kind
      LEFT JOIN public.licensees l ON l.party_id = k.pid
  ), nodes AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'party_id', pid, 'display_name', display_name, 'party_kind', party_kind,
        'is_natural_person', natural_person, 'is_legal_arrangement', legal_arrangement,
        'is_regulated', licensee_id IS NOT NULL, 'licensee_id', licensee_id,
        'min_depth', min_depth, 'path_count', paths,
        'economic_percentage', round(ec * 100, 6), 'voting_percentage', round(vt * 100, 6),
        'economic_incomplete', ec_missing, 'voting_incomplete', vt_missing,
        'controller_on_path', ctrl, 'recorded_ubo_declared', COALESCE(declared_ubo,false),
        'terminal', terminal) ORDER BY min_depth, pid), '[]'::jsonb) j
      FROM k
  ), edge_set AS (
    SELECT o.id, min(l.depth) depth
      FROM live l JOIN public.ownership_interests o ON o.id = l.edge_id
     WHERE EXISTS (SELECT 1 FROM kept x WHERE x.pid = o.owner_party_id)
     GROUP BY o.id
  ), edges AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', o.id, 'depth', es.depth,
        'owner_party_id', o.owner_party_id, 'owned_party_id', o.owned_party_id,
        'owned_entity_id', o.owned_entity_id,
        'owned_is_regulated', o.owned_entity_id IS NOT NULL,
        'economic_interest_percentage', o.economic_interest_percentage,
        'voting_rights_percentage', o.voting_rights_percentage,
        'is_controller', COALESCE(o.is_controller,false),
        'ownership_type', ot.key,
        'effective_from', o.effective_from, 'effective_to', o.effective_to,
        'approval_status', o.approval_status, 'approved_by', o.approved_by,
        'source_change_set_id', o.source_change_set_id,
        'source_submission_id', o.source_submission_id,
        'recorded_at', o.recorded_at) ORDER BY es.depth, o.id), '[]'::jsonb) j
      FROM edge_set es
      JOIN public.ownership_interests o ON o.id = es.id
      LEFT JOIN public.ownership_types ot ON ot.id = o.ownership_type_id
  ), cyc AS (
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'edge_id', edge_id, 'party_id', owner_party_id, 'depth', depth, 'reason','CYCLE')),
      '[]'::jsonb) j FROM walk WHERE is_cycle
  ), front AS (
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'party_id', w.owner_party_id, 'depth', w.depth, 'reason','DEPTH_LIMIT')),
      '[]'::jsonb) j
      FROM live w
     WHERE w.depth = _max_depth
       AND EXISTS (SELECT 1 FROM eff u WHERE u.owned_party_id = w.owner_party_id)
  ), counts AS (
    SELECT (SELECT count(*) FROM stat) discovered, (SELECT count(*) FROM kept) returned
  )
  SELECT jsonb_build_object(
      'seed', jsonb_build_object('entity_id', _entity_id, 'party_id', v_seed, 'regulator_id', v_reg),
      'as_of', _as_of, 'max_depth', _max_depth, 'max_nodes', _max_nodes,
      'node_count', c.returned, 'discovered_node_count', c.discovered,
      'nodes', n.j, 'edges', e.j, 'cycles', cy.j, 'frontier', f.j,
      'cycle_detected', jsonb_array_length(cy.j) > 0,
      'truncated', jsonb_array_length(f.j) > 0 OR c.discovered > c.returned,
      'truncation_reasons',
        (CASE WHEN jsonb_array_length(f.j) > 0 THEN jsonb_build_array('DEPTH_LIMIT') ELSE '[]'::jsonb END
         || CASE WHEN c.discovered > c.returned THEN jsonb_build_array('NODE_LIMIT') ELSE '[]'::jsonb END))
    INTO v_out
    FROM nodes n, edges e, cyc cy, front f, counts c;

  RETURN v_out;
END $function$;

REVOKE ALL ON FUNCTION public.entity_ownership_network_core(uuid,date,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_ownership_network_core(uuid,date,int,int) TO service_role;