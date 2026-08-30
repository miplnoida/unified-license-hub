-- ===========================================================================
-- F8A-B2 — deterministic ownership traversal + configurable UBO
-- ===========================================================================

-- 1. CANONICAL OWNERSHIP EDGE = PARTY -> PARTY -------------------------------
ALTER TABLE public.ownership_interests
  ADD COLUMN IF NOT EXISTS owned_party_id uuid REFERENCES public.parties(id) ON DELETE RESTRICT;

UPDATE public.ownership_interests o
   SET owned_party_id = l.party_id
  FROM public.licensees l
 WHERE o.owned_entity_id = l.id AND o.owned_party_id IS NULL;

ALTER TABLE public.ownership_interests ALTER COLUMN owned_entity_id DROP NOT NULL;

ALTER TABLE public.ownership_interests
  DROP CONSTRAINT IF EXISTS ownership_interests_owned_target_present;
ALTER TABLE public.ownership_interests
  ADD CONSTRAINT ownership_interests_owned_target_present
  CHECK (owned_party_id IS NOT NULL OR owned_entity_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.ownership_interests_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v_owned_party uuid; v_owned_entity uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = NEW.owner_party_id) THEN
    RAISE EXCEPTION 'Ownership owner_party_id % is not a canonical party', NEW.owner_party_id;
  END IF;

  -- Canonical edge is party -> party. A regulated owned party ALSO resolves to
  -- licensees.id; a non-regulated organization/trust/foundation/partnership
  -- never requires a fake licensee row.
  IF NEW.owned_entity_id IS NOT NULL THEN
    SELECT party_id INTO v_owned_party FROM public.licensees WHERE id = NEW.owned_entity_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ownership owned_entity_id % is not a regulated entity', NEW.owned_entity_id;
    END IF;
    IF NEW.owned_party_id IS NULL THEN
      NEW.owned_party_id := v_owned_party;
    ELSIF v_owned_party IS NOT NULL AND NEW.owned_party_id <> v_owned_party THEN
      RAISE EXCEPTION 'Ownership owned_party_id % does not match the regulated entity party %',
        NEW.owned_party_id, v_owned_party;
    END IF;
  END IF;

  IF NEW.owned_party_id IS NULL THEN
    RAISE EXCEPTION 'Ownership requires a canonical owned party';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = NEW.owned_party_id) THEN
    RAISE EXCEPTION 'Ownership owned_party_id % is not a canonical party', NEW.owned_party_id;
  END IF;

  IF NEW.owned_entity_id IS NULL THEN
    SELECT id INTO v_owned_entity FROM public.licensees WHERE party_id = NEW.owned_party_id;
    NEW.owned_entity_id := v_owned_entity;  -- NULL for non-regulated targets
  END IF;

  IF NEW.owner_party_id = NEW.owned_party_id THEN
    RAISE EXCEPTION 'Self-ownership is not valid: owner party equals the owned party';
  END IF;

  IF NEW.economic_interest_percentage IS NOT NULL
     AND (NEW.economic_interest_percentage < 0 OR NEW.economic_interest_percentage > 100) THEN
    RAISE EXCEPTION 'economic_interest_percentage must be between 0 and 100';
  END IF;
  IF NEW.voting_rights_percentage IS NOT NULL
     AND (NEW.voting_rights_percentage < 0 OR NEW.voting_rights_percentage > 100) THEN
    RAISE EXCEPTION 'voting_rights_percentage must be between 0 and 100';
  END IF;
  IF NEW.beneficial_interest_percentage IS NOT NULL
     AND (NEW.beneficial_interest_percentage < 0 OR NEW.beneficial_interest_percentage > 100) THEN
    RAISE EXCEPTION 'beneficial_interest_percentage must be between 0 and 100';
  END IF;
  IF NEW.shares_held IS NOT NULL AND NEW.total_shares IS NOT NULL
     AND NEW.shares_held > NEW.total_shares THEN
    RAISE EXCEPTION 'shares_held cannot exceed total_shares';
  END IF;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_from IS NOT NULL
     AND NEW.effective_to < NEW.effective_from THEN
    RAISE EXCEPTION 'effective_from must be on or before effective_to';
  END IF;
  IF NEW.ownership_type_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ownership_types WHERE id = NEW.ownership_type_id AND is_active) THEN
    RAISE EXCEPTION 'ownership_type_id must reference an active ownership type';
  END IF;
  RETURN NEW;
