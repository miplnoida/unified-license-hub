-- ============================================================================
-- F7-B BLOCKER REPAIR: canonical regulator BODY identity
-- Officer assignment fields (licensees.lead_regulator_id / regulator_officer_id /
-- alternate_regulator_id -> auth.users) are PERSON concepts and are NOT touched.
-- Institutional identity is regulators.id only.
-- ============================================================================

-- 1. Additive columns -------------------------------------------------------
ALTER TABLE public.entity_currency_profiles
  ADD COLUMN IF NOT EXISTS regulator_id uuid REFERENCES public.regulators(id);
CREATE INDEX IF NOT EXISTS idx_entity_currency_profiles_entity_regulator
  ON public.entity_currency_profiles(entity_id, regulator_id, status, effective_from);

ALTER TABLE public.entity_reporting_obligations
  ADD COLUMN IF NOT EXISTS regulator_id uuid REFERENCES public.regulators(id);

ALTER TABLE public.return_filings
  ADD COLUMN IF NOT EXISTS regulator_id uuid REFERENCES public.regulators(id);
ALTER TABLE public.return_filings
  ADD COLUMN IF NOT EXISTS regulator_source text;

COMMENT ON COLUMN public.entity_currency_profiles.regulator_id IS
  'Canonical regulator BODY (regulators.id) this effective-dated override applies to. NULL = legacy, DATA_REMEDIATION_REQUIRED, never governs resolution.';
COMMENT ON COLUMN public.return_filings.regulator_id IS
  'Regulator BODY snapshot that governed this filing (regulators.id).';

-- 2. Canonical regulator-body resolver --------------------------------------
CREATE OR REPLACE FUNCTION public.entity_regulator_body_resolve(
  _entity_id uuid,
  _as_of date DEFAULT CURRENT_DATE,
  _return_definition_id uuid DEFAULT NULL::uuid,
  _regulatory_function_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_at date := COALESCE(_as_of, CURRENT_DATE);
  v_reg uuid; v_src text; v_ref uuid; v_n int; v_status text;
BEGIN
  IF _entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_REGULATOR_ENTITY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Priority 1: explicit return-definition regulator body.
  IF _return_definition_id IS NOT NULL THEN
    SELECT d.regulator_id INTO v_reg FROM public.return_definitions d WHERE d.id = _return_definition_id;
    IF v_reg IS NOT NULL THEN v_src := 'RETURN_DEFINITION'; v_ref := _return_definition_id; END IF;
  END IF;

  -- Priority 2: obligation snapshot, then the obligation rule that created it.
  IF v_reg IS NULL AND _return_definition_id IS NOT NULL THEN
    SELECT o.regulator_id, o.id INTO v_reg, v_ref
      FROM public.entity_reporting_obligations o
     WHERE o.entity_id = _entity_id
       AND o.return_definition_id = _return_definition_id
       AND o.regulator_id IS NOT NULL
     ORDER BY (COALESCE(o.status,'ACTIVE') = 'ACTIVE') DESC, o.effective_from DESC NULLS LAST
     LIMIT 1;
    IF v_reg IS NOT NULL THEN v_src := 'OBLIGATION_SNAPSHOT'; END IF;

    IF v_reg IS NULL THEN
      SELECT count(DISTINCT r.regulator_id), min(r.regulator_id::text)::uuid
        INTO v_n, v_reg
        FROM public.entity_reporting_obligations o
        JOIN public.reporting_obligation_rules r ON r.id = o.source_rule_id
       WHERE o.entity_id = _entity_id
         AND o.return_definition_id = _return_definition_id
         AND r.regulator_id IS NOT NULL;
      IF COALESCE(v_n,0) > 1 THEN
        RAISE EXCEPTION 'ENTITY_REGULATOR_AMBIGUOUS' USING ERRCODE = '22023',
          DETAIL = 'Multiple obligation rules name different regulator bodies for this return.';
      END IF;
      IF v_reg IS NOT NULL THEN v_src := 'OBLIGATION_RULE'; END IF;
    END IF;
  END IF;

  -- Priority 3: canonical entity supervision assignment (primary first).
  IF v_reg IS NULL THEN
    SELECT count(DISTINCT a.regulator_id), min(a.regulator_id::text)::uuid
      INTO v_n, v_reg
      FROM public.entity_supervision_assignments a
     WHERE a.entity_id = _entity_id
       AND a.regulator_id IS NOT NULL
       AND lower(COALESCE(a.status,'active')) IN ('active','current','primary')
       AND COALESCE(a.is_primary, false)
       AND (a.effective_from IS NULL OR a.effective_from::date <= v_at)
       AND (a.effective_to IS NULL OR a.effective_to::date >= v_at)
       AND (_regulatory_function_id IS NULL
            OR a.regulatory_function_id IS NULL
            OR a.regulatory_function_id = _regulatory_function_id);

    IF COALESCE(v_n,0) = 0 THEN
      SELECT count(DISTINCT a.regulator_id), min(a.regulator_id::text)::uuid
        INTO v_n, v_reg
        FROM public.entity_supervision_assignments a
       WHERE a.entity_id = _entity_id
         AND a.regulator_id IS NOT NULL
         AND lower(COALESCE(a.status,'active')) IN ('active','current','primary')
         AND (a.effective_from IS NULL OR a.effective_from::date <= v_at)
         AND (a.effective_to IS NULL OR a.effective_to::date >= v_at)
         AND (_regulatory_function_id IS NULL
              OR a.regulatory_function_id IS NULL
              OR a.regulatory_function_id = _regulatory_function_id);
    END IF;

    IF COALESCE(v_n,0) > 1 THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_AMBIGUOUS' USING ERRCODE = '22023',
        DETAIL = 'Entity is supervised by more than one regulator body and no regulatory context was supplied.';
    END IF;
    IF v_reg IS NOT NULL THEN v_src := 'ENTITY_SUPERVISION_ASSIGNMENT'; END IF;
  END IF;

  -- Priority 4: sector / sub-sector regulator body.
  IF v_reg IS NULL THEN
    SELECT count(DISTINCT s.regulator_id), min(s.regulator_id::text)::uuid
      INTO v_n, v_reg
      FROM public.licensees l
      JOIN public.sectors s ON s.id = l.sector_id
     WHERE l.id = _entity_id
       AND s.regulator_id IS NOT NULL;
    IF COALESCE(v_n,0) > 1 THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_AMBIGUOUS' USING ERRCODE = '22023';
    END IF;
    IF v_reg IS NOT NULL THEN v_src := 'SECTOR'; END IF;
  END IF;

  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'ENTITY_REGULATOR_UNRESOLVED' USING ERRCODE = 'P0002',
      DETAIL = 'No canonical regulator body can be resolved for this entity/context.';
  END IF;

  SELECT r.status INTO v_status FROM public.regulators r WHERE r.id = v_reg;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'ENTITY_REGULATOR_NOT_A_REGULATOR_BODY' USING ERRCODE = '22023';
  END IF;
  IF lower(v_status) NOT IN ('active') THEN
    RAISE EXCEPTION 'ENTITY_REGULATOR_INACTIVE:%', v_reg USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'entity_id', _entity_id, 'regulator_id', v_reg,
    'source', v_src, 'as_of', v_at,
    'return_definition_id', _return_definition_id,
    'regulatory_function_id', _regulatory_function_id,
    'reference_id', v_ref);
