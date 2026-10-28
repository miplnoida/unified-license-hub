CREATE TABLE public.entity_user_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('UAR-' || to_char(now(),'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  entity_id uuid NOT NULL REFERENCES public.licensees(id),
  request_type text NOT NULL CHECK (request_type IN ('ADD_USER','CHANGE_ROLE','REMOVE_USER','PRIMARY_USER_CHANGE')),
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','UNDER_REVIEW','APPROVED','APPROVED_PENDING_PROVISIONING','REJECTED','WITHDRAWN')),
  target_membership_id uuid REFERENCES public.entity_user_memberships(id),
  subject_full_name text,
  subject_email text,
  subject_phone text,
  subject_position text,
  requested_role_id uuid REFERENCES public.entity_membership_roles(id),
  effective_date date,
  reason text NOT NULL,
  letter_path text NOT NULL,
  supporting_paths text[] NOT NULL DEFAULT '{}',
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid, reviewed_at timestamptz, review_recommendation text, review_notes text,
  decided_by uuid, decided_at timestamptz, decision_notes text,
  resulting_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.entity_user_access_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.entity_user_access_requests(id),
  event text NOT NULL, actor_id uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.entity_user_access_requests TO authenticated;
GRANT SELECT ON public.entity_user_access_request_events TO authenticated;
GRANT ALL ON public.entity_user_access_requests, public.entity_user_access_request_events TO service_role;
ALTER TABLE public.entity_user_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_user_access_request_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.entity_access_is_member(_uid uuid, _entity uuid, _primary_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM entity_user_memberships m JOIN entity_membership_roles r ON r.id = m.membership_role_id
    WHERE m.user_id = _uid AND m.entity_id = _entity AND m.status = 'APPROVED'
      AND (m.effective_to IS NULL OR m.effective_to > now())
      AND (NOT _primary_only OR r.is_primary_representative));
$$;
REVOKE ALL ON FUNCTION public.entity_access_is_member(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_access_is_member(uuid,uuid,boolean) TO authenticated, service_role;

CREATE POLICY "members and staff read requests" ON public.entity_user_access_requests FOR SELECT TO authenticated
USING (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid()) OR public.entity_access_is_member(auth.uid(), entity_id));
CREATE POLICY "members and staff read request events" ON public.entity_user_access_request_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.entity_user_access_requests r WHERE r.id = request_id AND
  (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid()) OR public.entity_access_is_member(auth.uid(), r.entity_id))));

-- Storage: files live under <entity_id>/...
CREATE POLICY "entity access letters upload" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'entity-access-requests' AND public.entity_access_is_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "entity access letters read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'entity-access-requests' AND (public.is_internal_staff(auth.uid()) OR public.is_super_admin(auth.uid())
  OR public.entity_access_is_member(auth.uid(), ((storage.foldername(name))[1])::uuid)));

