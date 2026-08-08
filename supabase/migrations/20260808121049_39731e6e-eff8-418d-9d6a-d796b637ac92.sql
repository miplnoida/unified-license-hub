
-- 1. Appeal scope lookup ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appeal_panel_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL UNIQUE,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.appeal_panel_scopes TO authenticated;
GRANT ALL ON public.appeal_panel_scopes TO service_role;
ALTER TABLE public.appeal_panel_scopes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appeal_panel_scopes_select ON public.appeal_panel_scopes;
CREATE POLICY appeal_panel_scopes_select ON public.appeal_panel_scopes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS appeal_panel_scopes_manage ON public.appeal_panel_scopes;
CREATE POLICY appeal_panel_scopes_manage ON public.appeal_panel_scopes
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'license_appeals', 'manage_config'))
  WITH CHECK (public.has_permission(auth.uid(), 'license_appeals', 'manage_config'));

INSERT INTO public.appeal_panel_scopes (scope_key, label) VALUES
  ('licensing', 'Licensing'),
  ('fit_and_proper', 'Fit & Proper'),
  ('enforcement', 'Enforcement / Supervisory Action')
ON CONFLICT (scope_key) DO NOTHING;

-- 2. Panel master governance fields ------------------------------------------
ALTER TABLE public.license_appeal_panels
  ADD COLUMN IF NOT EXISTS appeal_scope text NOT NULL DEFAULT 'licensing',
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date,
  ADD COLUMN IF NOT EXISTS default_hearing_format text NOT NULL DEFAULT 'written',
  ADD COLUMN IF NOT EXISTS quorum integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS decision_rule text NOT NULL DEFAULT 'majority',
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.license_appeal_panels DROP CONSTRAINT IF EXISTS license_appeal_panels_hearing_format_chk;
ALTER TABLE public.license_appeal_panels ADD CONSTRAINT license_appeal_panels_hearing_format_chk
  CHECK (default_hearing_format IN ('written','oral','virtual','in_person'));
ALTER TABLE public.license_appeal_panels DROP CONSTRAINT IF EXISTS license_appeal_panels_decision_rule_chk;
ALTER TABLE public.license_appeal_panels ADD CONSTRAINT license_appeal_panels_decision_rule_chk
  CHECK (decision_rule IN ('majority','unanimous','chair_casting'));
ALTER TABLE public.license_appeal_panels DROP CONSTRAINT IF EXISTS license_appeal_panels_quorum_chk;
ALTER TABLE public.license_appeal_panels ADD CONSTRAINT license_appeal_panels_quorum_chk
  CHECK (quorum >= 1);

-- 3. Panel membership ---------------------------------------------------------
ALTER TABLE public.license_appeal_panel_members
  ADD COLUMN IF NOT EXISTS is_chair boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_voting boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vote_weight numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS regulator_id uuid,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS effective_to date;

ALTER TABLE public.license_appeal_panel_members DROP CONSTRAINT IF EXISTS license_appeal_panel_members_role_chk;
ALTER TABLE public.license_appeal_panel_members ADD CONSTRAINT license_appeal_panel_members_role_chk
  CHECK (member_role IN ('chair','member','legal_adviser','observer'));

CREATE UNIQUE INDEX IF NOT EXISTS license_appeal_panel_members_one_chair
  ON public.license_appeal_panel_members (panel_id) WHERE is_chair AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS license_appeal_panel_members_unique_active
  ON public.license_appeal_panel_members (panel_id, user_id) WHERE is_active;

-- 4. Immutable composition snapshot ------------------------------------------
CREATE TABLE IF NOT EXISTS public.license_appeal_panel_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES public.license_appeals(id) ON DELETE CASCADE,
  panel_id uuid NOT NULL REFERENCES public.license_appeal_panels(id),
  panel_name text NOT NULL,
  appeal_scope text NOT NULL,
  quorum integer NOT NULL,
  decision_rule text NOT NULL,
  hearing_format text,
  member_roster jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_by uuid,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS license_appeal_panel_snapshots_appeal_idx
  ON public.license_appeal_panel_snapshots (appeal_id, snapshot_at DESC);

