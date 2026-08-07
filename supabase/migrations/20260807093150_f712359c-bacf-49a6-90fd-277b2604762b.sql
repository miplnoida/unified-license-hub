REVOKE UPDATE, DELETE, TRUNCATE ON public.complaint_closure_reviews FROM authenticated, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.ai_insight_actions FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.tg_append_only_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS tg_closure_reviews_append_only ON public.complaint_closure_reviews;
CREATE TRIGGER tg_closure_reviews_append_only
  BEFORE UPDATE OR DELETE ON public.complaint_closure_reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_history();

DROP TRIGGER IF EXISTS tg_ai_insight_actions_append_only ON public.ai_insight_actions;
CREATE TRIGGER tg_ai_insight_actions_append_only
  BEFORE UPDATE OR DELETE ON public.ai_insight_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_append_only_history();