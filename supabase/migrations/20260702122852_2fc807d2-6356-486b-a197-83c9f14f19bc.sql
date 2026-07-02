
-- Shared updated_at helper for the FP module
CREATE OR REPLACE FUNCTION public._fp_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Reusable helper: is the current user "internal FP staff"?
CREATE OR REPLACE FUNCTION public.is_fp_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id, 'super_admin'::app_role)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'supervisor'::app_role)
    OR public.has_role(_user_id, 'licensing_officer'::app_role)
    OR public.has_role(_user_id, 'analyst'::app_role)
    OR public.has_role(_user_id, 'legal_compliance'::app_role);
$$;

-- 1. fp_individuals
CREATE TABLE public.fp_individuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  nationality TEXT,
  national_id TEXT,
  passport_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  user_id UUID, -- optional link to auth.users if the individual has a portal login
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','deceased','removed')),
  regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_individuals_regulator ON public.fp_individuals(regulator_id);
CREATE INDEX idx_fp_individuals_name ON public.fp_individuals(lower(full_name) text_pattern_ops);
CREATE INDEX idx_fp_individuals_national_id ON public.fp_individuals(national_id) WHERE national_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_individuals TO authenticated;
GRANT ALL ON public.fp_individuals TO service_role;
ALTER TABLE public.fp_individuals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fp_individuals_touch BEFORE UPDATE ON public.fp_individuals
  FOR EACH ROW EXECUTE FUNCTION public._fp_touch_updated_at();

-- 2. fp_individual_roles
CREATE TABLE public.fp_individual_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  licensee_id UUID REFERENCES public.licensees(id) ON DELETE SET NULL,
  license_id UUID REFERENCES public.licenses(id) ON DELETE SET NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('director','chairperson','ceo','cfo','key_person','controller','shareholder','senior_manager','trustee','other')),
  role_title TEXT,
  effective_from DATE,
  effective_to DATE,
  is_current BOOLEAN NOT NULL DEFAULT true,
  ownership_pct NUMERIC(5,2),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_roles_individual ON public.fp_individual_roles(individual_id);
CREATE INDEX idx_fp_roles_licensee ON public.fp_individual_roles(licensee_id) WHERE licensee_id IS NOT NULL;
CREATE INDEX idx_fp_roles_current ON public.fp_individual_roles(is_current) WHERE is_current = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_individual_roles TO authenticated;
GRANT ALL ON public.fp_individual_roles TO service_role;
ALTER TABLE public.fp_individual_roles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fp_roles_touch BEFORE UPDATE ON public.fp_individual_roles
  FOR EACH ROW EXECUTE FUNCTION public._fp_touch_updated_at();