GRANT SELECT ON public.license_appeal_panel_snapshots TO authenticated;
GRANT ALL ON public.license_appeal_panel_snapshots TO service_role;
ALTER TABLE public.license_appeal_panel_snapshots ENABLE ROW LEVEL SECURITY;

-- 5. Hearing + quorum fields on the appeal ------------------------------------
ALTER TABLE public.license_appeals
  ADD COLUMN IF NOT EXISTS hearing_format text,
  ADD COLUMN IF NOT EXISTS hearing_venue text,
  ADD COLUMN IF NOT EXISTS hearing_link text,
  ADD COLUMN IF NOT EXISTS hearing_notes text,
  ADD COLUMN IF NOT EXISTS hearing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS case_file_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS quorum_met boolean,
  ADD COLUMN IF NOT EXISTS dissent_note text,
  ADD COLUMN IF NOT EXISTS decision_conditions text;

-- 6. Snapshot-scoped membership access ----------------------------------------
CREATE OR REPLACE FUNCTION public.is_appeal_panel_member(_user_id uuid, _appeal_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.license_appeal_panel_snapshots s,
         LATERAL jsonb_array_elements(s.member_roster) m
    WHERE s.appeal_id = _appeal_id
      AND (m->>'user_id')::uuid = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_license_appeal(_user_id uuid, _appeal_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.license_appeals la
    JOIN public.applications a ON a.id = la.application_id
    WHERE la.id = _appeal_id
      AND (
        la.filed_by = _user_id
        OR a.applicant_id = _user_id
        OR public.has_permission(_user_id, 'license_appeals', 'view')
        OR public.is_appeal_panel_member(_user_id, la.id)
      )
  );
$$;

DROP POLICY IF EXISTS appeal_panel_snapshots_select ON public.license_appeal_panel_snapshots;
CREATE POLICY appeal_panel_snapshots_select ON public.license_appeal_panel_snapshots
  FOR SELECT TO authenticated
  USING (public.can_read_license_appeal(auth.uid(), appeal_id));

-- Assigned panel members may read their own appeal even without the global view permission.
DROP POLICY IF EXISTS appeals_select_panel_member ON public.license_appeals;
CREATE POLICY appeals_select_panel_member ON public.license_appeals
  FOR SELECT TO authenticated
  USING (public.is_appeal_panel_member(auth.uid(), id));

-- 7. Case-file readiness -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appeal_case_file_status(_appeal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_appeal record;
  v_app record;
  v_docs int := 0;
  v_items jsonb;
  v_blocking int;
BEGIN
  IF NOT public.can_read_license_appeal(auth.uid(), _appeal_id) THEN
    RETURN jsonb_build_object('error','Not allowed','code','FORBIDDEN','http',403);
  END IF;

  SELECT * INTO v_appeal FROM public.license_appeals WHERE id = _appeal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404);
  END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = v_appeal.application_id;

  SELECT count(*) INTO v_docs
    FROM public.documents
   WHERE entity_type = 'application' AND entity_id = v_appeal.application_id::text;

  v_items := jsonb_build_array(
    jsonb_build_object('key','original_application','label','Original application',
      'required',true,'satisfied', v_app.id IS NOT NULL),
    jsonb_build_object('key','original_decision','label','Original decision on file',
      'required',true,'satisfied', v_app.rejected_at IS NOT NULL OR v_app.approved_at IS NOT NULL),
    jsonb_build_object('key','decision_rationale','label','Decision rationale',
      'required',true,'satisfied', coalesce(nullif(trim(coalesce(v_app.decision_rationale,'')),''), (
        SELECT nullif(trim(coalesce(aa.comments,'')),'')
          FROM public.approval_actions aa
         WHERE aa.application_id = v_app.id AND aa.action IN ('reject','rejected')
         ORDER BY aa.responded_at DESC NULLS LAST LIMIT 1
      )) IS NOT NULL),
    jsonb_build_object('key','appeal_grounds','label','Grounds of appeal',
      'required',true,'satisfied', nullif(trim(coalesce(v_appeal.grounds,'')),'') IS NOT NULL),
    jsonb_build_object('key','supporting_documents','label','Supporting documents',
      'required',false,'satisfied', v_docs > 0 OR jsonb_typeof(coalesce(v_appeal.supporting_docs,'[]'::jsonb)) = 'array'
        AND jsonb_array_length(coalesce(v_appeal.supporting_docs,'[]'::jsonb)) > 0),
    jsonb_build_object('key','acknowledgement','label','Appeal acknowledged',
      'required',true,'satisfied', v_appeal.acknowledged_at IS NOT NULL),
    jsonb_build_object('key','legal_review','label','Legal / compliance referral (where required)',
      'required',false,'satisfied', EXISTS (
        SELECT 1 FROM public.application_legal_referrals r
         WHERE r.application_id = v_app.id AND r.status IN ('returned','completed','closed')
      ))
  );

  SELECT count(*) INTO v_blocking
    FROM jsonb_array_elements(v_items) i
   WHERE (i->>'required')::boolean AND NOT (i->>'satisfied')::boolean;

  RETURN jsonb_build_object(
    'appeal_id', _appeal_id,
    'items', v_items,
    'blocking_count', v_blocking,
    'ready', v_blocking = 0
  );
END; $$;

-- 8. Panel referral (constitution + snapshot) ---------------------------------
CREATE OR REPLACE FUNCTION public.assign_appeal_panel(
  _appeal_id uuid,
  _panel_id uuid,
  _hearing_date timestamptz DEFAULT NULL,
  _hearing_format text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appeal record;
  v_panel record;
  v_roster jsonb;
  v_voting int;
  v_chair jsonb;
  v_format text;
  v_case jsonb;
  v_snapshot_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_permission(v_uid,'license_appeals','assign_panel')
          OR public.has_permission(v_uid,'license_appeals','decide')) THEN
    RETURN jsonb_build_object('error','You are not allowed to refer appeals to a panel','code','FORBIDDEN','http',403);
  END IF;

  SELECT * INTO v_appeal FROM public.license_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404);
  END IF;
  IF v_appeal.status NOT IN ('submitted','under_review','panel_review') THEN
    RETURN jsonb_build_object('error','This appeal is closed and cannot be referred to a panel','code','INVALID_STATE','http',409);
  END IF;

  SELECT * INTO v_panel FROM public.license_appeal_panels WHERE id = _panel_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Panel not found','code','NOT_FOUND','http',404);
  END IF;
  IF NOT v_panel.is_active
     OR (v_panel.effective_from IS NOT NULL AND v_panel.effective_from > current_date)
     OR (v_panel.effective_to IS NOT NULL AND v_panel.effective_to < current_date) THEN
    RETURN jsonb_build_object('error','That panel is not active today','code','PANEL_INACTIVE','http',409);
  END IF;
  IF v_panel.appeal_scope <> 'licensing' THEN
    RETURN jsonb_build_object('error','That panel does not hear licensing appeals','code','PANEL_SCOPE','http',409);
  END IF;
  IF v_panel.regulator_id IS NOT NULL AND v_appeal.regulator_id IS NOT NULL
     AND v_panel.regulator_id <> v_appeal.regulator_id THEN
    RETURN jsonb_build_object('error','That panel belongs to a different regulator','code','PANEL_REGULATOR','http',409);
  END IF;

  v_case := public.appeal_case_file_status(_appeal_id);
  IF coalesce((v_case->>'ready')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('error','The case file is not complete yet','code','CASE_FILE_INCOMPLETE','http',422,'case_file',v_case);
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
            'member_id', m.id,
            'user_id', m.user_id,
            'full_name', coalesce(p.full_name, p.email, 'Member'),
            'email', p.email,
            'member_role', m.member_role,
            'is_chair', m.is_chair,
            'is_voting', m.is_voting,
            'vote_weight', m.vote_weight,
            'regulator_id', m.regulator_id
          ) ORDER BY m.is_chair DESC, m.member_role, coalesce(p.full_name, p.email)), '[]'::jsonb)
    INTO v_roster
    FROM public.license_appeal_panel_members m
    LEFT JOIN public.profiles p ON p.id = m.user_id
   WHERE m.panel_id = _panel_id
     AND m.is_active
     AND (m.effective_from IS NULL OR m.effective_from <= current_date)
     AND (m.effective_to IS NULL OR m.effective_to >= current_date);

  SELECT count(*) INTO v_voting
    FROM jsonb_array_elements(v_roster) r WHERE (r->>'is_voting')::boolean;

  SELECT r INTO v_chair FROM jsonb_array_elements(v_roster) r WHERE (r->>'is_chair')::boolean LIMIT 1;

  IF v_chair IS NULL THEN
    RETURN jsonb_build_object('error','That panel has no active chair','code','PANEL_NO_CHAIR','http',409);
  END IF;
  IF v_voting < v_panel.quorum THEN
    RETURN jsonb_build_object('error',
      format('That panel cannot meet its quorum of %s (only %s active voting members)', v_panel.quorum, v_voting),
      'code','PANEL_QUORUM','http',409);
  END IF;

  v_format := coalesce(nullif(trim(coalesce(_hearing_format,'')),''), v_panel.default_hearing_format);

  INSERT INTO public.license_appeal_panel_snapshots (
    appeal_id, panel_id, panel_name, appeal_scope, quorum, decision_rule,
    hearing_format, member_roster, snapshot_by
  ) VALUES (
    _appeal_id, _panel_id, v_panel.name, v_panel.appeal_scope, v_panel.quorum, v_panel.decision_rule,
    v_format, v_roster, v_uid
  ) RETURNING id INTO v_snapshot_id;

  UPDATE public.license_appeals
     SET panel_id = _panel_id,
         status = 'panel_review',
         hearing_date = coalesce(_hearing_date, hearing_date),
         hearing_format = v_format,
         case_file_ready_at = coalesce(case_file_ready_at, now()),
         updated_at = now()
   WHERE id = _appeal_id;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (
    _appeal_id, 'panel_constituted',
    format('Appeal referred to %s — panel constituted with %s member(s), quorum %s',
           v_panel.name, jsonb_array_length(v_roster), v_panel.quorum),
    v_uid,
    jsonb_build_object('panel_id', _panel_id, 'snapshot_id', v_snapshot_id,
                       'quorum', v_panel.quorum, 'members', jsonb_array_length(v_roster))
  );

  IF _hearing_date IS NOT NULL THEN
    INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
    VALUES (_appeal_id, 'hearing_scheduled',
            format('Hearing scheduled for %s (%s)', to_char(_hearing_date, 'DD Mon YYYY HH24:MI'), v_format),
            v_uid, jsonb_build_object('hearing_date', _hearing_date, 'hearing_format', v_format));
  END IF;

  PERFORM public.notification_enqueue_event(
    'license_appeal.panel_member_assigned', 'license_appeal', _appeal_id,
    jsonb_build_object('appeal_reference', v_appeal.appeal_reference,
                       'panel_name', v_panel.name,
                       'member_user_ids', (SELECT jsonb_agg(r->>'user_id') FROM jsonb_array_elements(v_roster) r)),
    v_snapshot_id::text
  );

  RETURN jsonb_build_object('success', true, 'http', 200,
                            'snapshot_id', v_snapshot_id, 'members', jsonb_array_length(v_roster));
