-- =====================================================================
-- Canonical effective-regulator contract (generic supervisory platform)
-- Master regulators <> active selectable regulators <> platform reference.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_authorised_regulator_options(
  _domain_code text DEFAULT NULL, _capability text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _d text := NULLIF(upper(btrim(COALESCE(_domain_code,''))),'');
  _perm text := NULLIF(btrim(COALESCE(_capability,'')),'');
  _mod text; _act text;
  _super boolean; _oversight boolean;
  _rows jsonb := '[]'::jsonb;
  _selectable int := 0;
  _active jsonb := NULL;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  IF _perm IS NULL AND _d IS NOT NULL THEN
    SELECT manage_config_permission INTO _perm
      FROM public.supervisory_domain_authority WHERE domain_code = _d;
  END IF;

  _mod := NULLIF(split_part(COALESCE(_perm,''),'.',1),'');
  _act := NULLIF(split_part(COALESCE(_perm,''),'.',2),'');

  _super     := public.is_super_admin(_uid);
  _oversight := public.supervisory_methodology_oversight_reader(_uid);

  -- Only ACTIVE regulators are ever operationally selectable. Inactive and
  -- retired rows stay in the master for history; they are never new targets.
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb)
    INTO _rows
    FROM (
      SELECT jsonb_build_object(
               'id', r.id, 'code', r.code, 'name', r.name, 'status', r.status,
               'selectable', true, 'reason', NULL::text) AS x
        FROM public.regulators r
       WHERE r.status = 'active'
         AND (_super
              OR (_mod IS NOT NULL
                  AND public.user_has_regulator_authority(_uid, _mod, COALESCE(_act,'view'), r.id)))
    ) s;

  _selectable := jsonb_array_length(_rows);
  IF _selectable = 1 THEN _active := _rows->0; END IF;

  RETURN jsonb_build_object(
    'selectable_count', _selectable,
    'cross_regulator_allowed', (_selectable > 1 AND (_super OR _oversight)),
    'active_regulator', _active,
    'regulators', _rows,
    'reason', CASE WHEN _selectable = 0
                   THEN 'No active regulator is available in your authorised scope.'
                   ELSE NULL END);
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_authorised_regulator_options(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_authorised_regulator_options(text, text) TO authenticated;

-- =====================================================================
-- Methodology register options: operationally valid regulators only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_register_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _out jsonb; _scope jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  _scope := public.supervisory_authorised_regulator_options('AML_CFT', NULL);

  SELECT jsonb_build_object(
    'domains', (SELECT COALESCE(jsonb_agg(DISTINCT m.domain_code), '[]'::jsonb)
                  FROM supervisory_methodology m),
    'origins', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                          'value', m.origin,
                          'label', supervisory_methodology_origin_label(m.origin))), '[]'::jsonb)
                  FROM supervisory_methodology m WHERE m.origin IS NOT NULL),
    'statuses', (SELECT COALESCE(jsonb_agg(DISTINCT m.status), '[]'::jsonb)
                   FROM supervisory_methodology m),
    'regulators', COALESCE(_scope->'regulators', '[]'::jsonb),
    'selectable_regulator_count', COALESCE((_scope->>'selectable_count')::int, 0),
    'cross_regulator_allowed', COALESCE((_scope->>'cross_regulator_allowed')::boolean, false),
    'active_regulator', _scope->'active_regulator',
    'regulator_scope_reason', _scope->>'reason',
    'sectors', (SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                         'id', s.id, 'name', s.name)), '[]'::jsonb)
                  FROM supervisory_methodology m
                  JOIN sectors s ON s.id = m.sector_id
                                 OR s.id = ANY (COALESCE(m.applicable_sector_ids, '{}'::uuid[]))),
    'approval_states', jsonb_build_array('NOT_RECORDED', 'APPROVED', 'REVOKED')
  ) INTO _out;

  RETURN _out;
END $function$;