END $function$;

-- All regulator bodies related to an entity (for multi-regulator UI/validation).
CREATE OR REPLACE FUNCTION public.entity_regulator_bodies(
  _entity_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH cand AS (
    SELECT a.regulator_id, 'ENTITY_SUPERVISION_ASSIGNMENT'::text AS source
      FROM public.entity_supervision_assignments a
     WHERE a.entity_id = _entity_id AND a.regulator_id IS NOT NULL
       AND lower(COALESCE(a.status,'active')) IN ('active','current','primary')
       AND (a.effective_from IS NULL OR a.effective_from::date <= COALESCE(_as_of, CURRENT_DATE))
       AND (a.effective_to IS NULL OR a.effective_to::date >= COALESCE(_as_of, CURRENT_DATE))
    UNION
    SELECT s.regulator_id, 'SECTOR'
      FROM public.licensees l
      JOIN public.sectors s ON s.id = l.sector_id
     WHERE l.id = _entity_id AND s.regulator_id IS NOT NULL
    UNION
    SELECT d.regulator_id, 'RETURN_DEFINITION'
      FROM public.entity_reporting_obligations o
      JOIN public.return_definitions d ON d.id = o.return_definition_id
     WHERE o.entity_id = _entity_id AND d.regulator_id IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'regulator_id', c.regulator_id,
           'name', r.name, 'code', r.code, 'status', r.status,
           'sources', c.sources) ORDER BY r.name), '[]'::jsonb)
    FROM (SELECT regulator_id, array_agg(DISTINCT source) AS sources FROM cand GROUP BY regulator_id) c
    JOIN public.regulators r ON r.id = c.regulator_id
   WHERE lower(COALESCE(r.status,'')) = 'active';
$function$;

CREATE OR REPLACE FUNCTION public.entity_regulator_body_related(
  _entity_id uuid, _regulator_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.entity_regulator_bodies(_entity_id, _as_of)) e
     WHERE (e->>'regulator_id')::uuid = _regulator_id);
$function$;