END; $$;

-- 9. Hearing management --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.schedule_appeal_hearing(
  _appeal_id uuid,
  _hearing_date timestamptz,
  _hearing_format text,
  _venue text DEFAULT NULL,
  _link text DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appeal record;
  v_reschedule boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_permission(v_uid,'license_appeals','assign_panel')
          OR public.has_permission(v_uid,'license_appeals','decide')
          OR public.has_permission(v_uid,'license_appeals','edit')) THEN
    RETURN jsonb_build_object('error','You are not allowed to schedule appeal hearings','code','FORBIDDEN','http',403);
  END IF;

  SELECT * INTO v_appeal FROM public.license_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404);
  END IF;
  IF v_appeal.panel_id IS NULL THEN
    RETURN jsonb_build_object('error','Refer the appeal to a panel before scheduling a hearing','code','NO_PANEL','http',409);
  END IF;
  IF _hearing_format NOT IN ('written','oral','virtual','in_person') THEN
    RETURN jsonb_build_object('error','Unknown hearing format','code','BAD_FORMAT','http',400);
  END IF;

  v_reschedule := v_appeal.hearing_date IS NOT NULL;

  UPDATE public.license_appeals
     SET hearing_date = _hearing_date,
         hearing_format = _hearing_format,
         hearing_venue = _venue,
         hearing_link = _link,
         hearing_completed_at = NULL,
         updated_at = now()
   WHERE id = _appeal_id;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (
    _appeal_id,
    CASE WHEN v_reschedule THEN 'hearing_rescheduled' ELSE 'hearing_scheduled' END,
    format('%s for %s (%s)%s',
           CASE WHEN v_reschedule THEN 'Hearing rescheduled' ELSE 'Hearing scheduled' END,
           to_char(_hearing_date,'DD Mon YYYY HH24:MI'), _hearing_format,
           CASE WHEN nullif(trim(coalesce(_reason,'')),'') IS NULL THEN '' ELSE ' — ' || _reason END),
    v_uid,
    jsonb_build_object('hearing_date', _hearing_date, 'hearing_format', _hearing_format,
                       'venue', _venue, 'link', _link, 'reason', _reason)
  );

  PERFORM public.notification_enqueue_event(
    CASE WHEN v_reschedule THEN 'license_appeal.hearing_rescheduled' ELSE 'license_appeal.hearing_scheduled' END,
    'license_appeal', _appeal_id,
    jsonb_build_object('appeal_reference', v_appeal.appeal_reference,
                       'recipient_id', v_appeal.filed_by,
                       'hearing_date', to_char(_hearing_date,'DD Mon YYYY HH24:MI'),
                       'hearing_format', _hearing_format),
    to_char(_hearing_date,'YYYYMMDDHH24MI')
  );

  RETURN jsonb_build_object('success', true, 'http', 200, 'rescheduled', v_reschedule);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_appeal_hearing(
  _appeal_id uuid,
  _minutes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appeal record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT (public.has_permission(v_uid,'license_appeals','decide')
          OR public.has_permission(v_uid,'license_appeals','edit')) THEN
    RETURN jsonb_build_object('error','You are not allowed to record hearing minutes','code','FORBIDDEN','http',403);
  END IF;

  SELECT * INTO v_appeal FROM public.license_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404);
  END IF;
  IF v_appeal.hearing_date IS NULL THEN
    RETURN jsonb_build_object('error','No hearing has been scheduled','code','NO_HEARING','http',409);
  END IF;

  UPDATE public.license_appeals
     SET hearing_notes = _minutes,
         hearing_completed_at = now(),
         updated_at = now()
   WHERE id = _appeal_id;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (_appeal_id, 'hearing_completed', 'Hearing completed and minutes recorded', v_uid, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'http', 200);
