-- =====================================================================
-- P04 CONFIGURATION CLOSURE — fee + verification configuration model
-- =====================================================================

/* ---------------- fee binding configuration model ------------------- */
ALTER TABLE public.license_fee_bindings
  ADD COLUMN IF NOT EXISTS binding_key      text,
  ADD COLUMN IF NOT EXISTS purpose          text NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS trigger_event    text,
  ADD COLUMN IF NOT EXISTS trigger_timing   text NOT NULL DEFAULT 'ON_ENTER',
  ADD COLUMN IF NOT EXISTS workflow_step_key text,
  ADD COLUMN IF NOT EXISTS gate_policy      text NOT NULL DEFAULT 'BLOCK_UNTIL_VERIFIED',
  ADD COLUMN IF NOT EXISTS charge_basis     text NOT NULL DEFAULT 'FLAT',
  ADD COLUMN IF NOT EXISTS quantity         numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS effective_from   date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS effective_to     date;

DO $$ BEGIN
  ALTER TABLE public.license_fee_bindings
    ADD CONSTRAINT license_fee_bindings_purpose_chk
    CHECK (purpose IN ('PRODUCTION','CERTIFICATION','TEMPLATE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.license_fee_bindings
    ADD CONSTRAINT license_fee_bindings_gate_chk
    CHECK (gate_policy IN ('BLOCK_UNTIL_VERIFIED','BLOCK_UNTIL_PAID','ADVISORY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.license_fee_bindings
    ADD CONSTRAINT license_fee_bindings_timing_chk
    CHECK (trigger_timing IN ('ON_ENTER','BEFORE_EXIT','ON_EVENT'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_license_fee_bindings_key
  ON public.license_fee_bindings(binding_key) WHERE binding_key IS NOT NULL;

/* ---------------- regulator / process fee switch --------------------- */
CREATE TABLE IF NOT EXISTS public.license_fee_process_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id  uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  matter_kind   text NOT NULL,
  fees_enabled  boolean NOT NULL DEFAULT false,
  purpose       text NOT NULL DEFAULT 'PRODUCTION'
                  CHECK (purpose IN ('PRODUCTION','CERTIFICATION','TEMPLATE')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_license_fee_process_settings
  ON public.license_fee_process_settings(COALESCE(regulator_id,'00000000-0000-0000-0000-000000000000'::uuid), matter_kind);

GRANT SELECT ON public.license_fee_process_settings TO authenticated;
GRANT ALL ON public.license_fee_process_settings TO service_role;
ALTER TABLE public.license_fee_process_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "fee process settings readable by internal staff"
    ON public.license_fee_process_settings FOR SELECT TO authenticated
    USING (public.is_internal_staff_user(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/* ---------------- verification template versioning ------------------ */
ALTER TABLE public.license_verification_templates
  ADD COLUMN IF NOT EXISTS template_key   text,
  ADD COLUMN IF NOT EXISTS version        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS purpose        text NOT NULL DEFAULT 'PRODUCTION',
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS blocking_semantics jsonb NOT NULL DEFAULT
    '{"block_completion_until_required_items_recorded": true, "block_decision_on_deficiency": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS effective_to   date,
  ADD COLUMN IF NOT EXISTS superseded_by  uuid REFERENCES public.license_verification_templates(id);

DO $$ BEGIN
  ALTER TABLE public.license_verification_templates
    ADD CONSTRAINT license_verification_templates_purpose_chk
    CHECK (purpose IN ('PRODUCTION','CERTIFICATION','TEMPLATE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_license_verification_templates_key_version
  ON public.license_verification_templates(template_key, version) WHERE template_key IS NOT NULL;

ALTER TABLE public.license_verification_cases
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS template_key     text;

/* -------- certification scoping helper: is this a cert licence? ------ */
CREATE OR REPLACE FUNCTION public.license_is_certification_scoped(_license_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(l.license_number LIKE 'CERT-%', false)
    FROM public.licenses l WHERE l.id = _license_id
$$;

/* ---------------- fee resolver (configuration-driven) --------------- */
CREATE OR REPLACE FUNCTION public.license_fee_resolve(_license_id uuid, _matter_kind text, _action_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l record; out jsonb := '[]'::jsonb; b record;
  v_cert boolean; v_allowed_purpose text; v_enabled boolean;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;

  v_cert := COALESCE(l.license_number LIKE 'CERT-%', false);
  v_allowed_purpose := CASE WHEN v_cert THEN 'CERTIFICATION' ELSE 'PRODUCTION' END;

  -- regulator/process level fees switch: absent setting means enabled
  SELECT s.fees_enabled INTO v_enabled
    FROM public.license_fee_process_settings s
   WHERE s.matter_kind = _matter_kind
     AND (s.regulator_id IS NULL OR s.regulator_id = l.regulator_id)
   ORDER BY (s.regulator_id IS NOT NULL) DESC
   LIMIT 1;
  IF v_enabled IS NOT NULL AND v_enabled = false THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR b IN
    SELECT fb.*,
           (CASE WHEN fb.category_id  IS NOT NULL THEN 8 ELSE 0 END
          + CASE WHEN fb.sub_sector_id IS NOT NULL THEN 4 ELSE 0 END
          + CASE WHEN fb.sector_id    IS NOT NULL THEN 2 ELSE 0 END
          + CASE WHEN fb.action_key   IS NOT NULL THEN 1 ELSE 0 END) AS specificity,
           COALESCE(fb.amount_override, fc.amount, 0) AS resolved_amount,
           COALESCE(fb.currency, fc.currency, 'JMD')  AS resolved_currency
      FROM public.license_fee_bindings fb
      LEFT JOIN public.fee_configurations fc ON fc.id = fb.fee_configuration_id
     WHERE fb.is_active
       AND fb.purpose = v_allowed_purpose            -- TEMPLATE rows never resolve
       AND fb.matter_kind = _matter_kind
       AND fb.effective_from <= current_date
       AND (fb.effective_to IS NULL OR fb.effective_to >= current_date)
       AND (fb.action_key IS NULL OR _action_key IS NULL OR fb.action_key = _action_key)
       AND (fb.regulator_id  IS NULL OR fb.regulator_id  = l.regulator_id)
       AND (fb.sector_id     IS NULL OR fb.sector_id     = l.sector_id)
       AND (fb.sub_sector_id IS NULL OR fb.sub_sector_id = l.sub_sector_id)
       AND (fb.category_id   IS NULL OR fb.category_id   = l.category_id)
       AND (fb.license_type  IS NULL OR fb.license_type  = l.license_type)
     ORDER BY specificity DESC, fb.created_at
  LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(out) x
                WHERE COALESCE(x->>'fee_type_code','') = COALESCE(b.fee_type_code,'')) THEN
      CONTINUE;
    END IF;
    out := out || jsonb_build_array(jsonb_build_object(
      'binding_id', b.id, 'binding_key', b.binding_key, 'purpose', b.purpose,
      'fee_type_code', b.fee_type_code,
      'description', COALESCE(b.description, b.fee_type_code, 'Lifecycle fee'),
      'amount', ROUND(b.resolved_amount * COALESCE(b.quantity,1), 2),
      'unit_amount', b.resolved_amount, 'quantity', COALESCE(b.quantity,1),
      'charge_basis', b.charge_basis, 'currency', b.resolved_currency,
      'trigger_event', b.trigger_event, 'trigger_timing', b.trigger_timing,
      'workflow_step_key', b.workflow_step_key, 'gate_policy', b.gate_policy,
      'blocking', b.blocking, 'payment_verification_required', b.payment_verification_required,
      'due_days', b.due_days, 'fee_configuration_id', b.fee_configuration_id,
      'effective_from', b.effective_from, 'effective_to', b.effective_to,
      'specificity', b.specificity,
      'matter_kind', b.matter_kind, 'action_key', b.action_key));
  END LOOP;
  RETURN out;
END $$;

/* ------------- verification template resolver (versioned) ----------- */
CREATE OR REPLACE FUNCTION public.license_verification_template_resolve(_license_id uuid, _matter_kind text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_cert boolean; v_purpose text; v_id uuid;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RETURN NULL; END IF;
  v_cert := COALESCE(l.license_number LIKE 'CERT-%', false);
  v_purpose := CASE WHEN v_cert THEN 'CERTIFICATION' ELSE 'PRODUCTION' END;

  SELECT t.id INTO v_id
    FROM public.license_verification_templates t
   WHERE t.is_active
     AND t.purpose = v_purpose
     AND t.matter_kind = _matter_kind
     AND t.superseded_by IS NULL
     AND t.effective_from <= current_date
     AND (t.effective_to IS NULL OR t.effective_to >= current_date)
     AND (t.license_type IS NULL OR t.license_type = l.license_type)
     AND (t.sector_id    IS NULL OR t.sector_id    = l.sector_id)
     AND (t.regulator_id IS NULL OR t.regulator_id = l.regulator_id)
   ORDER BY (CASE WHEN t.license_type IS NOT NULL THEN 4 ELSE 0 END
           + CASE WHEN t.sector_id    IS NOT NULL THEN 2 ELSE 0 END
           + CASE WHEN t.regulator_id IS NOT NULL THEN 1 ELSE 0 END) DESC,
            t.version DESC, t.created_at
   LIMIT 1;
  RETURN v_id;
END $$;
