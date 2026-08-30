-- 1. Business configuration: enforcement penalty currency policy
ALTER TABLE public.monetary_configs
  ADD COLUMN IF NOT EXISTS enforcement_penalty_currency_policy text NOT NULL DEFAULT 'REGULATOR_BASE',
  ADD COLUMN IF NOT EXISTS enforcement_penalty_allowed_currencies text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.monetary_configs
  DROP CONSTRAINT IF EXISTS monetary_configs_enf_penalty_policy_chk;
ALTER TABLE public.monetary_configs
  ADD CONSTRAINT monetary_configs_enf_penalty_policy_chk
  CHECK (enforcement_penalty_currency_policy IN ('REGULATOR_BASE','EXPLICIT_ALLOWED_CURRENCIES'));

-- 2. Sanction currency provenance snapshot
ALTER TABLE public.enforcement_actions
  ADD COLUMN IF NOT EXISTS penalty_regulator_id uuid REFERENCES public.regulators(id),
  ADD COLUMN IF NOT EXISTS penalty_monetary_config_id uuid REFERENCES public.monetary_configs(id),
  ADD COLUMN IF NOT EXISTS penalty_currency_source text,
  ADD COLUMN IF NOT EXISTS penalty_currency_policy text,
  ADD COLUMN IF NOT EXISTS penalty_currency_reason text,
  ADD COLUMN IF NOT EXISTS penalty_currency_set_at timestamptz;

-- the historical 'USD' default is not a monetary authority
ALTER TABLE public.enforcement_actions ALTER COLUMN penalty_currency DROP DEFAULT;
ALTER TABLE public.enforcement_actions ALTER COLUMN penalty_currency DROP NOT NULL;

-- 3. Server-authoritative resolver
CREATE OR REPLACE FUNCTION public.enforcement_penalty_currency_resolve(
  _entity_id uuid,
  _requested text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _as_of date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_body jsonb;
  v_reg uuid;
  v_cfg public.monetary_configs;
  v_req text := nullif(upper(btrim(coalesce(_requested,''))), '');
  v_cur text;
  v_src text;
BEGIN
  v_body := public.entity_regulator_body_resolve(_entity_id, coalesce(_as_of, CURRENT_DATE));
  v_reg := (v_body->>'regulator_id')::uuid;
  v_cfg := public.monetary_config_resolve_strict(v_reg);

  v_cur := v_cfg.base_currency;
  v_src := 'REGULATOR_BASE';

  IF v_req IS NOT NULL AND v_req <> v_cfg.base_currency THEN
    IF coalesce(v_cfg.enforcement_penalty_currency_policy,'REGULATOR_BASE') <> 'EXPLICIT_ALLOWED_CURRENCIES' THEN
      RAISE EXCEPTION 'ENFORCEMENT_PENALTY_CURRENCY_NOT_PERMITTED:%', v_req USING ERRCODE = '22023',
        DETAIL = 'This regulator denominates monetary penalties in its base currency. A non-base penalty currency requires explicit business configuration.';
    END IF;
    IF NOT (v_req = ANY (coalesce(v_cfg.enforcement_penalty_allowed_currencies, '{}'::text[]))) THEN
      RAISE EXCEPTION 'ENFORCEMENT_PENALTY_CURRENCY_NOT_ALLOWED:%', v_req USING ERRCODE = '22023',
        DETAIL = 'The currency is not in the regulator''s configured enforcement penalty currency list.';
    END IF;
    IF NOT public.currency_is_supported(v_req, v_reg) THEN
      RAISE EXCEPTION 'ENFORCEMENT_PENALTY_CURRENCY_UNSUPPORTED:%', v_req USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(coalesce(_reason,'')),'') IS NULL OR length(btrim(_reason)) < 10 THEN
      RAISE EXCEPTION 'ENFORCEMENT_PENALTY_CURRENCY_REASON_REQUIRED' USING ERRCODE = '22023',
        DETAIL = 'A legal or configuration reason must be recorded for a non-base penalty currency.';
    END IF;
    v_cur := v_req;
    v_src := 'REGULATOR_APPROVED_CURRENCY';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'currency', v_cur,
    'source', v_src,
    'regulator_id', v_reg,
    'regulator_source', v_body->>'source',
    'monetary_config_id', v_cfg.id,
    'policy', coalesce(v_cfg.enforcement_penalty_currency_policy,'REGULATOR_BASE'),
    'base_currency', v_cfg.base_currency,
    'allowed_currencies', to_jsonb(coalesce(v_cfg.enforcement_penalty_allowed_currencies,'{}'::text[])),
    'reason', nullif(btrim(coalesce(_reason,'')),''),
    'as_of', coalesce(_as_of, CURRENT_DATE)
  );
