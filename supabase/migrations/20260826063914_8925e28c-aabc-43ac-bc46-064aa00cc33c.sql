-- =====================================================================
-- MC-02 PART 1 — JURISDICTION ASSESSMENT: PERMISSIONS, DATA MODEL, CONFIG
-- =====================================================================

-- ---------- 1. PERMISSIONS -------------------------------------------
DO $mc$
DECLARE
  v_mod uuid;
  v_perm uuid;
  v_legacy_exists boolean;
  r record;
BEGIN
  SELECT id INTO v_mod FROM public.sec_modules WHERE key = 'complaint_management';
  IF v_mod IS NULL THEN
    RAISE EXCEPTION 'sec_modules.complaint_management missing';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('assess_jurisdiction','Assess Jurisdiction','Open and record jurisdiction assessment factors',210,false),
      ('decide_jurisdiction','Decide Jurisdiction','Record the authoritative jurisdiction decision',211,true),
      ('refer','Refer Complaint','Refer a complaint to another authority',212,true),
      ('triage','Triage','Confirm risk-based triage of a complaint',213,false),
      ('override_triage','Override Triage','Override the deterministic triage recommendation',214,true),
      ('review_vulnerability','Review Support Needs','Review consumer support / vulnerability declarations',215,false)
    ) AS t(k,l,d,so,sens)
  LOOP
    INSERT INTO public.sec_permissions (module_id, key, label, description, sort_order, is_sensitive)
    VALUES (v_mod, r.k, r.l, r.d, r.so, r.sens)
    ON CONFLICT (module_id, key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description;
  END LOOP;

  -- grant to business roles only (never system_administrator / legacy_admin)
  FOR r IN
    SELECT * FROM (VALUES
      ('complaints_officer',      ARRAY['assess_jurisdiction','triage','review_vulnerability']),
      ('complaints_supervisor',   ARRAY['assess_jurisdiction','decide_jurisdiction','refer','triage','override_triage','review_vulnerability']),
      ('conduct_analyst',         ARRAY['assess_jurisdiction','triage']),
      ('conduct_supervisor',      ARRAY['assess_jurisdiction','decide_jurisdiction','refer','triage','override_triage','review_vulnerability']),
      ('market_conduct_supervisor',ARRAY['assess_jurisdiction','decide_jurisdiction','refer','triage','override_triage','review_vulnerability']),
      ('investigator',            ARRAY['assess_jurisdiction','triage'])
    ) AS t(role_key, perms)
  LOOP
    INSERT INTO public.sec_role_permissions (role_id, permission_id)
    SELECT sr.id, sp.id
    FROM public.sec_roles sr
    JOIN public.sec_permissions sp ON sp.module_id = v_mod AND sp.key = ANY (r.perms)
    WHERE sr.key = r.role_key
    ON CONFLICT (role_id, permission_id) DO NOTHING;
  END LOOP;

  -- mirror into the legacy permission catalogue where it is still consulted
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='permissions') INTO v_legacy_exists;
  IF v_legacy_exists THEN
    INSERT INTO public.permissions (name, module, description)
    SELECT x.k, 'complaint_management', x.d
    FROM (VALUES
      ('assess_jurisdiction','Complaints — assess jurisdiction'),
      ('decide_jurisdiction','Complaints — decide jurisdiction'),
      ('refer','Complaints — refer to another authority'),
      ('triage','Complaints — risk-based triage'),
      ('override_triage','Complaints — override triage'),
      ('review_vulnerability','Complaints — review support needs')
    ) AS x(k,d)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.permissions p WHERE p.module='complaint_management' AND p.name = x.k
    );
  END IF;
END
$mc$;

-- has_complaint_perm: expose the new explicit actions, keep legacy aliases working
CREATE OR REPLACE FUNCTION public.has_complaint_perm(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH aliased AS (
    SELECT CASE
             WHEN _action = 'view_all' THEN ARRAY['view']
             -- legacy callers used 'triage' before an explicit permission existed
             WHEN _action = 'triage'   THEN ARRAY['triage','assign','edit','investigate']
             ELSE ARRAY[_action]
           END AS actions
  )
  SELECT _user_id IS NOT NULL AND (
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM aliased a, unnest(a.actions) AS act(action_key)
      WHERE public.sec_has_permission(_user_id, 'complaint_management', act.action_key)
    )
  );