-- =====================================================================
-- Policy Profile register options: same contract
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_register_options()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _scope jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _scope := public.supervisory_authorised_regulator_options('AML_CFT', NULL);
  RETURN jsonb_build_object(
    'domains', (SELECT COALESCE(jsonb_agg(jsonb_build_object('domain_code', domain_code,
                        'policy_approval_permission', policy_approval_permission)
                        ORDER BY domain_code), '[]'::jsonb)
                  FROM public.supervisory_domain_authority),
    'statuses', jsonb_build_array('DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED','RETIRED'),
    'origins', jsonb_build_array('MIPL_REFERENCE','REGULATOR_ADOPTED','REGULATOR_AUTHORED'),
    'component_types', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'component_type', component_type, 'label', label,
                          'description', description, 'is_available', is_available,
                          'default_requirement', default_requirement) ORDER BY sort_order), '[]'::jsonb)
                          FROM public.supervisory_policy_component_type),
    'regulators', COALESCE(_scope->'regulators', '[]'::jsonb),
    'selectable_regulator_count', COALESCE((_scope->>'selectable_count')::int, 0),
    'cross_regulator_allowed', COALESCE((_scope->>'cross_regulator_allowed')::boolean, false),
    'active_regulator', _scope->'active_regulator',
    'regulator_scope_reason', _scope->>'reason');
END $function$;

-- =====================================================================
-- Adoption targets: active + authorised + eligible only
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_methodology_adoption_targets(_methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _m record;
  _manage_perm text;
  _domain_registered boolean := false;
  _super boolean;
  _rows jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM supervisory_methodology WHERE id = _methodology_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Methodology not found or not visible' USING ERRCODE = '42501';
  END IF;

  IF _m.origin <> 'MIPL_REFERENCE' THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0,
      'reason', 'Only a MIPL reference template can be adopted.');
  END IF;

  SELECT true, manage_config_permission INTO _domain_registered, _manage_perm
    FROM supervisory_domain_authority WHERE domain_code = _m.domain_code;

  IF NOT COALESCE(_domain_registered, false) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0,
      'reason', 'No configuration authority is registered for this supervisory domain.');
  END IF;

  _super := is_super_admin(_uid);

  IF NOT (_super OR (_manage_perm IS NOT NULL
        AND has_permission(_uid, split_part(_manage_perm, '.', 1), split_part(_manage_perm, '.', 2)))) THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total_count', 0,
      'reason', 'You do not hold methodology configuration authority for this domain.');
  END IF;

  -- Only ACTIVE regulators may become new adoption owners. Inactive/retired
  -- regulators remain in the master for historical records.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'code', r.code, 'name', r.name, 'status', r.status,
           'already_adopted', EXISTS (SELECT 1 FROM supervisory_methodology c
                                       WHERE c.adopted_from_id = _m.id AND c.regulator_id = r.id),
           'resulting_version', _m.version || '+' || r.code
         ) ORDER BY r.name), '[]'::jsonb)
    INTO _rows
    FROM regulators r
   WHERE r.status = 'active'
     AND (_super
      OR (_manage_perm IS NOT NULL
          AND user_has_regulator_authority(_uid, split_part(_manage_perm, '.', 1),
                                            split_part(_manage_perm, '.', 2), r.id)));

  RETURN jsonb_build_object(
    'rows', _rows,
    'total_count', jsonb_array_length(_rows),
    'reference', jsonb_build_object('id', _m.id, 'code', _m.code, 'version', _m.version,
                                    'origin', _m.origin,
                                    'origin_label', supervisory_methodology_origin_label(_m.origin)),
    'reason', CASE WHEN jsonb_array_length(_rows) = 0
                   THEN 'No active regulator is available in your authorised scope.'
                   ELSE NULL END
  );
END $function$;

-- =====================================================================
-- New regulator-owned work may never target an inactive/retired regulator
-- =====================================================================
CREATE OR REPLACE FUNCTION public.supervisory_domain_require_manage_for_regulator(
  _domain_code text, _regulator_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _d text; _perm text; _reg text; _status text;
BEGIN
  _d := upper(btrim(COALESCE(_domain_code,'')));
  _uid := public.supervisory_domain_require_manage(_d);   -- authentication + domain permission

  SELECT code, status INTO _reg, _status FROM public.regulators WHERE id = _regulator_id;
  IF _reg IS NULL THEN
    RAISE EXCEPTION 'not_found: regulator' USING ERRCODE = '22023'; END IF;

  IF _status <> 'active' THEN
    RAISE EXCEPTION 'not_selectable: regulator % is % and cannot own new supervisory configuration; historical records are preserved', _reg, _status
      USING ERRCODE = '22023'; END IF;

  -- Platform administration may operate for any regulator (technical authority only).
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;

  SELECT manage_config_permission INTO _perm
    FROM public.supervisory_domain_authority WHERE domain_code = _d;

  IF public.user_has_regulator_authority(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _regulator_id) THEN
    RETURN _uid; END IF;

  RAISE EXCEPTION 'not_authorized: % is held without authority to act for regulator %; the caller-supplied regulator is a target, not authority', _perm, _reg
    USING ERRCODE = '42501';
END $function$;