-- 3. Compatibility wrapper: never returns an officer id again ----------------
CREATE OR REPLACE FUNCTION public.entity_reporting_regulator(_entity_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  -- Compatibility facade over entity_regulator_body_resolve. Returns ONLY a
  -- regulators.id. Returns NULL (never an officer id, never a guess) when the
  -- canonical regulator body cannot be determined unambiguously.
  BEGIN
    v := public.entity_regulator_body_resolve(_entity_id, CURRENT_DATE, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  RETURN NULLIF(v->>'regulator_id','')::uuid;
END $function$;

-- 4. Regulator-scoped entity reporting currency ------------------------------
DROP FUNCTION IF EXISTS public.entity_reporting_currency_resolve(uuid, date, uuid);
CREATE OR REPLACE FUNCTION public.entity_reporting_currency_resolve(
  _entity_id uuid,
  _as_of date DEFAULT CURRENT_DATE,
  _return_definition_id uuid DEFAULT NULL::uuid,
  _regulator_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg uuid; v_regsrc text; v_body jsonb;
  v_cfg public.monetary_configs; v_cfg_scope text;
  v_prof public.entity_currency_profiles; v_def public.return_definitions;
  v_cur text; v_src text; v_at date := COALESCE(_as_of, CURRENT_DATE);
BEGIN
  IF _entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_ENTITY_NOT_RESOLVED' USING ERRCODE = 'P0002';
  END IF;

  IF _regulator_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id AND lower(COALESCE(status,'')) = 'active') THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_INACTIVE:%', _regulator_id USING ERRCODE = '22023';
    END IF;
    IF NOT public.entity_regulator_body_related(_entity_id, _regulator_id, v_at) THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_NOT_RELATED' USING ERRCODE = '42501';
    END IF;
    v_reg := _regulator_id; v_regsrc := 'EXPLICIT_CONTEXT';
  ELSE
    v_body := public.entity_regulator_body_resolve(_entity_id, v_at, _return_definition_id, NULL);
    v_reg := (v_body->>'regulator_id')::uuid;
    v_regsrc := v_body->>'source';
  END IF;

  -- Regulator body is now authoritative; configuration is resolved for it.
  v_cfg := public.monetary_config_resolve(v_reg);
  IF v_cfg.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_MONETARY_CONFIG_MISSING' USING ERRCODE = 'P0002';
  END IF;
  v_cfg_scope := CASE WHEN v_cfg.regulator_id = v_reg THEN 'REGULATOR' ELSE 'PLATFORM_DEFAULT' END;

  IF _return_definition_id IS NOT NULL THEN
    SELECT * INTO v_def FROM public.return_definitions WHERE id = _return_definition_id;
    IF v_def.mandatory_currency_code IS NOT NULL THEN
      v_cur := upper(v_def.mandatory_currency_code); v_src := 'RETURN_DEFINITION';
    END IF;
  END IF;

  IF v_cur IS NULL THEN
    -- Regulator-scoped, effective-dated. Legacy rows without a regulator body
    -- (DATA_REMEDIATION_REQUIRED) never govern resolution.
    SELECT * INTO v_prof FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id
       AND regulator_id = v_reg
       AND status IN ('ACTIVE','SUPERSEDED')
       AND effective_from <= v_at
       AND (effective_to IS NULL OR effective_to >= v_at)
     ORDER BY (status = 'ACTIVE') DESC, effective_from DESC, created_at DESC
     LIMIT 1;
    IF v_prof.id IS NOT NULL THEN
      v_cur := upper(v_prof.reporting_currency_override); v_src := 'ENTITY_OVERRIDE';
    END IF;
  END IF;

  IF v_cur IS NULL THEN
    v_cur := v_cfg.base_currency; v_src := 'REGULATOR_BASE';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_cur AND is_active) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_INACTIVE:%', v_cur USING ERRCODE = '22023';
  END IF;
  IF v_src <> 'REGULATOR_BASE' AND NOT public.currency_is_supported(v_cur, v_reg) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_UNSUPPORTED:%', v_cur USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'entity_id', _entity_id,
    'regulator_id', v_reg, 'regulator_source', v_regsrc,
    'currency', v_cur, 'source', v_src, 'as_of', v_at,
    'entity_currency_profile_id', CASE WHEN v_src = 'ENTITY_OVERRIDE' THEN v_prof.id ELSE NULL END,
    'monetary_config_id', v_cfg.id,
    'monetary_config_scope', v_cfg_scope,
    'regulator_base_currency', v_cfg.base_currency,
    'regulator_reporting_currency', v_cfg.reporting_currency,
    'returns_fx_date_policy', v_cfg.returns_fx_date_policy);
END $function$;

