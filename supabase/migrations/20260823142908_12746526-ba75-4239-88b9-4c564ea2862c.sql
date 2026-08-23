-- Defect: examination_create stamped stage 'planning', which the stage machine
-- does not recognise, leaving every new examination unable to progress.
-- Canonical opening stage is 'planned'.
CREATE OR REPLACE FUNCTION public.examination_create(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _after jsonb;
BEGIN
  _uid := public.conduct_require('prudential_supervision','manage_examination');
  IF nullif(_payload->>'entity_id','') IS NULL THEN
    RAISE EXCEPTION 'entity_id is required' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.examinations (entity_id, regulator_id, sector_id, title, examination_type, stage, risk_rating,
        period_under_review_start, period_under_review_end, fieldwork_start, fieldwork_end, lead_examiner_id, created_by)
  VALUES ((_payload->>'entity_id')::uuid, nullif(_payload->>'regulator_id','')::uuid, nullif(_payload->>'sector_id','')::uuid,
          nullif(_payload->>'title',''), nullif(_payload->>'examination_type',''),
          coalesce(nullif(_payload->>'stage',''),'planned'), nullif(_payload->>'risk_rating',''),
          nullif(_payload->>'period_under_review_start','')::date, nullif(_payload->>'period_under_review_end','')::date,
          nullif(_payload->>'fieldwork_start','')::date, nullif(_payload->>'fieldwork_end','')::date,
          coalesce(nullif(_payload->>'lead_examiner_id','')::uuid, _uid), _uid)
  RETURNING id INTO _id;
  SELECT to_jsonb(e) INTO _after FROM public.examinations e WHERE e.id=_id;
  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action,'examination',_id::text,NULL,_after,NULL);
  RETURN _after;
END; $function$;