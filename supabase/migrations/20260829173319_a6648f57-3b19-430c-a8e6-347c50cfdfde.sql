-- ============================================================
-- F6-X  Multi-currency, effective-dated FX, base/reporting currency
-- Additive extension to the frozen F6 financial contract.
-- ============================================================

-- ---------- 1. Currency master ----------
CREATE TABLE IF NOT EXISTS public.currencies (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name text NOT NULL,
  display_symbol text,
  decimal_precision smallint NOT NULL DEFAULT 2 CHECK (decimal_precision BETWEEN 0 AND 6),
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.currencies TO authenticated;
GRANT ALL ON public.currencies TO service_role;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "currencies readable" ON public.currencies;
CREATE POLICY "currencies readable" ON public.currencies FOR SELECT TO authenticated USING (true);

INSERT INTO public.currencies(code, name, display_symbol, decimal_precision) VALUES
  ('XCD','East Caribbean Dollar','EC$',2),
  ('USD','United States Dollar','US$',2),
  ('JMD','Jamaican Dollar','J$',2),
  ('EUR','Euro','€',2),
  ('GBP','Pound Sterling','£',2)
ON CONFLICT (code) DO NOTHING;

-- ---------- 2. Regulator / jurisdiction monetary configuration ----------
CREATE TABLE IF NOT EXISTS public.monetary_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  base_currency text NOT NULL REFERENCES public.currencies(code),
  reporting_currency text NOT NULL REFERENCES public.currencies(code),
  supported_transaction_currencies text[] NOT NULL DEFAULT '{}',
  accepted_payment_currencies text[] NOT NULL DEFAULT '{}',
  settlement_currencies text[] NOT NULL DEFAULT '{}',
  cross_currency_settlement_allowed boolean NOT NULL DEFAULT false,
  fx_resolution_policy text NOT NULL DEFAULT 'LAST_APPROVED_EFFECTIVE_RATE'
    CHECK (fx_resolution_policy IN ('LAST_APPROVED_EFFECTIVE_RATE','EXACT_DATE_REQUIRED','FIXED_RATE')),
  fx_source_policy text NOT NULL DEFAULT 'REGULATOR_MAINTAINED',
  rounding_policy text NOT NULL DEFAULT 'HALF_UP'
    CHECK (rounding_policy IN ('HALF_UP','DOWN','UP')),
  decimal_precision smallint NOT NULL DEFAULT 2 CHECK (decimal_precision BETWEEN 0 AND 6),
  payment_fx_date_policy text NOT NULL DEFAULT 'PAYMENT_DATE'
    CHECK (payment_fx_date_policy IN ('PAYMENT_DATE','SETTLEMENT_DATE','VERIFICATION_DATE')),
  refund_fx_date_policy text NOT NULL DEFAULT 'ORIGINAL_PAYMENT_DATE'
    CHECK (refund_fx_date_policy IN ('ORIGINAL_PAYMENT_DATE','REFUND_DATE')),
  cross_currency_refund_allowed boolean NOT NULL DEFAULT false,
  backdating_requires_authority boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.monetary_configs TO authenticated;
GRANT ALL ON public.monetary_configs TO service_role;
ALTER TABLE public.monetary_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monetary config readable" ON public.monetary_configs;
CREATE POLICY "monetary config readable" ON public.monetary_configs
  FOR SELECT TO authenticated USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS monetary_configs_scope_active
  ON public.monetary_configs (COALESCE(regulator_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_active;

-- Platform-scope row derived from the existing site currency setting (not invented).
INSERT INTO public.monetary_configs(
  regulator_id, base_currency, reporting_currency,
  supported_transaction_currencies, accepted_payment_currencies, settlement_currencies,
  cross_currency_settlement_allowed, notes)
SELECT NULL,
       d.cur, d.cur, ARRAY[d.cur], ARRAY[d.cur], ARRAY[d.cur], false,
       'Derived from site_settings.general.currency at F6-X install. Requires regulator confirmation (BCR).'
  FROM (
    SELECT COALESCE(
      (SELECT upper(value->>'currency') FROM public.site_settings WHERE key = 'general'
        AND (value->>'currency') ~* '^[a-z]{3}$'),
      'USD') AS cur
  ) d
 WHERE NOT EXISTS (SELECT 1 FROM public.monetary_configs WHERE regulator_id IS NULL AND is_active);

-- ---------- 3. Effective-dated FX rate register ----------
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  from_currency text NOT NULL REFERENCES public.currencies(code),
  to_currency text NOT NULL REFERENCES public.currencies(code),
  rate numeric(20,10) NOT NULL CHECK (rate > 0),
  quote_convention text NOT NULL DEFAULT 'UNITS_OF_TO_PER_ONE_FROM'
    CHECK (quote_convention IN ('UNITS_OF_TO_PER_ONE_FROM','UNITS_OF_FROM_PER_ONE_TO')),
  effective_from date NOT NULL,
  effective_to date,
  regime text NOT NULL DEFAULT 'EFFECTIVE_UNTIL_CHANGED'
    CHECK (regime IN ('MARKET','EFFECTIVE_UNTIL_CHANGED','FIXED')),
  rate_source text NOT NULL DEFAULT 'REGULATOR_MAINTAINED',
  rate_type text NOT NULL DEFAULT 'MID' CHECK (rate_type IN ('MID','BUY','SELL','OFFICIAL')),
  status text NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED','APPROVED','REJECTED','SUPERSEDED')),
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.fx_rates(id),
  superseded_by uuid REFERENCES public.fx_rates(id),
  provenance_reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  decision_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_currency <> to_currency),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
GRANT SELECT ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fx rates readable" ON public.fx_rates;
CREATE POLICY "fx rates readable" ON public.fx_rates FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS fx_rates_lookup
  ON public.fx_rates (from_currency, to_currency, status, effective_from DESC);

-- ---------- 4. Immutable conversion evidence ----------
CREATE TABLE IF NOT EXISTS public.fx_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('SETTLEMENT','BASE','REPORTING','REFUND','ADJUSTMENT')),
  subject_type text NOT NULL,
  subject_id uuid,
  source_amount numeric(18,4) NOT NULL,
  source_currency text NOT NULL,
  target_amount numeric(18,4) NOT NULL,
  target_currency text NOT NULL,
  rate numeric(20,10) NOT NULL,
  quote_convention text NOT NULL,
  fx_rate_id uuid REFERENCES public.fx_rates(id),
  fx_rate_version integer,
  fx_effective_date date NOT NULL,
  fx_regime text,
  fx_source text,
  rounding_policy text,
  rounding_difference numeric(18,6) NOT NULL DEFAULT 0,
  converted_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.fx_conversions TO authenticated;
GRANT ALL ON public.fx_conversions TO service_role;
ALTER TABLE public.fx_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fx conversions readable by finance" ON public.fx_conversions;
CREATE POLICY "fx conversions readable by finance" ON public.fx_conversions
  FOR SELECT TO authenticated
  USING (public.fee_can_administer(auth.uid()));

CREATE OR REPLACE FUNCTION public.fx_conversions_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'FX_CONVERSION_IMMUTABLE' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS fx_conversions_append_only ON public.fx_conversions;
CREATE TRIGGER fx_conversions_append_only
  BEFORE UPDATE OR DELETE ON public.fx_conversions
  FOR EACH ROW EXECUTE FUNCTION public.fx_conversions_append_only();

-- ---------- 5. Allocation FX provenance (additive) ----------
ALTER TABLE public.fee_payment_allocations
  ADD COLUMN IF NOT EXISTS source_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS fx_rate numeric(20,10),
  ADD COLUMN IF NOT EXISTS fx_rate_id uuid REFERENCES public.fx_rates(id),
  ADD COLUMN IF NOT EXISTS fx_quote_convention text,
  ADD COLUMN IF NOT EXISTS fx_effective_date date,
  ADD COLUMN IF NOT EXISTS fx_conversion_id uuid REFERENCES public.fx_conversions(id),
  ADD COLUMN IF NOT EXISTS rounding_difference numeric(18,6),
  ADD COLUMN IF NOT EXISTS base_amount numeric(18,4),
  ADD COLUMN IF NOT EXISTS base_currency text;

-- ---------- 6. Rate register guards ----------
CREATE OR REPLACE FUNCTION public.fx_rate_usage_count(_rate_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*) FROM public.fx_conversions WHERE fx_rate_id = _rate_id;
$$;

CREATE OR REPLACE FUNCTION public.fx_rates_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'PROPOSED' OR public.fx_rate_usage_count(OLD.id) > 0 THEN
      RAISE EXCEPTION 'FX_RATE_NOT_DELETABLE' USING ERRCODE = '42501',
        DETAIL = 'Approved or used exchange rates are superseded, never deleted.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('APPROVED','SUPERSEDED','REJECTED') OR public.fx_rate_usage_count(OLD.id) > 0 THEN
    IF NEW.rate IS DISTINCT FROM OLD.rate
       OR NEW.from_currency IS DISTINCT FROM OLD.from_currency
       OR NEW.to_currency IS DISTINCT FROM OLD.to_currency
       OR NEW.quote_convention IS DISTINCT FROM OLD.quote_convention
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.regime IS DISTINCT FROM OLD.regime THEN
      RAISE EXCEPTION 'FX_RATE_IMMUTABLE' USING ERRCODE = '42501',
        DETAIL = 'A decided or used exchange rate must be superseded, not rewritten.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fx_rates_protect ON public.fx_rates;
CREATE TRIGGER fx_rates_protect BEFORE UPDATE OR DELETE ON public.fx_rates
  FOR EACH ROW EXECUTE FUNCTION public.fx_rates_protect();

-- Direct browser DML is never permitted on the register or configuration.
REVOKE INSERT, UPDATE, DELETE ON public.fx_rates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.monetary_configs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.currencies FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fx_conversions FROM authenticated;
REVOKE ALL ON public.fx_rates FROM anon;
REVOKE ALL ON public.monetary_configs FROM anon;
REVOKE ALL ON public.currencies FROM anon;
REVOKE ALL ON public.fx_conversions FROM anon;

-- ---------- 7. Configuration resolution ----------
CREATE OR REPLACE FUNCTION public.monetary_config_resolve(_regulator_id uuid DEFAULT NULL)
RETURNS public.monetary_configs LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE c public.monetary_configs;
BEGIN
  IF _regulator_id IS NOT NULL THEN
    SELECT * INTO c FROM public.monetary_configs
     WHERE regulator_id = _regulator_id AND is_active LIMIT 1;
  END IF;
  IF c.id IS NULL THEN
    SELECT * INTO c FROM public.monetary_configs
     WHERE regulator_id IS NULL AND is_active LIMIT 1;
  END IF;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'MONETARY_CONFIG_MISSING' USING ERRCODE = '22023',
      DETAIL = 'No active monetary configuration is available for this scope.';
  END IF;
  RETURN c;
END $$;
GRANT EXECUTE ON FUNCTION public.monetary_config_resolve(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fx_base_currency(_regulator_id uuid DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.monetary_config_resolve(_regulator_id)).base_currency;
$$;
CREATE OR REPLACE FUNCTION public.fx_reporting_currency(_regulator_id uuid DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (public.monetary_config_resolve(_regulator_id)).reporting_currency;
$$;
GRANT EXECUTE ON FUNCTION public.fx_base_currency(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fx_reporting_currency(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.currency_is_supported(_code text, _regulator_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.monetary_configs;
BEGIN
  IF _code IS NULL OR _code !~ '^[A-Za-z]{3}$' THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = upper(_code) AND is_active) THEN
    RETURN false;
  END IF;
  c := public.monetary_config_resolve(_regulator_id);
  RETURN upper(_code) = ANY (c.supported_transaction_currencies)
      OR upper(_code) = c.base_currency
      OR upper(_code) = c.reporting_currency;
END $$;
GRANT EXECUTE ON FUNCTION public.currency_is_supported(text, uuid) TO authenticated, service_role;

-- ---------- 8. Rounding + rate resolution ----------
CREATE OR REPLACE FUNCTION public.fx_round(_amount numeric, _precision integer, _policy text)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(COALESCE(_policy,'HALF_UP'))
           WHEN 'DOWN' THEN trunc(_amount * power(10, _precision)) / power(10, _precision)
           WHEN 'UP'   THEN ceil(abs(_amount) * power(10, _precision)) / power(10, _precision) * sign(_amount)
           ELSE round(_amount, _precision)
         END;
$$;

CREATE OR REPLACE FUNCTION public.fx_resolve_rate(
  _from text, _to text, _at date, _regulator_id uuid DEFAULT NULL, _policy_override text DEFAULT NULL)
RETURNS public.fx_rates LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.monetary_configs;
  r public.fx_rates;
  v_policy text;
  v_from text := upper(btrim(_from));
  v_to   text := upper(btrim(_to));
BEGIN
  IF v_from = v_to THEN
    RAISE EXCEPTION 'FX_NO_CONVERSION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF _at IS NULL THEN
    RAISE EXCEPTION 'FX_EFFECTIVE_DATE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_from AND is_active)
     OR NOT EXISTS (SELECT 1 FROM public.currencies WHERE code = v_to AND is_active) THEN
    RAISE EXCEPTION 'FX_CURRENCY_UNSUPPORTED' USING ERRCODE = '22023',
      DETAIL = format('Unknown or inactive currency in pair %s/%s', v_from, v_to);
  END IF;

  c := public.monetary_config_resolve(_regulator_id);
  v_policy := COALESCE(NULLIF(btrim(_policy_override),''), c.fx_resolution_policy);

  SELECT * INTO r FROM public.fx_rates f
   WHERE f.status = 'APPROVED'
     AND f.from_currency = v_from AND f.to_currency = v_to
     AND (f.regulator_id = _regulator_id OR f.regulator_id IS NULL)
     AND f.effective_from <= _at
     AND (f.effective_to IS NULL OR f.effective_to >= _at)
     AND (v_policy <> 'FIXED_RATE' OR f.regime = 'FIXED')
     AND (v_policy <> 'EXACT_DATE_REQUIRED' OR f.effective_from = _at OR f.regime = 'FIXED')
   ORDER BY (f.regulator_id IS NOT NULL) DESC, f.effective_from DESC, f.version DESC, f.created_at DESC
   LIMIT 1;

  IF r.id IS NULL THEN
    -- inverse quotation of the same governed pair
    SELECT * INTO r FROM public.fx_rates f
     WHERE f.status = 'APPROVED'
       AND f.from_currency = v_to AND f.to_currency = v_from
       AND (f.regulator_id = _regulator_id OR f.regulator_id IS NULL)
       AND f.effective_from <= _at
       AND (f.effective_to IS NULL OR f.effective_to >= _at)
       AND (v_policy <> 'FIXED_RATE' OR f.regime = 'FIXED')
       AND (v_policy <> 'EXACT_DATE_REQUIRED' OR f.effective_from = _at OR f.regime = 'FIXED')
     ORDER BY (f.regulator_id IS NOT NULL) DESC, f.effective_from DESC, f.version DESC, f.created_at DESC
     LIMIT 1;
  END IF;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'FX_RATE_NOT_FOUND' USING ERRCODE = '22023',
      DETAIL = format('No approved %s rate for %s/%s effective %s', v_policy, v_from, v_to, _at);
  END IF;
  RETURN r;
END $$;
GRANT EXECUTE ON FUNCTION public.fx_resolve_rate(text, text, date, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fx_convert(
  _amount numeric, _from text, _to text, _at date,
  _regulator_id uuid DEFAULT NULL, _policy_override text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.monetary_configs;
  r public.fx_rates;
  v_from text := upper(btrim(_from));
  v_to   text := upper(btrim(_to));
  v_raw numeric; v_out numeric; v_eff numeric; v_dir text;
BEGIN
  IF _amount IS NULL THEN
    RAISE EXCEPTION 'FX_AMOUNT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  c := public.monetary_config_resolve(_regulator_id);

  IF v_from = v_to THEN
    RETURN jsonb_build_object(
      'ok', true, 'conversion_required', false,
      'source_amount', _amount, 'source_currency', v_from,
      'target_amount', public.fx_round(_amount, c.decimal_precision, c.rounding_policy),
      'target_currency', v_to, 'rate', 1, 'fx_rate_id', NULL,
      'quote_convention', 'IDENTITY', 'rounding_difference', 0);
  END IF;

  r := public.fx_resolve_rate(v_from, v_to, _at, _regulator_id, _policy_override);

  IF r.from_currency = v_from THEN
    v_eff := CASE WHEN r.quote_convention = 'UNITS_OF_TO_PER_ONE_FROM' THEN r.rate ELSE 1 / r.rate END;
    v_dir := 'DIRECT';
  ELSE
    v_eff := CASE WHEN r.quote_convention = 'UNITS_OF_TO_PER_ONE_FROM' THEN 1 / r.rate ELSE r.rate END;
    v_dir := 'INVERSE';
  END IF;

  v_raw := _amount * v_eff;
  v_out := public.fx_round(v_raw, c.decimal_precision, c.rounding_policy);

  RETURN jsonb_build_object(
    'ok', true, 'conversion_required', true,
    'source_amount', _amount, 'source_currency', v_from,
    'target_amount', v_out, 'target_currency', v_to,
    'rate', r.rate, 'effective_rate', v_eff, 'quote_convention', r.quote_convention,
    'quote_direction', v_dir,
    'fx_rate_id', r.id, 'fx_rate_version', r.version,
    'fx_effective_date', r.effective_from, 'fx_applied_date', _at,
    'fx_regime', r.regime, 'fx_source', r.rate_source,
    'rounding_policy', c.rounding_policy,
    'rounding_difference', round(v_raw - v_out, 6));
END $$;
GRANT EXECUTE ON FUNCTION public.fx_convert(numeric, text, text, date, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fx_record_conversion(
  _purpose text, _subject_type text, _subject_id uuid, _conv jsonb,
  _regulator_id uuid DEFAULT NULL, _actor uuid DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.fx_conversions(
    purpose, subject_type, subject_id, source_amount, source_currency,
    target_amount, target_currency, rate, quote_convention, fx_rate_id, fx_rate_version,
    fx_effective_date, fx_regime, fx_source, rounding_policy, rounding_difference,
    created_by, metadata)
  VALUES (
    _purpose, _subject_type, _subject_id,
    (_conv->>'source_amount')::numeric, _conv->>'source_currency',
    (_conv->>'target_amount')::numeric, _conv->>'target_currency',
    COALESCE((_conv->>'rate')::numeric, 1),
    COALESCE(_conv->>'quote_convention','IDENTITY'),
    NULLIF(_conv->>'fx_rate_id','')::uuid,
    NULLIF(_conv->>'fx_rate_version','')::integer,
    COALESCE(NULLIF(_conv->>'fx_applied_date','')::date, CURRENT_DATE),
    _conv->>'fx_regime', _conv->>'fx_source', _conv->>'rounding_policy',
    COALESCE((_conv->>'rounding_difference')::numeric, 0),
    _actor, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.fx_record_conversion(text, text, uuid, jsonb, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fx_record_conversion(text, text, uuid, jsonb, uuid, uuid, jsonb) TO service_role;

-- ---------- 9. Governed rate maintenance (maker-checker) ----------
CREATE OR REPLACE FUNCTION public.fx_rate_propose(
  _from text, _to text, _rate numeric, _effective_from date,
  _regime text DEFAULT 'EFFECTIVE_UNTIL_CHANGED',
  _quote_convention text DEFAULT 'UNITS_OF_TO_PER_ONE_FROM',
  _effective_to date DEFAULT NULL, _rate_source text DEFAULT 'REGULATOR_MAINTAINED',
  _rate_type text DEFAULT 'MID', _provenance_reference text DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.monetary_configs;
  v_id uuid; v_backdated boolean;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FX_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _rate IS NULL OR _rate <= 0 THEN
    RAISE EXCEPTION 'FX_RATE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _effective_from IS NULL THEN
    RAISE EXCEPTION 'FX_EFFECTIVE_DATE_REQUIRED' USING ERRCODE = '22023';
  END IF;

  c := public.monetary_config_resolve(_regulator_id);
  v_backdated := _effective_from < CURRENT_DATE;
  IF v_backdated AND c.backdating_requires_authority
     AND NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'settings','edit')) THEN
    RAISE EXCEPTION 'FX_BACKDATING_NOT_AUTHORISED' USING ERRCODE = '42501',
      DETAIL = 'Backdated exchange rates require explicit configuration authority.';
  END IF;

  INSERT INTO public.fx_rates(regulator_id, from_currency, to_currency, rate, quote_convention,
    effective_from, effective_to, regime, rate_source, rate_type, provenance_reference,
    notes, created_by, status)
  VALUES (_regulator_id, upper(btrim(_from)), upper(btrim(_to)), _rate,
          COALESCE(_quote_convention,'UNITS_OF_TO_PER_ONE_FROM'), _effective_from, _effective_to,
          COALESCE(_regime,'EFFECTIVE_UNTIL_CHANGED'), COALESCE(_rate_source,'REGULATOR_MAINTAINED'),
          COALESCE(_rate_type,'MID'), _provenance_reference, _notes, v_uid, 'PROPOSED')
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'fx.rate.proposed', 'fx_rate', v_id,
          jsonb_build_object('pair', upper(btrim(_from))||'/'||upper(btrim(_to)),
                             'rate', _rate, 'effective_from', _effective_from,
                             'regime', COALESCE(_regime,'EFFECTIVE_UNTIL_CHANGED'),
                             'backdated', v_backdated));
  RETURN jsonb_build_object('ok', true, 'fx_rate_id', v_id, 'status','PROPOSED','backdated', v_backdated);
END $$;
GRANT EXECUTE ON FUNCTION public.fx_rate_propose(text, text, numeric, date, text, text, date, text, text, text, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fx_rate_decide(_rate_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); r public.fx_rates; v_prev uuid; v_superseded int := 0;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FX_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.fx_rates WHERE id = _rate_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'FX_RATE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'FX_RATE_ALREADY_DECIDED' USING ERRCODE = '22023';
  END IF;
  IF _approve AND r.created_by IS NOT DISTINCT FROM v_uid AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'FX_MAKER_CHECKER' USING ERRCODE = '42501',
      DETAIL = 'An exchange rate must be approved by a different officer.';
  END IF;

  IF NOT _approve THEN
    UPDATE public.fx_rates
       SET status = 'REJECTED', decision_reason = btrim(_reason),
           approved_by = v_uid, approved_at = now()
     WHERE id = _rate_id;
    INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
    VALUES (v_uid, 'fx.rate.rejected', 'fx_rate', _rate_id,
            jsonb_build_object('status','PROPOSED'),
            jsonb_build_object('status','REJECTED','reason', btrim(_reason)));
    RETURN jsonb_build_object('ok', true, 'fx_rate_id', _rate_id, 'status','REJECTED');
  END IF;

  -- Close open-ended predecessors for the same governed pair/scope.
  FOR v_prev IN
    SELECT f.id FROM public.fx_rates f
     WHERE f.status = 'APPROVED'
       AND f.from_currency = r.from_currency AND f.to_currency = r.to_currency
       AND f.regulator_id IS NOT DISTINCT FROM r.regulator_id
       AND f.id <> r.id
       AND (f.effective_to IS NULL OR f.effective_to >= r.effective_from)
  LOOP
    UPDATE public.fx_rates
       SET effective_to = LEAST(COALESCE(effective_to, r.effective_from - 1), r.effective_from - 1),
           status = CASE WHEN r.effective_from <= effective_from THEN 'SUPERSEDED' ELSE status END,
           superseded_by = r.id
     WHERE id = v_prev;
    UPDATE public.fx_rates SET status = 'SUPERSEDED'
     WHERE id = v_prev AND effective_to < effective_from;
    v_superseded := v_superseded + 1;
  END LOOP;

  UPDATE public.fx_rates
     SET status = 'APPROVED', approved_by = v_uid, approved_at = now(),
         decision_reason = btrim(_reason),
         version = COALESCE((SELECT max(version) FROM public.fx_rates x
                              WHERE x.from_currency = r.from_currency
                                AND x.to_currency = r.to_currency
                                AND x.regulator_id IS NOT DISTINCT FROM r.regulator_id
                                AND x.status IN ('APPROVED','SUPERSEDED')), 0) + 1
   WHERE id = _rate_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fx.rate.approved', 'fx_rate', _rate_id,
          jsonb_build_object('status','PROPOSED'),
          jsonb_build_object('status','APPROVED','rate', r.rate,
                             'pair', r.from_currency||'/'||r.to_currency,
                             'effective_from', r.effective_from,
                             'predecessors_closed', v_superseded,
                             'reason', btrim(_reason)));
  RETURN jsonb_build_object('ok', true, 'fx_rate_id', _rate_id, 'status','APPROVED',
                            'predecessors_closed', v_superseded);
END $$;
GRANT EXECUTE ON FUNCTION public.fx_rate_decide(uuid, boolean, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fx_rate_supersede(_rate_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r public.fx_rates;
BEGIN
  IF NOT public.fee_can_administer(v_uid) THEN
    RAISE EXCEPTION 'FX_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.fx_rates WHERE id = _rate_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'FX_RATE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF r.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'FX_RATE_NOT_APPROVED' USING ERRCODE = '22023';
  END IF;
  UPDATE public.fx_rates
     SET status = 'SUPERSEDED',
         effective_to = LEAST(COALESCE(effective_to, CURRENT_DATE), CURRENT_DATE),
         decision_reason = btrim(_reason)
   WHERE id = _rate_id;
  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'fx.rate.superseded', 'fx_rate', _rate_id,
          jsonb_build_object('status','APPROVED','rate', r.rate),
          jsonb_build_object('status','SUPERSEDED','reason', btrim(_reason)));
  RETURN jsonb_build_object('ok', true, 'fx_rate_id', _rate_id, 'status','SUPERSEDED');
END $$;
GRANT EXECUTE ON FUNCTION public.fx_rate_supersede(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.monetary_config_save(_payload jsonb, _regulator_id uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_old public.monetary_configs; v_id uuid;
BEGIN
  IF NOT (public.is_super_admin(v_uid) OR public.has_permission(v_uid,'settings','edit')) THEN
    RAISE EXCEPTION 'FX_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old FROM public.monetary_configs
   WHERE regulator_id IS NOT DISTINCT FROM _regulator_id AND is_active FOR UPDATE;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'MONETARY_CONFIG_MISSING' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.monetary_configs SET
    base_currency = upper(COALESCE(_payload->>'base_currency', base_currency)),
    reporting_currency = upper(COALESCE(_payload->>'reporting_currency', reporting_currency)),
    supported_transaction_currencies = COALESCE(
      (SELECT array_agg(upper(x)) FROM jsonb_array_elements_text(_payload->'supported_transaction_currencies') t(x)),
      supported_transaction_currencies),
    accepted_payment_currencies = COALESCE(
      (SELECT array_agg(upper(x)) FROM jsonb_array_elements_text(_payload->'accepted_payment_currencies') t(x)),
      accepted_payment_currencies),
    settlement_currencies = COALESCE(
      (SELECT array_agg(upper(x)) FROM jsonb_array_elements_text(_payload->'settlement_currencies') t(x)),
      settlement_currencies),
    cross_currency_settlement_allowed = COALESCE((_payload->>'cross_currency_settlement_allowed')::boolean, cross_currency_settlement_allowed),
    cross_currency_refund_allowed = COALESCE((_payload->>'cross_currency_refund_allowed')::boolean, cross_currency_refund_allowed),
    fx_resolution_policy = COALESCE(_payload->>'fx_resolution_policy', fx_resolution_policy),
    fx_source_policy = COALESCE(_payload->>'fx_source_policy', fx_source_policy),
    rounding_policy = COALESCE(_payload->>'rounding_policy', rounding_policy),
    decimal_precision = COALESCE((_payload->>'decimal_precision')::smallint, decimal_precision),
    payment_fx_date_policy = COALESCE(_payload->>'payment_fx_date_policy', payment_fx_date_policy),
    refund_fx_date_policy = COALESCE(_payload->>'refund_fx_date_policy', refund_fx_date_policy),
    backdating_requires_authority = COALESCE((_payload->>'backdating_requires_authority')::boolean, backdating_requires_authority),
    notes = COALESCE(_payload->>'notes', notes),
    updated_by = v_uid, updated_at = now()
  WHERE id = v_old.id
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_uid, 'monetary.config.updated', 'monetary_config', v_id,
          to_jsonb(v_old), jsonb_build_object('payload', _payload, 'reason', btrim(_reason)));
  RETURN jsonb_build_object('ok', true, 'monetary_config_id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.monetary_config_save(jsonb, uuid, text) TO authenticated, service_role;

-- ---------- 10. Settlement: preserve original money, convert only when governed ----------
CREATE OR REPLACE FUNCTION public.fee_payment_settlement_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
  c public.monetary_configs;
  v_out numeric := 0;
  v_alloc numeric := 0;
  v_ledger uuid;
  v_pay_ccy text;
  v_amount numeric;
  v_fx_date date;
  v_conv jsonb;
  v_conv_id uuid;
  v_applied numeric;
  v_base jsonb;
  v_base_amount numeric;
  v_reason_code text;
BEGIN
  IF lower(COALESCE(NEW.status,'')) NOT IN ('completed','success','paid') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND lower(COALESCE(OLD.status,'')) IN ('completed','success','paid') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.fee_ledger_entries
              WHERE payment_id = NEW.id AND entry_type = 'PAYMENT') THEN RETURN NEW; END IF;

  c := public.monetary_config_resolve(NULL);
  v_pay_ccy := upper(COALESCE(NULLIF(btrim(NEW.currency),''), c.base_currency));
  v_amount := ROUND(COALESCE(NEW.amount,0),2);

  INSERT INTO public.fee_ledger_entries(application_id, payment_id, entry_type, amount, currency,
                                        external_reference, reason, metadata, created_by)
  VALUES (NEW.application_id, NEW.id, 'PAYMENT', v_amount, v_pay_ccy,
          NEW.transaction_ref, 'Cash received',
          jsonb_build_object('channel', NEW.payment_channel, 'method', NEW.payment_method), NEW.user_id);

  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO a FROM public.fee_assessments
   WHERE application_id = NEW.application_id AND status <> 'VOID'
   ORDER BY assessed_at DESC LIMIT 1 FOR UPDATE;
  IF a.id IS NULL THEN RETURN NEW; END IF;

  -- FX date convention is governed configuration, never a browser choice.
  v_fx_date := CASE c.payment_fx_date_policy
                 WHEN 'PAYMENT_DATE' THEN COALESCE(NEW.payment_date, NEW.paid_at::date, CURRENT_DATE)
                 WHEN 'VERIFICATION_DATE' THEN COALESCE(NEW.verified_at::date, CURRENT_DATE)
                 ELSE COALESCE(NEW.paid_at::date, NEW.payment_date, CURRENT_DATE)
               END;

  v_applied := v_amount;
  v_conv := NULL;

  IF v_pay_ccy <> upper(COALESCE(a.currency, v_pay_ccy)) THEN
    IF NOT c.cross_currency_settlement_allowed THEN
      v_reason_code := 'CROSS_CURRENCY_DISABLED';
    ELSIF NOT (v_pay_ccy = ANY (c.accepted_payment_currencies)) THEN
      v_reason_code := 'CURRENCY_NOT_ACCEPTED';
    ELSE
      BEGIN
        v_conv := public.fx_convert(v_amount, v_pay_ccy, upper(a.currency), v_fx_date, NULL, NULL);
        v_applied := (v_conv->>'target_amount')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_reason_code := 'FX_RATE_UNAVAILABLE';
      END;
    END IF;

    IF v_reason_code IS NOT NULL THEN
      INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type,
                                            amount, currency, reason, metadata, created_by)
      VALUES (NULL, NEW.application_id, NEW.id, 'CREDIT', v_amount, v_pay_ccy,
              'Unallocated: payment currency differs from assessed currency',
              jsonb_build_object('reason_code', v_reason_code,
                                 'assessment_currency', a.currency,
                                 'fx_date', v_fx_date), NEW.user_id);
      RETURN NEW;
    END IF;
  END IF;

  v_out := public.fee_assessment_outstanding(a.id);
  v_alloc := LEAST(v_applied, v_out);

  IF v_alloc > 0 THEN
    INSERT INTO public.fee_ledger_entries(assessment_id, application_id, payment_id, entry_type,
                                          amount, currency, external_reference, reason, metadata, created_by)
    VALUES (a.id, NEW.application_id, NEW.id, 'ALLOCATION', -v_alloc, a.currency,
            NEW.transaction_ref, 'Payment allocated to assessment',
            CASE WHEN v_conv IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('fx', v_conv) END,
            NEW.user_id)
    RETURNING id INTO v_ledger;

    IF v_conv IS NOT NULL THEN
      v_conv_id := public.fx_record_conversion('SETTLEMENT','payment', NEW.id,
                     v_conv || jsonb_build_object('fx_applied_date', v_fx_date),
                     NULL, NEW.user_id,
                     jsonb_build_object('assessment_id', a.id, 'application_id', NEW.application_id));
    END IF;

    -- Base/reporting equivalent is booked from the same governed provenance.
    v_base_amount := NULL;
    IF upper(a.currency) = c.base_currency THEN
      v_base_amount := v_alloc;
    ELSE
      BEGIN
        v_base := public.fx_convert(v_alloc, upper(a.currency), c.base_currency, v_fx_date, NULL, NULL);
        v_base_amount := (v_base->>'target_amount')::numeric;
      EXCEPTION WHEN OTHERS THEN
        v_base_amount := NULL;   -- reported in the unconverted bucket, never guessed
      END;
    END IF;

    INSERT INTO public.fee_payment_allocations(payment_id, assessment_id, amount, currency,
                                               ledger_entry_id, allocated_by,
                                               source_amount, source_currency,
                                               fx_rate, fx_rate_id, fx_quote_convention,
                                               fx_effective_date, fx_conversion_id,
                                               rounding_difference, base_amount, base_currency)
    VALUES (NEW.id, a.id, v_alloc, a.currency, v_ledger, NEW.user_id,
            v_amount, v_pay_ccy,
            NULLIF((v_conv->>'effective_rate')::numeric, NULL),
            NULLIF(v_conv->>'fx_rate_id','')::uuid,
            v_conv->>'quote_convention',
            CASE WHEN v_conv IS NULL THEN NULL ELSE v_fx_date END,
            v_conv_id,
            COALESCE((v_conv->>'rounding_difference')::numeric, 0),
            v_base_amount,
            CASE WHEN v_base_amount IS NULL THEN NULL ELSE c.base_currency END);
  END IF;

  IF v_applied - v_alloc > 0 THEN
    INSERT INTO public.fee_ledger_entries(application_id, payment_id, entry_type, amount, currency,
                                          reason, metadata, created_by)
    VALUES (NEW.application_id, NEW.id, 'CREDIT', v_applied - v_alloc,
            COALESCE(a.currency, v_pay_ccy), 'Overpayment held as unallocated credit',
            jsonb_build_object('reason_code','OVERPAYMENT'), NEW.user_id);
  END IF;

  IF public.fee_assessment_outstanding(a.id) <= 0 AND a.status = 'ASSESSED' THEN
    UPDATE public.fee_assessments SET status = 'SETTLED' WHERE id = a.id;
  END IF;

  RETURN NEW;
END $$;

-- ---------- 11. Booked reporting aggregation (never recalculated) ----------
CREATE OR REPLACE FUNCTION public.fee_totals_by_currency(_regulator_id uuid DEFAULT NULL)
RETURNS TABLE(currency text, assessed numeric, collected numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT upper(x.currency), ROUND(sum(x.assessed),2), ROUND(sum(x.collected),2)
    FROM (
      SELECT a.currency, COALESCE(a.assessed_total,0) AS assessed, 0::numeric AS collected
        FROM public.fee_assessments a WHERE a.status <> 'VOID'
      UNION ALL
      SELECT al.currency, 0::numeric, COALESCE(al.amount,0)
        FROM public.fee_payment_allocations al WHERE al.reversed_at IS NULL
    ) x
   GROUP BY 1 ORDER BY 1;
$$;
GRANT EXECUTE ON FUNCTION public.fee_totals_by_currency(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fee_collected_in_reporting_currency(_regulator_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.monetary_configs; v_total numeric := 0; v_unconv numeric := 0; v_rows int := 0;
BEGIN
  IF NOT public.fee_can_administer(auth.uid()) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  c := public.monetary_config_resolve(_regulator_id);
  SELECT COALESCE(sum(CASE WHEN al.base_currency = c.reporting_currency THEN al.base_amount
                           WHEN upper(al.currency) = c.reporting_currency THEN al.amount END),0),
         count(*) FILTER (WHERE al.base_currency IS DISTINCT FROM c.reporting_currency
                            AND upper(al.currency) <> c.reporting_currency),
         count(*)
    INTO v_total, v_unconv, v_rows
    FROM public.fee_payment_allocations al
   WHERE al.reversed_at IS NULL;
  RETURN jsonb_build_object('reporting_currency', c.reporting_currency,
                            'booked_total', ROUND(v_total,2),
                            'allocations', v_rows,
                            'unconverted_allocations', v_unconv,
                            'basis', 'BOOKED_FX_PROVENANCE');
END $$;
GRANT EXECUTE ON FUNCTION public.fee_collected_in_reporting_currency(uuid) TO authenticated, service_role;

-- ---------- 12. Receipt: no hard-coded currency fallback, FX provenance carried ----------
CREATE OR REPLACE FUNCTION public.payment_receipt_issue(_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pay record; v_asmt record; v_al record;
  v_id uuid; v_no text; v_inv text; v_void timestamptz;
  v_name text; v_email text;
  v_breakdown jsonb; v_aid uuid; v_alloc numeric; v_src text; v_ccy text; v_fx jsonb;
BEGIN
  IF NOT public.fee_can_view_payment(v_uid, _payment_id) THEN
    RAISE EXCEPTION 'FEE_FORBIDDEN' USING ERRCODE = '42501',
      DETAIL = 'You do not have access to this payment.';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF COALESCE(v_pay.status,'') NOT IN ('success','completed','paid','verified') THEN
    RAISE EXCEPTION 'PAYMENT_NOT_SETTLED' USING ERRCODE = '22023',
      DETAIL = 'A receipt can only be issued for a settled payment.';
  END IF;

  v_ccy := upper(NULLIF(btrim(COALESCE(v_pay.currency,'')),''));
  IF v_ccy IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_CURRENCY_MISSING' USING ERRCODE = '22023',
      DETAIL = 'A receipt cannot be issued for a payment with no recorded currency.';
  END IF;

  SELECT id, receipt_number, invoice_number, voided_at
    INTO v_id, v_no, v_inv, v_void
    FROM public.payment_receipts WHERE payment_id = _payment_id
   ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'receipt_id', v_id,
      'receipt_number', v_no, 'invoice_number', v_inv, 'issued', false,
      'voided', v_void IS NOT NULL);
  END IF;

  SELECT * INTO v_al FROM public.fee_payment_allocations a
   WHERE a.payment_id = _payment_id
   ORDER BY (a.reversed_at IS NULL) DESC, a.allocated_at LIMIT 1;
  IF v_al.id IS NOT NULL THEN
    v_aid := v_al.assessment_id; v_alloc := v_al.amount; v_src := 'ALLOCATION';
  END IF;

  IF v_aid IS NULL THEN
    SELECT le.assessment_id, le.amount, 'LEDGER'
      INTO v_aid, v_alloc, v_src
      FROM public.fee_ledger_entries le
     WHERE le.payment_id = _payment_id AND le.assessment_id IS NOT NULL
     ORDER BY le.created_at LIMIT 1;
  END IF;

  IF v_aid IS NULL THEN
    RAISE EXCEPTION 'NO_ASSESSMENT_LINEAGE' USING ERRCODE = '22023',
      DETAIL = 'This payment has no assessment or ledger lineage, so no receipt can be issued.';
  END IF;

  SELECT * INTO v_asmt FROM public.fee_assessments WHERE id = v_aid;

  SELECT COALESCE(NULLIF(btrim(pr.full_name),''), NULLIF(btrim(pr.email),''), 'Payer'),
         NULLIF(btrim(pr.email),'')
    INTO v_name, v_email FROM public.profiles pr WHERE pr.id = v_pay.user_id;
  v_name := COALESCE(v_name, 'Payer');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'line_no', l.line_no, 'description', l.description,
           'fee_type_code', l.fee_type_code, 'amount', l.amount,
           'currency', l.currency) ORDER BY l.line_no), '[]'::jsonb)
    INTO v_breakdown FROM public.fee_assessment_lines l WHERE l.assessment_id = v_aid;

  v_fx := CASE WHEN v_al.fx_conversion_id IS NULL AND v_al.fx_rate IS NULL THEN NULL
               ELSE jsonb_build_object(
                 'cross_currency', true,
                 'paid_amount', v_al.source_amount, 'paid_currency', v_al.source_currency,
                 'applied_amount', v_al.amount, 'applied_currency', v_al.currency,
                 'rate', v_al.fx_rate, 'fx_rate_id', v_al.fx_rate_id,
                 'quote_convention', v_al.fx_quote_convention,
                 'fx_effective_date', v_al.fx_effective_date,
                 'fx_conversion_id', v_al.fx_conversion_id,
                 'rounding_difference', v_al.rounding_difference,
                 'base_amount', v_al.base_amount, 'base_currency', v_al.base_currency)
          END;

  INSERT INTO public.payment_receipts(
    payment_id, application_id, issued_to_name, issued_to_email,
    amount, currency, subtotal, tax_amount, total_amount, fee_breakdown,
    payment_method, payment_reference, payment_channel, paid_at, issued_by, snapshot)
  VALUES (
    _payment_id, v_pay.application_id, v_name, v_email,
    ROUND(COALESCE(v_pay.amount,0),2), v_ccy,
    ROUND(COALESCE(v_pay.amount,0),2), 0, ROUND(COALESCE(v_pay.amount,0),2),
    COALESCE(v_breakdown,'[]'::jsonb),
    v_pay.payment_method, COALESCE(v_pay.transaction_ref, v_pay.receipt_number),
    v_pay.payment_channel,
    COALESCE(v_pay.paid_at, v_pay.payment_date::timestamptz, v_pay.created_at, now()),
    v_uid,
    jsonb_build_object(
      'payment_id', _payment_id, 'payment_status', v_pay.status,
      'payment_amount', ROUND(COALESCE(v_pay.amount,0),2),
      'payment_currency', v_ccy,
      'payment_method', v_pay.payment_method,
      'payment_reference', COALESCE(v_pay.transaction_ref, v_pay.receipt_number),
      'assessment_id', v_aid, 'lineage_source', v_src,
      'allocated_amount', ROUND(COALESCE(v_alloc,0),2),
      'fx', v_fx,
      'assessment', jsonb_build_object(
        'assessment_number', v_asmt.assessment_number,
        'assessed_total', v_asmt.assessed_total,
        'currency', v_asmt.currency,
        'status_at_issue', v_asmt.status,
        'basis', v_asmt.basis,
        'resolution_source', v_asmt.resolution_source,
        'assessed_at', v_asmt.assessed_at,
        'config_snapshot', v_asmt.config_snapshot),
      'fee_lines', COALESCE(v_breakdown,'[]'::jsonb),
      'issued_source','SERVER'))
  RETURNING id, receipt_number, invoice_number INTO v_id, v_no, v_inv;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'payment.receipt.issued', 'payment_receipt', v_id,
          jsonb_build_object('payment_id', _payment_id, 'receipt_number', v_no,
                             'amount', ROUND(COALESCE(v_pay.amount,0),2),
                             'currency', v_ccy, 'assessment_id', v_aid,
                             'lineage_source', v_src, 'cross_currency', v_fx IS NOT NULL));

  RETURN jsonb_build_object('ok', true, 'receipt_id', v_id,
    'receipt_number', v_no, 'invoice_number', v_inv, 'issued', true,
    'assessment_id', v_aid, 'lineage_source', v_src, 'voided', false);
END $$;
