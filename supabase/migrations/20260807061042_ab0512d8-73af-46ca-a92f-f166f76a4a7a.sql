CREATE OR REPLACE FUNCTION public.tg_decision_artifacts_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'decision_artifacts is append-only: issue a new version instead of modifying version % of %', OLD.version, OLD.artifact_type;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_artifacts_append_only ON public.decision_artifacts;
CREATE TRIGGER trg_decision_artifacts_append_only
BEFORE UPDATE OR DELETE ON public.decision_artifacts
FOR EACH ROW EXECUTE FUNCTION public.tg_decision_artifacts_append_only();