$function$;

-- ---------- 2. SHARED HELPERS ----------------------------------------
CREATE OR REPLACE FUNCTION public.mc02_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ---------- 3. FACTOR CATALOGUE --------------------------------------
CREATE TABLE IF NOT EXISTS public.complaint_jurisdiction_factor_catalogue (
  code            text PRIMARY KEY,
  label           text NOT NULL,
  help_text       text,
  sort_order      integer NOT NULL DEFAULT 100,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.complaint_jurisdiction_factor_catalogue TO authenticated;
GRANT ALL ON public.complaint_jurisdiction_factor_catalogue TO service_role;
ALTER TABLE public.complaint_jurisdiction_factor_catalogue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cjfc_read ON public.complaint_jurisdiction_factor_catalogue;
CREATE POLICY cjfc_read ON public.complaint_jurisdiction_factor_catalogue
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(), 'view'));
DROP TRIGGER IF EXISTS trg_cjfc_touch ON public.complaint_jurisdiction_factor_catalogue;
CREATE TRIGGER trg_cjfc_touch BEFORE UPDATE ON public.complaint_jurisdiction_factor_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.mc02_touch_updated_at();

INSERT INTO public.complaint_jurisdiction_factor_catalogue (code, label, help_text, sort_order) VALUES
  ('RESPONDENT_IDENTIFIED','Respondent identity established','Have we established who the complaint is actually about?',10),
  ('RESPONDENT_REGULATED_NOW','Respondent regulated by this authority','Is the respondent currently authorised by this authority?',20),
  ('RESPONDENT_REGULATED_AT_INCIDENT','Respondent regulated at the incident date','Was the respondent authorised when the events occurred?',30),
  ('PRODUCT_IN_MANDATE','Product or service within our mandate','Does the product or service fall within our remit?',40),
  ('COMPLAINANT_ELIGIBLE','Complainant is eligible','Is this complainant the type of customer we can assist?',50),
  ('GEOGRAPHIC_JURISDICTION','Geographic jurisdiction satisfied','Did the matter occur within our jurisdiction?',60),
  ('WITHIN_TIME_LIMIT','Complaint within the applicable time limit','Was the complaint brought in time?',70),
  ('PRIOR_ENTITY_COMPLAINT_REQUIRED','Prior complaint to the firm required','Does policy require the consumer to complain to the firm first?',80),
  ('PRIOR_ENTITY_COMPLAINT_MADE','Prior complaint to the firm made','Has the consumer already complained to the firm?',90),
  ('WAITING_PERIOD_SATISFIED','Final response or waiting period satisfied','Has the firm responded, or has the waiting period expired?',100),
  ('NOT_PREVIOUSLY_DETERMINED','Same matter not previously determined','Have we already determined this same matter?',110),
  ('NOT_DUPLICATE','Not a duplicate of an existing case','Is this a duplicate of a case we already hold?',120),
  ('NO_COMPETING_PROCEEDINGS','No relevant court, tribunal or police proceedings','Is the matter already before a court, tribunal or the police?',130),
  ('NO_OTHER_PRIMARY_AUTHORITY','No other authority has primary jurisdiction','Does another regulator or ombudsman have primary jurisdiction?',140),
  ('WHOLLY_WITHIN_SCOPE','Whole complaint within our mandate','Does the entire complaint fall within our remit, or only part of it?',150),
  ('INFORMATION_SUFFICIENT','Sufficient information to assess','Do we have enough information to make an assessment?',160)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, help_text = EXCLUDED.help_text, sort_order = EXCLUDED.sort_order;

