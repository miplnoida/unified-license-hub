-- =====================================================================
-- AML-01 — Policy Profile read models
-- =====================================================================

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_register(
  _search text DEFAULT NULL, _domain_code text DEFAULT NULL, _origin text DEFAULT NULL,
  _status text DEFAULT NULL, _regulator_id uuid DEFAULT NULL,
  _sort text DEFAULT 'updated_at', _dir text DEFAULT 'desc',
  _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _rows jsonb; _total bigint; _lim int; _off int; _s text; _d text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _lim := LEAST(GREATEST(COALESCE(_limit,25),1),200);
  _off := GREATEST(COALESCE(_offset,0),0);
  _s := lower(COALESCE(NULLIF(_sort,''),'updated_at'));
  IF _s NOT IN ('updated_at','created_at','code','profile_version','status','origin','domain_code') THEN
    _s := 'updated_at'; END IF;
  _d := CASE WHEN lower(COALESCE(_dir,'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  WITH visible AS (
    SELECT p.*, r.code AS regulator_code, r.name AS regulator_name
      FROM public.supervisory_policy_profile p
      LEFT JOIN public.regulators r ON r.id = p.regulator_id
     WHERE public.supervisory_methodology_regulator_scope_readable(p.domain_code, p.regulator_id)
       AND (_domain_code IS NULL OR p.domain_code = upper(_domain_code))
       AND (_origin IS NULL OR p.origin = upper(_origin))
       AND (_status IS NULL OR p.status = upper(_status))
       AND (_regulator_id IS NULL OR p.regulator_id = _regulator_id)
       AND (_search IS NULL OR btrim(_search) = '' OR
            p.code ILIKE '%'||btrim(_search)||'%' OR p.name ILIKE '%'||btrim(_search)||'%'
            OR p.profile_version ILIKE '%'||btrim(_search)||'%')
  ), counted AS (SELECT count(*) n FROM visible),
  page AS (
    SELECT v.*,
           (SELECT count(*) FROM public.supervisory_policy_profile_requirement rq
             WHERE rq.profile_id = v.id AND rq.requirement = 'REQUIRED') AS required_components,
           (SELECT count(*) FROM public.supervisory_policy_profile_binding b
             WHERE b.profile_id = v.id) AS bound_components
      FROM visible v
     ORDER BY
       CASE WHEN _s='updated_at' AND _d='desc' THEN v.updated_at END DESC NULLS LAST,
       CASE WHEN _s='updated_at' AND _d='asc'  THEN v.updated_at END ASC  NULLS LAST,
       CASE WHEN _s='created_at' AND _d='desc' THEN v.created_at END DESC NULLS LAST,
       CASE WHEN _s='created_at' AND _d='asc'  THEN v.created_at END ASC  NULLS LAST,
       CASE WHEN _s='code'            THEN v.code END,
       CASE WHEN _s='profile_version' THEN v.profile_version END,
       CASE WHEN _s='status'          THEN v.status END,
       CASE WHEN _s='origin'          THEN v.origin END,
       CASE WHEN _s='domain_code'     THEN v.domain_code END,
       v.updated_at DESC
     LIMIT _lim OFFSET _off)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'code', code, 'profile_version', profile_version,
           'domain_code', domain_code, 'regulator_id', regulator_id,
           'regulator_code', regulator_code, 'regulator_name', regulator_name,
           'sector_id', sector_id, 'name', name, 'title', title,
           'status', status, 'origin', origin,
           'origin_label', public.supervisory_methodology_origin_label(origin),
           'adopted_from_id', adopted_from_id, 'supersedes_id', supersedes_id,
           'effective_from', effective_from, 'effective_to', effective_to,
           'required_components', required_components, 'bound_components', bound_components,
           'created_at', created_at, 'updated_at', updated_at)), '[]'::jsonb),
         (SELECT n FROM counted)
    INTO _rows, _total FROM page;

  RETURN jsonb_build_object('rows', _rows, 'total', _total, 'limit', _lim, 'offset', _off);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_register(text,text,text,text,uuid,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_register(text,text,text,text,uuid,text,text,integer,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_register_options()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
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
    'regulators', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name)
                          ORDER BY r.code), '[]'::jsonb) FROM public.regulators r));
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_register_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_register_options() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_detail(_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.supervisory_policy_profile; _out jsonb;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  SELECT jsonb_build_object(
    'id', _p.id, 'code', _p.code, 'profile_version', _p.profile_version,
    'domain_code', _p.domain_code, 'regulator_id', _p.regulator_id,
    'regulator_code', (SELECT code FROM public.regulators WHERE id = _p.regulator_id),
    'regulator_name', (SELECT name FROM public.regulators WHERE id = _p.regulator_id),
    'sector_id', _p.sector_id, 'name', _p.name, 'title', _p.title, 'purpose', _p.purpose,
    'notes', _p.notes, 'status', _p.status, 'origin', _p.origin,
    'origin_label', public.supervisory_methodology_origin_label(_p.origin),
    'adopted_from', CASE WHEN _p.adopted_from_id IS NULL THEN NULL ELSE
        (SELECT jsonb_build_object('id', s.id, 'code', s.code, 'profile_version', s.profile_version,
                                   'status', s.status, 'origin', s.origin)
           FROM public.supervisory_policy_profile s WHERE s.id = _p.adopted_from_id) END,
    'supersedes', CASE WHEN _p.supersedes_id IS NULL THEN NULL ELSE
        (SELECT jsonb_build_object('id', s.id, 'code', s.code, 'profile_version', s.profile_version,
                                   'status', s.status)
           FROM public.supervisory_policy_profile s WHERE s.id = _p.supersedes_id) END,
    'effective_from', _p.effective_from, 'effective_to', _p.effective_to,
    'created_by', _p.created_by, 'created_by_name', public.app_actor_display_name(_p.created_by),
    'reviewed_by', _p.reviewed_by, 'reviewed_by_name', public.app_actor_display_name(_p.reviewed_by),
    'reviewed_at', _p.reviewed_at,
    'approved_by', _p.approved_by, 'approved_by_name', public.app_actor_display_name(_p.approved_by),
    'approved_at', _p.approved_at, 'activated_at', _p.activated_at,
    'superseded_at', _p.superseded_at, 'retired_at', _p.retired_at,
    'created_at', _p.created_at, 'updated_at', _p.updated_at,
    'sibling_versions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                            'id', s.id, 'profile_version', s.profile_version, 'status', s.status,
                            'origin', s.origin, 'updated_at', s.updated_at) ORDER BY s.created_at DESC), '[]'::jsonb)
                          FROM public.supervisory_policy_profile s
                         WHERE s.code = _p.code AND s.domain_code = _p.domain_code),
    'readiness', public.supervisory_policy_profile_readiness(_profile_id),
    'event_count', (SELECT count(*) FROM public.supervisory_policy_profile_event WHERE profile_id = _p.id)
  ) INTO _out;
  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_detail(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_component_candidates(
  _profile_id uuid, _component_type text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.supervisory_policy_profile; _ct text; _rows jsonb;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  _ct := upper(btrim(COALESCE(_component_type,'')));

  IF _ct = 'METHODOLOGY' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'component_id', m.id, 'component_code', m.code, 'component_version', m.version,
             'component_status', m.status, 'origin', m.origin, 'name', m.name,
             'label', m.code || ' ' || m.version || ' (' || m.status || ')') ORDER BY m.code, m.version), '[]'::jsonb)
      INTO _rows FROM public.supervisory_methodology m
     WHERE m.domain_code = _p.domain_code
       AND m.status IN ('APPROVED','ACTIVE')
       AND m.origin <> 'MIPL_REFERENCE'
       AND (_p.regulator_id IS NULL OR m.regulator_id IS NULL OR m.regulator_id = _p.regulator_id);

  ELSIF _ct = 'CALCULATION_CONFIG' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'component_id', c.id, 'component_code', m.code || '/calc',
             'component_version', c.config_version::text, 'component_status', c.status,
             'origin', m.origin, 'name', m.name,
             'label', m.code || ' ' || m.version || ' calculation v' || c.config_version
                      || ' (' || c.status || ')') ORDER BY m.code, c.config_version), '[]'::jsonb)
      INTO _rows
      FROM public.supervisory_calculation_config c
      JOIN public.supervisory_methodology m ON m.id = c.methodology_id
     WHERE m.domain_code = _p.domain_code
       AND c.status IN ('APPROVED','ACTIVE')
       AND m.origin <> 'MIPL_REFERENCE'
       AND (_p.regulator_id IS NULL OR m.regulator_id IS NULL OR m.regulator_id = _p.regulator_id);
  ELSE
    _rows := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'component_type', _ct,
    'is_available', COALESCE((SELECT is_available FROM public.supervisory_policy_component_type
                               WHERE component_type = _ct), false),
    'candidates', _rows);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_component_candidates(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_component_candidates(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_compare(
  _profile_id uuid, _baseline_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_policy_profile; _b public.supervisory_policy_profile; _rows jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_policy_profile WHERE id = _profile_id;
  SELECT * INTO _b FROM public.supervisory_policy_profile WHERE id = _baseline_id;
  IF _a.id IS NULL OR _b.id IS NULL THEN
    RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT (public.supervisory_methodology_regulator_scope_readable(_a.domain_code, _a.regulator_id)
      AND public.supervisory_methodology_regulator_scope_readable(_b.domain_code, _b.regulator_id)) THEN
    RAISE EXCEPTION 'not_authorized: one of these policy profiles is outside your supervisory scope'
      USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'component_type', t.component_type, 'label', t.label,
           'subject_requirement', COALESCE(ra.requirement, t.default_requirement),
           'baseline_requirement', COALESCE(rb.requirement, t.default_requirement),
           'requirement_changed', COALESCE(ra.requirement, t.default_requirement)
                                   IS DISTINCT FROM COALESCE(rb.requirement, t.default_requirement),
           'subject_component', CASE WHEN ba.id IS NULL THEN NULL ELSE
               jsonb_build_object('component_id', ba.component_id, 'component_code', ba.component_code,
                                  'component_version', ba.component_version) END,
           'baseline_component', CASE WHEN bb.id IS NULL THEN NULL ELSE
               jsonb_build_object('component_id', bb.component_id, 'component_code', bb.component_code,
                                  'component_version', bb.component_version) END,
           'binding_changed', ba.component_id IS DISTINCT FROM bb.component_id) ORDER BY t.sort_order), '[]'::jsonb)
    INTO _rows
    FROM public.supervisory_policy_component_type t
    LEFT JOIN public.supervisory_policy_profile_requirement ra ON ra.profile_id = _a.id AND ra.component_type = t.component_type
    LEFT JOIN public.supervisory_policy_profile_requirement rb ON rb.profile_id = _b.id AND rb.component_type = t.component_type
    LEFT JOIN public.supervisory_policy_profile_binding ba ON ba.profile_id = _a.id AND ba.component_type = t.component_type
    LEFT JOIN public.supervisory_policy_profile_binding bb ON bb.profile_id = _b.id AND bb.component_type = t.component_type;

  RETURN jsonb_build_object(
    'subject', jsonb_build_object('id', _a.id, 'code', _a.code, 'profile_version', _a.profile_version, 'status', _a.status),
    'baseline', jsonb_build_object('id', _b.id, 'code', _b.code, 'profile_version', _b.profile_version, 'status', _b.status),
    'components', _rows,
    'changed_count', (SELECT count(*) FROM jsonb_array_elements(_rows) c
                       WHERE (c->>'binding_changed')::boolean OR (c->>'requirement_changed')::boolean));
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_compare(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_compare(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_event_register(
  _profile_id uuid, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.supervisory_policy_profile; _rows jsonb; _total bigint; _lim int; _off int;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;
  _lim := LEAST(GREATEST(COALESCE(_limit,50),1),200);
  _off := GREATEST(COALESCE(_offset,0),0);

  SELECT count(*) INTO _total FROM public.supervisory_policy_profile_event WHERE profile_id = _profile_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id, 'event_type', e.event_type, 'from_status', e.from_status,
           'to_status', e.to_status, 'rationale', e.rationale,
           'actor_id', e.actor_id, 'actor_name', public.app_actor_display_name(e.actor_id),
           'detail', e.detail, 'created_at', e.created_at) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO _rows FROM (
      SELECT * FROM public.supervisory_policy_profile_event
       WHERE profile_id = _profile_id ORDER BY created_at DESC LIMIT _lim OFFSET _off) e;

  RETURN jsonb_build_object('rows', _rows, 'total', _total, 'limit', _lim, 'offset', _off);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_event_register(uuid,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_event_register(uuid,integer,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_action_capabilities(_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _p public.supervisory_policy_profile;
        _manage_perm text; _approve_perm text; _domain_registered boolean := false; _super boolean;
        _can_manage_domain boolean := false; _can_manage_regulator boolean := false;
        _can_approve_regulator boolean := false; _adoption_targets int := 0; _ready jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  SELECT true, manage_config_permission, policy_approval_permission
    INTO _domain_registered, _manage_perm, _approve_perm
    FROM public.supervisory_domain_authority WHERE domain_code = _p.domain_code;

  _super := public.is_super_admin(_uid);

  IF COALESCE(_domain_registered, false) THEN
    _can_manage_domain := _super OR (_manage_perm IS NOT NULL
      AND public.has_permission(_uid, split_part(_manage_perm,'.',1), split_part(_manage_perm,'.',2)));
  END IF;

  IF _can_manage_domain THEN
    _can_manage_regulator := _super
      OR (_p.regulator_id IS NULL AND _manage_perm IS NOT NULL
          AND public.has_permission(_uid, split_part(_manage_perm,'.',1), split_part(_manage_perm,'.',2)))
      OR (_p.regulator_id IS NOT NULL AND _manage_perm IS NOT NULL
          AND public.user_has_regulator_authority(_uid, split_part(_manage_perm,'.',1),
                                                  split_part(_manage_perm,'.',2), _p.regulator_id));
  END IF;

  IF _approve_perm IS NOT NULL THEN
    _can_approve_regulator := public.user_has_regulator_authority(
      _uid, split_part(_approve_perm,'.',1), split_part(_approve_perm,'.',2), _p.regulator_id);
  END IF;

  IF _p.origin = 'MIPL_REFERENCE' AND _can_manage_domain THEN
    SELECT count(*) INTO _adoption_targets FROM public.regulators r
     WHERE _super OR (_manage_perm IS NOT NULL
        AND public.user_has_regulator_authority(_uid, split_part(_manage_perm,'.',1),
                                                split_part(_manage_perm,'.',2), r.id));
  END IF;

  _ready := public.supervisory_policy_profile_readiness(_profile_id);

  RETURN jsonb_build_object(
    'profile_id', _p.id, 'status', _p.status, 'origin', _p.origin, 'domain_code', _p.domain_code,
    'is_platform_administrator', _super,
    'can_edit', jsonb_build_object(
      'allowed', _can_manage_regulator AND _p.status IN ('DRAFT','REVIEW'),
      'reason', CASE
        WHEN NOT COALESCE(_domain_registered,false) THEN 'No configuration authority is registered for this supervisory domain.'
        WHEN NOT _can_manage_domain THEN 'You do not hold supervisory configuration authority for this domain.'
        WHEN NOT _can_manage_regulator THEN 'You do not hold configuration authority for this profile''s regulator.'
        WHEN _p.status NOT IN ('DRAFT','REVIEW') THEN 'Only a draft or in-review profile can be edited.'
        ELSE NULL END),
    'can_bind_components', jsonb_build_object(
      'allowed', _can_manage_regulator AND _p.status IN ('DRAFT','REVIEW'),
      'reason', CASE
        WHEN NOT _can_manage_regulator THEN 'You do not hold configuration authority for this profile''s regulator.'
        WHEN _p.status NOT IN ('DRAFT','REVIEW') THEN 'Component bindings are locked once a profile is approved.'
        ELSE NULL END),
    'can_adopt', jsonb_build_object(
      'allowed', _p.origin = 'MIPL_REFERENCE' AND _can_manage_domain AND _adoption_targets > 0,
      'reason', CASE
        WHEN _p.origin <> 'MIPL_REFERENCE' THEN 'Only a MIPL reference profile can be adopted.'
        WHEN NOT _can_manage_domain THEN 'You do not hold supervisory configuration authority for this domain.'
        WHEN _adoption_targets = 0 THEN 'You hold no regulator within your configuration scope to adopt for.'
        ELSE NULL END,
      'target_count', _adoption_targets),
    'can_submit_review', jsonb_build_object(
      'allowed', _can_manage_regulator AND _p.status = 'DRAFT',
      'reason', CASE
        WHEN NOT _can_manage_regulator THEN 'You do not hold configuration authority for this profile''s regulator.'
        WHEN _p.status <> 'DRAFT' THEN 'Only a DRAFT profile can be submitted for review.'
        ELSE NULL END),
    'can_return_to_draft', jsonb_build_object(
      'allowed', _can_manage_regulator AND _p.status = 'REVIEW',
      'reason', CASE
        WHEN NOT _can_manage_regulator THEN 'You do not hold configuration authority for this profile''s regulator.'
        WHEN _p.status <> 'REVIEW' THEN 'Only a profile in REVIEW can be returned to draft.'
        ELSE NULL END),
    'can_approve', jsonb_build_object(
      'allowed', _p.status = 'REVIEW' AND _p.origin <> 'MIPL_REFERENCE'
                 AND _approve_perm IS NOT NULL AND _can_approve_regulator
                 AND _p.created_by IS DISTINCT FROM _uid
                 AND _p.reviewed_by IS DISTINCT FROM _uid
                 AND (_ready->>'is_ready_for_approval')::boolean,
      'reason', CASE
        WHEN _p.origin = 'MIPL_REFERENCE' THEN 'A MIPL reference profile cannot be approved in place. A regulator must adopt it first.'
        WHEN _p.status <> 'REVIEW' THEN 'Only a profile in REVIEW can be approved.'
        WHEN _approve_perm IS NULL THEN 'No policy approval authority is registered for this supervisory domain.'
        WHEN _p.created_by = _uid THEN 'You prepared this profile and cannot approve it.'
        WHEN _p.reviewed_by = _uid THEN 'You submitted this profile for review and cannot approve it.'
        WHEN NOT _can_approve_regulator THEN 'You do not hold supervisory policy approval authority for this regulator. Assessment approval and platform administration do not substitute.'
        WHEN NOT (_ready->>'is_ready_for_approval')::boolean THEN 'Required policy components are not yet satisfied.'
        ELSE NULL END,
      'requires_rationale', true),
    'can_activate', jsonb_build_object(
      'allowed', _can_manage_regulator AND _p.status = 'APPROVED' AND _p.approved_by IS NOT NULL,
      'reason', CASE
        WHEN _p.status <> 'APPROVED' THEN 'Only an approved profile can be activated.'
        WHEN NOT _can_manage_regulator THEN 'You do not hold configuration authority for this profile''s regulator.'
        ELSE NULL END,
      'requires_rationale', true,
      'note', 'Activation governs configuration only. Operational assessment resolution is not yet routed through policy profiles.'),
    'can_retire', jsonb_build_object(
      'allowed', _can_manage_regulator AND _p.status = 'ACTIVE',
      'reason', CASE
        WHEN _p.status <> 'ACTIVE' THEN 'Only an active profile can be retired.'
        WHEN NOT _can_manage_regulator THEN 'You do not hold configuration authority for this profile''s regulator.'
        ELSE NULL END,
      'requires_rationale', true),
    'can_new_version', jsonb_build_object(
      'allowed', _can_manage_regulator,
      'reason', CASE WHEN NOT _can_manage_regulator
        THEN 'You do not hold configuration authority for this profile''s regulator.' ELSE NULL END,
      'requires_rationale', true),
    'maker_checker', jsonb_build_object(
      'author_id', _p.created_by, 'author_name', public.app_actor_display_name(_p.created_by),
      'submitted_by', _p.reviewed_by, 'submitted_by_name', public.app_actor_display_name(_p.reviewed_by),
      'submitted_at', _p.reviewed_at,
      'actor_is_author', _p.created_by IS NOT DISTINCT FROM _uid,
      'actor_is_submitter', _p.reviewed_by IS NOT DISTINCT FROM _uid));
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_action_capabilities(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_action_capabilities(uuid) TO authenticated, service_role;

-- Configuration-layer resolution only. Deliberately NOT wired into assessments.
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_resolve(
  _domain_code text, _regulator_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL, _as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _d text; _as date; _p public.supervisory_policy_profile;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _d := upper(btrim(COALESCE(_domain_code,'')));
  _as := COALESCE(_as_of, current_date);
  IF NOT public.supervisory_methodology_regulator_scope_readable(_d, _regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this supervisory scope is outside your authority' USING ERRCODE = '42501'; END IF;

  SELECT * INTO _p FROM public.supervisory_policy_profile p
   WHERE p.domain_code = _d
     AND p.status = 'ACTIVE'
     AND (_regulator_id IS NULL OR p.regulator_id = _regulator_id)
     AND (p.sector_id IS NULL OR _sector_id IS NULL OR p.sector_id = _sector_id)
     AND (p.effective_from IS NULL OR p.effective_from <= _as)
     AND (p.effective_to IS NULL OR p.effective_to >= _as)
   ORDER BY (p.sector_id IS NOT NULL) DESC, (p.regulator_id IS NOT NULL) DESC,
            p.effective_from DESC NULLS LAST
   LIMIT 1;

  IF _p.id IS NULL THEN
    RETURN jsonb_build_object('resolved', false, 'domain_code', _d, 'as_of', _as,
      'reason', 'No active supervisory policy profile is configured for this domain, regulator, sector and date.',
      'binds_operational_assessments', false);
  END IF;

  RETURN jsonb_build_object(
    'resolved', true, 'as_of', _as,
    'profile', jsonb_build_object('id', _p.id, 'code', _p.code, 'profile_version', _p.profile_version,
                'domain_code', _p.domain_code, 'regulator_id', _p.regulator_id, 'sector_id', _p.sector_id,
                'status', _p.status, 'origin', _p.origin,
                'effective_from', _p.effective_from, 'effective_to', _p.effective_to),
    'components', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                     'component_type', b.component_type, 'component_id', b.component_id,
                     'component_table', b.component_table, 'component_code', b.component_code,
                     'component_version', b.component_version) ORDER BY b.component_type), '[]'::jsonb)
                     FROM public.supervisory_policy_profile_binding b WHERE b.profile_id = _p.id),
    'binds_operational_assessments', false,
    'note', 'Configuration-layer resolution only. Operational assessment resolution still runs through supervisory_methodology_resolve.');
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_resolve(text,uuid,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_resolve(text,uuid,uuid,date) TO authenticated, service_role;