END $function$;

-- 6. INDEXES PROVEN BY THE TRAVERSAL ---------------------------------------
-- downward key (owned side) and reverse/party key (owner side), both partial
-- to the effective approved structural edge set the walk actually reads.
CREATE INDEX IF NOT EXISTS idx_ownership_owned_party_effective
  ON public.ownership_interests (owned_party_id, effective_from, effective_to)
  WHERE superseded_at IS NULL AND is_direct;
CREATE INDEX IF NOT EXISTS idx_ownership_owner_party_effective
  ON public.ownership_interests (owner_party_id, effective_from, effective_to)
  WHERE superseded_at IS NULL AND is_direct;

-- 3. GOVERNED, EFFECTIVE-DATED UBO POLICY ----------------------------------
CREATE TABLE IF NOT EXISTS public.ubo_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE RESTRICT,
  ownership_threshold numeric NOT NULL CHECK (ownership_threshold > 0 AND ownership_threshold <= 100),
  voting_threshold numeric NOT NULL CHECK (voting_threshold > 0 AND voting_threshold <= 100),
  control_test_enabled boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')),
  approved_by uuid,
  approved_at timestamp with time zone,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ubo_policies_effective_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

GRANT SELECT ON public.ubo_policies TO authenticated;
GRANT ALL ON public.ubo_policies TO service_role;
ALTER TABLE public.ubo_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal staff read UBO policy" ON public.ubo_policies;
CREATE POLICY "Internal staff read UBO policy" ON public.ubo_policies
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'entity_structure', 'view'));

CREATE INDEX IF NOT EXISTS idx_ubo_policies_scope
  ON public.ubo_policies (regulator_id, effective_from DESC, status);

CREATE TRIGGER trg_ubo_policies_updated_at
  BEFORE UPDATE ON public.ubo_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.config_governed_tables (
  table_name, domain, required_module_key, required_create_action, required_edit_action,
  soft_delete_column, soft_delete_retired_value, allow_hard_delete, immutable_columns, notes)
VALUES ('ubo_policies','entity_network','entity_structure','approve','approve',
        'status','RETIRED', false, ARRAY['id','created_at','created_by']::text[],
        'Effective-dated beneficial-ownership threshold policy per regulator')
