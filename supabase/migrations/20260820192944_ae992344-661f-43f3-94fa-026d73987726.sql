create or replace function public.thematic_review_set_status(
  _review_id uuid, _status text, _reason text default null, _override_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
DECLARE _uid uuid; _before jsonb; _after jsonb;
BEGIN
  _uid := public.thematic_require('initiate_thematic_review');
  SELECT to_jsonb(t) INTO _before FROM public.thematic_reviews t WHERE t.id=_review_id;
  IF _before IS NULL THEN RAISE EXCEPTION 'Thematic review not found' USING ERRCODE='P0002'; END IF;
  IF _status NOT IN ('draft','scoped','evidence_collection','analysis','findings_issued','actions_required','monitoring','closed','cancelled') THEN
    RAISE EXCEPTION 'Invalid thematic review status %', _status USING ERRCODE='22023';
  END IF;
  IF _status IN ('closed','cancelled') AND coalesce(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required to close or cancel a review' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.thematic_review_status_history (review_id, from_status, to_status, changed_by, reason, override_id)
  VALUES (_review_id, _before->>'status', _status, _uid, _reason, _override_id);
  UPDATE public.thematic_reviews SET
    status=_status,
    closed_at = CASE WHEN _status IN ('closed','cancelled') THEN now() ELSE closed_at END,
    updated_at = now()
  WHERE id=_review_id RETURNING to_jsonb(thematic_reviews) INTO _after;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION'::compliance_audit_action,'thematic_review',_review_id::text,_before,_after,_reason);
  RETURN _after;
END; $$;

revoke all on function public.thematic_review_set_status(uuid,text,text,uuid) from public, anon;
grant execute on function public.thematic_review_set_status(uuid,text,text,uuid) to authenticated, service_role;