CREATE OR REPLACE FUNCTION public.get_public_complaint_tracking(p_reference text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_status record;
  v_timeline jsonb;
  v_is_owner boolean := false;
BEGIN
  IF p_reference IS NULL OR length(trim(p_reference)) < 4 THEN
    RETURN jsonb_build_object('found', false, 'error', 'REFERENCE_REQUIRED');
  END IF;

  SELECT id, complaint_number, subject, status, created_at, updated_at,
         resolved_at, closed_at, email, complainant_id
    INTO v_c
    FROM public.complaints
   WHERE complaint_number = trim(p_reference)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_is_owner := auth.uid() IS NOT NULL AND v_c.complainant_id = auth.uid();

  -- Contact verification: if the complaint has a contact email on file, the
  -- caller must supply a matching one. The signed-in complainant is exempt.
  IF NOT v_is_owner AND v_c.email IS NOT NULL AND btrim(v_c.email) <> '' THEN
    IF p_email IS NULL OR lower(btrim(p_email)) <> lower(btrim(v_c.email)) THEN
      RETURN jsonb_build_object('found', false, 'error', 'CONTACT_MISMATCH');
    END IF;
  END IF;

  SELECT public_label, public_description, is_terminal
    INTO v_status
    FROM public.complaint_status_catalogue
   WHERE code = v_c.status;

  -- Redacted timeline from workflow history: public labels only, no assignee
  -- names and no internal comments.
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.event_at), '[]'::jsonb)
    INTO v_timeline
    FROM (
      SELECT
        aa.created_at AS event_at,
        COALESCE(cs.public_label, 'Progress update') AS label,
        COALESCE(cs.public_description, 'Your complaint has been updated.') AS description
      FROM public.workflow_instances wi
      JOIN public.approval_actions aa ON aa.workflow_instance_id = wi.id
      LEFT JOIN public.complaint_status_catalogue cs
        ON cs.code = COALESCE(aa.action_type, aa.action)
      WHERE wi.entity_type = 'complaint' AND wi.entity_id = v_c.id
      ORDER BY aa.created_at
    ) t;

  RETURN jsonb_build_object(
    'found', true,
    'reference', v_c.complaint_number,
    'subject', v_c.subject,
    'submitted_at', v_c.created_at,
    'updated_at', v_c.updated_at,
    'resolved_at', v_c.resolved_at,
    'closed_at', v_c.closed_at,
    'status', jsonb_build_object(
      'label', COALESCE(v_status.public_label, 'In progress'),
      'description', COALESCE(v_status.public_description, ''),
      'terminal', COALESCE(v_status.is_terminal, false)
    ),
    'timeline', COALESCE(v_timeline, '[]'::jsonb)
  );
END;
$function$;