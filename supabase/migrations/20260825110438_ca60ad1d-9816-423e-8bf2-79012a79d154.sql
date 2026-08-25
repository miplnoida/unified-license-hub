ALTER TABLE public.entity_user_memberships
  DROP CONSTRAINT IF EXISTS entity_user_memberships_status_chk;

ALTER TABLE public.entity_user_memberships
  ADD CONSTRAINT entity_user_memberships_status_chk
  CHECK (status = ANY (ARRAY['REQUESTED','PENDING_VERIFICATION','VERIFIED','APPROVED','REJECTED','REVOKED','EXPIRED']));

-- One-time repair of rows stuck by the old verify() bug
UPDATE public.entity_user_memberships
   SET status = 'VERIFIED'
 WHERE status = 'PENDING_VERIFICATION'
   AND verified_at IS NOT NULL
   AND verified_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.entity_membership_verify(_id uuid, _notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); v_status text;
BEGIN
  IF NOT public.sec_has_permission(uid, 'entity_membership', 'verify') THEN
    RAISE EXCEPTION 'entity_membership.verify required' USING ERRCODE='42501';
  END IF;

  SELECT status INTO v_status FROM public.entity_user_memberships WHERE id = _id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Membership not found' USING ERRCODE='22023';
  END IF;
  IF v_status = 'VERIFIED' THEN
    RAISE EXCEPTION 'Membership evidence is already verified' USING ERRCODE='22023';
  END IF;
  IF v_status NOT IN ('REQUESTED','PENDING_VERIFICATION') THEN
    RAISE EXCEPTION 'Membership is % and cannot be verified', v_status USING ERRCODE='22023';
  END IF;

  UPDATE public.entity_user_memberships
     SET status = 'VERIFIED', verified_at = now(), verified_by = uid
   WHERE id = _id;

  PERFORM public.create_audit_log(uid, 'entity.identity.verified', 'entity_user_membership', _id::text,
    jsonb_build_object('status', v_status),
    jsonb_build_object('status', 'VERIFIED', 'notes', _notes), '{}'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.entity_membership_approve(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); v_row public.entity_user_memberships;
BEGIN
  IF NOT public.sec_has_permission(uid, 'entity_membership', 'approve') THEN
    RAISE EXCEPTION 'entity_membership.approve required' USING ERRCODE='42501';
  END IF;
  UPDATE public.entity_user_memberships
     SET status = 'APPROVED', approved_at = now(), approved_by = uid,
         effective_from = COALESCE(effective_from, now())
   WHERE id = _id AND status IN ('VERIFIED','REQUESTED','PENDING_VERIFICATION')
  RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Membership not pending approval' USING ERRCODE='22023'; END IF;
  PERFORM public.create_audit_log(uid, 'entity.membership.approved', 'entity_user_membership', _id::text,
    NULL, jsonb_build_object('entity_id', v_row.entity_id, 'user_id', v_row.user_id,
                             'approved_by', uid, 'approved_at', v_row.approved_at), '{}'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.entity_membership_reject(_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.sec_has_permission(uid, 'entity_membership', 'approve') THEN
    RAISE EXCEPTION 'entity_membership.approve required' USING ERRCODE='42501';
  END IF;
  UPDATE public.entity_user_memberships
     SET status='REJECTED', rejected_at = now(), rejected_by = uid, revocation_reason = _reason
   WHERE id = _id AND status IN ('REQUESTED','PENDING_VERIFICATION','VERIFIED');
  IF NOT FOUND THEN RAISE EXCEPTION 'Membership not pending' USING ERRCODE='22023'; END IF;
  PERFORM public.create_audit_log(uid, 'entity.membership.rejected', 'entity_user_membership', _id::text,
    NULL, jsonb_build_object('reason', _reason), '{}'::jsonb);
END $function$;