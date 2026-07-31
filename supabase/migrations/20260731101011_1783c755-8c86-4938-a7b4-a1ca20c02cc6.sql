CREATE OR REPLACE FUNCTION public.log_correspondence_export(_thread_id uuid, _detail text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.correspondence_thread_visible(_thread_id, v_user) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  INSERT INTO public.correspondence_events (thread_id, actor_id, actor_name, actor_role, action, detail, visible_to_licensee)
  VALUES (_thread_id, v_user, public.correspondence_actor_label(v_user),
          CASE WHEN public.is_internal_staff(v_user) THEN 'Staff' ELSE 'Licensee' END,
          'THREAD_EXPORTED', _detail, false);
END; $function$;

REVOKE ALL ON FUNCTION public.log_correspondence_export(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_correspondence_export(uuid, text) TO authenticated;