-- 5. Approval mode, regulator aware -----------------------------------------
DROP FUNCTION IF EXISTS public.entity_currency_approval_mode(uuid);
CREATE OR REPLACE FUNCTION public.entity_currency_approval_mode(
  _entity_id uuid, _regulator_id uuid DEFAULT NULL::uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cfg public.monetary_configs; v_reg uuid := _regulator_id;
BEGIN
  IF v_reg IS NULL THEN
    v_reg := (public.entity_regulator_body_resolve(_entity_id, CURRENT_DATE, NULL, NULL)->>'regulator_id')::uuid;
  END IF;
  v_cfg := public.monetary_config_resolve(v_reg);
  IF v_cfg.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_MONETARY_CONFIG_MISSING' USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE(v_cfg.entity_currency_override_approval_mode, 'DIRECT_AUTHORIZED');
END $function$;

-- 6. Regulator-scoped override maintenance -----------------------------------
DROP FUNCTION IF EXISTS public.entity_currency_override_set(uuid, text, date, text, date);
CREATE OR REPLACE FUNCTION public.entity_currency_override_set(
  _entity_id uuid, _currency text, _effective_from date, _reason text,
  _effective_to date DEFAULT NULL::date, _regulator_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_reg uuid; v_code text := upper(btrim(_currency));
  v_id uuid; v_prior uuid; v_mode text;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_ENTITY_NOT_RESOLVED' USING ERRCODE = 'P0002';
  END IF;
  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_EFFECTIVE_FROM_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_code IS NULL OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_code AND is_active) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_INACTIVE:%', COALESCE(v_code,'?') USING ERRCODE = '22023';
  END IF;

  -- Server-side regulator body. A browser-supplied regulator is never trusted.
  IF _regulator_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id AND lower(COALESCE(status,'')) = 'active') THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_INACTIVE:%', _regulator_id USING ERRCODE = '22023';
    END IF;
    IF NOT public.entity_regulator_body_related(_entity_id, _regulator_id, _effective_from) THEN
      RAISE EXCEPTION 'ENTITY_REGULATOR_NOT_RELATED' USING ERRCODE = '42501';
    END IF;
    v_reg := _regulator_id;
  ELSE
    v_reg := (public.entity_regulator_body_resolve(_entity_id, _effective_from, NULL, NULL)->>'regulator_id')::uuid;
  END IF;

  IF NOT public.currency_is_supported(v_code, v_reg) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_UNSUPPORTED:%', v_code USING ERRCODE = '22023';
  END IF;

  v_mode := public.entity_currency_approval_mode(_entity_id, v_reg);

  IF v_mode = 'MAKER_CHECKER' THEN
    INSERT INTO public.entity_currency_profiles(
      entity_id, regulator_id, reporting_currency_override, effective_from, effective_to, status,
      reason, source, created_by, proposed_by, proposed_at, approval_mode)
    VALUES (_entity_id, v_reg, v_code, _effective_from, _effective_to, 'PROPOSED',
            btrim(_reason), 'ENTITY_360', v_uid, v_uid, now(), v_mode)
    RETURNING id INTO v_id;

    PERFORM public.create_audit_log('entity_currency_profile', v_id, 'OVERRIDE_PROPOSED',
      jsonb_build_object('entity_id', _entity_id, 'regulator_id', v_reg, 'currency', v_code,
                         'effective_from', _effective_from, 'effective_to', _effective_to,
                         'approval_mode', v_mode, 'reason', btrim(_reason)));

    RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', v_id, 'regulator_id', v_reg,
                              'currency', v_code, 'status', 'PROPOSED', 'approval_mode', v_mode);
  END IF;

  FOR v_prior IN
    SELECT id FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id AND regulator_id = v_reg AND status = 'ACTIVE'
       AND (effective_to IS NULL OR effective_to >= _effective_from)
  LOOP
    UPDATE public.entity_currency_profiles
       SET status = 'SUPERSEDED', superseded_at = now(),
           effective_to = LEAST(COALESCE(effective_to, _effective_from - 1), _effective_from - 1)
     WHERE id = v_prior;
  END LOOP;

  INSERT INTO public.entity_currency_profiles(
    entity_id, regulator_id, reporting_currency_override, effective_from, effective_to, status,
    reason, source, created_by, approved_by, approved_at, approval_mode,
    proposed_by, proposed_at, decision_by, decision_at)
  VALUES (_entity_id, v_reg, v_code, _effective_from, _effective_to, 'ACTIVE',
          btrim(_reason), 'ENTITY_360', v_uid, v_uid, now(), v_mode,
          v_uid, now(), v_uid, now())
  RETURNING id INTO v_id;

  UPDATE public.entity_currency_profiles SET superseded_by = v_id
   WHERE entity_id = _entity_id AND regulator_id = v_reg AND status = 'SUPERSEDED' AND superseded_by IS NULL;

  PERFORM public.create_audit_log('entity_currency_profile', v_id, 'OVERRIDE_SET',
    jsonb_build_object('entity_id', _entity_id, 'regulator_id', v_reg, 'currency', v_code,
                       'effective_from', _effective_from, 'effective_to', _effective_to,
                       'approval_mode', v_mode, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', v_id, 'regulator_id', v_reg,
                            'currency', v_code, 'status', 'ACTIVE', 'approval_mode', v_mode);
END $function$;

CREATE OR REPLACE FUNCTION public.entity_currency_override_decide(_profile_id uuid, _decision text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_row public.entity_currency_profiles;
  v_dec text := upper(btrim(COALESCE(_decision,''))); v_prior uuid;
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'licensee_management','edit')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_dec NOT IN ('APPROVE','REJECT') THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_DECISION_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.entity_currency_profiles WHERE id = _profile_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_PROPOSED' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_row.proposed_by, v_row.created_by) = v_uid AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_SELF_APPROVAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_dec = 'REJECT' THEN
    UPDATE public.entity_currency_profiles
       SET status = 'REJECTED', decision_by = v_uid, decision_at = now(),
           decision_reason = btrim(_reason)
     WHERE id = _profile_id;
    PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_REJECTED',
      jsonb_build_object('entity_id', v_row.entity_id, 'regulator_id', v_row.regulator_id,
                         'currency', v_row.reporting_currency_override, 'reason', btrim(_reason)));
    RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', 'REJECTED');
  END IF;

  FOR v_prior IN
    SELECT id FROM public.entity_currency_profiles
     WHERE entity_id = v_row.entity_id
       AND regulator_id IS NOT DISTINCT FROM v_row.regulator_id
       AND status = 'ACTIVE'
       AND (effective_to IS NULL OR effective_to >= v_row.effective_from)
  LOOP
    UPDATE public.entity_currency_profiles
       SET status = 'SUPERSEDED', superseded_at = now(), superseded_by = _profile_id,
           effective_to = LEAST(COALESCE(effective_to, v_row.effective_from - 1), v_row.effective_from - 1)
     WHERE id = v_prior;
  END LOOP;

  UPDATE public.entity_currency_profiles
     SET status = 'ACTIVE', approved_by = v_uid, approved_at = now(),
         decision_by = v_uid, decision_at = now(), decision_reason = btrim(_reason)
   WHERE id = _profile_id;

  PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_APPROVED',
    jsonb_build_object('entity_id', v_row.entity_id, 'regulator_id', v_row.regulator_id,
                       'currency', v_row.reporting_currency_override,
                       'effective_from', v_row.effective_from, 'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id, 'status', 'ACTIVE');
END $function$;

-- 7. Multi-regulator overview -------------------------------------------------
CREATE OR REPLACE FUNCTION public.entity_currency_profile_overview(_entity_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_res jsonb; v_hist jsonb; v_bodies jsonb;
  v_regs jsonb := '[]'::jsonb; b jsonb; v_r jsonb; v_can boolean;
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'licensee_management','view')
          OR public.has_permission(v_uid,'returns_management','view')
          OR public.entity_membership_capability(v_uid, _entity_id, 'returns.view')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_can := public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit');
  v_bodies := public.entity_regulator_bodies(_entity_id, _as_of);

  FOR b IN SELECT * FROM jsonb_array_elements(v_bodies) LOOP
    BEGIN
      v_r := public.entity_reporting_currency_resolve(
               _entity_id, _as_of, NULL, (b->>'regulator_id')::uuid);
    EXCEPTION WHEN OTHERS THEN
      v_r := jsonb_build_object('ok', false, 'error', SQLERRM);
    END;
    v_regs := v_regs || jsonb_build_array(b || v_r || jsonb_build_object(
      'approval_mode', (SELECT COALESCE(c.entity_currency_override_approval_mode,'DIRECT_AUTHORIZED')
                          FROM public.monetary_configs c
                         WHERE c.is_active AND (c.regulator_id = (b->>'regulator_id')::uuid OR c.regulator_id IS NULL)
                         ORDER BY (c.regulator_id IS NOT NULL) DESC LIMIT 1),
      'overrides', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.effective_from DESC, p.created_at DESC)
                               FROM public.entity_currency_profiles p
                              WHERE p.entity_id = _entity_id
                                AND p.regulator_id = (b->>'regulator_id')::uuid), '[]'::jsonb),
      'pending_proposals', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
                               FROM public.entity_currency_profiles p
                              WHERE p.entity_id = _entity_id
                                AND p.regulator_id = (b->>'regulator_id')::uuid
                                AND p.status = 'PROPOSED'), '[]'::jsonb)));
  END LOOP;

  BEGIN
    v_res := public.entity_reporting_currency_resolve(_entity_id, _as_of, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_res := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.effective_from DESC, p.created_at DESC), '[]'::jsonb)
    INTO v_hist FROM public.entity_currency_profiles p WHERE p.entity_id = _entity_id;

  RETURN v_res || jsonb_build_object(
    'can_manage', v_can,
    'current_user_id', v_uid,
    'regulator_bodies', v_regs,
    'multi_regulator', (jsonb_array_length(v_bodies) > 1),
    'approval_mode', COALESCE((v_regs->0->>'approval_mode'), 'DIRECT_AUTHORIZED'),
    'pending_proposals', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC)
        FROM public.entity_currency_profiles p
       WHERE p.entity_id = _entity_id AND p.status = 'PROPOSED'), '[]'::jsonb),
    'history', v_hist,
    'data_remediation_required', EXISTS (
      SELECT 1 FROM public.entity_currency_profiles p
       WHERE p.entity_id = _entity_id AND p.regulator_id IS NULL),
    'mandated_definitions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('return_definition_id', d.id, 'code', d.code,
                                          'name', d.name, 'currency', d.mandatory_currency_code)
                       ORDER BY d.code)
        FROM public.return_definitions d
        JOIN public.entity_reporting_obligations o ON o.return_definition_id = d.id AND o.entity_id = _entity_id
       WHERE d.mandatory_currency_code IS NOT NULL), '[]'::jsonb));
