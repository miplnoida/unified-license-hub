-- F7-B / F6-X additive extension: entity reporting currency
CREATE TABLE IF NOT EXISTS public.entity_currency_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  reporting_currency_override text NOT NULL REFERENCES public.currencies(code),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'ACTIVE',
  reason text,
  source text NOT NULL DEFAULT 'ENTITY_360',
  provenance_reference text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  superseded_by uuid REFERENCES public.entity_currency_profiles(id),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ecp_status_chk CHECK (status IN ('ACTIVE','SUPERSEDED','WITHDRAWN')),
  CONSTRAINT ecp_window_chk CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.entity_currency_profiles IS
  'F7-B/F6-X: canonical effective-dated entity reporting-currency override. Absence of an ACTIVE row means the entity inherits the regulator BASE currency. Maintained only through Entity 360 governed RPCs.';

CREATE INDEX IF NOT EXISTS idx_ecp_entity_effective ON public.entity_currency_profiles(entity_id, effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ecp_entity_active_from ON public.entity_currency_profiles(entity_id, effective_from) WHERE status = 'ACTIVE';

GRANT SELECT ON public.entity_currency_profiles TO authenticated;
GRANT ALL ON public.entity_currency_profiles TO service_role;
ALTER TABLE public.entity_currency_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecp_read ON public.entity_currency_profiles;
CREATE POLICY ecp_read ON public.entity_currency_profiles FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(),'licensee_management','view')
  OR public.has_permission(auth.uid(),'returns_management','view')
  OR public.entity_membership_capability(auth.uid(), entity_id, 'returns.view')
);

DROP TRIGGER IF EXISTS trg_ecp_touch ON public.entity_currency_profiles;
CREATE TRIGGER trg_ecp_touch BEFORE UPDATE ON public.entity_currency_profiles
FOR EACH ROW EXECUTE FUNCTION public.onboarding_touch();

-- Business configuration: statutory return-definition currency mandate
ALTER TABLE public.return_definitions
  ADD COLUMN IF NOT EXISTS mandatory_currency_code text REFERENCES public.currencies(code);
COMMENT ON COLUMN public.return_definitions.mandatory_currency_code IS
  'F7-B: BUSINESS CONFIGURATION. When set, this return definition must be filed in this currency, overriding the entity reporting currency. NULL = follow entity/base resolution.';

-- Business configuration: returns FX date policy on the monetary config
ALTER TABLE public.monetary_configs
  ADD COLUMN IF NOT EXISTS returns_fx_date_policy text NOT NULL DEFAULT 'PERIOD_END';
