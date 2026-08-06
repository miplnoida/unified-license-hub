-- ============================================================
-- Market Conduct: Formal Investigation — Interview Record
-- Additive only. Mirrors conduct_investigations access model.
-- ============================================================

-- ---------- Access helper (security definer to avoid policy recursion) ----------
CREATE OR REPLACE FUNCTION public.can_view_conduct_investigation(_investigation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conduct_investigations ci
    WHERE ci.id = _investigation_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.has_scoped_permission(auth.uid(),'conduct_investigations','view', ci.id, ci.licensee_id,
             (SELECT l.sector_id FROM public.licensees l WHERE l.id = ci.licensee_id), NULL::uuid)
        OR public.has_scoped_permission(auth.uid(),'market_conduct_investigation','view', ci.id, ci.licensee_id,
             (SELECT l.sector_id FROM public.licensees l WHERE l.id = ci.licensee_id), NULL::uuid)
        OR public.has_scoped_permission(auth.uid(),'market_conduct_investigation','access_investigation_workspace', ci.id, ci.licensee_id,
             (SELECT l.sector_id FROM public.licensees l WHERE l.id = ci.licensee_id), NULL::uuid)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_conduct_investigation(_investigation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conduct_investigations ci
    WHERE ci.id = _investigation_id
      AND (
        public.is_super_admin(auth.uid())
        OR public.has_scoped_permission(auth.uid(),'market_conduct_investigation','access_investigation_workspace', ci.id, ci.licensee_id,
             (SELECT l.sector_id FROM public.licensees l WHERE l.id = ci.licensee_id), NULL::uuid)
      )
  )
$$;

-- ---------- Interviews ----------
CREATE TABLE IF NOT EXISTS public.conduct_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid NOT NULL REFERENCES public.conduct_investigations(id) ON DELETE CASCADE,
  reference_code text,
  interviewee_name text NOT NULL,
  interviewee_role text,
  interviewee_organisation text,
  licensee_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  contact_email text,
  contact_phone text,
  interview_type text NOT NULL DEFAULT 'in_person'
    CHECK (interview_type IN ('in_person','virtual','telephone','written')),
  location text,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  purpose text,
  key_information text,
  topics_covered text,
  admissions text,
  follow_up_actions text,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','conducted','recorded','cancelled')),
  cancellation_reason text,
  attestation_outcome text NOT NULL DEFAULT 'pending'
    CHECK (attestation_outcome IN ('pending','signed','refused','not_required')),
  attestation_name text,
  attestation_at timestamptz,
  attestation_captured_by uuid,
  signed_document_url text,
  refusal_reason text,
  refusal_witnessed_by text,
  finalised_by uuid,
  finalised_at timestamptz,
  amendments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conduct_interviews_investigation ON public.conduct_interviews(investigation_id);
CREATE INDEX IF NOT EXISTS idx_conduct_interviews_status ON public.conduct_interviews(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_interviews TO authenticated;
GRANT ALL ON public.conduct_interviews TO service_role;
ALTER TABLE public.conduct_interviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY cintv_read ON public.conduct_interviews
  FOR SELECT TO authenticated
  USING (public.can_view_conduct_investigation(investigation_id));

CREATE POLICY cintv_write ON public.conduct_interviews
  FOR ALL TO authenticated
  USING (public.can_manage_conduct_investigation(investigation_id))
  WITH CHECK (public.can_manage_conduct_investigation(investigation_id));

CREATE TRIGGER trg_conduct_interviews_touch
  BEFORE UPDATE ON public.conduct_interviews
  FOR EACH ROW EXECUTE FUNCTION public._touch_conduct_updated_at();

-- ---------- Participants ----------
CREATE TABLE IF NOT EXISTS public.conduct_interview_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.conduct_interviews(id) ON DELETE CASCADE,
  participant_type text NOT NULL DEFAULT 'interviewer'
    CHECK (participant_type IN ('interviewer','observer','legal_representative','interpreter','other')),
  name text NOT NULL,
  role text,
  organisation text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conduct_interview_participants_interview
  ON public.conduct_interview_participants(interview_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_interview_participants TO authenticated;
GRANT ALL ON public.conduct_interview_participants TO service_role;
ALTER TABLE public.conduct_interview_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY cintvp_read ON public.conduct_interview_participants
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conduct_interviews i
    WHERE i.id = interview_id AND public.can_view_conduct_investigation(i.investigation_id)
  ));

CREATE POLICY cintvp_write ON public.conduct_interview_participants
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conduct_interviews i
    WHERE i.id = interview_id AND public.can_manage_conduct_investigation(i.investigation_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conduct_interviews i
    WHERE i.id = interview_id AND public.can_manage_conduct_investigation(i.investigation_id)
  ));