END $function$;

-- 8. Filing regulator snapshot ------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_snapshot_filing_currency(_filing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE f record; v_res jsonb; v_at date;
BEGIN
  SELECT fi.id, fi.status, fi.reporting_currency, fi.entity_id, fi.return_definition_id,
         p.period_end, p.period_start
    INTO f
    FROM public.return_filings fi
    JOIN public.reporting_periods p ON p.id = fi.reporting_period_id
   WHERE fi.id = _filing_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'RETURN_FILING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF f.reporting_currency IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_snapshotted', true, 'currency', f.reporting_currency);
  END IF;
  v_at := f.period_end;
  v_res := public.entity_reporting_currency_resolve(f.entity_id, v_at, f.return_definition_id, NULL);
  UPDATE public.return_filings
     SET reporting_currency = v_res->>'currency',
         currency_source = v_res->>'source',
         entity_currency_profile_id = NULLIF(v_res->>'entity_currency_profile_id','')::uuid,
         currency_as_of = v_at,
         monetary_config_id = NULLIF(v_res->>'monetary_config_id','')::uuid,
         regulator_id = NULLIF(v_res->>'regulator_id','')::uuid,
         regulator_source = v_res->>'regulator_source',
         currency_snapshot_at = now()
   WHERE id = _filing_id;
  PERFORM public.create_audit_log('return_filing', _filing_id, 'CURRENCY_SNAPSHOT', v_res);
  RETURN v_res || jsonb_build_object('already_snapshotted', false);