ON CONFLICT (table_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_upsert_ubo_policy(_id uuid, _payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_old jsonb; v_id uuid; v_reg uuid; v_from date; v_status text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT (public.is_super_admin(uid)
          OR public.has_permission(uid,'entity_structure','approve')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF _payload IS NULL OR jsonb_typeof(_payload) <> 'object' THEN
    RAISE EXCEPTION 'PAYLOAD_REQUIRED' USING ERRCODE='22023';
  END IF;

  v_reg := NULLIF(_payload->>'regulator_id','')::uuid;
  IF v_reg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = v_reg) THEN
    RAISE EXCEPTION 'INVALID_REGULATOR' USING ERRCODE='22023';
  END IF;
  IF _payload->>'ownership_threshold' IS NULL OR _payload->>'voting_threshold' IS NULL THEN
    RAISE EXCEPTION 'THRESHOLDS_REQUIRED' USING ERRCODE='22023';
  END IF;
  v_from := COALESCE(NULLIF(_payload->>'effective_from','')::date, CURRENT_DATE);
  v_status := COALESCE(NULLIF(_payload->>'status',''),'ACTIVE');

  IF _id IS NULL THEN
    IF v_status = 'ACTIVE' THEN
      UPDATE public.ubo_policies p
         SET status = 'SUPERSEDED',
             effective_to = LEAST(COALESCE(p.effective_to, v_from - 1), v_from - 1),
             updated_at = now()
       WHERE p.status = 'ACTIVE'
         AND p.regulator_id IS NOT DISTINCT FROM v_reg
         AND p.effective_from < v_from
         AND (p.effective_to IS NULL OR p.effective_to >= v_from);
    END IF;
    INSERT INTO public.ubo_policies (regulator_id, ownership_threshold, voting_threshold,
      control_test_enabled, effective_from, effective_to, version, status,
      approved_by, approved_at, notes, created_by)
    VALUES (v_reg,
      (_payload->>'ownership_threshold')::numeric,
      (_payload->>'voting_threshold')::numeric,
      COALESCE((_payload->>'control_test_enabled')::boolean, true),
      v_from, NULLIF(_payload->>'effective_to','')::date,
      COALESCE((_payload->>'version')::int,
               1 + COALESCE((SELECT max(version) FROM public.ubo_policies
                              WHERE regulator_id IS NOT DISTINCT FROM v_reg), 0)),
      v_status,
      CASE WHEN v_status = 'ACTIVE' THEN uid END,
      CASE WHEN v_status = 'ACTIVE' THEN now() END,
      NULLIF(_payload->>'notes',''), uid)
    RETURNING id INTO v_id;
  ELSE
    SELECT to_jsonb(x) INTO v_old FROM public.ubo_policies x WHERE x.id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'POLICY_NOT_FOUND' USING ERRCODE='22023'; END IF;
    UPDATE public.ubo_policies x SET
      ownership_threshold = (_payload->>'ownership_threshold')::numeric,
      voting_threshold = (_payload->>'voting_threshold')::numeric,
      control_test_enabled = COALESCE((_payload->>'control_test_enabled')::boolean, x.control_test_enabled),
      effective_from = v_from,
      effective_to = NULLIF(_payload->>'effective_to','')::date,
      status = v_status,
      version = x.version + 1,
      approved_by = uid, approved_at = now(),
      notes = COALESCE(NULLIF(_payload->>'notes',''), x.notes),
      updated_at = now()
     WHERE x.id = _id
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.config_change_log (table_name, record_id, action, old_data, new_data, reason, changed_by)
  VALUES ('ubo_policies', v_id, CASE WHEN _id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
          v_old, (SELECT to_jsonb(x) FROM public.ubo_policies x WHERE x.id = v_id),
          NULLIF(_payload->>'notes',''), uid);

  PERFORM public.create_audit_log(uid,'entity.ubo_policy.changed','ubo_policies', v_id::text,
    v_old, (SELECT to_jsonb(x) FROM public.ubo_policies x WHERE x.id = v_id), NULL);
  RETURN v_id;
END $function$;

-- Effective-dated resolution. Fails SAFE: no applicable policy => explicit
-- CONFIGURATION_REQUIRED, never an invented threshold.
CREATE OR REPLACE FUNCTION public.ubo_policy_resolve(_regulator_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE p record;
BEGIN
  SELECT * INTO p FROM public.ubo_policies x
   WHERE x.status = 'ACTIVE'
     AND x.effective_from <= COALESCE(_as_of, CURRENT_DATE)
     AND (x.effective_to IS NULL OR x.effective_to >= COALESCE(_as_of, CURRENT_DATE))
     AND (x.regulator_id IS NOT DISTINCT FROM _regulator_id OR x.regulator_id IS NULL)
   ORDER BY (x.regulator_id IS NOT DISTINCT FROM _regulator_id) DESC,
            x.effective_from DESC, x.version DESC, x.id
   LIMIT 1;

  IF p.id IS NULL THEN
    RETURN jsonb_build_object('status','CONFIGURATION_REQUIRED','regulator_id',_regulator_id,
      'as_of', COALESCE(_as_of, CURRENT_DATE), 'policy', NULL);
  END IF;

  RETURN jsonb_build_object('status','RESOLVED','regulator_id',_regulator_id,
    'as_of', COALESCE(_as_of, CURRENT_DATE),
    'policy', jsonb_build_object('id',p.id,'regulator_id',p.regulator_id,
      'scope', CASE WHEN p.regulator_id IS NULL THEN 'GLOBAL' ELSE 'REGULATOR' END,
      'ownership_threshold',p.ownership_threshold,'voting_threshold',p.voting_threshold,
      'control_test_enabled',p.control_test_enabled,'effective_from',p.effective_from,
      'effective_to',p.effective_to,'version',p.version,'status',p.status,
      'approved_by',p.approved_by,'approved_at',p.approved_at));
END $function$;

-- 2. DETERMINISTIC TRAVERSAL CORE ------------------------------------------
-- Internal: no authorization, never granted to anon/authenticated. Both public
-- RPCs authorize first, then call this.
CREATE OR REPLACE FUNCTION public.entity_ownership_network_core(
  _entity_id uuid, _as_of date, _max_depth int, _max_nodes int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seed uuid; v_reg uuid; v_out jsonb; v_nodes jsonb; v_edges jsonb;
  v_cycles jsonb; v_frontier jsonb; v_node_count int; v_trunc_depth boolean;
BEGIN
  SELECT l.party_id INTO v_seed FROM public.licensees l WHERE l.id = _entity_id;
  IF v_seed IS NULL THEN
    RAISE EXCEPTION 'SEED_ENTITY_NOT_CANONICAL' USING ERRCODE='22023';
  END IF;
  v_reg := public.entity_reporting_regulator(_entity_id);

  CREATE TEMP TABLE IF NOT EXISTS _b2_walk (
    edge_id uuid, owner_party_id uuid, owned_party_id uuid, depth int, path uuid[],
    ec_prod numeric, vt_prod numeric, ctrl_path boolean, ec_missing boolean,
    vt_missing boolean, is_cycle boolean) ON COMMIT DROP;
  TRUNCATE _b2_walk;

  WITH RECURSIVE eff AS (
    SELECT o.id, o.owner_party_id, o.owned_party_id,
           o.economic_interest_percentage ec, o.voting_rights_percentage vt,
           o.is_controller
      FROM public.ownership_interests o
     WHERE o.superseded_at IS NULL
       AND o.approval_status = 'APPROVED'
       AND o.is_direct                     -- derived/indirect records are never structural edges
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
  )
  INSERT INTO _b2_walk SELECT * FROM walk;

  SELECT count(DISTINCT owner_party_id) INTO v_node_count FROM _b2_walk WHERE NOT is_cycle;
  SELECT EXISTS (SELECT 1 FROM _b2_walk w WHERE w.depth = _max_depth AND NOT w.is_cycle
                   AND EXISTS (SELECT 1 FROM public.ownership_interests o
                                WHERE o.owned_party_id = w.owner_party_id
                                  AND o.superseded_at IS NULL AND o.approval_status='APPROVED'
                                  AND o.is_direct
                                  AND o.effective_from::date <= _as_of
                                  AND (o.effective_to IS NULL OR o.effective_to::date > _as_of)))
    INTO v_trunc_depth;

  -- deterministic node retention when the node cap bites
  CREATE TEMP TABLE IF NOT EXISTS _b2_nodes (party_id uuid PRIMARY KEY, min_depth int) ON COMMIT DROP;
  TRUNCATE _b2_nodes;
  INSERT INTO _b2_nodes
  SELECT party_id, min_depth FROM (
    SELECT owner_party_id party_id, min(depth) min_depth
      FROM _b2_walk WHERE NOT is_cycle GROUP BY 1
      ORDER BY min(depth), owner_party_id
      LIMIT _max_nodes) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY min_depth, party_id), '[]'::jsonb) INTO v_nodes FROM (
    SELECT n.party_id, n.min_depth,
      jsonb_build_object(
        'party_id', n.party_id,
        'display_name', p.display_name,
        'party_kind', p.party_kind,
        'is_natural_person', COALESCE(pk.is_natural_person, false),
        'is_legal_arrangement', COALESCE(pk.is_legal_arrangement, false),
        'is_regulated', l.id IS NOT NULL,
        'licensee_id', l.id,
        'min_depth', n.min_depth,
        'path_count', agg.paths,
        'economic_percentage', round(agg.ec * 100, 6),
        'voting_percentage', round(agg.vt * 100, 6),
        'economic_incomplete', agg.ec_missing,
        'voting_incomplete', agg.vt_missing,
        'controller_on_path', agg.ctrl,
        'recorded_ubo_declared', COALESCE(dec.declared, false),
        'terminal', NOT EXISTS (
          SELECT 1 FROM public.ownership_interests o
           WHERE o.owned_party_id = n.party_id AND o.superseded_at IS NULL
             AND o.approval_status='APPROVED' AND o.is_direct
             AND o.effective_from::date <= _as_of
             AND (o.effective_to IS NULL OR o.effective_to::date > _as_of))
      ) AS x
      FROM _b2_nodes n
      JOIN public.parties p ON p.id = n.party_id
      LEFT JOIN public.party_kinds pk ON pk.key = p.party_kind
      LEFT JOIN public.licensees l ON l.party_id = n.party_id
      CROSS JOIN LATERAL (
        SELECT count(DISTINCT w.path) paths, sum(w.ec_prod) ec, sum(w.vt_prod) vt,
               bool_or(w.ctrl_path) ctrl, bool_or(w.ec_missing) ec_missing,
               bool_or(w.vt_missing) vt_missing
          FROM _b2_walk w WHERE w.owner_party_id = n.party_id AND NOT w.is_cycle) agg
      LEFT JOIN LATERAL (
        SELECT bool_or(o.is_ubo) declared FROM public.ownership_interests o
         WHERE o.owner_party_id = n.party_id AND o.superseded_at IS NULL) dec ON true
  ) s;

  SELECT COALESCE(jsonb_agg(x ORDER BY depth, edge_id), '[]'::jsonb) INTO v_edges FROM (
    SELECT w.depth, w.edge_id, jsonb_build_object(
      'id', o.id, 'depth', w.depth,
      'owner_party_id', o.owner_party_id, 'owned_party_id', o.owned_party_id,
      'owned_entity_id', o.owned_entity_id,
      'owned_is_regulated', o.owned_entity_id IS NOT NULL,
      'economic_interest_percentage', o.economic_interest_percentage,
      'voting_rights_percentage', o.voting_rights_percentage,
      'is_controller', o.is_controller,
      'ownership_type', ot.key,
      'effective_from', o.effective_from, 'effective_to', o.effective_to,
      'approval_status', o.approval_status, 'approved_by', o.approved_by,
      'source_change_set_id', o.source_change_set_id,
      'source_submission_id', o.source_submission_id,
      'recorded_at', o.recorded_at) AS x
      FROM (SELECT DISTINCT edge_id, min(depth) OVER (PARTITION BY edge_id) depth
              FROM _b2_walk WHERE NOT is_cycle) w
      JOIN public.ownership_interests o ON o.id = w.edge_id
      LEFT JOIN public.ownership_types ot ON ot.id = o.ownership_type_id
     WHERE EXISTS (SELECT 1 FROM _b2_nodes n WHERE n.party_id = o.owner_party_id)
  ) s;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'edge_id', edge_id, 'party_id', owner_party_id, 'depth', depth,
           'reason','CYCLE')), '[]'::jsonb) INTO v_cycles
    FROM _b2_walk WHERE is_cycle;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'party_id', w.owner_party_id, 'depth', w.depth, 'reason','DEPTH_LIMIT')),
         '[]'::jsonb) INTO v_frontier
    FROM _b2_walk w
   WHERE w.depth = _max_depth AND NOT w.is_cycle
     AND EXISTS (SELECT 1 FROM public.ownership_interests o
                  WHERE o.owned_party_id = w.owner_party_id AND o.superseded_at IS NULL
                    AND o.approval_status='APPROVED' AND o.is_direct
                    AND o.effective_from::date <= _as_of
                    AND (o.effective_to IS NULL OR o.effective_to::date > _as_of));

  v_out := jsonb_build_object(
    'seed', jsonb_build_object('entity_id', _entity_id, 'party_id', v_seed, 'regulator_id', v_reg),
    'as_of', _as_of, 'max_depth', _max_depth, 'max_nodes', _max_nodes,
    'node_count', jsonb_array_length(v_nodes), 'discovered_node_count', v_node_count,
    'nodes', v_nodes, 'edges', v_edges, 'cycles', v_cycles, 'frontier', v_frontier,
    'cycle_detected', jsonb_array_length(v_cycles) > 0,
    'truncated', COALESCE(v_trunc_depth,false) OR v_node_count > _max_nodes,
    'truncation_reasons', (
      CASE WHEN COALESCE(v_trunc_depth,false) THEN jsonb_build_array('DEPTH_LIMIT') ELSE '[]'::jsonb END
      || CASE WHEN v_node_count > _max_nodes THEN jsonb_build_array('NODE_LIMIT') ELSE '[]'::jsonb END));
  RETURN v_out;