-- ---------- 4. VERSIONED JURISDICTION RULE SETS ----------------------
CREATE TABLE IF NOT EXISTS public.complaint_jurisdiction_rule_sets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id       uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  code               text NOT NULL,
  name               text NOT NULL,
  version            integer NOT NULL DEFAULT 1,
  status             text NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','PUBLISHED','RETIRED')),
  sector_id          uuid,
  effective_from     date NOT NULL DEFAULT CURRENT_DATE,
  effective_to       date,
  config             jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_rationale   text,
  supersedes_id      uuid REFERENCES public.complaint_jurisdiction_rule_sets(id) ON DELETE SET NULL,
  created_by         uuid,
  published_by       uuid,
  published_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, code, version)
);
GRANT SELECT ON public.complaint_jurisdiction_rule_sets TO authenticated;
GRANT ALL ON public.complaint_jurisdiction_rule_sets TO service_role;
ALTER TABLE public.complaint_jurisdiction_rule_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cjrs_read ON public.complaint_jurisdiction_rule_sets;
CREATE POLICY cjrs_read ON public.complaint_jurisdiction_rule_sets
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(), 'view'));
DROP TRIGGER IF EXISTS trg_cjrs_touch ON public.complaint_jurisdiction_rule_sets;
CREATE TRIGGER trg_cjrs_touch BEFORE UPDATE ON public.complaint_jurisdiction_rule_sets
  FOR EACH ROW EXECUTE FUNCTION public.mc02_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.complaint_jurisdiction_rule_set_factors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id   uuid NOT NULL REFERENCES public.complaint_jurisdiction_rule_sets(id) ON DELETE CASCADE,
  factor_code   text NOT NULL REFERENCES public.complaint_jurisdiction_factor_catalogue(code),
  requirement   text NOT NULL DEFAULT 'MANDATORY'
                CHECK (requirement IN ('MANDATORY','ADVISORY','NOT_APPLICABLE')),
  expected_result text CHECK (expected_result IS NULL OR expected_result IN ('YES','NO','NOT_APPLICABLE')),
  guidance      text,
  legal_basis   text,
  policy_basis  text,
  parameters    jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_set_id, factor_code)
);
GRANT SELECT ON public.complaint_jurisdiction_rule_set_factors TO authenticated;
GRANT ALL ON public.complaint_jurisdiction_rule_set_factors TO service_role;
ALTER TABLE public.complaint_jurisdiction_rule_set_factors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cjrsf_read ON public.complaint_jurisdiction_rule_set_factors;
CREATE POLICY cjrsf_read ON public.complaint_jurisdiction_rule_set_factors
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(), 'view'));
DROP TRIGGER IF EXISTS trg_cjrsf_touch ON public.complaint_jurisdiction_rule_set_factors;
CREATE TRIGGER trg_cjrsf_touch BEFORE UPDATE ON public.complaint_jurisdiction_rule_set_factors
  FOR EACH ROW EXECUTE FUNCTION public.mc02_touch_updated_at();

-- published rule sets are immutable except for retirement / effective_to closure
CREATE OR REPLACE FUNCTION public.mc02_rule_set_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'Published jurisdiction rule sets cannot be deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.config IS DISTINCT FROM OLD.config
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.regulator_id IS DISTINCT FROM OLD.regulator_id
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
      RAISE EXCEPTION 'Published jurisdiction rule set % v% is immutable; publish a new version instead', OLD.code, OLD.version
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('PUBLISHED','RETIRED') THEN
      RAISE EXCEPTION 'Published rule sets may only be retired' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cjrs_immutable ON public.complaint_jurisdiction_rule_sets;
CREATE TRIGGER trg_cjrs_immutable BEFORE UPDATE OR DELETE ON public.complaint_jurisdiction_rule_sets
  FOR EACH ROW EXECUTE FUNCTION public.mc02_rule_set_immutability_guard();

CREATE OR REPLACE FUNCTION public.mc02_rule_set_factor_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.complaint_jurisdiction_rule_sets
   WHERE id = COALESCE(NEW.rule_set_id, OLD.rule_set_id);
  IF v_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Factor requirements of a published jurisdiction rule set are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_cjrsf_immutable ON public.complaint_jurisdiction_rule_set_factors;