DO $$ BEGIN
  ALTER TABLE public.monetary_configs
    ADD CONSTRAINT monetary_configs_returns_fx_date_policy_check
    CHECK (returns_fx_date_policy IN ('PERIOD_END','FILING_DATE','ACCEPTANCE_DATE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.monetary_configs.returns_fx_date_policy IS
  'F7-B: BUSINESS CONFIGURATION. Effective date used when converting as-reported return amounts to base/reporting currency.';

-- Filing currency snapshot
ALTER TABLE public.return_filings
  ADD COLUMN IF NOT EXISTS reporting_currency text REFERENCES public.currencies(code),
  ADD COLUMN IF NOT EXISTS currency_source text,
  ADD COLUMN IF NOT EXISTS entity_currency_profile_id uuid REFERENCES public.entity_currency_profiles(id),
  ADD COLUMN IF NOT EXISTS currency_as_of date,
  ADD COLUMN IF NOT EXISTS monetary_config_id uuid REFERENCES public.monetary_configs(id),
  ADD COLUMN IF NOT EXISTS currency_snapshot_at timestamptz;
DO $$ BEGIN
  ALTER TABLE public.return_filings
    ADD CONSTRAINT return_filings_currency_source_check
    CHECK (currency_source IS NULL OR currency_source IN ('REGULATOR_BASE','ENTITY_OVERRIDE','RETURN_DEFINITION'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.return_filings.reporting_currency IS
  'F7-B: authoritative as-reported filing currency, snapshotted when the filing is opened. Never recomputed for historical filings.';

-- Regulator context for an entity, derived server-side
CREATE OR REPLACE FUNCTION public.entity_reporting_regulator(_entity_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT l.lead_regulator_id FROM public.licensees l WHERE l.id = _entity_id;
$$;

-- Canonical resolver
CREATE OR REPLACE FUNCTION public.entity_reporting_currency_resolve(
  _entity_id uuid, _as_of date DEFAULT CURRENT_DATE, _return_definition_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_reg uuid; v_cfg public.monetary_configs; v_prof public.entity_currency_profiles;
  v_def public.return_definitions; v_cur text; v_src text; v_at date := COALESCE(_as_of, CURRENT_DATE);
BEGIN
  IF _entity_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_ENTITY_NOT_RESOLVED' USING ERRCODE = 'P0002';
  END IF;
  v_reg := public.entity_reporting_regulator(_entity_id);
  v_cfg := public.monetary_config_resolve(v_reg);
  IF v_cfg.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_MONETARY_CONFIG_MISSING' USING ERRCODE = 'P0002';
  END IF;

  IF _return_definition_id IS NOT NULL THEN
    SELECT * INTO v_def FROM public.return_definitions WHERE id = _return_definition_id;
    IF v_def.mandatory_currency_code IS NOT NULL THEN
      v_cur := upper(v_def.mandatory_currency_code); v_src := 'RETURN_DEFINITION';
    END IF;
  END IF;

  IF v_cur IS NULL THEN
    SELECT * INTO v_prof FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id AND status = 'ACTIVE'
       AND effective_from <= v_at
       AND (effective_to IS NULL OR effective_to >= v_at)
     ORDER BY effective_from DESC LIMIT 1;
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
    'ok', true, 'entity_id', _entity_id, 'regulator_id', v_reg,
    'currency', v_cur, 'source', v_src, 'as_of', v_at,
    'entity_currency_profile_id', CASE WHEN v_src = 'ENTITY_OVERRIDE' THEN v_prof.id ELSE NULL END,
    'monetary_config_id', v_cfg.id,
    'regulator_base_currency', v_cfg.base_currency,
    'regulator_reporting_currency', v_cfg.reporting_currency,
    'returns_fx_date_policy', v_cfg.returns_fx_date_policy);
END $$;

-- Governed override maintenance (Entity 360 authority)
CREATE OR REPLACE FUNCTION public.entity_currency_override_set(
  _entity_id uuid, _currency text, _effective_from date, _reason text,
  _effective_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_reg uuid; v_code text := upper(btrim(_currency)); v_id uuid; v_prior uuid;
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
  v_reg := public.entity_reporting_regulator(_entity_id);
  IF NOT public.currency_is_supported(v_code, v_reg) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_UNSUPPORTED:%', v_code USING ERRCODE = '22023';
  END IF;

  -- close (never destroy) any active override that would overlap
  FOR v_prior IN
    SELECT id FROM public.entity_currency_profiles
     WHERE entity_id = _entity_id AND status = 'ACTIVE'
       AND (effective_to IS NULL OR effective_to >= _effective_from)
  LOOP
    UPDATE public.entity_currency_profiles
       SET status = 'SUPERSEDED', superseded_at = now(),
           effective_to = LEAST(COALESCE(effective_to, _effective_from - 1), _effective_from - 1)
     WHERE id = v_prior;
  END LOOP;

  INSERT INTO public.entity_currency_profiles(
    entity_id, reporting_currency_override, effective_from, effective_to, status,
    reason, source, created_by, approved_by, approved_at)
  VALUES (_entity_id, v_code, _effective_from, _effective_to, 'ACTIVE',
          btrim(_reason), 'ENTITY_360', v_uid, v_uid, now())
  RETURNING id INTO v_id;

  UPDATE public.entity_currency_profiles SET superseded_by = v_id
   WHERE entity_id = _entity_id AND status = 'SUPERSEDED' AND superseded_by IS NULL;

  PERFORM public.create_audit_log('entity_currency_profile', v_id, 'OVERRIDE_SET',
    jsonb_build_object('entity_id', _entity_id, 'currency', v_code,
                       'effective_from', _effective_from, 'effective_to', _effective_to,
                       'reason', btrim(_reason)));

  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', v_id, 'currency', v_code);
END $$;

CREATE OR REPLACE FUNCTION public.entity_currency_override_supersede(_profile_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.entity_currency_profiles;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.entity_currency_profiles WHERE id = _profile_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_row.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_PROFILE_NOT_ACTIVE' USING ERRCODE = '22023';
  END IF;
  UPDATE public.entity_currency_profiles
     SET status = CASE WHEN v_row.effective_from > CURRENT_DATE THEN 'WITHDRAWN' ELSE 'SUPERSEDED' END,
         superseded_at = now(),
         effective_to = CASE WHEN v_row.effective_from > CURRENT_DATE THEN effective_to
                             ELSE LEAST(COALESCE(effective_to, CURRENT_DATE), CURRENT_DATE) END,
         reason = COALESCE(v_row.reason,'') || ' | superseded: ' || btrim(_reason)
   WHERE id = _profile_id;
  PERFORM public.create_audit_log('entity_currency_profile', _profile_id, 'OVERRIDE_SUPERSEDED',
    jsonb_build_object('entity_id', v_row.entity_id, 'reason', btrim(_reason)));
  RETURN jsonb_build_object('ok', true, 'entity_currency_profile_id', _profile_id);
END $$;

CREATE OR REPLACE FUNCTION public.entity_currency_profile_overview(_entity_id uuid, _as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_res jsonb; v_hist jsonb;
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'licensee_management','view')
          OR public.has_permission(v_uid,'returns_management','view')
          OR public.entity_membership_capability(v_uid, _entity_id, 'returns.view')) THEN
    RAISE EXCEPTION 'ENTITY_CURRENCY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  v_res := public.entity_reporting_currency_resolve(_entity_id, _as_of, NULL);
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.effective_from DESC, p.created_at DESC), '[]'::jsonb)
    INTO v_hist FROM public.entity_currency_profiles p WHERE p.entity_id = _entity_id;
  RETURN v_res || jsonb_build_object(
    'can_manage', public.is_super_admin(v_uid) OR public.has_permission(v_uid,'licensee_management','edit'),
    'history', v_hist,
    'mandated_definitions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('return_definition_id', d.id, 'code', d.code,
                                          'name', d.name, 'currency', d.mandatory_currency_code)
                       ORDER BY d.code)
        FROM public.return_definitions d
        JOIN public.entity_reporting_obligations o ON o.return_definition_id = d.id AND o.entity_id = _entity_id
       WHERE d.mandatory_currency_code IS NOT NULL), '[]'::jsonb));
