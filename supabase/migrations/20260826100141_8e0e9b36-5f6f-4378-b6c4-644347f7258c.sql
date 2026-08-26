-- MC-04 certification defect fixes
-- 1) Supervisory roles hold the "close complaint" permission, while the MC-04
--    quality-review and closure operations ask for "approve". Treat the two as
--    the same authority so the maker-checker steps are actually performable.
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
             -- closure/quality-review authority is configured as 'close'
             WHEN _action = 'approve'  THEN ARRAY['approve','close']
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

-- 2) Closure requires the outcome letter to the consumer to have been issued,
--    but no governed operation could record it. Add one.
CREATE OR REPLACE FUNCTION public.complaint_outcome_letter_issue(
  _complaint_id uuid, _subject text DEFAULT NULL, _body text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); o public.complaint_outcomes; n public.complaint_correspondence;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'edit');
  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current;
  IF o.id IS NULL OR o.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'outcome_not_recorded' USING ERRCODE='22023';
  END IF;
  IF coalesce(length(btrim(coalesce(_body,''))),0) < 20 THEN
    RAISE EXCEPTION 'letter_body_required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.complaint_correspondence (complaint_id, direction, subject, body, author_id)
  VALUES (_complaint_id, 'outbound',
          coalesce(nullif(btrim(coalesce(_subject,'')),''), 'Outcome of your complaint'),
          btrim(_body), v_uid)
  RETURNING * INTO n;
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'complaint.outcome.letter_issued', 'complaint', _complaint_id,
          jsonb_build_object('correspondence_id', n.id, 'outcome_id', o.id));
  RETURN jsonb_build_object('correspondence_id', n.id, 'issued_at', n.created_at);
END; $$;

REVOKE ALL ON FUNCTION public.complaint_outcome_letter_issue(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_outcome_letter_issue(uuid,text,text) TO authenticated, service_role;