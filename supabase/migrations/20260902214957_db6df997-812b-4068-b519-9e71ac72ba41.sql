REVOKE ALL ON FUNCTION public.tg_supervisory_work_assignment_touch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_supervisory_work_assignment_touch() FROM anon;
REVOKE ALL ON FUNCTION public.tg_supervisory_work_assignment_touch() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.tg_supervisory_work_assignment_touch() TO service_role;
