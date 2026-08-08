CREATE OR REPLACE FUNCTION public.appeal_case_file_status(_appeal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   WHERE entity_type = 'application' AND entity_id = v_appeal.application_id;

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
      'required',false,'satisfied', v_docs > 0 OR (
        jsonb_typeof(coalesce(v_appeal.supporting_docs,'[]'::jsonb)) = 'array'
        AND jsonb_array_length(coalesce(v_appeal.supporting_docs,'[]'::jsonb)) > 0)),
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
END; $function$;