CREATE OR REPLACE FUNCTION public.entity_access_request_submit(
  _entity_id uuid, _request_type text, _reason text, _letter_path text,
  _target_membership_id uuid DEFAULT NULL, _full_name text DEFAULT NULL, _email text DEFAULT NULL,
  _phone text DEFAULT NULL, _position text DEFAULT NULL, _requested_role_id uuid DEFAULT NULL,
  _effective_date date DEFAULT NULL, _supporting_paths text[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_primary boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  IF _request_type NOT IN ('ADD_USER','CHANGE_ROLE','REMOVE_USER','PRIMARY_USER_CHANGE') THEN RAISE EXCEPTION 'Unknown request type'; END IF;
  -- Secondary-user changes: Primary Representative only. Primary change: any approved member.
  IF NOT public.entity_access_is_member(v_uid, _entity_id, _request_type <> 'PRIMARY_USER_CHANGE') THEN
    RAISE EXCEPTION 'Not permitted to submit this request for this institution' USING ERRCODE='42501';
  END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF _letter_path IS NULL OR split_part(_letter_path,'/',1) <> _entity_id::text THEN RAISE EXCEPTION 'An authorisation letter is required'; END IF;
  IF _request_type IN ('ADD_USER','PRIMARY_USER_CHANGE') AND (coalesce(btrim(_full_name),'')='' OR coalesce(btrim(_email),'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Full name and a valid email are required'; END IF;
  IF _request_type IN ('ADD_USER','CHANGE_ROLE') THEN
    IF _requested_role_id IS NULL THEN RAISE EXCEPTION 'A role is required'; END IF;
    SELECT is_primary_representative INTO v_primary FROM entity_membership_roles WHERE id=_requested_role_id AND is_active;
    IF v_primary IS NULL THEN RAISE EXCEPTION 'Unknown role'; END IF;
    IF v_primary THEN RAISE EXCEPTION 'Primary Representative changes must use the Primary User change service'; END IF;
  END IF;
  IF _request_type IN ('CHANGE_ROLE','REMOVE_USER') THEN
    IF NOT EXISTS (SELECT 1 FROM entity_user_memberships m JOIN entity_membership_roles r ON r.id=m.membership_role_id
       WHERE m.id=_target_membership_id AND m.entity_id=_entity_id AND m.status='APPROVED' AND NOT r.is_primary_representative) THEN
      RAISE EXCEPTION 'Select an existing secondary user of this institution'; END IF;
  END IF;
  IF _request_type = 'PRIMARY_USER_CHANGE' THEN
    SELECT m.id INTO _target_membership_id FROM entity_user_memberships m JOIN entity_membership_roles r ON r.id=m.membership_role_id
     WHERE m.entity_id=_entity_id AND m.status='APPROVED' AND r.is_primary_representative AND (m.effective_to IS NULL OR m.effective_to>now()) LIMIT 1;
    SELECT id INTO _requested_role_id FROM entity_membership_roles WHERE is_primary_representative AND is_active LIMIT 1;
  END IF;
  IF EXISTS (SELECT 1 FROM entity_user_access_requests WHERE entity_id=_entity_id AND status IN ('SUBMITTED','UNDER_REVIEW')
     AND (( _request_type='PRIMARY_USER_CHANGE' AND request_type='PRIMARY_USER_CHANGE')
       OR (_target_membership_id IS NOT NULL AND target_membership_id=_target_membership_id)
       OR (_email IS NOT NULL AND lower(subject_email)=lower(_email)))) THEN
    RAISE EXCEPTION 'An open request already exists for this user'; END IF;
  INSERT INTO entity_user_access_requests(entity_id,request_type,target_membership_id,subject_full_name,subject_email,subject_phone,subject_position,
    requested_role_id,effective_date,reason,letter_path,supporting_paths,submitted_by)
  VALUES (_entity_id,_request_type,_target_membership_id,nullif(btrim(_full_name),''),lower(nullif(btrim(_email),'')),_phone,_position,
    _requested_role_id,_effective_date,btrim(_reason),_letter_path,coalesce(_supporting_paths,'{}'),v_uid) RETURNING id INTO v_id;
  INSERT INTO entity_user_access_request_events(request_id,event,actor_id) VALUES (v_id,'SUBMITTED',v_uid);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.entity_access_request_withdraw(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE entity_user_access_requests SET status='WITHDRAWN', updated_at=now()
   WHERE id=_id AND submitted_by=auth.uid() AND status='SUBMITTED';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only your own unreviewed request can be withdrawn' USING ERRCODE='42501'; END IF;
  INSERT INTO entity_user_access_request_events(request_id,event,actor_id) VALUES (_id,'WITHDRAWN',auth.uid());
END $$;

-- Maker: regulator officer review & recommendation
CREATE OR REPLACE FUNCTION public.entity_access_request_review(_id uuid, _recommendation text, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.is_internal_staff(v_uid) OR public.is_super_admin(v_uid)) THEN RAISE EXCEPTION 'Regulator staff only' USING ERRCODE='42501'; END IF;
  IF _recommendation NOT IN ('APPROVE','REJECT') OR coalesce(btrim(_notes),'')='' THEN RAISE EXCEPTION 'Recommendation and notes are required'; END IF;
  UPDATE entity_user_access_requests SET status='UNDER_REVIEW', reviewed_by=v_uid, reviewed_at=now(),
    review_recommendation=_recommendation, review_notes=btrim(_notes), updated_at=now()
   WHERE id=_id AND status='SUBMITTED';
  IF NOT FOUND THEN RAISE EXCEPTION 'Request is not awaiting review'; END IF;
  INSERT INTO entity_user_access_request_events(request_id,event,actor_id,notes) VALUES (_id,'REVIEWED_'||_recommendation,v_uid,_notes);
END $$;

-- Checker: final decision by a different officer; applies the membership change
CREATE OR REPLACE FUNCTION public.entity_access_request_decide(_id uuid, _approve boolean, _notes text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r entity_user_access_requests%ROWTYPE; v_user uuid; v_mem uuid; v_status text;
  v_auth_rep uuid;
BEGIN
  IF NOT (public.is_internal_staff(v_uid) OR public.is_super_admin(v_uid)) THEN RAISE EXCEPTION 'Regulator staff only' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_notes),'')='' THEN RAISE EXCEPTION 'Decision notes are required'; END IF;
  SELECT * INTO r FROM entity_user_access_requests WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'UNDER_REVIEW' THEN RAISE EXCEPTION 'Request must be reviewed before a decision'; END IF;
  IF r.reviewed_by = v_uid THEN RAISE EXCEPTION 'The reviewing officer cannot also decide (maker-checker)' USING ERRCODE='42501'; END IF;
  IF r.submitted_by = v_uid THEN RAISE EXCEPTION 'The requester cannot decide' USING ERRCODE='42501'; END IF;

  IF NOT _approve THEN
    v_status := 'REJECTED';
  ELSIF r.request_type = 'CHANGE_ROLE' THEN
    UPDATE entity_user_memberships SET membership_role_id=r.requested_role_id, updated_at=now() WHERE id=r.target_membership_id;
    v_mem := r.target_membership_id; v_status := 'APPROVED';
  ELSIF r.request_type = 'REMOVE_USER' THEN
    UPDATE entity_user_memberships SET status='REVOKED', revoked_at=now(), revoked_by=v_uid, effective_to=now(),
      revocation_reason='Access request '||r.reference, updated_at=now() WHERE id=r.target_membership_id;
    v_mem := r.target_membership_id; v_status := 'APPROVED';
  ELSE
    SELECT id INTO v_user FROM profiles WHERE lower(email)=r.subject_email LIMIT 1;
    IF v_user IS NULL THEN
      v_status := 'APPROVED_PENDING_PROVISIONING';
    ELSE
      SELECT id INTO v_mem FROM entity_user_memberships WHERE user_id=v_user AND entity_id=r.entity_id AND status='APPROVED' LIMIT 1;
      IF v_mem IS NULL THEN
        INSERT INTO entity_user_memberships(user_id,entity_id,membership_role_id,status,effective_from,requested_by,approved_at,approved_by,authority_evidence_reference)
        VALUES (v_user,r.entity_id,r.requested_role_id,'APPROVED',coalesce(r.effective_date,current_date),r.submitted_by,now(),v_uid,r.reference) RETURNING id INTO v_mem;
      ELSE
        UPDATE entity_user_memberships SET membership_role_id=r.requested_role_id, updated_at=now() WHERE id=v_mem;
      END IF;
      IF r.request_type='PRIMARY_USER_CHANGE' AND r.target_membership_id IS NOT NULL AND r.target_membership_id <> v_mem THEN
        SELECT id INTO v_auth_rep FROM entity_membership_roles WHERE key='AUTHORIZED_REPRESENTATIVE';
        UPDATE entity_user_memberships SET membership_role_id=v_auth_rep, updated_at=now() WHERE id=r.target_membership_id;
      END IF;
      v_status := 'APPROVED';
    END IF;
  END IF;
  UPDATE entity_user_access_requests SET status=v_status, decided_by=v_uid, decided_at=now(), decision_notes=btrim(_notes),
    resulting_membership_id=v_mem, updated_at=now() WHERE id=_id;
  INSERT INTO entity_user_access_request_events(request_id,event,actor_id,notes) VALUES (_id,v_status,v_uid,_notes);
  RETURN v_status;
END $$;

REVOKE ALL ON FUNCTION public.entity_access_request_submit(uuid,text,text,text,uuid,text,text,text,text,uuid,date,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_access_request_withdraw(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_access_request_review(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.entity_access_request_decide(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_access_request_submit(uuid,text,text,text,uuid,text,text,text,text,uuid,date,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_access_request_withdraw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_access_request_review(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_access_request_decide(uuid,boolean,text) TO authenticated;

-- Members list in self profile needs membership_id + role id for requests (already returns m.id).