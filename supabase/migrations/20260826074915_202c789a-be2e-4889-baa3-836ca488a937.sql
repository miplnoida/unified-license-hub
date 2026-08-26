
CREATE OR REPLACE FUNCTION public.complete_vulnerability_review(_complaint_id uuid, _decision text, _category text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF _decision NOT IN ('confirmed', 'not_applicable') THEN
    RAISE EXCEPTION 'invalid_decision' USING HINT = 'decision must be confirmed or not_applicable';
  END IF;
  IF NOT (public.has_role(v_uid, 'super_admin'::app_role)
          OR public.has_role(v_uid, 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.regulator_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF _decision = 'not_applicable' THEN
    UPDATE public.complaints
      SET vulnerability_indicator = FALSE,
          vulnerability_review_state = 'not_applicable',
          vulnerability_notes = NULL,
          vulnerability_category = NULL,
          updated_at = now()
    WHERE id = _complaint_id;
  ELSE
    IF COALESCE(btrim(_category), '') = '' AND COALESCE(btrim(_notes), '') = '' THEN
      RAISE EXCEPTION 'category_or_notes_required';
    END IF;
    UPDATE public.complaints
      SET vulnerability_indicator = TRUE,
          vulnerability_review_state = 'confirmed',
          vulnerability_category = NULLIF(btrim(_category), ''),
          vulnerability_notes = NULLIF(btrim(_notes), ''),
          updated_at = now()
    WHERE id = _complaint_id;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata, created_at)
  VALUES ('complaint.vulnerability_review_completed','complaint',_complaint_id, v_uid,
          jsonb_build_object('decision', _decision, 'category', _category, 'notes_provided', _notes IS NOT NULL),
          now());
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_vulnerability_review(uuid,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.complete_vulnerability_review(uuid,text,text,text) TO authenticated, service_role;