-- 3. fp_assessments
CREATE TABLE public.fp_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.fp_individual_roles(id) ON DELETE SET NULL,
  licensee_id UUID REFERENCES public.licensees(id) ON DELETE SET NULL,
  assessment_type TEXT NOT NULL DEFAULT 'initial' CHECK (assessment_type IN ('initial','renewal','change_of_role','triggered','ongoing_monitoring')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','screening','awaiting_committee','determined','closed','withdrawn')),
  declaration_data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ,
  submitted_by UUID,
  committee_id UUID,
  determined_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_assess_individual ON public.fp_assessments(individual_id);
CREATE INDEX idx_fp_assess_status ON public.fp_assessments(status);
CREATE INDEX idx_fp_assess_licensee ON public.fp_assessments(licensee_id) WHERE licensee_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_assessments TO authenticated;
GRANT ALL ON public.fp_assessments TO service_role;
ALTER TABLE public.fp_assessments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fp_assess_touch BEFORE UPDATE ON public.fp_assessments
  FOR EACH ROW EXECUTE FUNCTION public._fp_touch_updated_at();

-- 4. fp_screening_configs
CREATE TABLE public.fp_screening_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  display_label TEXT NOT NULL,
  description TEXT,
  check_type TEXT NOT NULL CHECK (check_type IN ('sanctions','pep','adverse_media','criminal_history','regulator_watchlist','credit_history','custom')),
  provider TEXT, -- e.g. 'internal_rules','lovable_ai','dow_jones', etc.
  config JSONB NOT NULL DEFAULT '{}',
  severity_default TEXT NOT NULL DEFAULT 'medium' CHECK (severity_default IN ('low','medium','high','critical')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_screening_configs TO authenticated;
GRANT ALL ON public.fp_screening_configs TO service_role;
ALTER TABLE public.fp_screening_configs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fp_sc_touch BEFORE UPDATE ON public.fp_screening_configs
  FOR EACH ROW EXECUTE FUNCTION public._fp_touch_updated_at();

-- 5. fp_screening_runs
CREATE TABLE public.fp_screening_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL DEFAULT 'initial' CHECK (run_type IN ('initial','manual_rerun','monitoring')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_checks INT NOT NULL DEFAULT 0,
  total_hits INT NOT NULL DEFAULT 0,
  triggered_by UUID,
  error TEXT
);
CREATE INDEX idx_fp_runs_assessment ON public.fp_screening_runs(assessment_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_screening_runs TO authenticated;
GRANT ALL ON public.fp_screening_runs TO service_role;
ALTER TABLE public.fp_screening_runs ENABLE ROW LEVEL SECURITY;

-- 6. fp_findings
CREATE TABLE public.fp_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.fp_screening_runs(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.fp_screening_configs(id) ON DELETE SET NULL,
  check_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  summary TEXT,
  evidence_url TEXT,
  source TEXT,
  raw_payload JSONB,
  is_false_positive BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_findings_assessment ON public.fp_findings(assessment_id);
CREATE INDEX idx_fp_findings_individual ON public.fp_findings(individual_id);
CREATE INDEX idx_fp_findings_severity ON public.fp_findings(severity);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_findings TO authenticated;
GRANT ALL ON public.fp_findings TO service_role;
ALTER TABLE public.fp_findings ENABLE ROW LEVEL SECURITY;

-- 7. fp_committees
CREATE TABLE public.fp_committees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL,
  quorum INT NOT NULL DEFAULT 3 CHECK (quorum >= 1),
  approval_threshold_pct NUMERIC(5,2) NOT NULL DEFAULT 60.00 CHECK (approval_threshold_pct > 0 AND approval_threshold_pct <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_committees TO authenticated;
GRANT ALL ON public.fp_committees TO service_role;
ALTER TABLE public.fp_committees ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fp_cmt_touch BEFORE UPDATE ON public.fp_committees
  FOR EACH ROW EXECUTE FUNCTION public._fp_touch_updated_at();

-- 8. fp_committee_members
CREATE TABLE public.fp_committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES public.fp_committees(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  member_role TEXT NOT NULL DEFAULT 'member' CHECK (member_role IN ('chair','member','secretary','observer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (committee_id, user_id)
);
CREATE INDEX idx_fp_cmt_members_user ON public.fp_committee_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_committee_members TO authenticated;
GRANT ALL ON public.fp_committee_members TO service_role;
ALTER TABLE public.fp_committee_members ENABLE ROW LEVEL SECURITY;

-- 9. fp_committee_votes
CREATE TABLE public.fp_committee_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  committee_id UUID NOT NULL REFERENCES public.fp_committees(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.fp_committee_members(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('approve','conditional','reject','abstain')),
  justification TEXT,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, member_id)
);
CREATE INDEX idx_fp_votes_assessment ON public.fp_committee_votes(assessment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_committee_votes TO authenticated;
GRANT ALL ON public.fp_committee_votes TO service_role;
ALTER TABLE public.fp_committee_votes ENABLE ROW LEVEL SECURITY;

-- 10. fp_determinations
CREATE TABLE public.fp_determinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','conditional','rejected','deferred','withdrawn')),
  rationale TEXT NOT NULL,
  determined_by UUID NOT NULL,
  determined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_from DATE,
  effective_to DATE,
  supersedes_id UUID REFERENCES public.fp_determinations(id) ON DELETE SET NULL,
  signature_hash TEXT,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_det_assessment ON public.fp_determinations(assessment_id);
CREATE INDEX idx_fp_det_individual ON public.fp_determinations(individual_id, is_current);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_determinations TO authenticated;
GRANT ALL ON public.fp_determinations TO service_role;
ALTER TABLE public.fp_determinations ENABLE ROW LEVEL SECURITY;

-- 11. fp_conditions
CREATE TABLE public.fp_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  determination_id UUID NOT NULL REFERENCES public.fp_determinations(id) ON DELETE CASCADE,
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date DATE,
  monitoring_owner UUID,
  evidence_type TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','satisfied','waived','overdue')),
  satisfied_at TIMESTAMPTZ,
  satisfied_by UUID,
  satisfaction_note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_cond_individual ON public.fp_conditions(individual_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_conditions TO authenticated;
GRANT ALL ON public.fp_conditions TO service_role;
ALTER TABLE public.fp_conditions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fp_cond_touch BEFORE UPDATE ON public.fp_conditions
  FOR EACH ROW EXECUTE FUNCTION public._fp_touch_updated_at();

-- 12. fp_appeals
CREATE TABLE public.fp_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  determination_id UUID NOT NULL REFERENCES public.fp_determinations(id) ON DELETE CASCADE,
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  filed_by UUID NOT NULL,
  filed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  grounds TEXT NOT NULL,
  supporting_docs JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','decided','withdrawn')),
  appeal_committee_id UUID REFERENCES public.fp_committees(id) ON DELETE SET NULL,
  decision TEXT CHECK (decision IN ('upheld','partially_upheld','dismissed','remitted')),
  decision_rationale TEXT,
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  new_determination_id UUID REFERENCES public.fp_determinations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fp_appeals_individual ON public.fp_appeals(individual_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_appeals TO authenticated;
GRANT ALL ON public.fp_appeals TO service_role;
ALTER TABLE public.fp_appeals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_fp_appeals_touch BEFORE UPDATE ON public.fp_appeals
  FOR EACH ROW EXECUTE FUNCTION public._fp_touch_updated_at();

-- 13. fp_monitoring_events
CREATE TABLE public.fp_monitoring_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id UUID NOT NULL REFERENCES public.fp_individuals(id) ON DELETE CASCADE,
  determination_id UUID REFERENCES public.fp_determinations(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('recheck_ok','recheck_hit','condition_due','condition_overdue','role_change','manual_flag')),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  summary TEXT NOT NULL,
  detail JSONB,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  acknowledgement_note TEXT
);
CREATE INDEX idx_fp_mon_individual ON public.fp_monitoring_events(individual_id, raised_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fp_monitoring_events TO authenticated;
GRANT ALL ON public.fp_monitoring_events TO service_role;
ALTER TABLE public.fp_monitoring_events ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- fp_individuals
CREATE POLICY "Internal staff read individuals" ON public.fp_individuals FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Individual reads own record" ON public.fp_individuals FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Licensee sees own individuals" ON public.fp_individuals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fp_individual_roles r
    JOIN public.entity_user_access eua ON eua.entity_id = r.licensee_id
    WHERE r.individual_id = fp_individuals.id AND eua.user_id = auth.uid()
  ));
CREATE POLICY "Internal staff manage individuals" ON public.fp_individuals FOR INSERT TO authenticated
  WITH CHECK (public.is_fp_staff(auth.uid()));
CREATE POLICY "Internal staff update individuals" ON public.fp_individuals FOR UPDATE TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Internal staff delete individuals" ON public.fp_individuals FOR DELETE TO authenticated
  USING (public.is_fp_staff(auth.uid()));

-- fp_individual_roles
CREATE POLICY "Internal staff read fp roles" ON public.fp_individual_roles FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Licensee reads own fp roles" ON public.fp_individual_roles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.entity_user_access eua
    WHERE eua.entity_id = fp_individual_roles.licensee_id AND eua.user_id = auth.uid()
  ));
CREATE POLICY "Internal staff manage fp roles" ON public.fp_individual_roles FOR ALL TO authenticated
  USING (public.is_fp_staff(auth.uid()))
  WITH CHECK (public.is_fp_staff(auth.uid()));

-- fp_assessments
CREATE POLICY "Internal staff read fp assess" ON public.fp_assessments FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Licensee reads own fp assess" ON public.fp_assessments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.entity_user_access eua
    WHERE eua.entity_id = fp_assessments.licensee_id AND eua.user_id = auth.uid()
  ));
CREATE POLICY "Submitter reads own fp assess" ON public.fp_assessments FOR SELECT TO authenticated
  USING (submitted_by = auth.uid() OR created_by = auth.uid());
CREATE POLICY "Licensee inserts fp assess" ON public.fp_assessments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_fp_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.entity_user_access eua WHERE eua.entity_id = fp_assessments.licensee_id AND eua.user_id = auth.uid())
  );
CREATE POLICY "Staff updates fp assess" ON public.fp_assessments FOR UPDATE TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Draft owner updates own fp assess" ON public.fp_assessments FOR UPDATE TO authenticated
  USING ((created_by = auth.uid() OR submitted_by = auth.uid()) AND status = 'draft');

-- fp_screening_configs (admin-only)
CREATE POLICY "Internal read screening configs" ON public.fp_screening_configs FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Admin manages screening configs" ON public.fp_screening_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- fp_screening_runs (internal + owning licensee read)
CREATE POLICY "Internal reads screening runs" ON public.fp_screening_runs FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Internal manages screening runs" ON public.fp_screening_runs FOR ALL TO authenticated
  USING (public.is_fp_staff(auth.uid()))
  WITH CHECK (public.is_fp_staff(auth.uid()));

-- fp_findings (internal read/manage)
CREATE POLICY "Internal reads findings" ON public.fp_findings FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Internal manages findings" ON public.fp_findings FOR ALL TO authenticated
  USING (public.is_fp_staff(auth.uid()))
  WITH CHECK (public.is_fp_staff(auth.uid()));

-- fp_committees (internal + committee members read)
CREATE POLICY "Internal reads committees" ON public.fp_committees FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Admin manages committees" ON public.fp_committees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- fp_committee_members
CREATE POLICY "Internal reads cmt members" ON public.fp_committee_members FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Admin manages cmt members" ON public.fp_committee_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- fp_committee_votes
CREATE POLICY "Internal reads votes" ON public.fp_committee_votes FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Member casts own vote" ON public.fp_committee_votes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fp_committee_members m
    WHERE m.id = fp_committee_votes.member_id AND m.user_id = auth.uid() AND m.is_active
  ));