END $function$;

CREATE OR REPLACE FUNCTION public.returns_rebase_filing_currency(_filing_id uuid, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); f record; v_res jsonb; v_old text;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'RETURN_CURRENCY_REBASE_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  SELECT fi.*, p.period_end INTO f
    FROM public.return_filings fi JOIN public.reporting_periods p ON p.id = fi.reporting_period_id
   WHERE fi.id = _filing_id FOR UPDATE OF fi;
  IF f.id IS NULL THEN RAISE EXCEPTION 'RETURN_FILING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'returns_management','edit')
          OR public.has_permission(v_uid,'licensee_management','edit')) THEN
    RAISE EXCEPTION 'RETURN_CURRENCY_REBASE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF f.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'RETURN_CURRENCY_REBASE_ONLY_DRAFT' USING ERRCODE='42501';
  END IF;
  v_old := f.reporting_currency;
  v_res := public.entity_reporting_currency_resolve(f.entity_id, f.period_end, f.return_definition_id, NULL);
  UPDATE public.return_filings
     SET reporting_currency = v_res->>'currency',
         currency_source = v_res->>'source',
         entity_currency_profile_id = NULLIF(v_res->>'entity_currency_profile_id','')::uuid,
         currency_as_of = f.period_end,
         monetary_config_id = NULLIF(v_res->>'monetary_config_id','')::uuid,
         regulator_id = NULLIF(v_res->>'regulator_id','')::uuid,
         regulator_source = v_res->>'regulator_source',
         currency_snapshot_at = now()
   WHERE id = _filing_id;
  PERFORM public.create_audit_log('return_filing', _filing_id, 'CURRENCY_REBASED',
    jsonb_build_object('from', v_old, 'to', v_res->>'currency', 'reason', btrim(_reason)));
  RETURN v_res || jsonb_build_object('previous_currency', v_old);
END $function$;

-- 9. Historical display uses the filing's own regulator snapshot --------------
CREATE OR REPLACE FUNCTION public.returns_filing_metrics_display(_filing_id uuid, _mode text DEFAULT 'AS_REPORTED'::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); f record; v_mode text := upper(btrim(COALESCE(_mode,'AS_REPORTED')));
  v_target text; v_reg uuid; v_at date; v_rows jsonb := '[]'::jsonb; v_incomplete int := 0;
  r record; v_val numeric; v_status text; v_prov text;