CREATE TRIGGER trg_cjrsf_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.complaint_jurisdiction_rule_set_factors
  FOR EACH ROW EXECUTE FUNCTION public.mc02_rule_set_factor_guard();

-- ---------- 5. ASSESSMENT EXTENSION ----------------------------------
ALTER TABLE public.complaint_jurisdiction_assessments
  ADD COLUMN IF NOT EXISTS assessment_started_at    timestamptz,
  ADD COLUMN IF NOT EXISTS assessment_started_by    uuid,
  ADD COLUMN IF NOT EXISTS decision_outcome         text,
  ADD COLUMN IF NOT EXISTS decision_date            timestamptz,
  ADD COLUMN IF NOT EXISTS decision_by              uuid,
  ADD COLUMN IF NOT EXISTS legal_basis              text,
  ADD COLUMN IF NOT EXISTS policy_basis             text,
  ADD COLUMN IF NOT EXISTS partial_scope_summary    text,
  ADD COLUMN IF NOT EXISTS outside_scope_summary    text,
  ADD COLUMN IF NOT EXISTS referral_required        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS more_information_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rule_set_id              uuid REFERENCES public.complaint_jurisdiction_rule_sets(id),
  ADD COLUMN IF NOT EXISTS rule_set_version         integer,
  ADD COLUMN IF NOT EXISTS reviewed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at              timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_by              uuid,
  ADD COLUMN IF NOT EXISTS reopen_reason            text,
  ADD COLUMN IF NOT EXISTS row_version              integer NOT NULL DEFAULT 1;

-- migrate legacy substantive values out of `status` into `decision_outcome`
UPDATE public.complaint_jurisdiction_assessments
   SET decision_outcome = CASE status
                            WHEN 'PARTIAL' THEN 'PARTIALLY_ACCEPTED'
                            ELSE status
                          END,
       decision_date = COALESCE(decision_date, assessed_at, updated_at),
       decision_by   = COALESCE(decision_by, assessed_by)
 WHERE status IN ('ACCEPTED','PARTIAL','OUT_OF_JURISDICTION','REFERRED')
   AND decision_outcome IS NULL;

UPDATE public.complaint_jurisdiction_assessments
   SET status = 'DECIDED'
 WHERE status IN ('ACCEPTED','PARTIAL','OUT_OF_JURISDICTION','REFERRED');

ALTER TABLE public.complaint_jurisdiction_assessments
  DROP CONSTRAINT IF EXISTS complaint_jurisdiction_assessments_status_check;
ALTER TABLE public.complaint_jurisdiction_assessments
  ADD CONSTRAINT complaint_jurisdiction_assessments_status_check
  CHECK (status IN ('PENDING_ASSESSMENT','IN_ASSESSMENT','PENDING_INFORMATION','DECIDED'));
ALTER TABLE public.complaint_jurisdiction_assessments
  DROP CONSTRAINT IF EXISTS complaint_jurisdiction_assessments_outcome_check;
ALTER TABLE public.complaint_jurisdiction_assessments
  ADD CONSTRAINT complaint_jurisdiction_assessments_outcome_check
  CHECK (decision_outcome IS NULL OR decision_outcome IN
    ('ACCEPTED','PARTIALLY_ACCEPTED','REFERRED','OUT_OF_JURISDICTION','MORE_INFORMATION_REQUIRED'));

DROP TRIGGER IF EXISTS trg_cja_touch ON public.complaint_jurisdiction_assessments;
CREATE TRIGGER trg_cja_touch BEFORE UPDATE ON public.complaint_jurisdiction_assessments
  FOR EACH ROW EXECUTE FUNCTION public.mc02_touch_updated_at();