CREATE POLICY "Member updates own vote" ON public.fp_committee_votes FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fp_committee_members m
    WHERE m.id = fp_committee_votes.member_id AND m.user_id = auth.uid()
  ));

-- fp_determinations
CREATE POLICY "Internal reads determinations" ON public.fp_determinations FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Individual reads own determinations" ON public.fp_determinations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fp_individuals i WHERE i.id = fp_determinations.individual_id AND i.user_id = auth.uid()));
CREATE POLICY "Licensee reads determinations" ON public.fp_determinations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fp_individual_roles r
    JOIN public.entity_user_access eua ON eua.entity_id = r.licensee_id
    WHERE r.individual_id = fp_determinations.individual_id AND eua.user_id = auth.uid()
  ));
CREATE POLICY "Internal manages determinations" ON public.fp_determinations FOR ALL TO authenticated
  USING (public.is_fp_staff(auth.uid()))
  WITH CHECK (public.is_fp_staff(auth.uid()));

-- fp_conditions
CREATE POLICY "Internal reads fp conditions" ON public.fp_conditions FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Individual reads own conditions" ON public.fp_conditions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fp_individuals i WHERE i.id = fp_conditions.individual_id AND i.user_id = auth.uid()));
CREATE POLICY "Licensee reads fp conditions" ON public.fp_conditions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fp_individual_roles r
    JOIN public.entity_user_access eua ON eua.entity_id = r.licensee_id
    WHERE r.individual_id = fp_conditions.individual_id AND eua.user_id = auth.uid()
  ));