END; $$;

-- 10. Decision with quorum enforcement ----------------------------------------
CREATE OR REPLACE FUNCTION public.record_appeal_decision(
  _appeal_id uuid,
  _decision text,
  _rationale text,
  _dissent text DEFAULT NULL,
  _conditions text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appeal record;
  v_snapshot record;
  v_voting int;
  v_reinstate jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF NOT public.has_permission(v_uid,'license_appeals','decide') THEN
    RETURN jsonb_build_object('error','You are not allowed to decide appeals','code','FORBIDDEN','http',403);
  END IF;
  IF nullif(trim(coalesce(_rationale,'')),'') IS NULL OR length(trim(_rationale)) < 10 THEN
    RETURN jsonb_build_object('error','A written rationale of at least 10 characters is required','code','RATIONALE_REQUIRED','http',400);
  END IF;
  IF _decision NOT IN ('upheld','partially_upheld','dismissed','remitted','overturned_to_approved') THEN
    RETURN jsonb_build_object('error','Unknown appeal decision','code','BAD_DECISION','http',400);
  END IF;

  SELECT * INTO v_appeal FROM public.license_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404);
  END IF;
  IF v_appeal.status = 'decided' THEN
    RETURN jsonb_build_object('error','This appeal has already been decided','code','ALREADY_DECIDED','http',409);
  END IF;

  SELECT * INTO v_snapshot
    FROM public.license_appeal_panel_snapshots
   WHERE appeal_id = _appeal_id
   ORDER BY snapshot_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','A panel must be constituted before an appeal can be decided','code','NO_PANEL','http',409);
  END IF;

  SELECT count(*) INTO v_voting
    FROM jsonb_array_elements(v_snapshot.member_roster) r WHERE (r->>'is_voting')::boolean;

  IF v_voting < v_snapshot.quorum THEN
    RETURN jsonb_build_object('error',
      format('Quorum is not met: %s voting member(s) against a quorum of %s', v_voting, v_snapshot.quorum),
      'code','QUORUM_NOT_MET','http',422);
  END IF;

  UPDATE public.license_appeals
     SET decision = _decision,
         decision_rationale = _rationale,
         dissent_note = _dissent,
         decision_conditions = _conditions,
         decided_at = now(),
         decided_by = v_uid,
         quorum_met = true,
         status = 'decided',
         updated_at = now()
   WHERE id = _appeal_id;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (
    _appeal_id, 'decided',
    CASE WHEN _decision IN ('upheld','partially_upheld','overturned_to_approved')
         THEN 'Appeal accepted for consideration' ELSE 'Appeal declined' END,
    v_uid,
    jsonb_build_object('decision', _decision, 'quorum', v_snapshot.quorum,
                       'voting_members', v_voting, 'decision_rule', v_snapshot.decision_rule,
                       'snapshot_id', v_snapshot.id)
  );

  IF _decision IN ('upheld','partially_upheld','overturned_to_approved') THEN
    v_reinstate := public.reinstate_application_after_appeal(_appeal_id, _rationale);
  END IF;

  RETURN jsonb_build_object('success', true, 'http', 200,
                            'quorum_met', true, 'reinstatement', v_reinstate);