BEGIN
  IF v_mode NOT IN ('AS_REPORTED','REGULATOR_BASE','CONSOLIDATED_REPORTING') THEN
    RAISE EXCEPTION 'RETURN_DISPLAY_MODE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT fi.*, p.period_end INTO f
    FROM public.return_filings fi
    JOIN public.reporting_periods p ON p.id = fi.reporting_period_id
   WHERE fi.id = _filing_id;
  IF f.id IS NULL THEN
    RAISE EXCEPTION 'RETURN_FILING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'returns_management','view')
          OR public.returns_can_view_filing_scope(f.entity_id)) THEN
    RAISE EXCEPTION 'RETURN_FILING_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Never re-resolve today's regulator for a historical filing.
  v_reg := f.regulator_id;
  v_prov := CASE WHEN v_reg IS NULL THEN 'DATA_REMEDIATION_REQUIRED' ELSE 'FILING_SNAPSHOT' END;
  v_at := COALESCE(f.currency_as_of, f.period_end, CURRENT_DATE);

  v_target := CASE
    WHEN v_mode = 'AS_REPORTED' THEN f.reporting_currency
    WHEN v_reg IS NULL THEN NULL
    WHEN v_mode = 'REGULATOR_BASE' THEN public.fx_base_currency(v_reg)
    ELSE public.fx_reporting_currency(v_reg) END;

  FOR r IN
    SELECT rm.code, rm.name, rm.unit, v.value_numeric
      FROM public.return_metric_values v
      JOIN public.return_filing_versions ver ON ver.id = v.return_filing_version_id
      JOIN public.regulatory_metrics rm ON rm.id = v.regulatory_metric_id
     WHERE ver.return_filing_id = _filing_id
     ORDER BY rm.code
  LOOP
    v_val := NULL; v_status := 'OK';
    IF r.value_numeric IS NULL THEN
      v_status := 'NOT_REPORTED';
    ELSIF v_target IS NULL OR f.reporting_currency IS NULL THEN
      v_status := 'UNCONVERTED';
    ELSIF v_target = f.reporting_currency THEN
      v_val := r.value_numeric;
    ELSE
      BEGIN
        v_val := (public.fx_convert(r.value_numeric, f.reporting_currency, v_target, v_at, v_reg, NULL)->>'amount')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_val := NULL; v_status := 'UNCONVERTED';
      END;
      IF v_val IS NULL THEN v_status := 'UNCONVERTED'; END IF;
    END IF;

    IF v_status = 'UNCONVERTED' THEN v_incomplete := v_incomplete + 1; END IF;

    v_rows := v_rows || jsonb_build_object(
      'code', r.code, 'name', r.name, 'unit', r.unit,
      'as_reported', r.value_numeric,
      'as_reported_currency', f.reporting_currency,
      'display_currency', v_target,
      'display_value', v_val,
      'status', v_status);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'filing_id', _filing_id, 'mode', v_mode,
    'filing_currency', f.reporting_currency,
    'regulator_id', v_reg,
    'regulator_source', f.regulator_source,
    'regulator_provenance', v_prov,
    'display_currency', v_target,
    'fx_as_of', v_at,
    'mixed_currency', (v_target IS DISTINCT FROM f.reporting_currency),
    'incomplete_count', v_incomplete,
    'summable', (v_incomplete = 0 AND v_target IS NOT NULL),
    'metrics', v_rows);
END $function$;

