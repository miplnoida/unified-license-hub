-- PHASE 9 (Part B) — harden communication timeline authorization.
CREATE OR REPLACE FUNCTION public.can_view_communications(_object_type text, _object_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_licensee uuid;
  v_ok boolean := false;
BEGIN
  IF _object_id IS NULL OR v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_super_admin(v_uid) THEN
    RETURN true;
  END IF;

  v_licensee := public.user_licensee_id(v_uid);

  CASE lower(COALESCE(_object_type, ''))
    WHEN 'application' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.applications a
         WHERE a.id = _object_id
           AND (
             a.applicant_id = v_uid
             OR (v_licensee IS NOT NULL
                 AND a.id IN (SELECT public.application_ids_for_licensee(v_licensee)))
             OR public.has_permission(v_uid, 'licensing', 'view')
           )
      ) INTO v_ok;

    WHEN 'complaint' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.complaints c
         WHERE c.id = _object_id
           AND (
             c.internal_created_by = v_uid
             OR (v_licensee IS NOT NULL AND c.licensee_id = v_licensee)
             OR public.has_complaint_perm(v_uid, 'view_all')
             OR public.has_complaint_perm(v_uid, 'triage')
           )
      ) INTO v_ok;

    WHEN 'fp_assessment' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.fp_assessments f
         WHERE f.id = _object_id
           AND (public.has_permission(v_uid, 'fit_and_proper', 'view')
                OR public.has_permission(v_uid, 'licensing', 'view')
                OR (v_licensee IS NOT NULL AND f.licensee_id = v_licensee))
      ) INTO v_ok;

    WHEN 'prudential_action' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.prudential_actions p
         WHERE p.id = _object_id
           AND public.has_permission(v_uid, 'prudential_supervision', 'view')
      ) INTO v_ok;

    WHEN 'conduct_investigation' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.conduct_investigations i
         WHERE i.id = _object_id
           AND public.has_permission(v_uid, 'market_conduct', 'view')
      ) INTO v_ok;

    WHEN 'enforcement_action' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.enforcement_actions e
         WHERE e.id = _object_id
           AND public.has_permission(v_uid, 'market_conduct', 'view')
      ) INTO v_ok;

    ELSE
      v_ok := false;
  END CASE;

  RETURN COALESCE(v_ok, false);
END $$;

GRANT EXECUTE ON FUNCTION public.can_view_communications(text, uuid) TO authenticated;

-- Timeline now scopes on both object type and id.
CREATE OR REPLACE FUNCTION public.communication_timeline(_object_type text, _object_id uuid)
RETURNS TABLE(
  id uuid, occurred_at timestamptz, direction text, channel text, event_key text,
  subject text, recipient text, recipient_user_id uuid,
  communication_state public.communication_state, provider text, provider_message_id text,
  failure_category text, error text, retry_count integer,
  template_id uuid, template_version integer, rendered_content_ref text,
  delivered_at timestamptz, failed_at timestamptz, sent_to_provider_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_communications(_object_type, _object_id) THEN
    RAISE EXCEPTION 'not authorized for communications of % %', _object_type, _object_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.id, COALESCE(d.requested_at, d.created_at), 'outbound'::text, d.channel, d.event_key,
         d.subject, COALESCE(d.recipient_email, d.recipient_phone), d.recipient_user_id,
         d.communication_state, d.provider, d.provider_message_id,
         d.failure_category, d.error, COALESCE(d.retry_count,0),
         d.template_id, d.template_version, d.rendered_content_ref,
         d.delivered_at, d.failed_at, d.sent_to_provider_at
  FROM public.notification_dispatch_log d
  WHERE d.entity_id = _object_id::text
    AND (d.entity_type IS NULL OR lower(d.entity_type) = lower(_object_type))
  ORDER BY COALESCE(d.requested_at, d.created_at) DESC
  LIMIT 500;
END $$;

GRANT EXECUTE ON FUNCTION public.communication_timeline(text, uuid) TO authenticated;