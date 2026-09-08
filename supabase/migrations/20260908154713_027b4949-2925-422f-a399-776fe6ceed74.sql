-- =====================================================================
-- AML-01 — Enterprise Configuration Kernel: Supervisory Policy Profile
-- Generic supervisory-platform capability; AML/CFT is the first consumer.
-- Non-destructive: no existing object is dropped, renamed or replaced.
-- =====================================================================

-- ---------------------------------------------------------------- catalogue
CREATE TABLE IF NOT EXISTS public.supervisory_policy_component_type (
  component_type   text PRIMARY KEY,
  label            text NOT NULL,
  description      text,
  component_table  text,
  is_available     boolean NOT NULL DEFAULT false,
  default_requirement text NOT NULL DEFAULT 'OPTIONAL'
    CHECK (default_requirement IN ('REQUIRED','OPTIONAL','NOT_APPLICABLE')),
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supervisory_policy_component_type TO authenticated;
GRANT ALL    ON public.supervisory_policy_component_type TO service_role;
ALTER TABLE public.supervisory_policy_component_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "component type catalogue readable by authenticated staff"
  ON public.supervisory_policy_component_type FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

INSERT INTO public.supervisory_policy_component_type
  (component_type, label, description, component_table, is_available, default_requirement, sort_order)
VALUES
  ('METHODOLOGY','Methodology','The versioned supervisory methodology (dimensions, questions, semantics, facts).','supervisory_methodology',true,'REQUIRED',10),
  ('CALCULATION_CONFIG','Calculation policy','The versioned calculation configuration governing aggregation, completeness and rounding.','supervisory_calculation_config',true,'REQUIRED',20),
  ('ASSESSMENT_PROGRAMME','Assessment programme','Programme architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',30),
  ('SECTOR_OVERLAY','Sector overlay','Sector overlay architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',40),
  ('FACT_CONFIG','Fact configuration','Standalone fact configuration is not implemented yet.',NULL,false,'NOT_APPLICABLE',50),
  ('SOURCE_BINDING','Source bindings','Source binding architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',60),
  ('EVIDENCE_POLICY','Evidence policy','Evidence policy architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',70),
  ('MATERIALITY_POLICY','Materiality policy','Materiality policy architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',80),
  ('JUDGEMENT_POLICY','Judgement and override policy','Judgement/override policy architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',90),
  ('RESPONSE_POLICY','Supervisory response policy','Supervisory response policy architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',100),
  ('SLA_POLICY','SLA policy','SLA policy architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',110),
  ('DASHBOARD_POLICY','Dashboard policy','Dashboard policy architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',120),
  ('NOTIFICATION_POLICY','Notification policy','Notification policy architecture is not implemented yet.',NULL,false,'NOT_APPLICABLE',130)
ON CONFLICT (component_type) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  component_table = EXCLUDED.component_table, is_available = EXCLUDED.is_available,
  default_requirement = EXCLUDED.default_requirement, sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ------------------------------------------------------------------ profile
CREATE TABLE IF NOT EXISTS public.supervisory_policy_profile (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  profile_version  text NOT NULL,
  domain_code      text NOT NULL,
  regulator_id     uuid REFERENCES public.regulators(id),
  sector_id        uuid,
  name             text NOT NULL,
  title            text,
  purpose          text,
  status           text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED','RETIRED')),
  origin           text NOT NULL DEFAULT 'REGULATOR_AUTHORED'
    CHECK (origin IN ('MIPL_REFERENCE','REGULATOR_ADOPTED','REGULATOR_AUTHORED')),
  adopted_from_id  uuid REFERENCES public.supervisory_policy_profile(id),
  supersedes_id    uuid REFERENCES public.supervisory_policy_profile(id),
  effective_from   date,
  effective_to     date,
  notes            text,
  created_by       uuid,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  approved_by      uuid,
  approved_at      timestamptz,
  activated_at     timestamptz,
  superseded_at    timestamptz,
  retired_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_policy_profile_code_version_uniq UNIQUE (code, profile_version)
);

CREATE INDEX IF NOT EXISTS supervisory_policy_profile_scope_idx
  ON public.supervisory_policy_profile (domain_code, regulator_id, sector_id, status);

GRANT SELECT ON public.supervisory_policy_profile TO authenticated;
GRANT ALL    ON public.supervisory_policy_profile TO service_role;
ALTER TABLE public.supervisory_policy_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy profiles readable within regulator supervisory scope"
  ON public.supervisory_policy_profile FOR SELECT TO authenticated
  USING (public.supervisory_methodology_regulator_scope_readable(domain_code, regulator_id));

-- ------------------------------------------------------------------ binding
CREATE TABLE IF NOT EXISTS public.supervisory_policy_profile_binding (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid NOT NULL REFERENCES public.supervisory_policy_profile(id) ON DELETE CASCADE,
  component_type    text NOT NULL REFERENCES public.supervisory_policy_component_type(component_type),
  component_table   text NOT NULL,
  component_id      uuid NOT NULL,
  component_code    text,
  component_version text,
  component_status  text,
  rationale         text,
  bound_by          uuid,
  bound_at          timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_policy_profile_binding_uniq UNIQUE (profile_id, component_type)
);

GRANT SELECT ON public.supervisory_policy_profile_binding TO authenticated;
GRANT ALL    ON public.supervisory_policy_profile_binding TO service_role;
ALTER TABLE public.supervisory_policy_profile_binding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy profile bindings follow profile readability"
  ON public.supervisory_policy_profile_binding FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_policy_profile p
                  WHERE p.id = profile_id
                    AND public.supervisory_methodology_regulator_scope_readable(p.domain_code, p.regulator_id)));