-- 10. Identifier registration: canonical body, fail closed --------------------
CREATE OR REPLACE FUNCTION public.entity_identifier_register(_entity_id uuid, _identifier_type_key text, _identifier_value text, _jurisdiction_id uuid DEFAULT NULL::uuid, _issuer_key text DEFAULT NULL::text, _is_primary boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  u uuid := auth.uid();
  t public.entity_identifier_types%ROWTYPE;
  st_label text;
  new_id uuid := gen_random_uuid();
  v_status text;
  v_reg uuid;
BEGIN
  IF u IS NULL OR NOT public.is_internal_staff(u) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.e360_section_allowed(u, 'identity') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO t FROM public.entity_identifier_types
  WHERE key = _identifier_type_key AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown_or_inactive_identifier_type: %', _identifier_type_key USING ERRCODE = '22023';
  END IF;

  IF _identifier_value IS NULL OR btrim(_identifier_value) = '' THEN
    RAISE EXCEPTION 'identifier_value_required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'entity_not_found' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entity_identifiers i
    WHERE i.entity_id = _entity_id
      AND i.identifier_type_id = t.id
      AND i.effective_to IS NULL
  ) THEN
    RAISE EXCEPTION 'duplicate_active_identifier_for_type' USING ERRCODE = '23505';
  END IF;

  -- Regulator-scoped identifiers key off the canonical regulator BODY only.
  IF t.uniqueness_scope = 'REGULATOR' THEN
    BEGIN
      v_reg := (public.entity_regulator_body_resolve(_entity_id, CURRENT_DATE, NULL, NULL)->>'regulator_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'identifier_regulator_unresolved' USING ERRCODE = '22023',
        DETAIL = 'This entity requires a regulator body for a regulator-scoped identifier and none can be resolved unambiguously.';
    END;
    IF v_reg IS NULL THEN
      RAISE EXCEPTION 'identifier_regulator_unresolved' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT s.label INTO st_label
  FROM public.licensees l
  LEFT JOIN public.entity_identity_statuses s ON s.id = l.identity_status_id
  WHERE l.id = _entity_id;

  v_status := CASE st_label
    WHEN 'Verified' THEN 'VERIFIED'
    WHEN 'Provisional' THEN 'PROVISIONAL'
    WHEN 'Disputed' THEN 'DISPUTED'
    ELSE 'UNVERIFIED'
  END;

  IF _is_primary THEN
    UPDATE public.entity_identifiers
    SET is_primary = false, updated_at = now()
    WHERE entity_id = _entity_id AND is_primary AND effective_to IS NULL;
  END IF;

  INSERT INTO public.entity_identifiers (
    id, entity_id, identifier_type_id, identifier_value, normalized_value,
    uniqueness_scope, jurisdiction_id, issuer_key, regulator_id,
    is_primary, verification_status, effective_from, source_type, source_reference
  ) VALUES (
    new_id, _entity_id, t.id, _identifier_value,
    CASE t.normalization_strategy
      WHEN 'DIGITS_ONLY' THEN regexp_replace(_identifier_value, '\D', '', 'g')
      WHEN 'UPPER_ALPHANUMERIC' THEN upper(regexp_replace(_identifier_value, '[^A-Za-z0-9]', '', 'g'))
      WHEN 'UPPER_TRIM' THEN upper(btrim(_identifier_value))
      ELSE upper(btrim(_identifier_value))
    END,
    t.uniqueness_scope, _jurisdiction_id, _issuer_key, v_reg,
    _is_primary, v_status, now(), 'MANUAL', 'E360-IDENTITY-UI'
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (u, 'ENTITY_IDENTIFIER_REGISTERED', 'entity_identifiers', new_id::text,
          jsonb_build_object('entity_id', _entity_id, 'identifier_type', _identifier_type_key,
                             'identifier_value', _identifier_value, 'is_primary', _is_primary,
                             'verification_status', v_status, 'regulator_id', v_reg),
          jsonb_build_object('source', 'entity360_identity_section'));

  RETURN jsonb_build_object('id', new_id, 'verification_status', v_status, 'regulator_id', v_reg);
END $function$;

-- 11. Deterministic data repair ----------------------------------------------
DO $do$
DECLARE r record; v uuid; n_ident int := 0; n_ob int := 0; n_fil int := 0;
BEGIN
  -- 11a. Identifiers written by the retired hard-coded fallback / officer path.
  FOR r IN
    SELECT i.id, i.entity_id, i.regulator_id
      FROM public.entity_identifiers i
     WHERE i.uniqueness_scope = 'REGULATOR'
       AND (i.regulator_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.regulators g
                            WHERE g.id = i.regulator_id AND lower(COALESCE(g.status,'')) = 'active'))
  LOOP
    BEGIN
      v := (public.entity_regulator_body_resolve(r.entity_id, CURRENT_DATE, NULL, NULL)->>'regulator_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v := NULL;
    END;
    IF v IS NOT NULL AND v IS DISTINCT FROM r.regulator_id THEN
      UPDATE public.entity_identifiers SET regulator_id = v, updated_at = now() WHERE id = r.id;
      INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
      VALUES (NULL, 'ENTITY_IDENTIFIER_REGULATOR_BODY_REPAIRED', 'entity_identifiers', r.id::text,
              jsonb_build_object('regulator_id', r.regulator_id),
              jsonb_build_object('regulator_id', v),
              jsonb_build_object('source','f7b_regulator_body_repair','deterministic',true));
      n_ident := n_ident + 1;
    END IF;
  END LOOP;

  -- 11b. Obligation regulator-body snapshot (additive, deterministic only).
  FOR r IN SELECT o.id, o.entity_id, o.return_definition_id
             FROM public.entity_reporting_obligations o WHERE o.regulator_id IS NULL
  LOOP
    BEGIN
      v := (public.entity_regulator_body_resolve(r.entity_id, CURRENT_DATE, r.return_definition_id, NULL)->>'regulator_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v := NULL;
    END;
    IF v IS NOT NULL THEN
      UPDATE public.entity_reporting_obligations SET regulator_id = v WHERE id = r.id;
      n_ob := n_ob + 1;
    END IF;
  END LOOP;

  -- 11c. Historical filing regulator provenance where deterministic.
  FOR r IN SELECT f.id, f.entity_id, f.return_definition_id
             FROM public.return_filings f WHERE f.regulator_id IS NULL
  LOOP
    BEGIN
      v := (public.entity_regulator_body_resolve(r.entity_id, CURRENT_DATE, r.return_definition_id, NULL)->>'regulator_id')::uuid;
    EXCEPTION WHEN OTHERS THEN v := NULL;
    END;
    IF v IS NOT NULL THEN
      UPDATE public.return_filings
         SET regulator_id = v, regulator_source = 'BACKFILL_DETERMINISTIC'
       WHERE id = r.id;
      n_fil := n_fil + 1;
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value, metadata)
  VALUES (NULL, 'REGULATOR_BODY_IDENTITY_REPAIR', 'migration', 'f7b_regulator_body',
          jsonb_build_object('identifiers_repaired', n_ident, 'obligations_backfilled', n_ob,
                             'filings_backfilled', n_fil),
          jsonb_build_object('source','f7b_regulator_body_repair'));
END $do$;

-- 12. Grants ------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.entity_regulator_body_resolve(uuid, date, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_regulator_bodies(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entity_regulator_body_related(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_regulator_body_resolve(uuid, date, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_regulator_bodies(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_regulator_body_related(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_reporting_currency_resolve(uuid, date, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_currency_approval_mode(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_set(uuid, text, date, text, date, uuid) TO authenticated, service_role;