CREATE POLICY "Internal manages fp conditions" ON public.fp_conditions FOR ALL TO authenticated
  USING (public.is_fp_staff(auth.uid()))
  WITH CHECK (public.is_fp_staff(auth.uid()));

-- fp_appeals
CREATE POLICY "Internal reads fp appeals" ON public.fp_appeals FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Filer reads own appeal" ON public.fp_appeals FOR SELECT TO authenticated
  USING (filed_by = auth.uid());
CREATE POLICY "Licensee files appeal" ON public.fp_appeals FOR INSERT TO authenticated
  WITH CHECK (
    filed_by = auth.uid()
    AND (
      public.is_fp_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.fp_individual_roles r
        JOIN public.entity_user_access eua ON eua.entity_id = r.licensee_id
        WHERE r.individual_id = fp_appeals.individual_id AND eua.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Internal manages fp appeals" ON public.fp_appeals FOR UPDATE TO authenticated
  USING (public.is_fp_staff(auth.uid()));

-- fp_monitoring_events
CREATE POLICY "Internal reads fp monitoring" ON public.fp_monitoring_events FOR SELECT TO authenticated
  USING (public.is_fp_staff(auth.uid()));
CREATE POLICY "Internal manages fp monitoring" ON public.fp_monitoring_events FOR ALL TO authenticated
  USING (public.is_fp_staff(auth.uid()))
  WITH CHECK (public.is_fp_staff(auth.uid()));