-- ---------- 6. ASSESSMENT FACTOR RECORDS -----------------------------
CREATE TABLE IF NOT EXISTS public.complaint_jurisdiction_factors (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES public.complaint_jurisdiction_assessments(id) ON DELETE CASCADE,
  complaint_id   uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  factor_code    text NOT NULL REFERENCES public.complaint_jurisdiction_factor_catalogue(code),
  factor_label   text NOT NULL,
  requirement    text NOT NULL DEFAULT 'MANDATORY',
  result         text NOT NULL DEFAULT 'UNKNOWN'
                 CHECK (result IN ('YES','NO','UNKNOWN','NOT_APPLICABLE','MORE_INFORMATION_REQUIRED')),
  rule_set_id    uuid REFERENCES public.complaint_jurisdiction_rule_sets(id),
  rule_set_version integer,
  evidence_refs  jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale      text,
  evaluated_by   uuid,
  evaluated_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, factor_code)
);
CREATE INDEX IF NOT EXISTS idx_cjf_complaint ON public.complaint_jurisdiction_factors(complaint_id);
GRANT SELECT ON public.complaint_jurisdiction_factors TO authenticated;
GRANT ALL ON public.complaint_jurisdiction_factors TO service_role;
ALTER TABLE public.complaint_jurisdiction_factors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cjf_read ON public.complaint_jurisdiction_factors;
CREATE POLICY cjf_read ON public.complaint_jurisdiction_factors
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(), 'view'));
DROP TRIGGER IF EXISTS trg_cjf_touch ON public.complaint_jurisdiction_factors;
CREATE TRIGGER trg_cjf_touch BEFORE UPDATE ON public.complaint_jurisdiction_factors
  FOR EACH ROW EXECUTE FUNCTION public.mc02_touch_updated_at();

-- ---------- 7. REFERRALS ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.complaint_referrals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id          uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  assessment_id         uuid REFERENCES public.complaint_jurisdiction_assessments(id) ON DELETE SET NULL,
  regulator_id          uuid REFERENCES public.regulators(id) ON DELETE SET NULL,
  destination_type      text NOT NULL DEFAULT 'OTHER'
                        CHECK (destination_type IN ('REGULATOR','OMBUDSMAN','LAW_ENFORCEMENT','COURT_TRIBUNAL','GOVERNMENT_AGENCY','OTHER')),
  destination_name      text NOT NULL,
  destination_contact   text,
  referral_reason       text NOT NULL,
  legal_basis           text,
  policy_basis          text,
  information_sharing_basis text,
  shareable_information text,
  status                text NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT','READY','REFERRED','ACKNOWLEDGED','DECLINED','RETURNED','CLOSED')),
  referred_by           uuid,
  referred_at           timestamptz,
  acknowledged_at       timestamptz,
  acknowledgement_note  text,
  external_reference    text,
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complaint_referrals_complaint ON public.complaint_referrals(complaint_id);
GRANT SELECT ON public.complaint_referrals TO authenticated;
GRANT ALL ON public.complaint_referrals TO service_role;
ALTER TABLE public.complaint_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS complaint_referrals_read ON public.complaint_referrals;
CREATE POLICY complaint_referrals_read ON public.complaint_referrals
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(), 'view'));
DROP TRIGGER IF EXISTS trg_complaint_referrals_touch ON public.complaint_referrals;
CREATE TRIGGER trg_complaint_referrals_touch BEFORE UPDATE ON public.complaint_referrals
  FOR EACH ROW EXECUTE FUNCTION public.mc02_touch_updated_at();

-- ---------- 8. JURISDICTION INFORMATION REQUESTS ---------------------
CREATE TABLE IF NOT EXISTS public.complaint_jurisdiction_info_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id        uuid NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  assessment_id       uuid NOT NULL REFERENCES public.complaint_jurisdiction_assessments(id) ON DELETE CASCADE,
  requested_from      text NOT NULL DEFAULT 'COMPLAINANT'
                      CHECK (requested_from IN ('COMPLAINANT','REPRESENTATIVE','RESPONDENT','OTHER_AUTHORITY','INTERNAL')),
  missing_information text NOT NULL,
  factor_codes        text[] NOT NULL DEFAULT '{}',
  due_date            date,
  status              text NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN','RESPONDED','CANCELLED','EXPIRED')),
  communication_ref   uuid,
  communication_channel text,
  response_summary    text,
  response_received_at timestamptz,
  requested_by        uuid,
  requested_at        timestamptz NOT NULL DEFAULT now(),
  resolved_by         uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cjir_complaint ON public.complaint_jurisdiction_info_requests(complaint_id);