-- -------------------------------------------------------------- requirement
CREATE TABLE IF NOT EXISTS public.supervisory_policy_profile_requirement (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES public.supervisory_policy_profile(id) ON DELETE CASCADE,
  component_type text NOT NULL REFERENCES public.supervisory_policy_component_type(component_type),
  requirement    text NOT NULL DEFAULT 'OPTIONAL'
    CHECK (requirement IN ('REQUIRED','OPTIONAL','NOT_APPLICABLE')),
  rationale      text,
  set_by         uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_policy_profile_requirement_uniq UNIQUE (profile_id, component_type)
);

GRANT SELECT ON public.supervisory_policy_profile_requirement TO authenticated;
GRANT ALL    ON public.supervisory_policy_profile_requirement TO service_role;
ALTER TABLE public.supervisory_policy_profile_requirement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy profile requirements follow profile readability"
  ON public.supervisory_policy_profile_requirement FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_policy_profile p
                  WHERE p.id = profile_id
                    AND public.supervisory_methodology_regulator_scope_readable(p.domain_code, p.regulator_id)));

-- -------------------------------------------------------------------- event
CREATE TABLE IF NOT EXISTS public.supervisory_policy_profile_event (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.supervisory_policy_profile(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  from_status  text,
  to_status    text,
  rationale    text,
  actor_id     uuid,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supervisory_policy_profile_event_profile_idx
  ON public.supervisory_policy_profile_event (profile_id, created_at DESC);

GRANT SELECT ON public.supervisory_policy_profile_event TO authenticated;
GRANT ALL    ON public.supervisory_policy_profile_event TO service_role;
ALTER TABLE public.supervisory_policy_profile_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY "policy profile events follow profile readability"
  ON public.supervisory_policy_profile_event FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.supervisory_policy_profile p
                  WHERE p.id = profile_id
                    AND public.supervisory_methodology_regulator_scope_readable(p.domain_code, p.regulator_id)));

-- ------------------------------------------------------- immutability guards
CREATE OR REPLACE FUNCTION public.tg_supervisory_policy_profile_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status IN ('APPROVED','ACTIVE','SUPERSEDED','RETIRED') THEN
    IF NEW.code IS DISTINCT FROM OLD.code
       OR NEW.profile_version IS DISTINCT FROM OLD.profile_version
       OR NEW.domain_code IS DISTINCT FROM OLD.domain_code
       OR NEW.regulator_id IS DISTINCT FROM OLD.regulator_id
       OR NEW.sector_id IS DISTINCT FROM OLD.sector_id
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.adopted_from_id IS DISTINCT FROM OLD.adopted_from_id
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id THEN
      RAISE EXCEPTION 'policy_profile_immutable: % % is % and its substantive configuration cannot be altered; issue a new version instead',
        OLD.code, OLD.profile_version, OLD.status USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supervisory_policy_profile_immutable ON public.supervisory_policy_profile;
CREATE TRIGGER supervisory_policy_profile_immutable
  BEFORE UPDATE ON public.supervisory_policy_profile
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_policy_profile_immutable();

CREATE OR REPLACE FUNCTION public.tg_supervisory_policy_child_draft_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _pid uuid; _st text; _code text; _ver text;
BEGIN
  _pid := COALESCE(NEW.profile_id, OLD.profile_id);
  SELECT status, code, profile_version INTO _st, _code, _ver
    FROM public.supervisory_policy_profile WHERE id = _pid;
  IF _st IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;   -- cascade delete of the parent
  IF _st NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'policy_profile_immutable: % % is %; component bindings and requirements can only change on a draft or in-review profile',
      _code, _ver, _st USING ERRCODE = '42501';
  END IF;
  IF TG_OP <> 'DELETE' THEN NEW.updated_at := now(); RETURN NEW; END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS supervisory_policy_binding_draft_only ON public.supervisory_policy_profile_binding;
CREATE TRIGGER supervisory_policy_binding_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_policy_profile_binding
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_policy_child_draft_only();

DROP TRIGGER IF EXISTS supervisory_policy_requirement_draft_only ON public.supervisory_policy_profile_requirement;
CREATE TRIGGER supervisory_policy_requirement_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_policy_profile_requirement
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_policy_child_draft_only();

CREATE OR REPLACE FUNCTION public.tg_supervisory_policy_event_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'policy_profile_history_append_only: policy profile history cannot be altered or deleted'
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS supervisory_policy_event_append_only ON public.supervisory_policy_profile_event;
CREATE TRIGGER supervisory_policy_event_append_only
  BEFORE UPDATE OR DELETE ON public.supervisory_policy_profile_event
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_policy_event_append_only();

-- ------------------------------------------ dedicated policy-approval authority
ALTER TABLE public.supervisory_domain_authority
  ADD COLUMN IF NOT EXISTS policy_approval_permission text;

INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive, is_enforced, is_system, is_active)
SELECT m.id, 'policy_approve', 'Approve supervisory policy profile',
       'Approve a supervisory policy profile version for this domain. Assessment approval and platform administration do not substitute.',
       95, true, true, true, true
  FROM public.sec_modules m
 WHERE m.key IN ('aml_supervision','prudential_supervision')
ON CONFLICT (module_id, key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  is_sensitive = true, is_enforced = true, is_active = true, updated_at = now();

UPDATE public.supervisory_domain_authority
   SET policy_approval_permission = 'aml_supervision.policy_approve', updated_at = now()
 WHERE domain_code = 'AML_CFT';

UPDATE public.supervisory_domain_authority
   SET policy_approval_permission = 'prudential_supervision.policy_approve', updated_at = now()
 WHERE domain_code = 'PRUDENTIAL';