END $$;

-- Filing currency snapshot: protect once authoritative
CREATE OR REPLACE FUNCTION public.return_filing_currency_snapshot_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.reporting_currency IS NOT NULL
     AND NEW.reporting_currency IS DISTINCT FROM OLD.reporting_currency
     AND OLD.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'RETURN_FILING_CURRENCY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_return_filing_currency_protect ON public.return_filings;
CREATE TRIGGER trg_return_filing_currency_protect BEFORE UPDATE ON public.return_filings
FOR EACH ROW EXECUTE FUNCTION public.return_filing_currency_snapshot_protect();

-- Snapshot helper used at the canonical lifecycle point (filing open)
CREATE OR REPLACE FUNCTION public.returns_snapshot_filing_currency(_filing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  v_res := public.entity_reporting_currency_resolve(f.entity_id, v_at, f.return_definition_id);
  UPDATE public.return_filings
     SET reporting_currency = v_res->>'currency',
         currency_source = v_res->>'source',
         entity_currency_profile_id = NULLIF(v_res->>'entity_currency_profile_id','')::uuid,
         currency_as_of = v_at,
         monetary_config_id = NULLIF(v_res->>'monetary_config_id','')::uuid,
         currency_snapshot_at = now()
   WHERE id = _filing_id;
  PERFORM public.create_audit_log('return_filing', _filing_id, 'CURRENCY_SNAPSHOT', v_res);
  RETURN v_res || jsonb_build_object('already_snapshotted', false);
END $$;

-- Governed DRAFT-only rebase; submitted/accepted filings can never be rebased
CREATE OR REPLACE FUNCTION public.returns_rebase_filing_currency(_filing_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  v_res := public.entity_reporting_currency_resolve(f.entity_id, f.period_end, f.return_definition_id);
  UPDATE public.return_filings
     SET reporting_currency = v_res->>'currency',
         currency_source = v_res->>'source',
         entity_currency_profile_id = NULLIF(v_res->>'entity_currency_profile_id','')::uuid,
         currency_as_of = f.period_end,
         monetary_config_id = NULLIF(v_res->>'monetary_config_id','')::uuid,
         currency_snapshot_at = now()
   WHERE id = _filing_id;
  PERFORM public.create_audit_log('return_filing', _filing_id, 'CURRENCY_REBASED',
    jsonb_build_object('from', v_old, 'to', v_res->>'currency', 'reason', btrim(_reason)));
  RETURN v_res || jsonb_build_object('previous_currency', v_old);
END $$;

REVOKE ALL ON FUNCTION public.returns_snapshot_filing_currency(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.entity_reporting_regulator(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.entity_reporting_currency_resolve(uuid, date, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.entity_currency_override_set(uuid, text, date, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.entity_currency_override_supersede(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.entity_currency_profile_overview(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.returns_rebase_filing_currency(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.entity_reporting_currency_resolve(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_set(uuid, text, date, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_currency_override_supersede(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_currency_profile_overview(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_rebase_filing_currency(uuid, text) TO authenticated;