GRANT SELECT ON public.complaint_jurisdiction_info_requests TO authenticated;
GRANT ALL ON public.complaint_jurisdiction_info_requests TO service_role;
ALTER TABLE public.complaint_jurisdiction_info_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cjir_read ON public.complaint_jurisdiction_info_requests;
CREATE POLICY cjir_read ON public.complaint_jurisdiction_info_requests
  FOR SELECT TO authenticated USING (public.has_complaint_perm(auth.uid(), 'view'));
DROP TRIGGER IF EXISTS trg_cjir_touch ON public.complaint_jurisdiction_info_requests;
CREATE TRIGGER trg_cjir_touch BEFORE UPDATE ON public.complaint_jurisdiction_info_requests
  FOR EACH ROW EXECUTE FUNCTION public.mc02_touch_updated_at();

-- ---------- 9. SEED A DEFAULT PUBLISHED RULE SET PER REGULATOR -------
DO $seed$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN SELECT id FROM public.regulators LOOP
    SELECT id INTO v_id FROM public.complaint_jurisdiction_rule_sets
     WHERE regulator_id = r.id AND code = 'DEFAULT_CONSUMER_COMPLAINT' AND version = 1;
    IF v_id IS NULL THEN
      INSERT INTO public.complaint_jurisdiction_rule_sets
        (regulator_id, code, name, version, status, effective_from, config, change_rationale, published_at)
      VALUES (r.id, 'DEFAULT_CONSUMER_COMPLAINT', 'Default consumer complaint jurisdiction rules', 1, 'DRAFT',
              CURRENT_DATE,
              jsonb_build_object(
                'time_limit', jsonb_build_object('enabled', true, 'months_from_incident', 72, 'months_from_final_response', 6),
                'prior_entity_complaint', jsonb_build_object('required', true, 'waiting_period_days', 40),
                'geography', jsonb_build_object('mode','jurisdiction_of_authority'),
                'customer_types', jsonb_build_array('individual','micro_enterprise','small_business'),
                'referral_destinations', jsonb_build_array(),
                'legal_reference', NULL,
                'policy_reference', 'Consumer complaint handling policy',
                'sla', jsonb_build_object('jurisdiction_assessment_days', 5, 'information_request_days', 14, 'triage_days', 3)
              ),
              'MC-02 initial configuration baseline', now())
      RETURNING id INTO v_id;

      INSERT INTO public.complaint_jurisdiction_rule_set_factors
        (rule_set_id, factor_code, requirement, expected_result, guidance, sort_order)
      SELECT v_id, c.code,
             CASE WHEN c.code IN ('RESPONDENT_IDENTIFIED','PRODUCT_IN_MANDATE','COMPLAINANT_ELIGIBLE',
                                  'GEOGRAPHIC_JURISDICTION','WITHIN_TIME_LIMIT','NOT_DUPLICATE',
                                  'NO_OTHER_PRIMARY_AUTHORITY','WHOLLY_WITHIN_SCOPE','INFORMATION_SUFFICIENT')
                  THEN 'MANDATORY' ELSE 'ADVISORY' END,
             CASE WHEN c.code IN ('NOT_DUPLICATE','NO_COMPETING_PROCEEDINGS','NO_OTHER_PRIMARY_AUTHORITY',
                                  'NOT_PREVIOUSLY_DETERMINED','WHOLLY_WITHIN_SCOPE','INFORMATION_SUFFICIENT',
                                  'RESPONDENT_IDENTIFIED','PRODUCT_IN_MANDATE','COMPLAINANT_ELIGIBLE',
                                  'GEOGRAPHIC_JURISDICTION','WITHIN_TIME_LIMIT')
                  THEN 'YES' ELSE NULL END,
             c.help_text, c.sort_order
      FROM public.complaint_jurisdiction_factor_catalogue c
      WHERE c.active;

      UPDATE public.complaint_jurisdiction_rule_sets SET status = 'PUBLISHED' WHERE id = v_id;
    END IF;
  END LOOP;
END
$seed$;