CREATE OR REPLACE FUNCTION public.close_correspondence(_thread_id uuid, _notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_actor text;
BEGIN
  IF NOT public.is_internal_staff(v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_actor := public.correspondence_actor_label(v_user);
  UPDATE public.correspondence_threads
     SET status = 'closed',
         thread_state = 'closed',
         closed_at = now(),
         closed_by = v_user,
         pending_since = NULL,
         response_due_at = NULL
   WHERE id = _thread_id;
  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail)
  VALUES (_thread_id, v_user, v_actor, 'Staff', 'Correspondence closed', _notes);
END; $function$;