END $$;

REVOKE ALL ON FUNCTION public.enforcement_penalty_currency_resolve(uuid, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforcement_penalty_currency_resolve(uuid, text, text, date) TO authenticated, service_role;

-- 4. Authority enforced for every write path (RPC or DML)
CREATE OR REPLACE FUNCTION public.tg_enforcement_penalty_currency_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_res jsonb;
  v_req text;
BEGIN
  IF coalesce(NEW.penalty_amount, 0) <= 0 THEN
    IF TG_OP = 'INSERT' THEN
      NEW.penalty_currency := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- immutable snapshot: an imposed sanction currency is never rewritten
  IF TG_OP = 'UPDATE'
     AND OLD.penalty_currency_set_at IS NOT NULL
     AND coalesce(OLD.penalty_amount,0) > 0 THEN
    NEW.penalty_currency := OLD.penalty_currency;
    NEW.penalty_currency_source := OLD.penalty_currency_source;
    NEW.penalty_currency_policy := OLD.penalty_currency_policy;
    NEW.penalty_currency_reason := OLD.penalty_currency_reason;
    NEW.penalty_regulator_id := OLD.penalty_regulator_id;
    NEW.penalty_monetary_config_id := OLD.penalty_monetary_config_id;
    NEW.penalty_currency_set_at := OLD.penalty_currency_set_at;
    RETURN NEW;
  END IF;

  v_req := nullif(upper(btrim(coalesce(NEW.penalty_currency,''))), '');
  v_res := public.enforcement_penalty_currency_resolve(
             NEW.entity_id, v_req, NEW.penalty_currency_reason, CURRENT_DATE);

  NEW.penalty_currency := v_res->>'currency';
  NEW.penalty_currency_source := v_res->>'source';
  NEW.penalty_currency_policy := v_res->>'policy';
  NEW.penalty_regulator_id := (v_res->>'regulator_id')::uuid;
  NEW.penalty_monetary_config_id := (v_res->>'monetary_config_id')::uuid;
  NEW.penalty_currency_set_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_enforcement_penalty_currency_authority ON public.enforcement_actions;
CREATE TRIGGER tg_enforcement_penalty_currency_authority
BEFORE INSERT OR UPDATE OF penalty_amount, penalty_currency, penalty_currency_reason
ON public.enforcement_actions
FOR EACH ROW EXECUTE FUNCTION public.tg_enforcement_penalty_currency_authority();

-- 5. Tender currency of a settlement never rewrites the sanction currency
CREATE OR REPLACE FUNCTION public.tg_enforcement_penalty_payment_currency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_case public.enforcement_actions;
BEGIN
  SELECT * INTO v_case FROM public.enforcement_actions WHERE id = NEW.case_id;
  IF v_case.id IS NULL THEN
    RAISE EXCEPTION 'ENFORCEMENT_CASE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  NEW.currency := nullif(upper(btrim(coalesce(NEW.currency,''))), '');
  IF NEW.currency IS NULL THEN
    NEW.currency := v_case.penalty_currency;
  END IF;
  IF NEW.currency IS NULL THEN
    RAISE EXCEPTION 'ENFORCEMENT_PENALTY_CURRENCY_UNRESOLVED' USING ERRCODE = '22023';
  END IF;
  IF NEW.currency <> coalesce(v_case.penalty_currency, NEW.currency)
     AND NOT public.currency_is_supported(NEW.currency, v_case.penalty_regulator_id) THEN
    RAISE EXCEPTION 'ENFORCEMENT_TENDER_CURRENCY_UNSUPPORTED:%', NEW.currency USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_enforcement_penalty_payment_currency ON public.enforcement_penalty_payments;
CREATE TRIGGER tg_enforcement_penalty_payment_currency
BEFORE INSERT ON public.enforcement_penalty_payments
FOR EACH ROW EXECUTE FUNCTION public.tg_enforcement_penalty_payment_currency();