-- ---------- Attachments (documents produced during the interview) ----------
CREATE TABLE IF NOT EXISTS public.conduct_interview_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES public.conduct_interviews(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_url text,
  storage_bucket text DEFAULT 'fp-evidence',
  file_name text,
  size_bytes bigint,
  mime_type text,
  produced_by_interviewee boolean NOT NULL DEFAULT false,
  exhibit_reference text,
  evidence_id uuid REFERENCES public.conduct_evidence(id) ON DELETE SET NULL,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conduct_interview_attachments_interview
  ON public.conduct_interview_attachments(interview_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conduct_interview_attachments TO authenticated;
GRANT ALL ON public.conduct_interview_attachments TO service_role;
ALTER TABLE public.conduct_interview_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY cintva_read ON public.conduct_interview_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conduct_interviews i
    WHERE i.id = interview_id AND public.can_view_conduct_investigation(i.investigation_id)
  ));

CREATE POLICY cintva_write ON public.conduct_interview_attachments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conduct_interviews i
    WHERE i.id = interview_id AND public.can_manage_conduct_investigation(i.investigation_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conduct_interviews i
    WHERE i.id = interview_id AND public.can_manage_conduct_investigation(i.investigation_id)
  ));

-- ---------- Immutability guard: finalised records only change via amend RPC ----------
CREATE OR REPLACE FUNCTION public._guard_conduct_interview_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.finalised_at IS NOT NULL
     AND current_setting('app.conduct_interview_amend', true) IS DISTINCT FROM OLD.id::text
     AND to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
    RAISE EXCEPTION 'Interview record is finalised; amendments require a justification (use conduct_amend_interview)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_conduct_interviews_guard
  BEFORE UPDATE ON public.conduct_interviews
  FOR EACH ROW EXECUTE FUNCTION public._guard_conduct_interview_update();

-- ---------- Finalise RPC ----------
CREATE OR REPLACE FUNCTION public.conduct_finalise_interview(
  _interview_id uuid,
  _attestation_outcome text,
  _attestation_name text DEFAULT NULL,
  _signed_document_url text DEFAULT NULL,
  _refusal_reason text DEFAULT NULL,
  _refusal_witnessed_by text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.conduct_interviews;
  has_doc boolean;
BEGIN
  SELECT * INTO rec FROM public.conduct_interviews WHERE id = _interview_id;
  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'Interview not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.can_manage_conduct_investigation(rec.investigation_id) THEN
    RAISE EXCEPTION 'Not authorised to finalise this interview record' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF rec.finalised_at IS NOT NULL THEN
    RAISE EXCEPTION 'Interview record already finalised' USING ERRCODE = 'check_violation';
  END IF;

  IF _attestation_outcome NOT IN ('signed','refused','not_required') THEN
    RAISE EXCEPTION 'Attestation outcome must be signed, refused or not_required' USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(btrim(rec.key_information), '') = '' THEN
    RAISE EXCEPTION 'Key information obtained is required before finalising' USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.conduct_interview_attachments a
    WHERE a.interview_id = _interview_id AND coalesce(btrim(a.file_url),'') <> ''
  ) INTO has_doc;

  IF _attestation_outcome = 'signed'
     AND coalesce(btrim(_attestation_name), '') = ''
     AND coalesce(btrim(_signed_document_url), '') = ''
     AND NOT has_doc THEN
    RAISE EXCEPTION 'Signed records require an attestation name or an uploaded signed copy' USING ERRCODE = 'check_violation';
  END IF;

  IF _attestation_outcome = 'refused' AND length(coalesce(btrim(_refusal_reason), '')) < 10 THEN
    RAISE EXCEPTION 'Refusal reason of at least 10 characters is required' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.conduct_interviews SET
    status = 'recorded',
    attestation_outcome = _attestation_outcome,
    attestation_name = nullif(btrim(coalesce(_attestation_name,'')), ''),
    attestation_at = CASE WHEN _attestation_outcome = 'signed' THEN now() ELSE attestation_at END,
    attestation_captured_by = auth.uid(),
    signed_document_url = nullif(btrim(coalesce(_signed_document_url,'')), ''),
    refusal_reason = nullif(btrim(coalesce(_refusal_reason,'')), ''),
    refusal_witnessed_by = nullif(btrim(coalesce(_refusal_witnessed_by,'')), ''),
    finalised_by = auth.uid(),
    finalised_at = now()
  WHERE id = _interview_id
  RETURNING * INTO rec;

  RETURN to_jsonb(rec);
