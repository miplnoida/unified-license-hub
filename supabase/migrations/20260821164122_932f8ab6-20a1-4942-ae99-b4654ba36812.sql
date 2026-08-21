ALTER VIEW public.v_conduct_investigation_state SET (security_invoker = true);
ALTER FUNCTION public.conduct_work_queue(text[], text[], uuid, uuid, boolean, text, boolean, text, integer, integer) SECURITY INVOKER;
ALTER FUNCTION public.conduct_work_queue_counts() SECURITY INVOKER;