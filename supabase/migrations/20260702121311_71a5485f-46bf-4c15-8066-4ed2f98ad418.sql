
CREATE OR REPLACE FUNCTION public._touch_coordination_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 1. coordination_cases
CREATE TABLE public.coordination_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('application','license','entity','other')),
  subject_id UUID,
  owner_regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL,
  owner_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_clearance','cleared','closed')),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordination_cases TO authenticated;
GRANT ALL ON public.coordination_cases TO service_role;
ALTER TABLE public.coordination_cases ENABLE ROW LEVEL SECURITY;

-- 2. coordination_participants
CREATE TABLE public.coordination_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.coordination_cases(id) ON DELETE CASCADE,
  regulator_id UUID REFERENCES public.regulators(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  participant_role TEXT NOT NULL DEFAULT 'participant' CHECK (participant_role IN ('owner','participant','observer')),
  clearance_status TEXT NOT NULL DEFAULT 'pending' CHECK (clearance_status IN ('pending','cleared','blocked','not_required')),
  clearance_note TEXT,
  cleared_at TIMESTAMPTZ,
  invited_by UUID,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, user_id)
);
CREATE INDEX idx_coord_participants_user ON public.coordination_participants(user_id);
CREATE INDEX idx_coord_participants_case ON public.coordination_participants(case_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordination_participants TO authenticated;
GRANT ALL ON public.coordination_participants TO service_role;
ALTER TABLE public.coordination_participants ENABLE ROW LEVEL SECURITY;

-- 3. coordination_messages
CREATE TABLE public.coordination_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.coordination_cases(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coord_messages_case ON public.coordination_messages(case_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordination_messages TO authenticated;
GRANT ALL ON public.coordination_messages TO service_role;
ALTER TABLE public.coordination_messages ENABLE ROW LEVEL SECURITY;

-- 4. coordination_flags
CREATE TABLE public.coordination_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.coordination_cases(id) ON DELETE CASCADE,
  flag_type TEXT NOT NULL CHECK (flag_type IN ('interdependency','blocker','notice','concurrent_review')),
  title TEXT NOT NULL,
  description TEXT,
  linked_application_id UUID,
  linked_license_id UUID,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','withdrawn')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);
CREATE INDEX idx_coord_flags_case ON public.coordination_flags(case_id);
CREATE INDEX idx_coord_flags_app ON public.coordination_flags(linked_application_id) WHERE linked_application_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coordination_flags TO authenticated;
GRANT ALL ON public.coordination_flags TO service_role;
ALTER TABLE public.coordination_flags ENABLE ROW LEVEL SECURITY;

-- Helper: is user a participant in case?
CREATE OR REPLACE FUNCTION public.is_coordination_participant(_case_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.coordination_participants WHERE case_id = _case_id AND user_id = _user_id);
$$;

-- RLS: cases
CREATE POLICY "Participants can view coordination cases" ON public.coordination_cases FOR SELECT TO authenticated
  USING (public.is_coordination_participant(id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Internal can create coordination cases" ON public.coordination_cases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Owner can update coordination case" ON public.coordination_cases FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Owner can delete coordination case" ON public.coordination_cases FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- RLS: participants
CREATE POLICY "Participants can view participant list" ON public.coordination_participants FOR SELECT TO authenticated
  USING (public.is_coordination_participant(case_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Owner can add participants" ON public.coordination_participants FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.coordination_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Self or owner can update clearance" ON public.coordination_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.coordination_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Owner can remove participants" ON public.coordination_participants FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coordination_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- RLS: messages
CREATE POLICY "Participants can read messages" ON public.coordination_messages FOR SELECT TO authenticated
  USING (public.is_coordination_participant(case_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Participants can post messages" ON public.coordination_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_coordination_participant(case_id, auth.uid()));
CREATE POLICY "Author can delete own message" ON public.coordination_messages FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- RLS: flags
CREATE POLICY "Participants can view flags" ON public.coordination_flags FOR SELECT TO authenticated
  USING (public.is_coordination_participant(case_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Participants can create flags" ON public.coordination_flags FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_coordination_participant(case_id, auth.uid()));
CREATE POLICY "Participants can update flags" ON public.coordination_flags FOR UPDATE TO authenticated
  USING (public.is_coordination_participant(case_id, auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Creator or owner can delete flag" ON public.coordination_flags FOR DELETE TO authenticated
  USING (created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.coordination_cases c WHERE c.id = case_id AND c.owner_user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_coord_cases_touch BEFORE UPDATE ON public.coordination_cases
  FOR EACH ROW EXECUTE FUNCTION public._touch_coordination_updated_at();

-- Seed creator as owner participant
CREATE OR REPLACE FUNCTION public.coord_case_seed_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.coordination_participants (case_id, regulator_id, user_id, participant_role, clearance_status, invited_by)
  VALUES (NEW.id, NEW.owner_regulator_id, NEW.owner_user_id, 'owner', 'cleared', NEW.owner_user_id)
  ON CONFLICT (case_id, user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_coord_case_seed_owner AFTER INSERT ON public.coordination_cases
  FOR EACH ROW EXECUTE FUNCTION public.coord_case_seed_owner();

-- Recompute case status when clearance changes
CREATE OR REPLACE FUNCTION public.coord_check_clearance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case_id UUID := NEW.case_id; v_pending INT; v_blocked INT;
BEGIN
  SELECT COUNT(*) FILTER (WHERE clearance_status = 'pending'),
         COUNT(*) FILTER (WHERE clearance_status = 'blocked')
  INTO v_pending, v_blocked
  FROM public.coordination_participants WHERE case_id = v_case_id;

  IF v_blocked > 0 THEN
    UPDATE public.coordination_cases SET status = 'pending_clearance', updated_at = now() WHERE id = v_case_id AND status != 'closed';
  ELSIF v_pending = 0 THEN
    UPDATE public.coordination_cases SET status = 'cleared', updated_at = now() WHERE id = v_case_id AND status != 'closed';
  ELSE
    UPDATE public.coordination_cases SET status = 'pending_clearance', updated_at = now() WHERE id = v_case_id AND status != 'closed';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_coord_check_clearance AFTER INSERT OR UPDATE OF clearance_status ON public.coordination_participants
  FOR EACH ROW EXECUTE FUNCTION public.coord_check_clearance();
