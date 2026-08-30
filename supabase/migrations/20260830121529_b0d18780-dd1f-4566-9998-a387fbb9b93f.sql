CREATE OR REPLACE FUNCTION public.entity_ubo_resolve(
  _entity_id uuid, _as_of date DEFAULT CURRENT_DATE,
  _max_depth int DEFAULT 10, _max_nodes int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); v_reg uuid; v_pol jsonb; v_p jsonb; v_net jsonb;
  v_ubos jsonb; v_unres jsonb; v_ot numeric; v_vt numeric; v_ctrl boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _max_depth IS NULL OR _max_depth < 1 OR _max_depth > 25 THEN
    RAISE EXCEPTION 'INVALID_DEPTH_LIMIT' USING ERRCODE='22023';
  END IF;
  IF _max_nodes IS NULL OR _max_nodes < 1 OR _max_nodes > 1000 THEN
    RAISE EXCEPTION 'INVALID_NODE_LIMIT' USING ERRCODE='22023';
  END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'entity_structure','view')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  v_reg := public.entity_reporting_regulator(_entity_id);
  IF NOT public.regulatory_scope_allows(uid,'entity_structure','view', v_reg, NULL, NULL, _entity_id, NULL) THEN
    RAISE EXCEPTION 'REGULATOR_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;

  v_pol := public.ubo_policy_resolve(v_reg, COALESCE(_as_of, CURRENT_DATE));
  IF v_pol->>'status' <> 'RESOLVED' THEN
    RETURN jsonb_build_object('status','CONFIGURATION_REQUIRED','entity_id',_entity_id,
      'regulator_id', v_reg, 'as_of', COALESCE(_as_of, CURRENT_DATE),
      'reason','UBO_POLICY_NOT_CONFIGURED','policy', NULL,
      'ubos','[]'::jsonb,'unresolved','[]'::jsonb);
  END IF;
  v_p := v_pol->'policy';
  v_ot := (v_p->>'ownership_threshold')::numeric;
  v_vt := (v_p->>'voting_threshold')::numeric;
  v_ctrl := (v_p->>'control_test_enabled')::boolean;

  v_net := public.entity_ownership_network_core(_entity_id, COALESCE(_as_of, CURRENT_DATE), _max_depth, _max_nodes);

  SELECT COALESCE(jsonb_agg(x ORDER BY ord DESC, pid), '[]'::jsonb) INTO v_ubos FROM (
    SELECT (n->>'party_id')::uuid pid,
           COALESCE((n->>'economic_percentage')::numeric,0) ord,
           n || jsonb_build_object('qualification_reasons', r.reasons) AS x
      FROM jsonb_array_elements(v_net->'nodes') n
      CROSS JOIN LATERAL (
        SELECT (CASE WHEN COALESCE((n->>'economic_percentage')::numeric,0) >= v_ot
                     THEN jsonb_build_array('ECONOMIC_THRESHOLD') ELSE '[]'::jsonb END
             || CASE WHEN COALESCE((n->>'voting_percentage')::numeric,0) >= v_vt
                     THEN jsonb_build_array('VOTING_THRESHOLD') ELSE '[]'::jsonb END
             || CASE WHEN v_ctrl AND COALESCE((n->>'controller_on_path')::boolean,false)
                     THEN jsonb_build_array('CONTROL_DETERMINATION') ELSE '[]'::jsonb END
             || CASE WHEN COALESCE((n->>'is_natural_person')::boolean,false)
                       AND COALESCE((n->>'terminal')::boolean,false)
                     THEN jsonb_build_array('NATURAL_PERSON_TERMINATION') ELSE '[]'::jsonb END
               ) reasons) r
     WHERE jsonb_array_length(r.reasons) > 0
  ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY pid), '[]'::jsonb) INTO v_unres FROM (
    SELECT (n->>'party_id')::uuid pid,
      jsonb_build_object('party_id', n->'party_id', 'display_name', n->'display_name',
        'party_kind', n->'party_kind', 'min_depth', n->'min_depth',
        'economic_percentage', n->'economic_percentage',
        'reason', CASE
          WHEN COALESCE((n->>'is_legal_arrangement')::boolean,false) THEN 'TRUST_LEGAL_ARRANGEMENT'
          WHEN COALESCE((n->>'is_regulated')::boolean,false) THEN 'NO_UPSTREAM_DATA'
          ELSE 'FOREIGN_UNIDENTIFIED' END) AS x
      FROM jsonb_array_elements(v_net->'nodes') n
     WHERE COALESCE((n->>'terminal')::boolean,false)
       AND NOT COALESCE((n->>'is_natural_person')::boolean,false)
  ) s;

  IF COALESCE((v_net->>'cycle_detected')::boolean,false) THEN
    v_unres := v_unres || jsonb_build_array(jsonb_build_object('reason','CYCLE','detail', v_net->'cycles'));
  END IF;
  IF (v_net->'truncation_reasons') @> '["DEPTH_LIMIT"]'::jsonb THEN
    v_unres := v_unres || jsonb_build_array(jsonb_build_object('reason','DEPTH_LIMIT','detail', v_net->'frontier'));
  END IF;
  IF (v_net->'truncation_reasons') @> '["NODE_LIMIT"]'::jsonb THEN
    v_unres := v_unres || jsonb_build_array(jsonb_build_object('reason','NODE_LIMIT',
      'detail', jsonb_build_object('discovered', v_net->'discovered_node_count',
                                   'returned', v_net->'node_count')));
  END IF;

  RETURN jsonb_build_object('status','RESOLVED','entity_id',_entity_id,'regulator_id',v_reg,
    'as_of', COALESCE(_as_of, CURRENT_DATE), 'policy', v_p,
    'ubos', v_ubos, 'unresolved', v_unres,
    'truncated', v_net->'truncated', 'cycle_detected', v_net->'cycle_detected',
    'network_node_count', v_net->'node_count');
END $function$;

REVOKE ALL ON FUNCTION public.entity_ubo_resolve(uuid,date,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_ubo_resolve(uuid,date,int,int) TO authenticated, service_role;