END; $$;

REVOKE ALL ON FUNCTION public.assign_appeal_panel(uuid,uuid,timestamptz,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.schedule_appeal_hearing(uuid,timestamptz,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_appeal_hearing(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_appeal_decision(uuid,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.appeal_case_file_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_appeal_panel(uuid,uuid,timestamptz,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_appeal_hearing(uuid,timestamptz,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_appeal_hearing(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_appeal_decision(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appeal_case_file_status(uuid) TO authenticated;

-- 11. Notification events -------------------------------------------------------
INSERT INTO public.notification_event_configs (
  event_key, module, description, category, notification_type, severity, channels,
  title_template, message_template, email_subject_template, email_body_template, recipient_rules, is_active
) VALUES
  ('license_appeal.hearing_scheduled','license_appeal','Appeal hearing scheduled','info','info','medium',
   ARRAY['in_app','email'],
   'Hearing scheduled for appeal {{appeal_reference}}',
   'A hearing for appeal {{appeal_reference}} is scheduled for {{hearing_date}} ({{hearing_format}}).',
   'Hearing scheduled for appeal {{appeal_reference}}',
   'A hearing for appeal {{appeal_reference}} is scheduled for {{hearing_date}} ({{hearing_format}}).',
   '[{"type":"payload_user","key":"recipient_id"}]'::jsonb, true),
  ('license_appeal.hearing_rescheduled','license_appeal','Appeal hearing rescheduled','info','info','medium',
   ARRAY['in_app','email'],
   'Hearing rescheduled for appeal {{appeal_reference}}',
   'The hearing for appeal {{appeal_reference}} has moved to {{hearing_date}} ({{hearing_format}}).',
   'Hearing rescheduled for appeal {{appeal_reference}}',
   'The hearing for appeal {{appeal_reference}} has moved to {{hearing_date}} ({{hearing_format}}).',
   '[{"type":"payload_user","key":"recipient_id"}]'::jsonb, true),
  ('license_appeal.panel_member_assigned','license_appeal','Appeal panel member assigned','action_required','info','medium',
   ARRAY['in_app'],
   'You have been assigned to an appeal panel',
   'You are a member of {{panel_name}} constituted to hear appeal {{appeal_reference}}.',
   NULL, NULL,
   '[{"type":"payload_user","key":"member_user_ids"}]'::jsonb, true)
ON CONFLICT (event_key) DO NOTHING;
