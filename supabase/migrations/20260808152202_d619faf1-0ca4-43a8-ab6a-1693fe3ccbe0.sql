CREATE OR REPLACE FUNCTION public.complete_appeal_hearing(
  _appeal_id uuid,
  _minutes text,
  _amend boolean DEFAULT false
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

  IF _minutes IS NULL OR length(btrim(_minutes)) < 10 THEN
    RETURN jsonb_build_object('error','Record the hearing minutes first (at least 10 characters)','code','MINUTES_REQUIRED','http',422);
  END IF;

  -- Already completed: only an explicit amendment may write again.
  IF v_appeal.hearing_completed_at IS NOT NULL AND NOT COALESCE(_amend, false) THEN
    RETURN jsonb_build_object(
      'error','This hearing has already been marked complete',
      'code','ALREADY_COMPLETED','http',409,
      'completed_at', v_appeal.hearing_completed_at
    );
  END IF;

  IF v_appeal.hearing_completed_at IS NOT NULL THEN
    IF btrim(COALESCE(v_appeal.hearing_notes,'')) = btrim(_minutes) THEN
      RETURN jsonb_build_object('error','The minutes are unchanged — nothing to amend','code','NO_CHANGE','http',409);
    END IF;

    UPDATE public.license_appeals
       SET hearing_notes = _minutes,
           updated_at = now()
     WHERE id = _appeal_id;

    INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
    VALUES (_appeal_id, 'hearing_minutes_amended', 'Hearing minutes amended', v_uid, '{}'::jsonb);

    RETURN jsonb_build_object('success', true, 'amended', true, 'http', 200,
                              'completed_at', v_appeal.hearing_completed_at);
  END IF;

  UPDATE public.license_appeals
     SET hearing_notes = _minutes,
         hearing_completed_at = now(),
         updated_at = now()
   WHERE id = _appeal_id;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (_appeal_id, 'hearing_completed', 'Hearing completed and minutes recorded', v_uid, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'amended', false, 'http', 200);
END; $$;