END $function$;

CREATE OR REPLACE FUNCTION public.entity_ownership_network(
  _entity_id uuid, _as_of date DEFAULT CURRENT_DATE,
  _max_depth int DEFAULT 10, _max_nodes int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); v_reg uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _entity_id IS NULL THEN RAISE EXCEPTION 'ENTITY_REQUIRED' USING ERRCODE='22023'; END IF;
  IF _max_depth IS NULL OR _max_depth < 1 OR _max_depth > 25 THEN
    RAISE EXCEPTION 'INVALID_DEPTH_LIMIT' USING ERRCODE='22023';
  END IF;
  IF _max_nodes IS NULL OR _max_nodes < 1 OR _max_nodes > 1000 THEN
    RAISE EXCEPTION 'INVALID_NODE_LIMIT' USING ERRCODE='22023';
  END IF;

  -- internal only: entity memberships never reach the network
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid,'entity_structure','view')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  v_reg := public.entity_reporting_regulator(_entity_id);
  IF NOT public.regulatory_scope_allows(uid,'entity_structure','view', v_reg, NULL, NULL, _entity_id, NULL) THEN
    RAISE EXCEPTION 'REGULATOR_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN public.entity_ownership_network_core(_entity_id, COALESCE(_as_of, CURRENT_DATE), _max_depth, _max_nodes);
END $function$;

-- 4. UBO RESOLUTION --------------------------------------------------------
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
  ) s
  UNION ALL SELECT NULL, NULL WHERE false;

  -- cycle and limit conditions are explicit unresolved states, not silent gaps
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

-- 5. EXECUTION CONTRACT ----------------------------------------------------
REVOKE ALL ON FUNCTION public.entity_ownership_network_core(uuid,date,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_ownership_network(uuid,date,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_ubo_resolve(uuid,date,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ubo_policy_resolve(uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_ubo_policy(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_ownership_network(uuid,date,int,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_ubo_resolve(uuid,date,int,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ubo_policy_resolve(uuid,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_upsert_ubo_policy(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_ownership_network_core(uuid,date,int,int) TO service_role;