END $$;

REVOKE ALL ON FUNCTION public.conduct_finalise_interview(uuid,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_finalise_interview(uuid,text,text,text,text,text) TO authenticated, service_role;

-- ---------- Amend RPC (post-finalisation, justification mandatory) ----------
CREATE OR REPLACE FUNCTION public.conduct_amend_interview(
  _interview_id uuid,
  _patch jsonb,
  _justification text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.conduct_interviews;
BEGIN
  SELECT * INTO rec FROM public.conduct_interviews WHERE id = _interview_id;
  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'Interview not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.can_manage_conduct_investigation(rec.investigation_id) THEN
    RAISE EXCEPTION 'Not authorised to amend this interview record' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(coalesce(btrim(_justification), '')) < 10 THEN
    RAISE EXCEPTION 'Amendment justification of at least 10 characters is required' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.conduct_interview_amend', _interview_id::text, true);

  UPDATE public.conduct_interviews SET
    key_information   = coalesce(_patch->>'key_information', key_information),
    topics_covered    = coalesce(_patch->>'topics_covered', topics_covered),
    admissions        = coalesce(_patch->>'admissions', admissions),
    follow_up_actions = coalesce(_patch->>'follow_up_actions', follow_up_actions),
    amendments = amendments || jsonb_build_array(jsonb_build_object(
      'amended_at', now(),
      'amended_by', auth.uid(),
      'justification', btrim(_justification),
      'patch', _patch
    ))
  WHERE id = _interview_id
  RETURNING * INTO rec;

  PERFORM set_config('app.conduct_interview_amend', '', true);

  RETURN to_jsonb(rec);
END $$;

REVOKE ALL ON FUNCTION public.conduct_amend_interview(uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_amend_interview(uuid,jsonb,text) TO authenticated, service_role;

-- ---------- Notification events (idempotent) ----------
INSERT INTO public.notification_event_configs
  (event_key, description, module, category, notification_type, severity, channels,
   title_template, message_template, email_subject_template, email_body_template,
   action_required, allow_mute, system_required, delivery_frequency, dedupe_window_seconds, is_active,
   recipient_rules)
VALUES
  ('conduct.interview_scheduled','An investigation interview was scheduled','conduct','info','info','medium',
   ARRAY['in_app','email'],
   'Interview scheduled: {{interviewee_name}}',
   'An interview with {{interviewee_name}} was scheduled for investigation {{investigation_code}}.',
   'Interview scheduled: {{interviewee_name}}',
   'An interview with {{interviewee_name}} was scheduled for investigation {{investigation_code}}.',
   false,true,false,'immediate',60,true,
   '[{"type":"record_assignee"},{"type":"supervisor"}]'::jsonb),
  ('conduct.interview_record_finalised','An investigation interview record was finalised','conduct','info','info','medium',
   ARRAY['in_app','email'],
   'Interview record finalised: {{interviewee_name}}',
   'The interview record for {{interviewee_name}} on investigation {{investigation_code}} was finalised.',
   'Interview record finalised: {{interviewee_name}}',
   'The interview record for {{interviewee_name}} on investigation {{investigation_code}} was finalised.',
   false,true,false,'immediate',60,true,
   '[{"type":"record_assignee"},{"type":"supervisor"}]'::jsonb),
  ('conduct.interview_signature_refused','An interviewee refused to sign the interview record','conduct','alert','warning','high',
   ARRAY['in_app','email'],
   'Signature refused: {{interviewee_name}}',
   '{{interviewee_name}} refused to sign the interview record for investigation {{investigation_code}}. Reason: {{refusal_reason}}',
   'Signature refused: {{interviewee_name}}',
   '{{interviewee_name}} refused to sign the interview record for investigation {{investigation_code}}. Reason: {{refusal_reason}}',
   true,false,true,'immediate',60,true,
   '[{"type":"role","role":"supervisor"},{"type":"record_assignee"}]'::jsonb)
ON CONFLICT (event_key) DO NOTHING;